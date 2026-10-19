// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateUpdate,
  clearAppBadge,
  clearPageCaches,
  createUpdateCheck,
  isAppPath,
  isServiceWorkerEnabled,
  onUpdateWaiting,
  onWorkerNavigate,
  PAGE_CACHE_PREFIX,
  registerServiceWorker,
  syncOfflinePageLanguage,
  watchDocumentLanguage,
} from "./sw-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, "serviceWorker");
});

/** Minimal EventTarget with a typed `state`, standing in for a ServiceWorker. */
function fakeWorker(state: ServiceWorkerState) {
  const target = new EventTarget();
  return Object.assign(target, { state, postMessage: vi.fn() }) as unknown as ServiceWorker & {
    postMessage: ReturnType<typeof vi.fn>;
  };
}

function setState(worker: ServiceWorker, state: ServiceWorkerState) {
  Object.assign(worker, { state });
  worker.dispatchEvent(new Event("statechange"));
}

function fakeRegistration(init: { waiting?: ServiceWorker; installing?: ServiceWorker } = {}) {
  const target = new EventTarget();
  return Object.assign(target, {
    waiting: init.waiting ?? null,
    installing: init.installing ?? null,
    update: vi.fn(async () => {}),
  }) as unknown as ServiceWorkerRegistration & { update: ReturnType<typeof vi.fn> };
}

describe("isServiceWorkerEnabled", () => {
  it.each([
    [{ nodeEnv: "production" }, true],
    [{ nodeEnv: "development" }, false],
    [{ nodeEnv: "development", enableInDev: "1" }, true],
    [{ nodeEnv: "development", enableInDev: "true" }, false],
    [{ nodeEnv: "test" }, false],
  ])("%j → %s", (env, expected) => {
    expect(isServiceWorkerEnabled(env)).toBe(expected);
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole app, bypassing the HTTP cache for updates", async () => {
    const registration = fakeRegistration();
    const container = { register: vi.fn(async () => registration) };
    await expect(
      registerServiceWorker(container as unknown as ServiceWorkerContainer),
    ).resolves.toBe(registration);
    expect(container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("returns null without service workers or when registering fails", async () => {
    await expect(registerServiceWorker(undefined)).resolves.toBeNull();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const container = { register: vi.fn(async () => Promise.reject(new Error("SecurityError"))) };
    await expect(
      registerServiceWorker(container as unknown as ServiceWorkerContainer),
    ).resolves.toBeNull();
  });
});

describe("onUpdateWaiting", () => {
  const controlled = { controller: {} as ServiceWorker };
  const uncontrolled = { controller: null };

  it("reports a worker that was already waiting", () => {
    const waiting = fakeWorker("installed");
    const onWaiting = vi.fn();
    onUpdateWaiting(fakeRegistration({ waiting }), onWaiting, controlled);
    expect(onWaiting).toHaveBeenCalledWith(waiting);
  });

  it("reports an update once it has installed", () => {
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing });
    const onWaiting = vi.fn();
    onUpdateWaiting(registration, onWaiting, controlled);

    registration.dispatchEvent(new Event("updatefound"));
    expect(onWaiting).not.toHaveBeenCalled();
    setState(installing, "installed");
    expect(onWaiting).toHaveBeenCalledWith(installing);
  });

  it("ignores the first install (no controller yet) and stops after cleanup", () => {
    const installing = fakeWorker("installing");
    const registration = fakeRegistration({ installing });
    const onWaiting = vi.fn();
    onUpdateWaiting(registration, onWaiting, uncontrolled);
    registration.dispatchEvent(new Event("updatefound"));
    setState(installing, "installed");
    expect(onWaiting).not.toHaveBeenCalled();

    const later = fakeWorker("installing");
    const other = fakeRegistration({ installing: later });
    const stop = onUpdateWaiting(other, onWaiting, controlled);
    stop();
    other.dispatchEvent(new Event("updatefound"));
    setState(later, "installed");
    expect(onWaiting).not.toHaveBeenCalled();
  });
});

describe("activateUpdate", () => {
  it("asks the worker to take over and reloads once when it does", () => {
    vi.useFakeTimers();
    const container = new EventTarget();
    const worker = fakeWorker("installed");
    const reload = vi.fn();
    const guard = { reloading: false };

    activateUpdate(worker, { container, reload, guard });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();

    container.dispatchEvent(new Event("controllerchange"));
    container.dispatchEvent(new Event("controllerchange"));
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads anyway if the worker never takes over, but never twice per page", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const guard = { reloading: false };
    activateUpdate(fakeWorker("installed"), { container: new EventTarget(), reload, guard });
    activateUpdate(fakeWorker("installed"), { container: new EventTarget(), reload, guard });
    vi.advanceTimersByTime(5000);
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("createUpdateCheck", () => {
  it("checks at most every 30 minutes and survives failed checks", () => {
    let now = 0;
    const registration = fakeRegistration();
    registration.update.mockRejectedValue(new Error("offline"));
    const check = createUpdateCheck(registration, { now: () => now });

    now = 29 * 60_000;
    expect(check()).toBe(false);
    now = 30 * 60_000;
    expect(check()).toBe(true);
    now += 60_000;
    expect(check()).toBe(false);
    expect(registration.update).toHaveBeenCalledOnce();
  });
});

describe("clearAppBadge", () => {
  it("clears the badge where the Badging API exists", () => {
    const nav = { clearAppBadge: vi.fn(async () => Promise.reject(new Error("denied"))) };
    clearAppBadge(nav);
    expect(nav.clearAppBadge).toHaveBeenCalledOnce();
    expect(() => clearAppBadge({})).not.toThrow();
  });
});

describe("isAppPath", () => {
  it.each([
    ["/today", true],
    ["/today?habit=1#x", true],
    ["https://evil.test/today", false],
    ["//evil.test/today", false],
    ["/\\evil.test", false],
    ["today", false],
    [42, false],
  ])("%s → %s", (value, expected) => {
    expect(isAppPath(value, "https://app.test")).toBe(expected);
  });
});

describe("onWorkerNavigate", () => {
  it("follows NAVIGATE messages to app paths only", () => {
    const container = new EventTarget();
    const navigate = vi.fn();
    const stop = onWorkerNavigate(navigate, container);
    const send = (data: unknown) => container.dispatchEvent(new MessageEvent("message", { data }));

    send({ type: "NAVIGATE", url: "/today?habit=1" });
    send({ type: "NAVIGATE", url: "https://evil.test/" });
    send({ type: "OTHER", url: "/stats" });
    send("NAVIGATE");
    expect(navigate.mock.calls).toEqual([["/today?habit=1"]]);

    stop();
    send({ type: "NAVIGATE", url: "/stats" });
    expect(navigate).toHaveBeenCalledOnce();
  });
});

describe("offline page language", () => {
  it("tells the active worker the app's language", async () => {
    const active = { postMessage: vi.fn() };
    await syncOfflinePageLanguage("es", {
      ready: Promise.resolve({ active } as unknown as ServiceWorkerRegistration),
    });
    expect(active.postMessage).toHaveBeenCalledWith({ type: "REFRESH_OFFLINE_PAGE", lang: "es" });
  });

  it("reports <html lang> now and when it changes", async () => {
    document.documentElement.lang = "en";
    const onChange = vi.fn();
    const stop = watchDocumentLanguage(onChange);
    document.documentElement.lang = "es";
    await vi.waitFor(() => expect(onChange.mock.calls).toEqual([["en"], ["es"]]));
    stop();
  });
});

describe("clearPageCaches", () => {
  function stubCaches(names: string[]) {
    const store = { keys: vi.fn(async () => names), delete: vi.fn(async () => true) };
    vi.stubGlobal("caches", store);
    return store;
  }

  function stubServiceWorker(controller: Partial<ServiceWorker> | null) {
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { controller, getRegistration: vi.fn(async () => undefined) },
    });
  }

  it("asks the worker and trusts its answer", async () => {
    const store = stubCaches([`${PAGE_CACHE_PREFIX}v1`]);
    const controller = {
      postMessage: vi.fn((message: unknown, transfer: MessagePort[]) => {
        expect(message).toEqual({ type: "CLEAR_CACHES" });
        transfer[0]?.postMessage({ type: "CLEAR_CACHES_DONE", ok: true });
      }),
    };
    stubServiceWorker(controller as unknown as ServiceWorker);
    await clearPageCaches();
    expect(controller.postMessage).toHaveBeenCalledOnce();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("deletes the page caches itself when no worker answers", async () => {
    const store = stubCaches([`${PAGE_CACHE_PREFIX}v1`, "restart-static-v1", "other"]);
    stubServiceWorker({ postMessage: vi.fn() });
    await clearPageCaches({ timeoutMs: 10 });
    expect(store.delete.mock.calls).toEqual([[`${PAGE_CACHE_PREFIX}v1`]]);
  });

  it("works without service workers", async () => {
    const store = stubCaches([`${PAGE_CACHE_PREFIX}v1`]);
    await expect(clearPageCaches()).resolves.toBeUndefined();
    expect(store.delete).toHaveBeenCalledOnce();
  });
});
