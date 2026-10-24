/**
 * Restart service worker. Hand-written, no build step (spike S5,
 * docs/spikes/S5-service-worker.md). Served with no-cache headers (next.config.ts).
 *
 * Caching (FR-PWA-2, docs/spec/03-architecture.md §8):
 * - Precache on install: /offline plus the static files it needs, the manifest, the icons.
 * - /_next/static/*: cache-first. File names are content hashes, so entries never go stale.
 * - Page navigations: network-first. After 3 s without an answer, the cached copy of that
 *   page; when the network fails, the cached copy, then /offline.
 * - Never cached: anything but same-origin GET, /api/*, /auth/*, other origins. Supabase
 *   data lives in the app's IndexedDB cache, not here.
 *
 * Push and notification clicks: docs/spec/06-integrations.md §4.4–4.5.
 *
 * Bump VERSION when the caching rules or the precache list change. Any change to this
 * file makes browsers install it as an update; a new VERSION also starts with empty caches
 * and deletes the old ones on activation.
 */
"use strict";

const VERSION = "v1";
const CACHE_PREFIX = "restart-";
const CACHE_NAMES = {
  precache: `${CACHE_PREFIX}precache-${VERSION}`,
  static: `${CACHE_PREFIX}static-${VERSION}`,
  pages: `${CACHE_PREFIX}pages-${VERSION}`,
};

const OFFLINE_URL = "/offline";
/** Nice to have offline, but never worth failing the install over. */
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/badge-96.png",
  "/icons/shortcut-today-96.png",
  "/icons/shortcut-settings-96.png",
];
/** Served from the precache. /offline isn't here: navigations to it are network-first. */
const PRECACHED_PATHS = new Set(PRECACHE_URLS);
/** Requests the worker never answers from a cache: APIs and the sign-in flow. */
const NEVER_CACHED_PREFIXES = ["/api", "/auth"];

const NAVIGATION_TIMEOUT_MS = 3000;
const MAX_CACHED_PAGES = 30;
const MAX_CACHED_STATIC = 300;

const DEFAULT_APP_PATH = "/today";
const NOTIFICATION_ICON = "/icons/icon-192.png";
const NOTIFICATION_BADGE = "/icons/badge-96.png";
const NOTIFICATION_ACTION_URL = "/api/notifications/action";
const PUSH_KINDS = ["habit_reminder", "routine_digest", "daily_report", "weekly_review", "test"];

/**
 * Shown only when a push arrives without a usable title. The worker can't load the app's
 * message catalogs, so this last resort is inlined (English is the fallback language).
 */
const FALLBACK_TEXT = {
  en: { title: "Restart", body: "Tap to open Restart." },
  es: { title: "Restart", body: "Toca para abrir Restart." },
};

// ---------------------------------------------------------------------------------------
// Lifecycle

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precache();
      // The first worker has nothing to replace, so it takes over right away. Later
      // versions wait until the user accepts "Update available" (FR-PWA-3).
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set(Object.values(CACHE_NAMES));
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !current.has(name))
          .map((name) => caches.delete(name)),
      );
      // Starts page requests while the worker boots (Chromium, Safari 15.4+).
      await self.registration.navigationPreload?.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "SKIP_WAITING":
      event.waitUntil(self.skipWaiting());
      break;
    case "CLEAR_CACHES":
      // Sign-out: cached pages may show the previous user's data.
      event.waitUntil(
        clearPageCaches()
          .then(
            () => true,
            () => false,
          )
          .then((ok) => reply(event, { type: "CLEAR_CACHES_DONE", ok })),
      );
      break;
    case "REFRESH_OFFLINE_PAGE":
      // The language changed since /offline was cached.
      event.waitUntil(refreshOfflinePage(message.lang).catch(() => {}));
      break;
  }
});

function reply(event, data) {
  const port = event.ports && event.ports[0];
  if (port) port.postMessage(data);
  else if (event.source) event.source.postMessage(data);
}

async function precache() {
  const cache = await caches.open(CACHE_NAMES.precache);
  // Without the offline page the worker can't do its job: fail the install, and the
  // browser tries again on a later visit.
  await cacheOfflinePage(cache);
  await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(freshRequest(url))));
}

/** Bypasses the HTTP cache, so a new worker never precaches an old file. */
function freshRequest(url) {
  return new Request(url, { cache: "reload" });
}

async function cacheOfflinePage(cache) {
  const response = await fetch(freshRequest(OFFLINE_URL));
  if (!isCacheable(response)) throw new Error(`${OFFLINE_URL} answered ${response.status}`);
  const html = await response.clone().text();
  await cache.put(OFFLINE_URL, response);
  // Its scripts and styles too, so the page renders and its button works offline.
  await cacheStaticFiles(staticFilesIn(html));
}

async function refreshOfflinePage(lang) {
  if (typeof lang !== "string" || lang === "") return;
  const cache = await caches.open(CACHE_NAMES.precache);
  const cached = await cache.match(OFFLINE_URL);
  if (cached && htmlLang(await cached.text()) === lang) return;
  await cacheOfflinePage(cache);
}

function htmlLang(html) {
  const match = /<html[^>]*\slang="([^"]*)"/i.exec(html);
  return match ? match[1] : null;
}

/** `/_next/static/…` URLs referenced by a page (script and link tags, the RSC payload). */
function staticFilesIn(html) {
  const urls = new Set();
  for (const match of html.matchAll(
    /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s\\<>)&]+/g,
  )) {
    const path = match[0].startsWith("/") ? match[0] : `/_next/${match[0]}`;
    urls.add(path);
  }
  return [...urls];
}

async function cacheStaticFiles(urls) {
  const cache = await caches.open(CACHE_NAMES.static);
  await Promise.allSettled(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url);
      if (isCacheable(response)) await cache.put(url, response);
    }),
  );
}

async function clearPageCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${CACHE_PREFIX}pages-`))
      .map((name) => caches.delete(name)),
  );
}

/** Keeps the newest `max` entries (Cache keys are in insertion order; put moves to the end). */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

// ---------------------------------------------------------------------------------------
// Requests

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // DevTools issues these; fetch() would throw for them.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Not cached, but the preloaded response must be used, or the request would be sent
    // twice (an OAuth callback code can only be exchanged once).
    if (isNeverCached(url.pathname)) event.respondWith(networkResponse(event));
    else handleNavigation(event);
    return;
  }
  if (isNeverCached(url.pathname)) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event));
  } else if (url.search === "" && PRECACHED_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, url.pathname));
  }
});

function isNeverCached(pathname) {
  return NEVER_CACHED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Complete same-origin answers only: no errors, redirects or opaque responses. */
function isCacheable(response) {
  return (
    Boolean(response) &&
    response.status === 200 &&
    response.type === "basic" &&
    !response.redirected
  );
}

function isHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

/** The navigation-preload response when there is one, else a normal fetch. */
function networkResponse(event) {
  return Promise.resolve(event.preloadResponse).then(
    (preloaded) => preloaded || fetch(event.request),
  );
}

function handleNavigation(event) {
  const { request } = event;
  const network = networkResponse(event).then((response) => {
    // Cloned now, before the browser starts reading the body.
    const saved =
      isCacheable(response) && isHtml(response)
        ? savePage(request.url, response.clone())
        : Promise.resolve();
    return { response, saved };
  });
  // Keeps the worker alive until the page is stored, even if a cached copy answered first.
  event.waitUntil(network.then(({ saved }) => saved).catch(() => {}));
  event.respondWith(
    respondToNavigation(
      request,
      network.then(({ response }) => response),
    ),
  );
}

async function respondToNavigation(request, network) {
  try {
    const first = await Promise.race([network, delay(NAVIGATION_TIMEOUT_MS)]);
    if (first) return first;
    // Slow network: a cached copy beats a blank screen. The request keeps running and
    // refreshes the cache. With nothing cached, keep waiting: slow isn't offline.
    return (await cachedPage(request.url)) || (await network);
  } catch {
    return (await cachedPage(request.url)) || (await offlinePage()) || Response.error();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function savePage(url, response) {
  const cache = await caches.open(CACHE_NAMES.pages);
  await cache.put(url, response);
  await trimCache(CACHE_NAMES.pages, MAX_CACHED_PAGES);
  await trimCache(CACHE_NAMES.static, MAX_CACHED_STATIC);
}

/** The cached copy of this URL, else of the same path (e.g. /today for /today?habit=…). */
async function cachedPage(url) {
  const cache = await caches.open(CACHE_NAMES.pages);
  return (
    (await cache.match(url, { ignoreVary: true })) ||
    (await cache.match(url, { ignoreVary: true, ignoreSearch: true }))
  );
}

function offlinePage() {
  return caches.match(OFFLINE_URL, { cacheName: CACHE_NAMES.precache });
}

async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAMES.static);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  return response;
}

/** Precached files (manifest, icons): answer from the cache, refresh it in the background. */
function staleWhileRevalidate(event, path) {
  const refreshed = fetch(event.request).then(async (response) => {
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAMES.precache);
      await cache.put(path, response.clone());
    }
    return response;
  });
  event.waitUntil(refreshed.catch(() => {}));
  return caches
    .match(path, { cacheName: CACHE_NAMES.precache })
    .then((cached) => cached || refreshed);
}

// ---------------------------------------------------------------------------------------
// Push (docs/spec/06-integrations.md §4.4–4.5)

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(readPushData(event.data)));
});

/** The payload as sent: JSON, or plain text (e.g. DevTools' "Push" button). Never throws. */
function readPushData(data) {
  if (!data) return null;
  try {
    return data.json();
  } catch {
    // Not JSON.
  }
  try {
    const text = data.text().trim();
    // Broken JSON is a bug, not a message: show the fallback text rather than raw JSON.
    return text && !/^[[{]/.test(text) ? { body: text } : null;
  } catch {
    return null;
  }
}

async function showPush(raw) {
  const payload = parsePushPayload(raw);
  try {
    await self.registration.showNotification(payload.title, notificationOptions(payload));
  } catch {
    // Options this browser rejects: still show something. iOS cancels the subscription
    // of an app that receives pushes without showing a notification.
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: NOTIFICATION_ICON,
      data: { url: payload.url, kind: payload.kind },
    });
  }
  if (payload.badge !== undefined && typeof self.navigator.setAppBadge === "function") {
    await self.navigator.setAppBadge(payload.badge).catch(() => {});
  }
}

/**
 * PushPayloadV1 (src/lib/push/payload.ts), read defensively: every field is checked and
 * anything missing or malformed falls back, so a notification can always be shown.
 */
function parsePushPayload(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const fallback = fallbackText();
  const title = cleanText(value.title, 200);
  const body = cleanText(value.body, 1000);
  return {
    kind: PUSH_KINDS.includes(value.kind) ? value.kind : null,
    title: title || fallback.title,
    body: body || (title ? "" : fallback.body),
    tag: cleanText(value.tag, 200),
    url: safeAppPath(value.url),
    badge: Number.isInteger(value.badge) && value.badge >= 0 ? value.badge : undefined,
    actions: Array.isArray(value.actions)
      ? value.actions
          .filter((a) => a && cleanText(a.action, 64) && cleanText(a.title, 64))
          .map((a) => ({ action: cleanText(a.action, 64), title: cleanText(a.title, 64) }))
      : [],
    actionToken: cleanText(value.actionToken, 4096),
  };
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function fallbackText() {
  const language = (self.navigator.language || "").toLowerCase();
  return language.startsWith("es") ? FALLBACK_TEXT.es : FALLBACK_TEXT.en;
}

function notificationOptions(payload) {
  const options = {
    body: payload.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    data: { url: payload.url, kind: payload.kind, actionToken: payload.actionToken },
  };
  if (payload.tag) {
    // A newer notification for the same habit and day replaces the older one, and alerts again.
    options.tag = payload.tag;
    options.renotify = true;
  }
  const max = maxNotificationActions();
  // iPhone has no notification buttons; tapping opens the app (§4.7).
  if (max > 0 && payload.actions.length > 0) options.actions = payload.actions.slice(0, max);
  return options;
}

function maxNotificationActions() {
  const max = typeof Notification === "undefined" ? undefined : Notification.maxActions;
  return typeof max === "number" && max > 0 ? max : 0;
}

/** Only same-origin paths; anything else opens Today. */
function safeAppPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_APP_PATH;
  }
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return DEFAULT_APP_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_APP_PATH;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(handleNotificationClick(event.notification.data, event.action));
});

async function handleNotificationClick(rawData, action) {
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const url = safeAppPath(data.url);
  const token = typeof data.actionToken === "string" ? data.actionToken : "";
  if (action && token) {
    // A button (Done, Snooze) works without opening the app. If it didn't go through
    // (offline, expired token), open the app so the user can do it there.
    if (await sendNotificationAction(token, action)) return;
  }
  await openApp(url);
}

async function sendNotificationAction(token, action) {
  try {
    const response = await fetch(NOTIFICATION_ACTION_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action }),
      // The signed token authenticates the request (docs/spec/05-api.md §4), not cookies.
      credentials: "omit",
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(10000) : undefined,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Focuses an open window of the app and shows `path` there, or opens a new window. */
async function openApp(path) {
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const client =
    windows.find((c) => c.focused) ||
    windows.find((c) => c.visibilityState === "visible") ||
    windows[0];

  if (client) {
    try {
      const focused = (await client.focus()) || client;
      if (focused.url !== url) await showIn(focused, url, path);
      return;
    } catch {
      // Focus refused: open a window instead.
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url).catch(() => {});
}

async function showIn(client, url, path) {
  try {
    // Only works on windows this worker controls.
    await client.navigate(url);
  } catch {
    // An uncontrolled window (e.g. after a hard reload): the page navigates itself
    // (src/components/pwa/sw-register.tsx).
    client.postMessage({ type: "NAVIGATE", url: path });
  }
}
