import { expect, test } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 6: Google Calendar (FR-CAL-1…7). The local stack has no Google client, so this covers
// what works without one; the sync itself is tested against a fake Google (calendar.test.ts).
test.use({ locale: "en-US", timezoneId: "America/Lima" });

test("without Google set up, Settings says so and the editor explains the switch", async ({
  page,
}) => {
  await signInWithEmailCode(page);
  await page.goto("/settings#calendar");
  await expect(
    page.getByRole("region", { name: "Google Calendar" }).getByText(/isn't set up on this server/),
  ).toBeVisible();

  await page.goto("/habits/new?template=custom");
  const toggle = page.getByRole("checkbox", { name: "Show in Google Calendar" });
  await expect(toggle).toBeDisabled();
  await expect(page.getByText("Connect Google Calendar in Settings first.")).toBeVisible();
});

test("the connect endpoint refuses when Google isn't configured", async ({ page }) => {
  await signInWithEmailCode(page);
  const res = await page.request.get("/api/calendar/google/connect", { maxRedirects: 0 });
  expect(res.status()).toBe(500);
});
