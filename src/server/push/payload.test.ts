import { describe, expect, it, vi } from "vitest";

import en from "@messages/en/push.json";
import es from "@messages/es/push.json";

import { buildNotificationPayload, buildPushPayload } from "./payload";

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

describe("buildNotificationPayload (docs/spec/06-integrations.md §4.6)", () => {
  const ctx = (locale: string, extra = {}) => ({ locale, today: "2026-10-20", badge: 3, ...extra });
  const morning = {
    id: "r1",
    system_key: "morning",
    name: null,
    icon: "🌅",
    start_time: "07:00:00",
    sort_order: 0,
    deleted_at: null,
    digest_enabled: true,
  };
  const reminder = {
    kind: "habit_reminder" as const,
    habitId: "h1",
    name: "Meditar",
    icon: null,
    cue: "Después de preparar el café",
    leadMinutes: 5,
    streak: 11,
    weekly: false,
  };

  it("habit reminder, with buttons and a link to the habit", async () => {
    const es = await buildNotificationPayload(
      { id: 1, localDate: "2026-10-20", content: reminder },
      ctx("es", { actionToken: "tok" }),
    );
    expect(es).toMatchObject({
      title: "⏰ Meditar en 5 min",
      body: "Después de preparar el café · 🔥 11 días",
      tag: "habit:h1:2026-10-20",
      url: "/today?habit=h1",
      badge: 3,
      actions: [
        { action: "done", title: "Hecho" },
        { action: "snooze", title: "15 min" },
      ],
      actionToken: "tok",
    });
    const en = await buildNotificationPayload(
      {
        id: 1,
        localDate: "2026-10-19",
        content: { ...reminder, name: "Meditate", cue: "After I brew coffee", leadMinutes: 0 },
      },
      ctx("en"),
    );
    expect(en).toMatchObject({
      title: "⏰ Time for Meditate",
      body: "After I brew coffee · 🔥 11 days",
      url: "/today?habit=h1&day=2026-10-19",
    });
    expect(en.actions).toBeUndefined();
  });

  it("routine digest", async () => {
    const content = {
      kind: "routine_digest" as const,
      routineId: "r1",
      routine: morning,
      names: ["Meditate", "Read", "Water", "Stretch"],
    };
    expect(
      await buildNotificationPayload({ id: 2, localDate: "2026-10-20", content }, ctx("en")),
    ).toMatchObject({
      title: "🌅 Morning routine · 4 habits",
      body: "Meditate, Read, Water, Stretch",
      url: "/routine/r1",
    });
    const es = await buildNotificationPayload(
      {
        id: 2,
        localDate: "2026-10-20",
        content: { ...content, names: [...content.names, "Diario"] },
      },
      ctx("es"),
    );
    expect(es).toMatchObject({
      title: "🌅 Rutina de mañana · 5 hábitos",
      body: "Meditate, Read, Water, Stretch +1 más",
    });
  });

  it("daily report and perfect day", async () => {
    const content = {
      kind: "daily_report" as const,
      score: 0.8,
      done: 8,
      total: 10,
      best: { name: "Meditar", days: 12 },
      left: ["Leer", "Diario"],
      attention: [],
    };
    expect(
      await buildNotificationPayload({ id: 3, localDate: "2026-10-20", content }, ctx("es")),
    ).toMatchObject({
      title: "📊 Hoy: 80\u00a0% (8/10)",
      body: "🔥 Meditar 12 días. Faltan: Leer, Diario",
      url: "/today?mood=1",
    });
    expect(
      await buildNotificationPayload(
        {
          id: 3,
          localDate: "2026-10-20",
          content: { ...content, best: { name: "Meditate", days: 12 }, left: ["Read", "Journal"] },
        },
        ctx("en"),
      ),
    ).toMatchObject({
      title: "📊 Today: 80% (8/10)",
      body: "🔥 Meditate 12 days. Left: Read, Journal",
    });
    const perfect = await buildNotificationPayload(
      { id: 3, localDate: "2026-10-20", content: { ...content, score: 1, done: 10, left: [] } },
      ctx("en"),
    );
    expect(perfect).toMatchObject({
      title: "🎉 Perfect day! 100%",
      body: "How did you feel today?",
    });
  });

  it("weekly review", async () => {
    const content = {
      kind: "weekly_review" as const,
      weekStart: "2026-10-19",
      score: 0.76,
      delta: 0.06,
    };
    expect(
      await buildNotificationPayload({ id: 4, localDate: "2026-10-25", content }, ctx("en")),
    ).toMatchObject({
      title: "🗓️ Your week: 76% (+6%)",
      body: "Tap to review it and plan the next one.",
      url: "/review/2026-10-19",
    });
    expect(
      (await buildNotificationPayload({ id: 4, localDate: "2026-10-25", content }, ctx("es")))
        .title,
    ).toBe("🗓️ Tu semana: 76\u00a0% (+6\u00a0%)");
  });
});
