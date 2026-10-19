import { describe, expect, it, vi } from "vitest";

import en from "@messages/en/push.json";
import es from "@messages/es/push.json";

import { buildPushPayload } from "./payload";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-19T15:00:42.000Z");

describe("buildPushPayload", () => {
  it("builds the test notification in English", async () => {
    expect(
      await buildPushPayload(
        { id: "abc", kind: "test" },
        { locale: "en", timeZone: "UTC", now: NOW },
      ),
    ).toEqual({
      v: 1,
      kind: "test",
      title: en.notifications.test.title,
      body: en.notifications.test.body,
      tag: "test:abc",
      url: "/settings#notifications",
      badge: 1,
    });
  });

  it("builds it in Spanish", async () => {
    const payload = await buildPushPayload(
      { id: 7, kind: "test" },
      { locale: "es", timeZone: "UTC", now: NOW },
    );
    expect(payload?.title).toBe("🔔 Prueba de Restart");
    expect(payload?.body).toBe(es.notifications.test.body);
    expect(payload?.tag).toBe("test:7");
  });

  it("shows when a queued test was due and sent, in the user's time zone", async () => {
    const source = { id: 9, kind: "test" as const, sendAt: "2026-10-19T15:00:00.000Z" };

    const english = await buildPushPayload(source, {
      locale: "en",
      timeZone: "America/Lima",
      now: NOW,
    });
    expect(english?.body).toBe(
      "It works! Due 10:00:00 AM, sent 10:00:42 AM. Reminders will arrive on this device.",
    );

    const spanish = await buildPushPayload(source, {
      locale: "es",
      timeZone: "Europe/Madrid",
      now: NOW,
    });
    expect(spanish?.body).toBe(
      "¡Funciona! Programada para las 17:00:00, enviada a las 17:00:42. Los recordatorios llegarán a este dispositivo.",
    );
  });

  it("falls back to English and UTC for unknown values", async () => {
    const payload = await buildPushPayload(
      { id: 1, kind: "test", sendAt: "2026-10-19T15:00:00.000Z" },
      { locale: "fr", timeZone: "Not/AZone", now: NOW },
    );
    expect(payload?.title).toBe(en.notifications.test.title);
    expect(payload?.body).toContain("3:00:00 PM");
  });

  it.each(["habit_reminder", "routine_digest", "daily_report", "weekly_review"] as const)(
    "returns null for %s until Phase 3 builds it",
    async (kind) => {
      expect(
        await buildPushPayload({ id: 1, kind }, { locale: "en", timeZone: "UTC", now: NOW }),
      ).toBeNull();
    },
  );

  it("stays far below the 4 KB Web Push payload limit", async () => {
    const payload = await buildPushPayload(
      { id: Number.MAX_SAFE_INTEGER, kind: "test", sendAt: NOW.toISOString() },
      { locale: "es", timeZone: "UTC", now: NOW },
    );
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(1024);
  });
});
