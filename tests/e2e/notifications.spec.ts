import { expect, test } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 3: notification settings (FR-NTF-2…8, FR-RTN-3). English UI.
test.use({ locale: "en-US", timezoneId: "America/Lima" });

test("notification settings are saved and kept after a reload", async ({ page }) => {
  await signInWithEmailCode(page);
  await page.goto("/settings#notifications");

  await page.getByLabel("Remind me before a habit's time").selectOption("10");
  await expect(page.getByText("Saved.").first()).toBeVisible();

  const reportTime = page.locator("#report-time");
  await reportTime.fill("21:30");
  await reportTime.blur();

  await page.getByRole("button", { name: "Mute for today" }).click();
  await expect(page.getByText("Muted until tomorrow.").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Remind me before a habit's time")).toHaveValue("10");
  await expect(page.locator("#report-time")).toHaveValue("21:30");
  await expect(page.getByRole("button", { name: "Unmute" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Routine digests can be turned off per routine.
  const digest = page
    .getByRole("checkbox", { name: "Notify me at the start with what's left" })
    .first();
  await expect(digest).toBeChecked();
  await digest.uncheck();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Notify me at the start with what's left" }).first(),
  ).not.toBeChecked();
});

test("a reminder in quiet hours is flagged in the editor", async ({ page }) => {
  await signInWithEmailCode(page);
  await page.goto("/settings#notifications");
  const from = page.getByLabel("From");
  await from.fill("22:00");
  await from.blur();
  await expect(page.getByText("Saved.").first()).toBeVisible();

  await page.goto("/habits/new?template=custom");
  await page.getByLabel("Time", { exact: true }).fill("23:00");
  await expect(page.getByText("This reminder falls in your quiet hours")).toBeVisible();
});

test("a pending habit can be snoozed from the app (iPhone has no buttons)", async ({ page }) => {
  await signInWithEmailCode(page);
  await page.goto("/habits/new?template=custom");
  await page.getByLabel("Name", { exact: true }).fill("Water");
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);

  // A tapped reminder opens /today?habit=<id> with the habit's sheet.
  await page.getByRole("button", { name: "More for Water" }).click();
  await page.getByRole("button", { name: "30 min" }).click();
  await expect(page.getByText("I'll remind you in 30 min.")).toBeVisible();
});
