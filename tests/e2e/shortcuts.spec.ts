import { expect, test } from "@playwright/test";

import { signInWithEmailCode } from "./helpers/auth";

// Phase 4: Siri & Shortcuts (FR-SIR-1…9). English UI.
test.use({ locale: "en-US", timezoneId: "America/Lima" });

test("a Shortcuts token logs a habit, the open app updates live, and undo works", async ({
  page,
}) => {
  await signInWithEmailCode(page);
  await page.goto("/habits/new?template=custom");
  await page.getByLabel("Name", { exact: true }).fill("Meditate");
  await page.getByRole("button", { name: "Create habit" }).click();
  await page.waitForURL(/\/today/);

  // FR-SIR-1: create a token; it's shown once.
  await page.goto("/settings#shortcuts");
  await page.locator("#token-name").fill("My iPhone");
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByText("Copy it now. It won't be shown again.")).toBeVisible();
  const token = (await page.locator("code", { hasText: /^ht_[\w-]{40,}$/ }).textContent()) ?? "";
  expect(token).toMatch(/^ht_[\w-]{40,}$/);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const today = await page.request.get("/api/v1/today", { headers });
  expect(await today.json()).toMatchObject({
    pending_count: 1,
    speech: "You have 1 habit left: Meditate.",
  });
  // The page notices the first call (§1.6).
  await expect(page.getByText("✅ Connected")).toBeVisible({ timeout: 15_000 });

  // "Hey Siri, log habit" → "meditate": the open app updates live (FR-SIR-9).
  await page.goto("/today");
  await expect(page.getByRole("button", { name: "Mark Meditate done" })).toBeVisible();
  const logged = await page.request.post("/api/v1/check-ins", {
    headers,
    data: { query: "MEDITATE" },
  });
  expect(logged.status()).toBe(200);
  expect((await logged.json()).speech).toBe(
    "Done, Meditate ✅. Perfect day! 🎉 You finished everything.",
  );
  await expect(page.getByRole("button", { name: "Mark Meditate not done" })).toBeVisible({
    timeout: 15_000,
  });

  // FR-SIR-5
  const undo = await page.request.post("/api/v1/check-ins/undo", { headers, data: {} });
  expect((await undo.json()).speech).toBe("Undid Meditate.");
  await expect(page.getByRole("button", { name: "Mark Meditate done" })).toBeVisible({
    timeout: 15_000,
  });

  // Revoking stops the shortcut at once.
  await page.goto("/settings#shortcuts");
  await page.getByRole("button", { name: "Revoke My iPhone" }).click();
  await expect(page.getByText("Token revoked.")).toBeVisible();
  const refused = await page.request.get("/api/v1/today", { headers });
  expect(refused.status()).toBe(401);
});
