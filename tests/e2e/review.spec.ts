import { expect, test, type Page } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 2: stats, routine mode, mood, weekly review, data (FR-STA, FR-RMD, FR-REV, FR-DAT).
test.use({ locale: "en-US", timezoneId: "America/Lima" });

async function fromTemplate(page: Page, template: string) {
  await page.goto("/habits/new");
  await page.getByRole("link", { name: new RegExp(template, "i") }).click();
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);
}

test("stats and habit detail show a streak", async ({ page }) => {
  await signInWithEmailCode(page);
  await fromTemplate(page, "Journal");
  await page.getByRole("button", { name: "Mark Journal done" }).click();
  await expect(page.getByText("Synced")).toBeVisible();

  await page.goto("/stats");
  await expect(page.getByRole("heading", { level: 1, name: "Stats" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily score" })).toBeVisible();
  const strongest = page.getByRole("region", { name: "Strongest streaks" });
  await strongest.getByRole("link", { name: /Journal/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Journal/ })).toBeVisible();
  await expect(page.getByText("Current streak")).toBeVisible();
  await expect(page.getByText("1 day").first()).toBeVisible();
  // Table view of a chart.
  await page
    .getByRole("region", { name: "Completion" })
    .getByRole("button", { name: "Show as table" })
    .click();
  await expect(page.getByRole("rowheader", { name: "7 days" })).toBeVisible();
});

test("routine mode steps through the morning and logs each habit", async ({ page }) => {
  await signInWithEmailCode(page);
  await fromTemplate(page, "Stretch");
  await fromTemplate(page, "Meditate");

  await page.getByRole("link", { name: "Start Morning" }).click();
  await page.waitForURL(/\/routine\//);
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Routine finished" })).toBeVisible();
  await expect(page.getByText("2 of 2 done")).toBeVisible();
  await page.getByRole("link", { name: "Back to Today" }).click();
  await expect(page.getByRole("button", { name: "Mark Stretch not done" })).toBeVisible();
  await expect(page.getByText("10 of 10 min")).toBeVisible();
});

test("mood and the weekly reflection are saved", async ({ page }) => {
  await signInWithEmailCode(page);
  await fromTemplate(page, "Journal");

  await page.getByRole("radio", { name: "Great" }).click();
  await expect(page.getByRole("radio", { name: "Great" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Synced")).toBeVisible();

  await page.goto("/review");
  await expect(page.getByRole("heading", { level: 1, name: /Week of/ })).toBeVisible();
  await page.getByLabel("Reflection").fill("Evenings worked best.");
  await page.getByRole("button", { name: "Save reflection" }).click();
  await expect(page.getByText("Reflection saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Reflection")).toHaveValue("Evenings worked best.");
  await page.goto("/today");
  await expect(page.getByRole("radio", { name: "Great" })).toHaveAttribute("aria-checked", "true");
});

test("data can be exported and the account deleted", async ({ page }) => {
  await signInWithEmailCode(page);
  await page.goto("/settings#data");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export everything (JSON)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^restart-export-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole("button", { name: "Delete account" }).click();
  const confirm = page.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();
  await page.waitForURL(/\/login/);

  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});
