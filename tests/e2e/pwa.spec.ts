import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// FR-PWA-1…3, docs/spec/03-architecture.md §8 and spike S5 (docs/spikes/S5-service-worker.md).
// Run against a production build (`npm run build && npm run test:e2e`): the service worker
// isn't registered by `next dev` unless NEXT_PUBLIC_ENABLE_SW_IN_DEV=1.

const serviceWorkerEnabled =
  !process.env.E2E_DEV || process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === "1";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

type ManifestIcon = { src: string; sizes?: string; type?: string; purpose?: string };
type Manifest = {
  id?: string;
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  background_color?: string;
  theme_color?: string;
  icons?: ManifestIcon[];
  shortcuts?: { name: string; url: string; icons?: ManifestIcon[] }[];
};

async function expectPng(request: APIRequestContext, src: string) {
  const response = await request.get(src);
  expect(response.status(), src).toBe(200);
  expect(response.headers()["content-type"], src).toMatch(/^image\/png/);
  expect([...(await response.body()).subarray(0, 4)], src).toEqual(PNG_SIGNATURE);
}

/** page.waitForFunction doesn't await async predicates, so poll page.evaluate instead. */
async function waitForActiveWorker(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null,
        ),
      { timeout: 20_000, message: "the service worker should install and activate" },
    )
    .toBe("activated");
}

async function waitUntilCached(page: Page, url: string) {
  await expect
    .poll(() => page.evaluate(async (key) => Boolean(await caches.match(key)), url), {
      timeout: 10_000,
      message: `${url} should be in the service worker's cache`,
    })
    .toBe(true);
}

test.describe("install files", () => {
  // Plain HTTP checks give the same answer on every device: run them once, on desktop.
  test.skip(({ isMobile }) => isMobile, "Device-independent checks run on desktop");

  test("the manifest describes an installable app, and every icon exists", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/application\/manifest\+json/);

    const manifest = (await response.json()) as Manifest;
    expect(manifest).toMatchObject({
      id: "/",
      name: "Restart",
      short_name: "Restart",
      start_url: "/today",
      scope: "/",
      display: "standalone",
    });
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);

    const icons = manifest.icons ?? [];
    const sizesFor = (purpose: string) =>
      icons
        .filter((icon) => (icon.purpose ?? "any").split(" ").includes(purpose))
        .map((i) => i.sizes);
    expect(sizesFor("any")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(sizesFor("maskable")).toContain("512x512");
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(["/today", "/settings"]);

    const shortcutIcons = (manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []);
    for (const icon of [...icons, ...shortcutIcons]) await expectPng(request, icon.src);
    await expectPng(request, "/icons/badge-96.png");
  });

  test("pages link the manifest, favicons and the Apple touch icon", async ({ page, request }) => {
    // /offline needs no session or database, so this check depends on nothing else.
    await page.goto("/offline");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /\/manifest\.webmanifest/,
    );
    const hrefs = await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    expect(hrefs.some((href) => href.includes("apple-icon"))).toBe(true);
    expect(hrefs.some((href) => href.includes("icon.svg"))).toBe(true);
    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      expect(response.headers()["content-type"], href).toMatch(/^image\//);
    }
  });

  test("/sw.js is never cached by the browser", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/javascript/);
    expect(response.headers()["cache-control"]).toMatch(/no-cache|no-store/);
    expect(await response.text()).toContain('addEventListener("fetch"');
  });

  test("/offline renders without a session", async ({ page }) => {
    const response = await page.goto("/offline");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/offline$/);
    await expect(page.locator("#offline-title")).toBeVisible();
    await expect(page.locator("#offline-retry")).toBeVisible();
  });
});

test.describe("service worker", () => {
  test.skip(!serviceWorkerEnabled, "The service worker only registers in production builds");

  test("registers for the whole app and controls the page after a reload", async ({ page }) => {
    await page.goto("/login");
    await waitForActiveWorker(page);
    await page.reload();

    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        scope: registration?.scope ?? null,
        updateViaCache: registration?.updateViaCache ?? null,
      };
    });
    expect(state.controller).toMatch(/\/sw\.js$/);
    expect(state.scope && new URL(state.scope).pathname).toBe("/");
    expect(state.updateViaCache).toBe("none");
  });

  test("offline: visited pages open from the cache, others show the offline page", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await waitForActiveWorker(page);
    await waitUntilCached(page, "/offline");
    // Load it again through the worker, so the page and its files are cached.
    await page.reload();
    await waitUntilCached(page, page.url());

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("#login-email")).toBeVisible();

      // Never visited: the offline page, at the requested URL.
      await page.goto("/habits");
      await expect(page.locator("#offline-title")).toBeVisible();
      await expect(page).toHaveURL(/\/habits$/);
    } finally {
      await context.setOffline(false);
    }

    // Back online, the page reloads (by itself on `online`, or with "Try again") and the
    // real route answers: signed out, /habits sends the visitor to sign in.
    await page
      .locator("#offline-retry")
      .click({ timeout: 2_000 })
      .catch(() => {
        // Already reloading.
      });
    await expect(page).toHaveURL(/\/login\?next=%2Fhabits$/);
  });
});
