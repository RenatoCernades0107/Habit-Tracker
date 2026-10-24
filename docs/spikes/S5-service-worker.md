# S5 · Service worker tooling

**Question** ([roadmap](../spec/08-roadmap.md#technical-spikes)): which service-worker tooling works with the current Next.js bundler, Serwist or a hand-written worker?
**Pass criteria:** an offline cold start of the installed app works.
**Decision:** a hand-written `public/sw.js`, with no dependencies. This is the roadmap's fallback, chosen here on its merits.

## Context

- Next.js 16.4 builds with Turbopack by default, for both `next dev` and `next build`.
- Spec: [Architecture §8](../spec/03-architecture.md#8-pwa) (PWA), [Integrations §4.4–4.5](../spec/06-integrations.md#44-payload) (push payload and worker), `FR-PWA-1…3`.
- The app is local-first. Supabase data lives in the app's IndexedDB cache (Phase 1), never in the service worker's caches.

## Options considered

| Option | How it works | Cost | Verdict |
|---|---|---|---|
| `@serwist/next` | A webpack plugin compiles `sw.ts` and injects a precache manifest of the build | Needs `next build --webpack`, giving up Turbopack for the whole app just for the worker | Rejected |
| `@serwist/turbopack` 9.5.13 | A route handler compiles `sw.ts` with esbuild and serves it, with a precache manifest of the build | Not installed. Adds `serwist`, `@serwist/turbopack` and its dependencies (`@serwist/build`, `@serwist/utils`, `@serwist/window`, `@swc/core`, `browserslist`, `semver`, `kolorist`, a pinned `zod` 4.6.5) plus an `esbuild` peer. That means a build-time compile step, a route and a config wrapper | Rejected for now |
| Hand-written `public/sw.js` | A static file served from `public/`, with no build step | About 500 lines of plain JavaScript that we own and test | **Chosen** |

Why hand-written:

1. **No new dependencies or build steps.** It works the same with Turbopack, webpack, `next dev` and `next start`, and it can't break when Next.js changes its bundler.
2. **The caching we need is small.** We need network-first pages, cache-first hashed static files, an offline page and push handling. Serwist's main extra, precaching every build file, would download the whole app on install. A habit tracker doesn't need that: its offline start page (Today) is always visited online first.
3. **Testable.** `src/lib/pwa/sw.test.ts` runs the real file in a simulated worker global (41 tests). `tests/e2e/pwa.spec.ts` checks it in Chromium against the production build.

Revisit when we need precaching of pages the user has never opened, Background Sync, or routing rules complex enough that Workbox-style strategies save code. Moving to `@serwist/turbopack` would then be an isolated change: the page-side contract (`src/lib/pwa/sw-client.ts`) stays the same.

## How it works

### Caches (versioned by `VERSION` in `public/sw.js`)

| Cache | Contents | Strategy | Limit |
|---|---|---|---|
| `restart-precache-<v>` | `/offline`, `/manifest.webmanifest`, the icons | Filled on install. Served cache-first and refreshed in the background (stale-while-revalidate) | Fixed list |
| `restart-static-<v>` | `/_next/static/*` (content-hashed JS, CSS, fonts), including the files `/offline` uses | Cache-first. Only 200 same-origin responses are stored | 300 entries, oldest first |
| `restart-pages-<v>` | HTML of pages the user opened | Network-first with a **3 s** timeout | 30 pages, oldest first |

Page navigations work like this:

1. The page comes from the network. With navigation preload it starts while the worker boots. A `200` same-origin, non-redirected, `text/html` response is also cached.
2. After 3 s without an answer, the worker serves the cached copy of that URL (or of the same path with another query string) and lets the request finish in the background to refresh the cache. With nothing cached it keeps waiting, because a slow network isn't the same as being offline.
3. When the network fails, the worker serves the cached copy, then `/offline`, at the URL the user asked for. "Try again" (or the browser's `online` event) reloads that URL.

These requests are **never** handled from a cache:

- anything but `GET`;
- other origins (Supabase, Google);
- `/api/*` and `/auth/*`.

Navigations to `/api/*` and `/auth/*` still go through `respondWith`, with the preloaded response when there is one. Otherwise the browser could send the request twice, and an OAuth callback code can only be exchanged once.

Install precaches `/offline` (this step is required: if it fails, the install fails and the browser retries on a later visit). The worker parses `/offline`'s HTML for its `/_next/static/…` files and caches them too, so the page renders and hydrates offline. Icons and the manifest are fetched in a best-effort step and never block the install.

### Lifecycle and updates (`FR-PWA-3`)

- **First install:** `skipWaiting()`, then `clients.claim()` on activate. The first page is controlled without a reload.
- **Updates:** browsers check `/sw.js`, which is served `no-cache`, registered with `updateViaCache: "none"`, and checked again when the app becomes visible, at most every 30 minutes. Any byte change installs a new worker, which **waits**. `ServiceWorkerRegister` shows a sonner toast, "Update available", with an "Update" action. The action posts `SKIP_WAITING` and reloads once on `controllerchange`, with a 5 s fallback and a once-per-page guard against loops.
- **Activate** deletes `restart-*` caches from other versions, enables navigation preload and claims clients.
- Bump `VERSION` when caching rules or the precache list change. Changing other code in the file is enough to trigger the update toast.
- App deploys that don't change `sw.js` don't trigger the toast. Pages are network-first, so users get the new HTML on their next page load. To show the toast on every deploy, a follow-up could stamp the build ID into the worker (for example, a generated `importScripts` file or a route-served worker).

### Messages (page → worker)

| Message | Effect |
|---|---|
| `{ type: "SKIP_WAITING" }` | The waiting worker takes over |
| `{ type: "CLEAR_CACHES" }` | Deletes `restart-pages-*` (sign-out: pages may show the previous user's data). Replies `{ type: "CLEAR_CACHES_DONE", ok }` on the message port |
| `{ type: "REFRESH_OFFLINE_PAGE", lang }` | Re-caches `/offline` when `<html lang>` differs from the cached copy's language. Sent by `ServiceWorkerRegister` on load and when the language changes |

The worker sends `{ type: "NAVIGATE", url }` to a window it doesn't control (for example, after a hard reload) when a notification asks for a page. `ServiceWorkerRegister` checks the URL is a same-origin path, then navigates.

`clearPageCaches()` in `src/lib/pwa/sw-client.ts` wraps `CLEAR_CACHES`. If the worker doesn't answer within 2 s, it deletes the page caches from the page itself.

### Push (`docs/spec/06-integrations.md` §4.4–4.5)

- **`push`:** reads `PushPayloadV1` (`src/lib/push/payload.ts`) defensively. Every field is type-checked and length-capped, and broken JSON or plain text falls back to a short "Tap to open Restart." in English or Spanish, based on `navigator.language`. `showNotification` is **always** called, because iOS revokes the subscriptions of apps that receive pushes silently. If the browser rejects the options, the worker shows the notification again without them. Options:
  - `body`, `tag` (with `renotify`), `icon: /icons/icon-192.png`, `badge: /icons/badge-96.png`;
  - `data: { url, kind, actionToken }`;
  - `actions` only when `Notification.maxActions > 0`, cut to that number (iPhone has none).

  After that, `navigator.setAppBadge(badge)` runs when the payload has a non-negative integer badge and the API exists.
- **`notificationclick`:** closes the notification.
  - With a button and an `actionToken`: `POST /api/notifications/action { token, action }` without cookies (the token authenticates it) and a 10 s timeout. On success nothing opens, so one tap is enough. On failure (offline, expired token, endpoint missing) the app opens so the user can do it there.
  - Otherwise: focus an open window and navigate it to `data.url`, or open a new window. Only same-origin paths are accepted; anything else opens `/today`.

### Badge and install prompt

- Phase 0 clears the app badge when the app becomes visible. Phase 3 sets real counts.
- `src/lib/pwa/install-prompt.ts` captures `beforeinstallprompt` as soon as `ServiceWorkerRegister` loads, for the "Install app" button in `InstallGuide`.

## How to test locally

The worker registers in production builds only.

```bash
npm run build && npm run start          # http://localhost:3000
npm run test:e2e -- tests/e2e/pwa.spec.ts   # builds must exist; Playwright starts `next start` on :3100
```

Chrome DevTools → **Application**:

- **Service workers:** status, "Update", "skipWaiting". The **Push** box sends a plain-text push, which becomes the body. Avoid "Update on reload" when testing the update toast: it hides the waiting state.
- **Cache storage:** `restart-precache-v1`, `restart-static-v1`, `restart-pages-v1`.
- **Manifest:** identity, icons (including the maskable safe-zone preview), shortcuts, installability.
- **Network → Offline:** reload a visited page (from cache), then open one you haven't visited (`/offline` content at that URL). Back online, the page reloads by itself.

To try the update toast, change any byte in `public/sw.js`, rebuild, start, then refocus the tab or reload. The toast appears, and "Update" reloads onto the new worker.

During development, `NEXT_PUBLIC_ENABLE_SW_IN_DEV=1 npm run dev` registers the worker. Unregister it afterwards in DevTools: cache-first static files and dev builds don't mix.

Test-writing note: `page.waitForFunction` doesn't await async predicates (a pending Promise counts as truthy). Poll `page.evaluate(async () => …)` with `expect.poll` instead, as `pwa.spec.ts` does.

### Device checklist (with S1/S2)

- [ ] iPhone (iOS 16.4+ and current): Safari → Share → Add to Home Screen. Opens standalone on Today, with the icon and splash on the brand background.
- [ ] iPhone, Airplane Mode: cold start from the Home Screen opens Today from the cache. An unvisited page shows the offline page.
- [ ] iPhone: a test push shows the notification and sets the badge. Opening the app clears the badge.
- [ ] Android Chrome: the "Install app" button shows the browser dialog. The maskable icon isn't clipped. Shortcuts (Today, Settings) work. Notification buttons appear.
- [ ] Desktop Chrome or Edge: install from the address bar. The update toast appears after a deploy that changes `sw.js`.

## Results

Before integration, `public/sw.js` was checked in Chromium 141 (Playwright's bundled build, `/opt/pw-browsers/chromium-1194`) against a stub server that mimics the app's routes (not the Next.js build). These checks passed:

- install, precache, navigation preload and claim;
- the visited page cached and served offline; the unvisited page showing `/offline` at its own URL;
- "Try again" back online;
- the 3 s slow-network fallback, with the cache refreshed in the background;
- the OAuth callback fetched exactly once;
- the language refresh of `/offline`, and `CLEAR_CACHES` with its reply;
- update install → waiting → `SKIP_WAITING` → `controllerchange`;
- CDP push delivery: a valid payload with two of three actions, broken JSON, and an empty payload all shown.

`tests/e2e/pwa.spec.ts` also passed (8 passed, 4 skipped on mobile by design) against that stub.

To be filled in by the integrator, against `npm run build && npm run start`:

| Date | Commit | Check | Result | Notes |
|---|---|---|---|---|
| | | `npm run test:e2e -- tests/e2e/pwa.spec.ts` (desktop + mobile) | | |
| | | Lighthouse PWA / installability (Chrome) | | |
| | | iPhone checklist above | | |
| | | Android checklist above | | |
| | | Offline cold start of the installed app (pass criterion) | | |
