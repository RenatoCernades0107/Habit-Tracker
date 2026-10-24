/**
 * Page-side helpers for the service worker in public/sw.js: registration, updates
 * (FR-PWA-3), the messages the worker understands, and clearing cached pages on sign-out.
 * Browser only; every function is safe to call where service workers don't exist.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/** Messages public/sw.js handles. */
export type WorkerMessage =
  | { type: "SKIP_WAITING" }
  | { type: "CLEAR_CACHES" }
  | { type: "REFRESH_OFFLINE_PAGE"; lang: string };

/** Must match CACHE_NAMES.pages in public/sw.js (sw.test.ts checks it). */
export const PAGE_CACHE_PREFIX = "restart-pages-";

/** How often a visible app looks for a new worker, at most. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

type Env = { nodeEnv?: string; enableInDev?: string };

/**
 * Production builds only: in development the worker's cache-first rules would serve
 * stale files. `NEXT_PUBLIC_ENABLE_SW_IN_DEV=1` opts in to test it with `next dev`.
 */
export function isServiceWorkerEnabled(
  env: Env = {
    nodeEnv: process.env.NODE_ENV,
    enableInDev: process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV,
  },
): boolean {
  return env.nodeEnv === "production" || env.enableInDev === "1";
}

export function supportsServiceWorker(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/** Registers /sw.js for the whole app. Never rejects; null when it can't. */
export async function registerServiceWorker(
  container: ServiceWorkerContainer | undefined = supportsServiceWorker()
    ? navigator.serviceWorker
    : undefined,
): Promise<ServiceWorkerRegistration | null> {
  if (!container) return null;
  try {
    // updateViaCache "none": update checks always reach the server, never the HTTP cache.
    return await container.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
  } catch (error) {
    console.warn("[pwa] service worker registration failed:", error);
    return null;
  }
}

/**
 * Calls `onWaiting` when an updated worker is installed and waiting to take over: now, if
 * one was downloaded on an earlier visit, or later when the browser finds one.
 */
export function onUpdateWaiting(
  registration: ServiceWorkerRegistration,
  onWaiting: (worker: ServiceWorker) => void,
  container: Pick<ServiceWorkerContainer, "controller"> = navigator.serviceWorker,
): () => void {
  const notify = (worker: ServiceWorker | null) => {
    // Without a controller this is the first install, not an update.
    if (worker?.state === "installed" && container.controller) onWaiting(worker);
  };
  notify(registration.waiting);

  const onUpdateFound = () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => notify(worker));
  };
  registration.addEventListener("updatefound", onUpdateFound);
  return () => registration.removeEventListener("updatefound", onUpdateFound);
}

type ActivateOptions = {
  container?: Pick<ServiceWorkerContainer, "addEventListener">;
  reload?: () => void;
  fallbackMs?: number;
  /** One reload per page, however many times this runs (loop guard). */
  guard?: { reloading: boolean };
};

const pageReloadGuard = { reloading: false };

/** "Update": lets the waiting worker take over, then reloads once onto the new version. */
export function activateUpdate(
  worker: Pick<ServiceWorker, "postMessage">,
  {
    container = navigator.serviceWorker,
    reload = () => window.location.reload(),
    fallbackMs = 5000,
    guard = pageReloadGuard,
  }: ActivateOptions = {},
): void {
  const reloadOnce = () => {
    if (guard.reloading) return;
    guard.reloading = true;
    reload();
  };
  container.addEventListener("controllerchange", reloadOnce, { once: true });
  // If the worker never takes over (e.g. a newer one replaced it), reload anyway.
  setTimeout(reloadOnce, fallbackMs);
  worker.postMessage({ type: "SKIP_WAITING" } satisfies WorkerMessage);
}

/** Returns a check that asks the browser for a new worker at most every `intervalMs`. */
export function createUpdateCheck(
  registration: Pick<ServiceWorkerRegistration, "update">,
  { intervalMs = UPDATE_CHECK_INTERVAL_MS, now = Date.now } = {},
): () => boolean {
  // Registering just checked.
  let lastCheck = now();
  return () => {
    const time = now();
    if (time - lastCheck < intervalMs) return false;
    lastCheck = time;
    // Offline or a server error: the next check tries again.
    registration.update().catch(() => {});
    return true;
  };
}

/** Phase 0 clears the app icon's badge when the app is opened (Phase 3 sets real counts). */
export function clearAppBadge(nav: Partial<Pick<Navigator, "clearAppBadge">> = navigator): void {
  if (typeof nav.clearAppBadge !== "function") return;
  nav.clearAppBadge().catch(() => {});
}

/** Only same-origin paths ("/today?habit=1"), never other sites or `//host` URLs. */
export function isAppPath(value: unknown, origin = window.location.origin): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

/** The worker asks pages it doesn't control to open a notification's page themselves. */
export function onWorkerNavigate(
  navigate: (path: string) => void,
  container: Pick<
    ServiceWorkerContainer,
    "addEventListener" | "removeEventListener"
  > = navigator.serviceWorker,
): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (data && typeof data === "object" && "type" in data && data.type === "NAVIGATE") {
      const url = "url" in data ? data.url : undefined;
      if (isAppPath(url)) navigate(url);
    }
  };
  container.addEventListener("message", listener);
  return () => container.removeEventListener("message", listener);
}

/** Keeps the cached offline page in the app's current language. */
export async function syncOfflinePageLanguage(
  lang: string,
  container: Pick<ServiceWorkerContainer, "ready"> = navigator.serviceWorker,
): Promise<void> {
  if (!lang) return;
  const { active } = await container.ready;
  active?.postMessage({ type: "REFRESH_OFFLINE_PAGE", lang } satisfies WorkerMessage);
}

/** Calls `onChange` with <html lang> now and whenever it changes (language switch). */
export function watchDocumentLanguage(onChange: (lang: string) => void): () => void {
  const root = document.documentElement;
  let current = root.lang;
  onChange(current);
  const observer = new MutationObserver(() => {
    if (root.lang === current) return;
    current = root.lang;
    onChange(current);
  });
  observer.observe(root, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
}

/**
 * Sign-out: deletes the pages the worker cached, since they may show this user's data.
 * Asks the worker, and deletes them directly if it doesn't answer in time. Never rejects.
 */
export async function clearPageCaches({ timeoutMs = 2000 } = {}): Promise<void> {
  try {
    const worker = await activeWorker();
    if (worker && (await askWorker(worker, { type: "CLEAR_CACHES" }, timeoutMs))) return;
  } catch {
    // Fall through to deleting them here.
  }
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith(PAGE_CACHE_PREFIX)).map((name) => caches.delete(name)),
    );
  } catch {
    // Storage unavailable (e.g. private mode): nothing was cached either.
  }
}

async function activeWorker(): Promise<ServiceWorker | null> {
  if (!supportsServiceWorker()) return null;
  const container = navigator.serviceWorker;
  return container.controller ?? (await container.getRegistration())?.active ?? null;
}

/** Posts a message with a reply port; true when the worker answers `{ ok: true }` in time. */
function askWorker(
  worker: Pick<ServiceWorker, "postMessage">,
  message: WorkerMessage,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const done = (ok: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      done(Boolean(data && typeof data === "object" && "ok" in data && data.ok === true));
    };
    worker.postMessage(message, [channel.port2]);
  });
}
