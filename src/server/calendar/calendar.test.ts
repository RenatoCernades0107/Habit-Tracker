import { describe, expect, it, vi } from "vitest";

import type { AdminClient } from "@/server/push/subscriptions";
import { FakeSupabase } from "@/server/push/testing/fake-supabase";

import { encrypt, toBytea } from "./crypto";
import {
  instancePatch,
  isSyncable,
  pausedDays,
  rruleOf,
  seriesEvent,
  untilAfter,
  type SeriesHabit,
} from "./events";
import { GoogleError, type GoogleClient, type GoogleEvent } from "./google";
import { processCalendarJobs } from "./worker";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://restart.test" }),
}));
const KEY = Buffer.alloc(32, 7);
vi.mock("@/lib/env.server", () => ({
  getServerEnv: () => ({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }),
}));

const habit = (o: Partial<SeriesHabit> = {}): SeriesHabit => ({
  id: "h1",
  name: "Meditar",
  icon: "🧘",
  cue: "Después del café",
  description: null,
  schedule_type: "daily",
  days_of_week: null,
  time_of_day: "07:00:00",
  duration_min: null,
  start_date: "2026-10-01",
  archived_on: null,
  deleted_at: null,
  calendar_sync: true,
  ...o,
});

describe("the event model (Integrations §3.5)", () => {
  it("FR-CAL-5: fixed schedules with a time only", () => {
    expect(isSyncable(habit(), null)).toBe(true);
    expect(isSyncable(habit({ time_of_day: null }), "21:00:00")).toBe(true);
    expect(isSyncable(habit({ time_of_day: null }), null)).toBe(false);
    expect(isSyncable(habit({ schedule_type: "times_per_week" }), null)).toBe(false);
    expect(isSyncable(habit({ calendar_sync: false }), null)).toBe(false);
  });

  it("recurrence, reminders off, free, linked back to the habit", () => {
    expect(rruleOf({ schedule_type: "days_of_week", days_of_week: [5, 1, 2, 4] })).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,TH,FR",
    );
    const e = seriesEvent({
      habit: habit({ duration_min: 20 }),
      time: "07:00",
      timeZone: "America/Lima",
      from: "2026-10-20",
      until: null,
      pauses: [{ start_date: "2026-10-22", end_date: "2026-10-23", deleted_at: null }],
      appUrl: "https://restart.test",
    });
    expect(e).toMatchObject({
      summary: "🧘 Meditar",
      start: { dateTime: "2026-10-20T07:00:00", timeZone: "America/Lima" },
      end: { dateTime: "2026-10-20T07:20:00", timeZone: "America/Lima" },
      recurrence: ["RRULE:FREQ=DAILY", "EXDATE;TZID=America/Lima:20261022T070000,20261023T070000"],
      reminders: { useDefault: false },
      transparency: "transparent",
      extendedProperties: { private: { habitId: "h1" } },
    });
    expect(e.description).toContain("https://restart.test/habits/h1");
  });

  it("an open-ended pause stops the series the day before; UNTIL is the end of a day in UTC", () => {
    expect(
      pausedDays([{ start_date: "2026-11-01", end_date: null, deleted_at: null }], "2026-10-20"),
    ).toMatchObject({ stopBefore: "2026-11-01" });
    // 23:59:59 on 19 Oct in Lima = 04:59:59Z on the 20th.
    expect(untilAfter("2026-10-19", "America/Lima")).toBe("20261020T045959Z");
  });

  it("FR-CAL-3: ✅ for done, ⏭️ for skipped, back to normal on undo", () => {
    expect(instancePatch(habit(), "done")).toEqual({ summary: "✅ Meditar", colorId: "10" });
    expect(instancePatch(habit(), "skipped")).toEqual({ summary: "⏭️ Meditar", colorId: null });
    expect(instancePatch(habit(), null)).toEqual({ summary: "🧘 Meditar", colorId: null });
  });
});

// --- The worker, against a fake Google ---------------------------------------------------

const USER = "u1";
const NOW = Date.parse("2026-10-20T15:00:00Z"); // 10:00 in Lima

function fakeGoogle() {
  const calls: { op: string; id?: string; body?: GoogleEvent }[] = [];
  let next = 1;
  const google = {
    accessToken: vi.fn(async () => "access"),
    insertEvent: vi.fn(async (_t: string, _c: string, body: GoogleEvent) => {
      const id = `evt-${next++}`;
      calls.push({ op: "insert", id, body });
      return { id };
    }),
    patchEvent: vi.fn(async (_t: string, _c: string, id: string, body: GoogleEvent) => {
      calls.push({ op: "patch", id, body });
      return { id };
    }),
    deleteEvent: vi.fn(async (_t: string, _c: string, id: string) => {
      calls.push({ op: "delete", id });
    }),
    instances: vi.fn(async (_t: string, _c: string, id: string) => [{ id: `${id}_20261020` }]),
    deleteCalendar: vi.fn(),
  };
  return { google, calls };
}

function setup(jobs: Record<string, unknown>[], habitOverrides: Partial<SeriesHabit> = {}) {
  const db = new FakeSupabase();
  db.seed("calendar_connections", [
    {
      user_id: USER,
      calendar_id: "cal-1",
      status: "active",
      refresh_token_enc: toBytea(encrypt("refresh", KEY)),
    },
  ]);
  db.seed("profiles", [{ id: USER, timezone: "America/Lima", day_start_hour: 4 }]);
  db.seed("habits", [{ ...habit(habitOverrides), user_id: USER, routine_id: null }]);
  db.seed("pauses", []);
  db.seed("calendar_series", []);
  db.seed("calendar_sync_jobs", jobs);
  db.onRpc("srv_claim_calendar_jobs", () =>
    db
      .rows("calendar_sync_jobs")
      .filter((j) => j.status === "pending")
      .map((j) => {
        j.status = "running";
        j.attempts = Number(j.attempts ?? 0) + 1;
        return { ...j };
      }),
  );
  return db;
}
const job = (id: number, op: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: USER,
  habit_id: "h1",
  local_date: null,
  op,
  payload: {},
  status: "pending",
  attempts: 0,
  ...extra,
});
const run = (db: FakeSupabase, google: unknown) =>
  processCalendarJobs(db as unknown as AdminClient, google as GoogleClient, { now: () => NOW });

describe("processCalendarJobs", () => {
  it("creates the series from today, then keeps past events when the schedule changes", async () => {
    const { google, calls } = fakeGoogle();
    const db = setup([job(1, "sync_series")]);
    expect(await run(db, google)).toMatchObject({ claimed: 1, done: 1 });
    expect(calls[0]).toMatchObject({
      op: "insert",
      body: { start: { dateTime: "2026-10-20T07:00:00" } },
    });
    const [series] = db.rows("calendar_series");
    expect(series).toMatchObject({ google_event_id: "evt-1", valid_from: "2026-10-20" });

    // The series started earlier; now the time changes.
    series!.valid_from = "2026-10-01";
    db.rows("habits")[0]!.time_of_day = "08:00:00";
    db.seed("calendar_sync_jobs", [job(2, "sync_series")]);
    await run(db, google);
    expect(calls[1]).toMatchObject({
      op: "patch",
      id: "evt-1",
      body: { recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261020T045959Z"] },
    });
    expect(calls[2]).toMatchObject({
      op: "insert",
      body: { start: { dateTime: "2026-10-20T08:00:00" } },
    });
    expect(db.rows("calendar_series").map((s) => s.valid_until ?? null)).toEqual([
      "2026-10-19",
      null,
    ]);
  });

  it("FR-CAL-3: a check-in renames that day's event", async () => {
    const { google, calls } = fakeGoogle();
    const db = setup([job(1, "mark_instance", { local_date: "2026-10-20" })]);
    db.seed("calendar_series", [
      {
        id: "s1",
        habit_id: "h1",
        google_event_id: "evt-9",
        valid_from: "2026-10-01",
        valid_until: null,
        rrule: "x",
      },
    ]);
    db.seed("check_ins", [
      { habit_id: "h1", local_date: "2026-10-20", status: "done", deleted_at: null },
    ]);
    await run(db, google);
    expect(calls).toEqual([
      { op: "patch", id: "evt-9_20261020", body: { summary: "✅ Meditar", colorId: "10" } },
    ]);
  });

  it("an expired grant asks to reconnect and keeps the job", async () => {
    const { google } = fakeGoogle();
    google.accessToken.mockRejectedValueOnce(new GoogleError(400, "invalid_grant"));
    const db = setup([job(1, "sync_series")]);
    expect(await run(db, google)).toMatchObject({ retried: 1 });
    expect(db.rows("calendar_connections")[0]).toMatchObject({ status: "needs_reauth" });
    expect(db.rows("calendar_sync_jobs")[0]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("other failures back off", async () => {
    const { google } = fakeGoogle();
    google.insertEvent.mockRejectedValueOnce(new GoogleError(503, "backendError"));
    const db = setup([job(1, "sync_series")]);
    await run(db, google);
    expect(db.rows("calendar_sync_jobs")[0]).toMatchObject({
      status: "pending",
      next_attempt_at: new Date(NOW + 60_000).toISOString(),
    });
  });
});
