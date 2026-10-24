import { expect, test } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 7: public pages (FR-DAT-3) and the Content-Security-Policy.
test.use({ locale: "en-US", timezoneId: "America/Lima" });

test("privacy and getting started are public and linked from sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByText(/only daily totals/)).toBeVisible();

  await page.goto("/start");
  await expect(page.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL(/\/login/);
});

test("no Content-Security-Policy violations across the app", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(msg.text()))
      violations.push(msg.text());
  });
  const res = await page.goto("/login");
  expect(res?.headers()["content-security-policy"]).toContain("'strict-dynamic'");

  await signInWithEmailCode(page);
  for (const path of ["/today", "/habits/new", "/stats", "/settings", "/review"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(violations).toEqual([]);
});
