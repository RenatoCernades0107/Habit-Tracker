import { expect, test, type Page } from "@playwright/test";

import { isTodayUrl, signInWithEmailCode } from "./helpers/auth";

// App shell and Phase 0 screens: docs/spec/07-ux.md §3–4, FR-TOD-7, FR-I18N-1, FR-ACC-3,
// NFR-1. Every test that signs in uses its own new account and browser context.
// Selectors use hrefs, ids and data attributes, so they work in both languages.

/** Phones and tablets get the bottom tab bar; 1024 px and wider get the sidebar. */
const isPhoneLayout = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

const tabBar = (page: Page) => page.locator('[data-shell="tab-bar"]');
const sidebar = (page: Page) => page.locator('[data-shell="sidebar"]');
/** The navigation in use. The sidebar's own <nav>: its brand link also points to /today. */
const visibleNav = (page: Page) =>
  isPhoneLayout(page) ? tabBar(page) : sidebar(page).getByRole("navigation");

/** React has hydrated the Settings page once the theme control shows the device's theme. */
async function waitForSettingsReady(page: Page) {
  await expect(page.locator('#theme button[aria-pressed="true"]')).toHaveCount(1);
}

test.describe("signed out", () => {
  test("the start URL sends signed-out visitors to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an unknown page says so and links back to Today", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('main a[href="/today"]')).toBeVisible();
  });
});

test.describe("app shell", () => {
  test("shows the navigation for the screen size, and tabs mark the current page", async ({
    page,
  }) => {
    await signInWithEmailCode(page);

    if (isPhoneLayout(page)) {
      await expect(tabBar(page)).toBeVisible();
      await expect(sidebar(page)).toBeHidden();
    } else {
      await expect(sidebar(page)).toBeVisible();
      await expect(tabBar(page)).toBeHidden();
    }

    const nav = visibleNav(page);
    await expect(nav.locator('a[href="/today"]')).toHaveAttribute("aria-current", "page");

    for (const path of ["/habits", "/stats", "/settings", "/today"]) {
      await nav.locator(`a[href="${path}"]`).click();
      await page.waitForURL((url) => url.pathname === path);
      await expect(nav.locator(`a[href="${path}"]`)).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator("main h1")).toBeVisible();
    }

    // Signed in, the start URL opens Today.
    await page.goto("/");
    await expect(page).toHaveURL(isTodayUrl);
  });

  test("the first Tab stop skips to the main content", async ({ page }) => {
    await signInWithEmailCode(page);
    // A fresh document, so keyboard focus starts at the top of the page.
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await page.keyboard.press("Tab");

    const skipLink = page.locator('a[href="#main"]');
    await expect(skipLink).toBeFocused();
    await expect(page.locator("main#main")).toHaveAttribute("tabindex", "-1");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test.describe("Today", () => {
  test("shows the setup checklist, which can be hidden for good", async ({ page }) => {
    await signInWithEmailCode(page);

    const checklist = page.locator("#setup-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.locator('a[href="/settings#install"]')).toBeVisible();
    await expect(checklist.locator('a[href="/settings#notifications"]')).toBeVisible();
    // Siri and Apple Health are iPhone-only; the mobile project uses an iPhone user agent.
    const isIPhone = /iPhone/.test(await page.evaluate(() => navigator.userAgent));
    await expect(checklist.getByRole("listitem")).toHaveCount(isIPhone ? 5 : 3);
    await expect(page.locator('main a[href="/habits"]')).toBeVisible();

    // Hydrated and checked once the list is no longer busy.
    await expect(checklist.locator("ul")).not.toHaveAttribute("aria-busy", "true");
    await checklist.getByRole("button").click();
    await expect(checklist).toHaveCount(0);

    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("#setup-checklist")).toHaveCount(0);
  });

  test("a checklist step opens its Settings section", async ({ page }) => {
    await signInWithEmailCode(page);
    await page.locator('#setup-checklist a[href="/settings#notifications"]').click();
    await page.waitForURL((url) => url.pathname === "/settings" && url.hash === "#notifications");
    await expect(page.locator("#notifications")).toBeInViewport();
  });
});

test.describe("Settings", () => {
  test("switching to Spanish translates the app and is kept after a reload", async ({ page }) => {
    await signInWithEmailCode(page);
    await page.goto("/settings#language");
    await waitForSettingsReady(page);

    const language = page.locator("#language");
    await language.getByRole("button", { name: "Español", exact: true }).click();

    await expect(page.locator("main h1")).toHaveText("Ajustes");
    await expect(language.getByRole("button", { name: "Español", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(visibleNav(page).locator('a[href="/today"]')).toHaveText("Hoy");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("main h1")).toHaveText("Ajustes");

    // And back, so the account ends in English like it started.
    await waitForSettingsReady(page);
    await language.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.locator("main h1")).toHaveText("Settings");
  });

  test("switching to the dark theme applies it and is kept after a reload", async ({ page }) => {
    await signInWithEmailCode(page);
    await page.goto("/settings#theme");
    await waitForSettingsReady(page);

    const dark = page.locator("#theme").getByRole("button", { name: /^(dark|oscuro)$/i });
    await dark.click();

    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(dark).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });
});
