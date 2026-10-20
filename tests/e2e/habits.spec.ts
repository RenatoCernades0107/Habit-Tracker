import { expect, test, type Page } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 1: habits and check-ins (FR-HAB, FR-CHK, FR-TOD). English UI.
test.use({ locale: "en-US", timezoneId: "America/Lima" });

async function createFromTemplate(page: Page, template: string, name: string) {
  await page.goto("/habits/new");
  await page.getByRole("link", { name: new RegExp(template, "i") }).click();
  const field = page.getByLabel("Name", { exact: true });
  await field.fill(name);
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);
}

async function createCustom(page: Page, name: string) {
  await page.goto("/habits/new");
  await page.getByRole("link", { name: /Create my own/ }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);
}

test("a habit from a template shows on Today and counts up, with Undo", async ({ page }) => {
  await signInWithEmailCode(page);
  await createFromTemplate(page, "Drink water", "Water");

  await expect(page.getByText("0 of 8 glasses")).toBeVisible();
  await page.getByRole("button", { name: "Add 1 to Water" }).click();
  await expect(page.getByText("1 of 8 glasses")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("0 of 8 glasses")).toBeVisible();

  // The exact value from the sheet completes it.
  await page.getByRole("button", { name: "More for Water" }).click();
  await page.getByLabel(/Value/).fill("8");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("8 of 8 glasses")).toBeVisible();
  await expect(page.getByText("1 of 1 done")).toBeVisible();
});

test("check-ins are saved on the server and survive a reload", async ({ page }) => {
  await signInWithEmailCode(page);
  await createCustom(page, "Meditate");

  const toggle = page.getByRole("button", { name: "Mark Meditate done" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Mark Meditate not done" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Synced")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Mark Meditate not done" })).toBeVisible();
});

test("skipping asks for a reason and shows the skips left", async ({ page }) => {
  await signInWithEmailCode(page);
  await createCustom(page, "Stretch");

  await page.getByRole("button", { name: "More for Stretch" }).click();
  await expect(page.getByText("4 skips left this month")).toBeVisible();
  await page.getByRole("button", { name: "Travel" }).click();
  await expect(page.getByText("Skipped · Travel")).toBeVisible();
  // A skipped habit doesn't count against the score: nothing scheduled is left.
  await expect(page.getByText("0 of 0 done")).toHaveCount(0);
});

test("past days can be logged with the day switcher", async ({ page }) => {
  await signInWithEmailCode(page);
  await page.goto("/habits/new?template=custom");
  await page.getByLabel("Name", { exact: true }).fill("Journal");
  // Started a few days ago, so yesterday can be logged.
  const start = new Date(Date.now() - 3 * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/Lima",
  });
  await page.getByLabel("Start date").fill(start);
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByText("Yesterday")).toBeVisible();
  await page.getByRole("button", { name: "Mark Journal done" }).click();
  await expect(page.getByRole("button", { name: "Mark Journal not done" })).toBeVisible();

  await page.getByRole("button", { name: "Back to today" }).click();
  await expect(page.getByRole("button", { name: "Mark Journal done" })).toBeVisible();
});

test("check-ins made offline sync when the connection returns", async ({ page, context }) => {
  await signInWithEmailCode(page);
  await createCustom(page, "Read");
  await expect(page.getByText("Synced")).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Mark Read done" }).click();
  await expect(page.getByRole("button", { name: "Mark Read not done" })).toBeVisible();
  await expect(page.getByText(/Offline/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Synced")).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Mark Read not done" })).toBeVisible();
});

test("a check-in on one device appears live on another", async ({ page, browser }) => {
  const email = await signInWithEmailCode(page);
  await createCustom(page, "Walk");

  const other = await browser.newContext({ locale: "en-US", timezoneId: "America/Lima" });
  const second = await other.newPage();
  await signInWithEmailCode(second, email);
  await expect(second.getByRole("button", { name: "Mark Walk done" })).toBeVisible();

  await page.getByRole("button", { name: "Mark Walk done" }).click();
  await expect(second.getByRole("button", { name: "Mark Walk not done" })).toBeVisible({
    timeout: 15_000,
  });
  await other.close();
});

test("archiving hides a habit from Today; restoring brings it back", async ({ page }) => {
  await signInWithEmailCode(page);
  await createCustom(page, "Floss");

  await page.goto("/habits");
  await page.getByRole("link", { name: /Floss/ }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await page.waitForURL(/\/habits$/);
  await expect(page.getByRole("link", { name: /Floss/ })).toHaveCount(0);

  await page.getByRole("radio", { name: "Archived" }).click();
  await page.getByRole("link", { name: /Floss/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.goto("/today");
  await expect(page.getByRole("button", { name: "Mark Floss done" })).toBeVisible();
});
