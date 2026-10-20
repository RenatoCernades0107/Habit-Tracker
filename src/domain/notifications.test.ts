import { describe, expect, it } from "vitest";

import {
  badgeCount,
  contentFor,
  instantOnHabitDay,
  planNotifications,
  reviewedWeek,
  suppressionFor,
  type NotifyData,
  type NotifyHabit,
  type NotifyProfile,
  type NotifyRoutine,
} from "./notifications";
import type { CheckInRow } from "./types";
import { inQuietHours, zonedTimeToUtc } from "./zoned";

const TODAY = "2026-10-20"; // Tuesday

const profile: NotifyProfile = {
  timezone: "America/Lima",
  day_start_hour: 4,
  week_start: 1,
  reminder_lead_min: 5,
  daily_report_enabled: true,
  daily_report_time: "22:00:00",
  weekly_review_enabled: true,
  weekly_review_dow: 7,
  weekly_review_time: "19:00:00",
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_until: null,
};

let seq = 0;
function habit(o: Partial<NotifyHabit> = {}): NotifyHabit {
  seq++;
  return {
    id: `n${seq}`,
    name: `Habit ${seq}`,
    icon: null,
    color: null,
    cue: null,
    kind: "boolean",
    target_value: null,
    unit: null,
    increment_step: 1,
    schedule_type: "daily",
    days_of_week: null,
    times_per_week: null,
    time_of_day: null,
    routine_id: null,
    category_id: null,
    sort_order: 0,
    start_date: "2026-10-01",
    archived_on: null,
    deleted_at: null,
    reminder_enabled: true,
    reminder_lead_min: null,
    ...o,
  };
}
const morning: NotifyRoutine = {
  id: "r-morning",
  system_key: "morning",
  name: null,
  icon: "🌅",
  start_time: "07:00:00",
  sort_order: 0,
  deleted_at: null,
  digest_enabled: true,
};
const done = (h: NotifyHabit, date: string, extra: Partial<CheckInRow> = {}): CheckInRow => ({
  habit_id: h.id,
  local_date: date,
  status: "done",
  value: null,
  skip_reason: null,
  note: null,
  source: "app",
  deleted_at: null,
  ...extra,
});
const data = (o: Partial<NotifyData> = {}): NotifyData => ({
  profile,
  habits: [],
  versions: [],
  pauses: [],
  routines: [morning],
  checkIns: [],
  ...o,
});

describe("R-NTF-6: local times to instants", () => {
  it("spec examples", () => {
    // Meditate 07:00, lead 5 min, Lima (UTC−5) → 06:55 → 11:55Z
    expect(zonedTimeToUtc("2026-10-20", "06:55", "America/Lima").toISOString()).toBe(
      "2026-10-20T11:55:00.000Z",
    );
    // 02:30 doesn't exist in Madrid on 2026-03-29 → 03:00 CEST = 01:00Z
    expect(zonedTimeToUtc("2026-03-29", "02:30", "Europe/Madrid").toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
    // 02:30 happens twice on 2026-10-25 → the first one (CEST) = 00:30Z
    expect(zonedTimeToUtc("2026-10-25", "02:30", "Europe/Madrid").toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("R-NTF-4: a time before the day's start belongs to the end of the habit day", () => {
    expect(instantOnHabitDay("2026-10-20", "00:30", profile).toISOString()).toBe(
      "2026-10-21T05:30:00.000Z",
    );
  });

  it("quiet hours may cross midnight", () => {
    const at = (iso: string) => new Date(iso);
    // 23:00 and 06:00 Lima are inside 22:00–07:00; 12:00 isn't.
    expect(inQuietHours(at("2026-10-21T04:00:00Z"), "America/Lima", "22:00", "07:00")).toBe(true);
    expect(inQuietHours(at("2026-10-20T11:00:00Z"), "America/Lima", "22:00", "07:00")).toBe(true);
    expect(inQuietHours(at("2026-10-20T17:00:00Z"), "America/Lima", "22:00", "07:00")).toBe(false);
    expect(inQuietHours(at("2026-10-20T17:00:00Z"), "America/Lima", null, null)).toBe(false);
  });
});

describe("planning (R-NTF-1…5)", () => {
  const meditate = habit({ name: "Meditate", time_of_day: "07:00:00", routine_id: morning.id });
  const gym = habit({ schedule_type: "times_per_week", times_per_week: 3, time_of_day: "18:00" });
  const mondays = habit({ schedule_type: "days_of_week", days_of_week: [1], time_of_day: "08:00" });
  const silent = habit({ time_of_day: "09:00", reminder_enabled: false });
  const now = new Date("2026-10-20T10:00:00Z"); // 05:00 in Lima
  const plan = planNotifications(
    "u1",
    data({ habits: [meditate, gym, mondays, silent] }),
    TODAY,
    now,
  );
  const keys = plan.map((p) => p.dedupeKey);

  it("plans reminders, digests and reports for today and tomorrow", () => {
    expect(keys).toContain(`habit_reminder:${meditate.id}:2026-10-20`);
    expect(keys).toContain(`habit_reminder:${meditate.id}:2026-10-21`);
    expect(keys).toContain(`habit_reminder:${gym.id}:2026-10-20`);
    expect(keys).toContain("routine_digest:r-morning:2026-10-20");
    expect(keys).toContain("daily_report:u1:2026-10-20");
    expect(
      plan.find((p) => p.dedupeKey === `habit_reminder:${meditate.id}:2026-10-20`)?.sendAt,
    ).toEqual(new Date("2026-10-20T11:55:00Z"));
  });

  it("leaves out days off, turned-off reminders and the weekly review on other days", () => {
    expect(keys.some((k) => k.startsWith(`habit_reminder:${mondays.id}`))).toBe(false);
    expect(keys.some((k) => k.startsWith(`habit_reminder:${silent.id}`))).toBe(false);
    expect(keys.some((k) => k.startsWith("weekly_review"))).toBe(false);
  });

  it("leaves out what's already past", () => {
    const later = planNotifications(
      "u1",
      data({ habits: [meditate] }),
      TODAY,
      new Date("2026-10-20T12:30:00Z"),
    );
    expect(later.map((p) => p.dedupeKey)).not.toContain(`habit_reminder:${meditate.id}:2026-10-20`);
  });

  it("plans the weekly review on its day", () => {
    const sunday = planNotifications("u1", data(), "2026-10-24", new Date("2026-10-24T10:00:00Z"));
    expect(sunday.map((p) => p.dedupeKey)).toContain("weekly_review:u1:2026-10-25");
  });
});

describe("suppression (R-NTF-7)", () => {
  const h = habit({ name: "Read", time_of_day: "07:00", routine_id: morning.id });
  const due = {
    kind: "habit_reminder" as const,
    habitId: h.id,
    routineId: null,
    localDate: TODAY,
    sendAt: new Date("2026-10-20T11:55:00Z"),
  };
  const now = new Date("2026-10-20T11:56:00Z");

  it("sends a pending reminder", () => {
    expect(suppressionFor(due, data({ habits: [h] }), TODAY, now)).toBeNull();
  });

  it("not when done, skipped, paused, muted or in quiet hours", () => {
    expect(suppressionFor(due, data({ habits: [h], checkIns: [done(h, TODAY)] }), TODAY, now)).toBe(
      "done",
    );
    expect(
      suppressionFor(
        due,
        data({ habits: [h], checkIns: [done(h, TODAY, { status: "skipped" })] }),
        TODAY,
        now,
      ),
    ).toBe("done");
    expect(
      suppressionFor(
        due,
        data({
          habits: [h],
          pauses: [
            { id: "p", habit_id: h.id, start_date: TODAY, end_date: null, deleted_at: null },
          ],
        }),
        TODAY,
        now,
      ),
    ).toBe("inactive");
    expect(
      suppressionFor(
        due,
        { ...data({ habits: [h] }), profile: { ...profile, muted_until: "2026-10-21T09:00:00Z" } },
        TODAY,
        now,
      ),
    ).toBe("muted");
    expect(
      suppressionFor(
        due,
        {
          ...data({ habits: [h] }),
          profile: { ...profile, quiet_hours_start: "22:00", quiet_hours_end: "07:00" },
        },
        TODAY,
        now,
      ),
    ).toBe("quiet_hours");
  });

  it("flexible habits: not once the weekly target is met", () => {
    const gym = habit({ schedule_type: "times_per_week", times_per_week: 1, time_of_day: "18:00" });
    const d = data({ habits: [gym], checkIns: [done(gym, "2026-10-19")] });
    expect(suppressionFor({ ...due, habitId: gym.id }, d, TODAY, now)).toBe("target_met");
  });

  it("digests need something pending; reports need a day with habits", () => {
    const digest = {
      ...due,
      kind: "routine_digest" as const,
      habitId: null,
      routineId: morning.id,
    };
    expect(suppressionFor(digest, data({ habits: [h] }), TODAY, now)).toBeNull();
    expect(
      suppressionFor(digest, data({ habits: [h], checkIns: [done(h, TODAY)] }), TODAY, now),
    ).toBe("nothing_pending");
    const report = { ...due, kind: "daily_report" as const, habitId: null };
    expect(suppressionFor(report, data(), TODAY, now)).toBe("rest_day");
  });
});

describe("badge and content", () => {
  it("R-NTF-9 and the daily report's numbers", () => {
    const a = habit({ name: "Meditate", start_date: "2026-10-18" });
    const b = habit({ name: "Read" });
    const d = data({
      habits: [a, b],
      checkIns: [done(a, "2026-10-18"), done(a, "2026-10-19"), done(a, TODAY)],
    });
    expect(badgeCount(d, TODAY)).toBe(1);
    const report = contentFor(
      {
        kind: "daily_report",
        habitId: null,
        routineId: null,
        localDate: TODAY,
        sendAt: new Date(),
      },
      d,
      TODAY,
    );
    expect(report).toMatchObject({
      kind: "daily_report",
      score: 0.5,
      done: 1,
      total: 2,
      best: { name: "Meditate", days: 3 },
      left: ["Read"],
    });
  });
});

describe("R-NTF-5: the week a review is about", () => {
  it("is the week that's ending", () => {
    // Sunday 2026-10-25, weeks from Monday: this week.
    expect(reviewedWeek("2026-10-25", 1)).toBe("2026-10-19");
    // Sunday 2026-10-25, weeks from Sunday: Sunday starts a week, so the one before.
    expect(reviewedWeek("2026-10-25", 7)).toBe("2026-10-18");
    // Monday with weeks from Monday: last week.
    expect(reviewedWeek("2026-10-19", 1)).toBe("2026-10-12");
  });
});
