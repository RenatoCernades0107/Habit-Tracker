import { expect, test } from "@playwright/test";

import {
  enterCode,
  isTodayUrl,
  requestEmailCode,
  signInWithEmailCode,
  uniqueEmail,
  waitForEmailCode,
} from "./helpers/auth";

// FR-ACC-1, FR-ACC-6 and docs/spec/03-architecture.md §6. Every test uses its own account.

test.describe("sign-in", () => {
  test("signed-out visitors of the app are sent to /login with a way back", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/);
    await expect(page.locator("#login-email")).toBeVisible();
  });

  test("a new user signs in with an email code and lands on Today", async ({ page }) => {
    await signInWithEmailCode(page);
    await expect(page).toHaveURL(isTodayUrl);
  });

  test("a wrong code shows an error and stays on the code step", async ({ page }) => {
    const email = uniqueEmail();
    const alreadySeen = await requestEmailCode(page, email);
    const realCode = await waitForEmailCode(email, alreadySeen);
    const wrongCode = String((Number(realCode) + 1) % 1_000_000).padStart(6, "0");

    await enterCode(page, wrongCode);

    const error = page.locator('[data-slot="alert"]');
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();
    await expect(page.locator("#login-code")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#login-code")).toHaveValue("");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signed-in users visiting /login are sent to Today", async ({ page }) => {
    await signInWithEmailCode(page);
    await page.goto("/login");
    await expect(page).toHaveURL(isTodayUrl);
  });

  test("signing out returns to /login and protects the app again", async ({ page }) => {
    await signInWithEmailCode(page);
    await page.goto("/settings#account");

    // The account section of Settings. Matches "Sign out" / "Cerrar sesión" exactly,
    // not "Sign out of all devices".
    await page
      .getByRole("button", { name: /^(sign out|log out|cerrar sesión)$/i })
      .first()
      .click();

    await page.waitForURL((url) => url.pathname === "/login");
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/);
  });
});
