import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { PUSH_KINDS } from "@/lib/push/payload";

import { ICON_PATHS } from "./icons";
import { PAGE_CACHE_PREFIX } from "./sw-client";

/**
 * Runs public/sw.js in a fake service-worker global: in-memory Cache Storage, a scripted
 * network and recorded notifications. The real browser behavior is covered by
 * tests/e2e/pwa.spec.ts; this pins down the routing and push rules.
 */

const ORIGIN = "https://app.test";
const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

type FakeRequest = { url: string; method: string; mode: string; cache: string; headers: Headers };
type RequestLike = string | { url: string };
type Handler = (event: Record<string, unknown>) => void;
type Route = Response | Error | (() => Response | Error | Promise<Response>);

function absolute(input: RequestLike): string {
  return typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
}

function withoutSearch(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/** A same-origin response as the browser sees it (`type: "basic"`). */
function basic(body: string, init: ResponseInit = {}): Response {
  const response = new Response(body, { status: 200, ...init });
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

function html(body: string, lang = "en"): Response {
  return basic(`<!doctype html><html lang="${lang}"><body>${body}</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function request(path: string, init: Partial<FakeRequest> = {}): FakeRequest {
  return {
    url: new URL(path, ORIGIN).href,
    method: "GET",
    mode: "no-cors",
    cache: "default",
    headers: new Headers(),
    ...init,
  };
}

const navigation = (path: string) => request(path, { mode: "navigate" });

class FakeCache {
  entries: { url: string; response: Response }[] = [];

  constructor(private readonly network: (input: RequestLike) => Promise<Response>) {}

  async match(input: RequestLike, options: { ignoreSearch?: boolean } = {}) {
    const url = absolute(input);
    const same = (other: string) =>
      options.ignoreSearch ? withoutSearch(other) === withoutSearch(url) : other === url;
    return this.entries.find((entry) => same(entry.url))?.response.clone();
  }

  async put(input: RequestLike, response: Response) {
    const url = absolute(input);
    this.entries = this.entries.filter((entry) => entry.url !== url);
    this.entries.push({ url, response });
  }

  async add(input: RequestLike) {
    const response = await this.network(input);
    if (!response.ok) throw new TypeError(`add() failed: ${response.status}`);
    await this.put(input, response);
  }

  async keys() {
    return this.entries.map((entry) => ({ url: entry.url }));
  }

  async delete(input: RequestLike) {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.url !== absolute(input));
    return this.entries.length !== before;
  }

  urls() {
    return this.entries.map((entry) => new URL(entry.url).pathname + new URL(entry.url).search);
  }
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>();

  constructor(private readonly network: (input: RequestLike) => Promise<Response>) {}

  async open(name: string) {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new FakeCache(this.network);
      this.stores.set(name, cache);
    }
    return cache;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }

  async match(input: RequestLike, options: { cacheName?: string } = {}) {
    const names = options.cacheName ? [options.cacheName] : [...this.stores.keys()];
    for (const name of names) {
      const hit = await this.stores.get(name)?.match(input);
      if (hit) return hit;
    }
    return undefined;
  }

  cache(kind: "precache" | "static" | "pages") {
    const name = [...this.stores.keys()].find((key) => key.startsWith(`restart-${kind}-`));
    return name ? this.stores.get(name) : undefined;
  }
}

type Options = {
  routes?: Record<string, Route>;
  active?: boolean;
  language?: string;
  maxActions?: number;
  windows?: FakeWindow[];
};

type FakeWindow = {
  url: string;
  focused: boolean;
  visibilityState: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

function fakeWindow(path: string, init: Partial<FakeWindow> = {}): FakeWindow {
  const client: FakeWindow = {
    url: new URL(path, ORIGIN).href,
    focused: false,
    visibilityState: "visible",
    focus: vi.fn(async () => client),
    navigate: vi.fn(async () => client),
    postMessage: vi.fn(),
    ...init,
  };
  return client;
}

const OFFLINE_HTML = `<!doctype html><html lang="en"><head>
<link rel="stylesheet" href="/_next/static/chunks/app.css" />
<script src="/_next/static/chunks/main.js" async=""></script></head>
<body><h1>Offline</h1><script>self.__next_f.push([1,"1:I[42,[\\"/_next/static/chunks/offline-page.js\\"],\\"Retry\\"]"])</script></body></html>`;

function loadServiceWorker(options: Options = {}) {
  const routes: Record<string, Route> = {
    "/offline": () => html(OFFLINE_HTML.replace(/^[\s\S]*?<html/, "<html")),
    "/_next/static/chunks/app.css": () => basic("css"),
    "/_next/static/chunks/main.js": () => basic("js"),
    "/_next/static/chunks/offline-page.js": () => basic("js"),
    ...Object.fromEntries(
      ["/manifest.webmanifest", ...Object.values(ICON_PATHS)].map((path) => [
        path,
        () => basic(path),
      ]),
    ),
    ...options.routes,
  };

  const network = vi.fn(async (input: RequestLike, init?: RequestInit): Promise<Response> => {
    void init;
    const url = new URL(absolute(input));
    const route = routes[url.pathname + url.search] ?? routes[url.pathname];
    const result = typeof route === "function" ? await route() : route;
    if (result === undefined) return basic("not found", { status: 404 });
    if (result instanceof Error) throw result;
    return result;
  });

  const caches = new FakeCacheStorage(network);
  const handlers = new Map<string, Handler[]>();
  const timers: (() => void)[] = [];
  const windows = options.windows ?? [];

  const registration = {
    active: options.active ? {} : null,
    showNotification: vi.fn(async (title: string, opts?: NotificationOptions) => {
      void title;
      void opts;
    }),
    navigationPreload: { enable: vi.fn(async () => {}) },
  };
  const clients = {
    claim: vi.fn(async () => {}),
    matchAll: vi.fn(async () => windows),
    openWindow: vi.fn(async (url: string) => fakeWindow(url)),
  };
  const navigator = {
    language: options.language ?? "en-US",
    setAppBadge: vi.fn(async (count?: number) => {
      void count;
    }),
  };

  // Relative URLs resolve against the worker's location, as in a browser.
  class WorkerRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN) : input, init);
    }
  }

  const sandbox: Record<string, unknown> = {
    addEventListener: (type: string, handler: Handler) =>
      handlers.set(type, [...(handlers.get(type) ?? []), handler]),
    registration,
    clients,
    navigator,
    caches,
    fetch: network,
    skipWaiting: vi.fn(async () => {}),
    location: new URL("/sw.js", ORIGIN),
    Request: WorkerRequest,
    Response,
    Headers,
    URL,
    AbortSignal,
    Notification: { maxActions: options.maxActions },
    setTimeout: (callback: () => void) => timers.push(callback),
    console,
  };
  sandbox.self = sandbox;
  createContext(sandbox);
  runInContext(SOURCE, sandbox, { filename: "public/sw.js" });

  function listeners(type: string) {
    const list = handlers.get(type);
    if (!list?.length) throw new Error(`no ${type} listener`);
    return list;
  }

  /** Dispatches an ExtendableEvent and waits for everything passed to waitUntil(). */
  async function extendable(type: string, init: Record<string, unknown> = {}) {
    const pending: Promise<unknown>[] = [];
    const event = { ...init, waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    for (const listener of listeners(type)) listener(event);
    await Promise.all(pending);
    return event;
  }

  /** Dispatches a fetch event; resolves with the response given to respondWith(), if any. */
  async function fetchEvent(req: FakeRequest, init: { preloadResponse?: Promise<Response> } = {}) {
    let answer: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    const event = {
      request: req,
      preloadResponse: init.preloadResponse,
      respondWith: (response: Promise<Response>) => {
        answer = Promise.resolve(response);
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    };
    for (const listener of listeners("fetch")) listener(event);
    const response = answer ? await answer : undefined;
    await Promise.allSettled(pending);
    return { response, intercepted: answer !== undefined };
  }

  return {
    sandbox,
    caches,
    network,
    registration,
    clients,
    navigator,
    timers,
    routes,
    extendable,
    fetchEvent,
    value: (expression: string) => runInContext(expression, sandbox) as unknown,
  };
}

async function installed(options: Options = {}) {
  const sw = loadServiceWorker(options);
  await sw.extendable("install");
  await sw.extendable("activate");
  sw.network.mockClear();
  return sw;
}

describe("install and activate", () => {
  it("precaches the offline page with its files, the manifest and the icons", async () => {
    const sw = loadServiceWorker();
    await sw.extendable("install");

    expect(sw.caches.cache("precache")?.urls().sort()).toEqual(
      ["/offline", "/manifest.webmanifest", ...Object.values(ICON_PATHS)].sort(),
    );
    expect(sw.caches.cache("static")?.urls().sort()).toEqual([
      "/_next/static/chunks/app.css",
      "/_next/static/chunks/main.js",
      "/_next/static/chunks/offline-page.js",
    ]);
    // Precache requests skip the HTTP cache.
    const offlineRequest = sw.network.mock.calls.find(
      ([input]) => absolute(input) === `${ORIGIN}/offline`,
    )?.[0] as Request;
    expect(offlineRequest.cache).toBe("reload");
  });

  it("precaches exactly the icons the manifest uses", () => {
    const sw = loadServiceWorker();
    expect(sw.value("PRECACHE_URLS")).toEqual([
      "/manifest.webmanifest",
      ...Object.values(ICON_PATHS),
    ]);
  });

  it("takes over right away on the first install only", async () => {
    const first = loadServiceWorker();
    await first.extendable("install");
    expect(first.sandbox.skipWaiting).toHaveBeenCalledOnce();

    const update = loadServiceWorker({ active: true });
    await update.extendable("install");
    expect(update.sandbox.skipWaiting).not.toHaveBeenCalled();
  });

  it("fails the install when the offline page can't be fetched", async () => {
    const sw = loadServiceWorker({ routes: { "/offline": new TypeError("offline") } });
    await expect(sw.extendable("install")).rejects.toThrow();
  });

  it("still installs when an icon is missing", async () => {
    const sw = loadServiceWorker({ routes: { [ICON_PATHS.icon512]: basic("", { status: 404 }) } });
    await sw.extendable("install");
    expect(sw.caches.cache("precache")?.urls()).not.toContain(ICON_PATHS.icon512);
  });

  it("deletes caches of older versions, keeps other caches and claims the clients", async () => {
    const sw = loadServiceWorker();
    await sw.caches.open("restart-pages-v0");
    await sw.caches.open("restart-static-v0");
    await sw.caches.open("someone-else");
    await sw.extendable("install");
    await sw.extendable("activate");

    const names = await sw.caches.keys();
    expect(names).not.toContain("restart-pages-v0");
    expect(names).not.toContain("restart-static-v0");
    expect(names).toContain("someone-else");
    expect(sw.clients.claim).toHaveBeenCalledOnce();
    expect(sw.registration.navigationPreload.enable).toHaveBeenCalledOnce();
  });
});

describe("fetch routing", () => {
  it("ignores other methods, other origins, APIs and the sign-in flow", async () => {
    const sw = await installed();
    for (const req of [
      request("/today", { method: "POST", mode: "navigate" }),
      request("https://project.supabase.co/rest/v1/habits"),
      request("/api/push/subscriptions"),
      request("/auth/callback?code=1"),
    ]) {
      expect((await sw.fetchEvent(req)).intercepted).toBe(false);
    }
  });

  it("passes API and auth navigations to the network without caching them", async () => {
    const sw = await installed({ routes: { "/auth/callback": html("callback") } });
    const { response } = await sw.fetchEvent(navigation("/auth/callback?code=1"));
    expect(await response?.text()).toContain("callback");
    expect(sw.caches.cache("pages")?.urls() ?? []).toEqual([]);
  });

  it("uses the navigation preload response instead of fetching twice", async () => {
    const sw = await installed();
    const { response } = await sw.fetchEvent(navigation("/auth/callback?code=1"), {
      preloadResponse: Promise.resolve(html("preloaded")),
    });
    expect(await response?.text()).toContain("preloaded");
    expect(sw.network).not.toHaveBeenCalled();
  });

  it("serves /_next/static from the cache after the first request", async () => {
    const sw = await installed({ routes: { "/_next/static/chunks/today.js": basic("today") } });
    const req = request("/_next/static/chunks/today.js");
    expect(await (await sw.fetchEvent(req)).response?.text()).toBe("today");
    expect(await (await sw.fetchEvent(req)).response?.text()).toBe("today");
    expect(sw.network).toHaveBeenCalledOnce();
  });

  it("doesn't cache failed static requests", async () => {
    const sw = await installed();
    await sw.fetchEvent(request("/_next/static/chunks/gone.js"));
    expect(sw.caches.cache("static")?.urls()).not.toContain("/_next/static/chunks/gone.js");
  });

  it("serves precached icons offline", async () => {
    const sw = await installed();
    sw.routes[ICON_PATHS.icon192] = new TypeError("offline");
    const { response } = await sw.fetchEvent(request(ICON_PATHS.icon192));
    expect(await response?.text()).toBe(ICON_PATHS.icon192);
  });
});

describe("navigations", () => {
  it("answers from the network and caches the page", async () => {
    const sw = await installed({ routes: { "/login": html("login form") } });
    const { response } = await sw.fetchEvent(navigation("/login"));
    expect(await response?.text()).toContain("login form");
    expect(sw.caches.cache("pages")?.urls()).toEqual(["/login"]);
  });

  it("shows the cached copy of a visited page when offline", async () => {
    const sw = await installed({ routes: { "/login": html("login form") } });
    await sw.fetchEvent(navigation("/login"));
    sw.routes["/login"] = new TypeError("Failed to fetch");

    const { response } = await sw.fetchEvent(navigation("/login"));
    expect(await response?.text()).toContain("login form");
    // Same path with another query string falls back to that copy too.
    const withQuery = await sw.fetchEvent(navigation("/login?next=%2Ftoday"));
    expect(await withQuery.response?.text()).toContain("login form");
  });

  it("shows /offline for a page that was never visited", async () => {
    const sw = await installed({ routes: { "/habits": new TypeError("Failed to fetch") } });
    const { response } = await sw.fetchEvent(navigation("/habits"));
    expect(await response?.text()).toContain("<h1>Offline</h1>");
  });

  it("doesn't cache errors, redirects or non-HTML answers", async () => {
    const redirect = new Response(null, { status: 307, headers: { location: "/login" } });
    Object.defineProperty(redirect, "type", { value: "opaqueredirect" });
    const sw = await installed({
      routes: {
        "/broken": html("oops", "en"),
        "/today": redirect,
        "/data.json": basic("{}", { headers: { "content-type": "application/json" } }),
      },
    });
    sw.routes["/broken"] = basic("error", {
      status: 500,
      headers: { "content-type": "text/html" },
    });
    for (const path of ["/broken", "/today", "/data.json"]) await sw.fetchEvent(navigation(path));
    expect(sw.caches.cache("pages")?.urls() ?? []).toEqual([]);
  });

  it("shows the cached copy when the network is slow, and still refreshes it", async () => {
    const sw = await installed({ routes: { "/today": html("old today") } });
    await sw.fetchEvent(navigation("/today"));

    let finish: (response: Response) => void = () => {};
    sw.routes["/today"] = () => new Promise<Response>((resolve) => (finish = resolve));
    const pending = sw.fetchEvent(navigation("/today"));
    await vi.waitFor(() => expect(sw.timers.length).toBeGreaterThan(0));
    sw.timers.forEach((fire) => fire()); // The 3 s timeout.
    await vi.waitFor(() => expect(finish).not.toBe(undefined));
    finish(html("new today"));

    const { response } = await pending;
    expect(await response?.text()).toContain("old today");
    const cached = await sw.caches.cache("pages")?.match("/today");
    expect(await cached?.text()).toContain("new today");
  });

  it("keeps waiting on a slow network when nothing is cached", async () => {
    let finish: (response: Response) => void = () => {};
    const sw = await installed({
      routes: { "/stats": () => new Promise<Response>((resolve) => (finish = resolve)) },
    });
    const pending = sw.fetchEvent(navigation("/stats"));
    await vi.waitFor(() => expect(sw.timers.length).toBeGreaterThan(0));
    sw.timers.forEach((fire) => fire());
    finish(html("stats"));
    expect(await (await pending).response?.text()).toContain("stats");
  });

  it("keeps at most 30 pages", async () => {
    const routes = Object.fromEntries(
      Array.from({ length: 35 }, (_, i) => [`/habits/${i}`, () => html(`habit ${i}`)]),
    );
    const sw = await installed({ routes });
    for (let i = 0; i < 35; i++) await sw.fetchEvent(navigation(`/habits/${i}`));
    const urls = sw.caches.cache("pages")?.urls() ?? [];
    expect(urls).toHaveLength(30);
    expect(urls[0]).toBe("/habits/5");
  });
});

describe("messages", () => {
  it("activates a waiting worker on SKIP_WAITING", async () => {
    const sw = loadServiceWorker({ active: true });
    await sw.extendable("message", { data: { type: "SKIP_WAITING" } });
    expect(sw.sandbox.skipWaiting).toHaveBeenCalledOnce();
  });

  it("deletes cached pages on CLEAR_CACHES and replies on the port", async () => {
    const sw = await installed({ routes: { "/settings": html("my settings") } });
    await sw.fetchEvent(navigation("/settings"));
    const port = { postMessage: vi.fn() };

    await sw.extendable("message", { data: { type: "CLEAR_CACHES" }, ports: [port] });

    expect(sw.caches.cache("pages")).toBeUndefined();
    expect(sw.caches.cache("precache")?.urls()).toContain("/offline");
    expect(sw.caches.cache("static")).toBeDefined();
    expect(port.postMessage).toHaveBeenCalledWith({ type: "CLEAR_CACHES_DONE", ok: true });
  });

  it("re-caches /offline when the app's language changed", async () => {
    const sw = await installed();
    await sw.extendable("message", { data: { type: "REFRESH_OFFLINE_PAGE", lang: "en" } });
    expect(sw.network).not.toHaveBeenCalled();

    sw.routes["/offline"] = () => html("<h1>Sin conexión</h1>", "es");
    await sw.extendable("message", { data: { type: "REFRESH_OFFLINE_PAGE", lang: "es" } });
    const cached = await sw.caches.cache("precache")?.match("/offline");
    expect(await cached?.text()).toContain("Sin conexión");
  });

  it("names the page caches the way the sign-out fallback expects", () => {
    const sw = loadServiceWorker();
    expect(sw.value("CACHE_NAMES.pages")).toMatch(new RegExp(`^${PAGE_CACHE_PREFIX}`));
  });

  it("ignores unknown or malformed messages", async () => {
    const sw = await installed();
    for (const data of [null, "SKIP_WAITING", { type: "NOPE" }]) {
      await sw.extendable("message", { data });
    }
    expect(sw.sandbox.skipWaiting).toHaveBeenCalledTimes(1); // Only the first install's.
  });
});

function pushData(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { json: () => JSON.parse(text) as unknown, text: () => text };
}

describe("push", () => {
  const reminder = {
    v: 1,
    kind: "habit_reminder",
    title: "⏰ Meditate in 5 min",
    body: "After I brew coffee · 🔥 11 days",
    tag: "habit:6f1c:2026-10-20",
    url: "/today?habit=6f1c",
    badge: 3,
    actions: [
      { action: "done", title: "Done" },
      { action: "snooze", title: "15 min" },
      { action: "skip", title: "Skip" },
    ],
    actionToken: "eyJ.token",
  };

  it("knows every kind of the PushPayloadV1 contract", () => {
    expect(loadServiceWorker().value("PUSH_KINDS")).toEqual([...PUSH_KINDS]);
  });

  it("shows a PushPayloadV1 notification and sets the app badge", async () => {
    const sw = loadServiceWorker({ maxActions: 2 });
    await sw.extendable("push", { data: pushData(reminder) });

    expect(sw.registration.showNotification).toHaveBeenCalledWith("⏰ Meditate in 5 min", {
      body: "After I brew coffee · 🔥 11 days",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: "habit:6f1c:2026-10-20",
      renotify: true,
      data: { url: "/today?habit=6f1c", kind: "habit_reminder", actionToken: "eyJ.token" },
      actions: [
        { action: "done", title: "Done" },
        { action: "snooze", title: "15 min" },
      ],
    });
    expect(sw.navigator.setAppBadge).toHaveBeenCalledWith(3);
  });

  it("leaves out buttons where notifications have none (iPhone)", async () => {
    const sw = loadServiceWorker({ maxActions: undefined });
    await sw.extendable("push", { data: pushData(reminder) });
    const options = sw.registration.showNotification.mock.calls[0]?.[1];
    expect(options).not.toHaveProperty("actions");
  });

  it.each([
    ["no data", undefined],
    ["invalid JSON", { json: () => JSON.parse("{"), text: () => '{"title": "Meditate' }],
    ["an array", pushData([1, 2])],
    ["no title", pushData({ v: 1, kind: "test" })],
    ["a wrong title type", pushData({ title: 42, body: ["x"] })],
  ])("always shows a notification, even with %s", async (_name, data) => {
    const sw = loadServiceWorker();
    await sw.extendable("push", { data });
    expect(sw.registration.showNotification).toHaveBeenCalledOnce();
    const [title, options] = sw.registration.showNotification.mock.calls[0] ?? [];
    expect(title).toBe("Restart");
    expect(options?.body).toBe("Tap to open Restart.");
    expect(options?.data).toMatchObject({ url: "/today" });
    expect(sw.navigator.setAppBadge).not.toHaveBeenCalled();
  });

  it("uses Spanish fallback text on Spanish devices, and plain text as the body", async () => {
    const sw = loadServiceWorker({ language: "es-PE" });
    await sw.extendable("push", { data: undefined });
    await sw.extendable("push", { data: { json: () => JSON.parse("x"), text: () => "Hola" } });
    expect(sw.registration.showNotification.mock.calls.map(([, o]) => o?.body)).toEqual([
      "Toca para abrir Restart.",
      "Hola",
    ]);
  });

  it("never links outside the app", async () => {
    for (const url of ["https://evil.test/", "//evil.test/x", "javascript:alert(1)", "today"]) {
      const sw = loadServiceWorker();
      await sw.extendable("push", { data: pushData({ ...reminder, url }) });
      expect(sw.registration.showNotification.mock.calls[0]?.[1]?.data).toMatchObject({
        url: "/today",
      });
    }
  });

  it("retries without options the browser rejected", async () => {
    const sw = loadServiceWorker({ maxActions: 2 });
    sw.registration.showNotification.mockRejectedValueOnce(new TypeError("bad option"));
    await sw.extendable("push", { data: pushData(reminder) });
    expect(sw.registration.showNotification).toHaveBeenCalledTimes(2);
    expect(sw.registration.showNotification.mock.calls[1]?.[0]).toBe(reminder.title);
  });

  it("ignores badges that aren't counts", async () => {
    const sw = loadServiceWorker();
    await sw.extendable("push", { data: pushData({ ...reminder, badge: -1 }) });
    await sw.extendable("push", { data: pushData({ ...reminder, badge: "3" }) });
    expect(sw.navigator.setAppBadge).not.toHaveBeenCalled();
  });
});

function click(data: unknown, action = "") {
  return { notification: { data, close: vi.fn() }, action };
}

describe("notification clicks", () => {
  it("focuses an open window and shows the notification's page", async () => {
    const tab = fakeWindow("/stats");
    const sw = loadServiceWorker({ windows: [tab] });
    const event = click({ url: "/today?habit=1" });
    await sw.extendable("notificationclick", event);

    expect(event.notification.close).toHaveBeenCalled();
    expect(tab.focus).toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/today?habit=1`);
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it("asks an uncontrolled window to navigate itself", async () => {
    const tab = fakeWindow("/stats", {
      navigate: vi.fn(async () => {
        throw new TypeError("not controlled");
      }),
    });
    const sw = loadServiceWorker({ windows: [tab] });
    await sw.extendable("notificationclick", click({ url: "/today" }));
    expect(tab.postMessage).toHaveBeenCalledWith({ type: "NAVIGATE", url: "/today" });
  });

  it("opens Today in a new window when the app isn't open or the URL is unsafe", async () => {
    const sw = loadServiceWorker();
    await sw.extendable("notificationclick", click({ url: "https://evil.test/" }));
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/today`);
  });

  it("sends a button press to the API without opening the app", async () => {
    const sw = loadServiceWorker({
      routes: { "/api/notifications/action": basic('{"ok":true}') },
    });
    await sw.extendable(
      "notificationclick",
      click({ url: "/today", actionToken: "eyJ.token" }, "done"),
    );

    const [input, init] = sw.network.mock.calls[0] ?? [];
    expect(absolute(input as RequestLike)).toBe(`${ORIGIN}/api/notifications/action`);
    expect(init).toMatchObject({ method: "POST", credentials: "omit" });
    expect(JSON.parse(String(init?.body))).toEqual({ token: "eyJ.token", action: "done" });
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens the app when the button press fails", async () => {
    const sw = loadServiceWorker({
      routes: { "/api/notifications/action": basic("", { status: 404 }) },
    });
    await sw.extendable(
      "notificationclick",
      click({ url: "/today?habit=1", actionToken: "eyJ.token" }, "done"),
    );
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/today?habit=1`);
  });
});
