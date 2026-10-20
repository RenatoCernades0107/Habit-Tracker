import { expect, test } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 5: Apple Health (FR-HLT-1…7). English UI.
test.use({ locale: "en-US", timezoneId: "America/Lima" });

test("5,000 steps from Health complete the walk by themselves (FR-HLT-7)", async ({ page }) => {
  await signInWithEmailCode(page);

  // The "Walk" template comes with the rule steps ≥ 5,000.
  await page.goto("/habits/new");
  await page.getByRole("link", { name: /Walk/ }).click();
  await expect(page.getByLabel("Complete it automatically when")).toHaveValue("steps");
  await expect(page.getByLabel("is at least")).toHaveValue("5000");
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);

  await page.goto("/settings#shortcuts");
  // The page settles to one form (a second copy can show for a moment while it loads).
  await expect(page.locator("#token-name")).toHaveCount(1);
  await page.locator("#token-name").fill("Health");
  await page.getByRole("button", { name: "Create token" }).click();
  const token = (await page.locator("code", { hasText: /^ht_[\w-]{40,}$/ }).textContent()) ?? "";
  await expect(page.getByText("Health hasn't synced yet.")).toBeVisible();

  await page.goto("/today");
  await expect(page.getByText("0 of 5000 steps")).toBeVisible();

  // The habit day in Lima (the day starts at 04:00).
  const today = new Date(Date.now() - 4 * 3_600_000).toLocaleDateString("en-CA", {
    timeZone: "America/Lima",
  });
  const res = await page.request.post("/api/v1/health", {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: {
      metrics: [
        { metric: "steps", date: today, value: 6234 },
        { metric: "sleep_hours", date: today, value: 7 },
      ],
    },
  });
  expect(await res.json()).toMatchObject({
    accepted: 1,
    ignored: 1,
    speech: "Health synced. Completed Walk.",
  });

  // Live on the open app, with the badge.
  await expect(page.getByText("6234 of 5000 steps")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Verified by Health")).toBeVisible();

  await page.goto("/settings#health");
  await expect(page.getByText(/Last Health sync: /)).toBeVisible();
});
