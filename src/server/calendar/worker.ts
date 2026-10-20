import "server-only";

import { addDays } from "@/domain/dates";
import { habitDay } from "@/domain/day";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { dbError, type AdminClient } from "@/server/push/subscriptions";

import { decrypt, fromBytea } from "./crypto";
import {
  dayRange,
  instancePatch,
  isSyncable,
  seriesEvent,
  seriesSignature,
  seriesTime,
  type SeriesHabit,
} from "./events";
import { GoogleError, type GoogleClient } from "./google";

type Job = Database["public"]["Tables"]["calendar_sync_jobs"]["Row"];
type Series = Database["public"]["Tables"]["calendar_series"]["Row"];

/** Integrations §3.7: 1 min, 5 min, 30 min, 2 h, 12 h; failed after 6 attempts. */
export const BACKOFF_MIN = [1, 5, 30, 120, 720];
export const MAX_ATTEMPTS = 6;

export type CalendarCounts = { claimed: number; done: number; retried: number; failed: number };

type Account = {
  calendarId: string;
  timeZone: string;
  token: string;
  today: string;
};

/**
 * Drains due calendar jobs (docs/spec/03-architecture.md §5 step 4). With `userId`, only that
 * user's jobs (a Siri check-in processes its own right away).
 */
export async function processCalendarJobs(
  admin: AdminClient,
  google: GoogleClient,
  {
    userId,
    max = 100,
    budgetMs = 20_000,
    now = () => Date.now(),
  }: { userId?: string; max?: number; budgetMs?: number; now?: () => number } = {},
): Promise<CalendarCounts> {
  const counts: CalendarCounts = { claimed: 0, done: 0, retried: 0, failed: 0 };
  const start = now();
  const { data: jobs, error } = await admin.rpc("srv_claim_calendar_jobs", {
    p_max: max,
    ...(userId ? { p_user_id: userId } : {}),
  });
  if (error) throw dbError("claim calendar jobs", error);
  counts.claimed = jobs.length;

  const accounts = new Map<string, Promise<Account | null>>();
  for (const job of jobs) {
    if (now() - start > budgetMs) {
      await finish(admin, job, { status: "pending", attempts: Math.max(0, job.attempts - 1) });
      continue;
    }
    let account = accounts.get(job.user_id);
    if (!account) {
      account = loadAccount(admin, google, job.user_id, now());
      accounts.set(job.user_id, account);
    }
    try {
      const acc = await account;
      if (!acc) {
        await finish(admin, job, { status: "done", last_error: "not connected" });
        counts.done++;
        continue;
      }
      await runJob(admin, google, acc, job);
      await finish(admin, job, { status: "done", last_error: null });
      counts.done++;
    } catch (e) {
      if (e instanceof GoogleError && e.needsReauth) {
        // The user must reconnect; the job waits (srv_claim_calendar_jobs skips them).
        await admin
          .from("calendar_connections")
          .update({ status: "needs_reauth" })
          .eq("user_id", job.user_id);
        await finish(admin, job, {
          status: "pending",
          attempts: Math.max(0, job.attempts - 1),
          last_error: e.message,
        });
        counts.retried++;
        accounts.set(job.user_id, Promise.resolve(null));
        continue;
      }
      const message = e instanceof Error ? e.message.slice(0, 300) : "error";
      if (job.attempts >= MAX_ATTEMPTS) {
        await finish(admin, job, { status: "failed", last_error: message });
        counts.failed++;
      } else {
        const delay = BACKOFF_MIN[Math.min(job.attempts - 1, BACKOFF_MIN.length - 1)] ?? 1;
        await finish(admin, job, {
          status: "pending",
          last_error: message,
          next_attempt_at: new Date(now() + delay * 60_000).toISOString(),
        });
        counts.retried++;
      }
    }
  }
  return counts;
}

async function finish(
  admin: AdminClient,
  job: Job,
  values: Database["public"]["Tables"]["calendar_sync_jobs"]["Update"],
) {
  const { error } = await admin
    .from("calendar_sync_jobs")
    .update({ claimed_at: null, ...values })
    .eq("id", job.id);
  if (error) console.error("[calendar] could not record a job:", error.code || "unknown");
}

async function loadAccount(
  admin: AdminClient,
  google: GoogleClient,
  userId: string,
  nowMs: number,
): Promise<Account | null> {
  const [conn, profile] = await Promise.all([
    admin
      .from("calendar_connections")
      .select("calendar_id, refresh_token_enc, status")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("profiles").select("timezone, day_start_hour").eq("id", userId).maybeSingle(),
  ]);
  if (conn.error) throw dbError("load calendar connection", conn.error);
  if (!conn.data || conn.data.status === "disconnected" || !conn.data.calendar_id) return null;
  const token = await google.accessToken(
    decrypt(fromBytea(conn.data.refresh_token_enc as unknown as string)),
  );
  const timeZone = profile.data?.timezone || "UTC";
  return {
    calendarId: conn.data.calendar_id,
    timeZone,
    token,
    today: habitDay(new Date(nowMs), timeZone, profile.data?.day_start_hour ?? 4),
  };
}

const HABIT_COLUMNS =
  "id, user_id, name, icon, cue, description, schedule_type, days_of_week, time_of_day, duration_min, start_date, archived_on, deleted_at, calendar_sync, routine_id";

async function loadHabit(admin: AdminClient, habitId: string) {
  const { data, error } = await admin
    .from("habits")
    .select(HABIT_COLUMNS)
    .eq("id", habitId)
    .maybeSingle();
  if (error) throw dbError("load habit", error);
  if (!data) return null;
  let routineStart: string | null = null;
  if (data.routine_id) {
    const r = await admin
      .from("routines")
      .select("start_time, deleted_at")
      .eq("id", data.routine_id)
      .maybeSingle();
    if (r.data && r.data.deleted_at === null) routineStart = r.data.start_time;
  }
  const pauses = await admin
    .from("pauses")
    .select("habit_id, start_date, end_date, deleted_at")
    .eq("user_id", data.user_id);
  if (pauses.error) throw dbError("load pauses", pauses.error);
  return {
    habit: data as unknown as SeriesHabit & { user_id: string },
    routineStart,
    pauses: (pauses.data ?? []).filter((p) => p.habit_id === null || p.habit_id === habitId),
  };
}

async function openSeries(admin: AdminClient, habitId: string): Promise<Series[]> {
  const { data, error } = await admin
    .from("calendar_series")
    .select("*")
    .eq("habit_id", habitId)
    .is("valid_until", null);
  if (error) throw dbError("load calendar series", error);
  return data ?? [];
}

async function runJob(admin: AdminClient, google: GoogleClient, acc: Account, job: Job) {
  switch (job.op) {
    case "sync_series":
      return job.habit_id ? syncSeries(admin, google, acc, job.habit_id) : undefined;
    case "end_series":
      return job.habit_id ? endSeries(admin, google, acc, job.habit_id) : undefined;
    case "delete_series":
      return deleteSeries(admin, google, acc, job);
    case "mark_instance":
      return job.habit_id && job.local_date
        ? markInstance(admin, google, acc, job.user_id, job.habit_id, job.local_date)
        : undefined;
    case "full_resync":
      return fullResync(admin, job.user_id);
    case "delete_calendar":
      return google.deleteCalendar(acc.token, acc.calendarId);
  }
}

/** Creates, updates or splits a habit's series (Integrations §3.6 sync_series). */
async function syncSeries(admin: AdminClient, google: GoogleClient, acc: Account, habitId: string) {
  const loaded = await loadHabit(admin, habitId);
  if (!loaded) return;
  const { habit, routineStart, pauses } = loaded;
  const time = seriesTime(habit, routineStart);
  const open = await openSeries(admin, habitId);

  if (!time || !isSyncable(habit, routineStart)) {
    for (const s of open) await closeSeries(admin, google, acc, s, habit, routineStart, pauses);
    return;
  }

  const signature = seriesSignature(habit, time);
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const current = open[0];
  if (current && (current.rrule === signature || current.valid_from >= acc.today)) {
    // Same shape (or nothing in the past to keep): update it in place.
    const from = current.valid_from;
    await google.patchEvent(
      acc.token,
      acc.calendarId,
      current.google_event_id,
      seriesEvent({ habit, time, timeZone: acc.timeZone, from, until: null, pauses, appUrl }),
    );
    if (current.rrule !== signature) {
      await admin.from("calendar_series").update({ rrule: signature }).eq("id", current.id);
    }
    return;
  }

  // A new shape: end the old series yesterday so past events stay, start a new one today.
  for (const s of open) await closeSeries(admin, google, acc, s, habit, routineStart, pauses);
  const from = habit.start_date > acc.today ? habit.start_date : acc.today;
  const created = await google.insertEvent(
    acc.token,
    acc.calendarId,
    seriesEvent({ habit, time, timeZone: acc.timeZone, from, until: null, pauses, appUrl }),
  );
  const { error } = await admin.from("calendar_series").insert({
    user_id: habit.user_id,
    habit_id: habit.id,
    google_event_id: created.id,
    valid_from: from,
    rrule: signature,
  });
  if (error) throw dbError("save calendar series", error);
}

/** Ends a series after yesterday (or deletes it if it hadn't started). */
async function closeSeries(
  admin: AdminClient,
  google: GoogleClient,
  acc: Account,
  s: Series,
  habit: SeriesHabit,
  routineStart: string | null,
  pauses: Parameters<typeof seriesEvent>[0]["pauses"],
) {
  const last = addDays(acc.today, -1);
  if (s.valid_from > last) {
    await google.deleteEvent(acc.token, acc.calendarId, s.google_event_id);
    await admin.from("calendar_series").delete().eq("id", s.id);
    return;
  }
  const time = s.rrule.match(/;T=(\d{2}:\d{2})/)?.[1] ?? seriesTime(habit, routineStart) ?? "08:00";
  await google.patchEvent(acc.token, acc.calendarId, s.google_event_id, {
    recurrence: seriesEvent({
      habit,
      time,
      timeZone: acc.timeZone,
      from: s.valid_from,
      until: last,
      pauses,
      appUrl: getPublicEnv().NEXT_PUBLIC_APP_URL,
    }).recurrence,
  });
  await admin.from("calendar_series").update({ valid_until: last }).eq("id", s.id);
}

async function endSeries(admin: AdminClient, google: GoogleClient, acc: Account, habitId: string) {
  const loaded = await loadHabit(admin, habitId);
  if (!loaded) return;
  for (const s of await openSeries(admin, habitId)) {
    await closeSeries(admin, google, acc, s, loaded.habit, loaded.routineStart, loaded.pauses);
  }
}

async function deleteSeries(admin: AdminClient, google: GoogleClient, acc: Account, job: Job) {
  const payload = job.payload as { event_ids?: string[] } | null;
  const ids = new Set(payload?.event_ids ?? []);
  if (job.habit_id) {
    const { data } = await admin
      .from("calendar_series")
      .select("google_event_id")
      .eq("habit_id", job.habit_id);
    for (const s of data ?? []) ids.add(s.google_event_id);
  }
  for (const id of ids) await google.deleteEvent(acc.token, acc.calendarId, id);
  if (job.habit_id) await admin.from("calendar_series").delete().eq("habit_id", job.habit_id);
}

/** Renames that day's event: "✅ Name", "⏭️ Name", or back (Integrations §3.6 mark_instance). */
async function markInstance(
  admin: AdminClient,
  google: GoogleClient,
  acc: Account,
  userId: string,
  habitId: string,
  date: string,
) {
  const [habitRes, seriesRes, checkInRes] = await Promise.all([
    admin.from("habits").select("name, icon, calendar_sync").eq("id", habitId).maybeSingle(),
    admin.from("calendar_series").select("*").eq("habit_id", habitId),
    admin
      .from("check_ins")
      .select("status, deleted_at")
      .eq("habit_id", habitId)
      .eq("local_date", date)
      .maybeSingle(),
  ]);
  if (!habitRes.data?.calendar_sync) return;
  const series = (seriesRes.data ?? []).find(
    (s) => s.valid_from <= date && (s.valid_until === null || s.valid_until >= date),
  );
  if (!series) return;
  const c = checkInRes.data;
  const state =
    c && c.deleted_at === null && (c.status === "done" || c.status === "skipped") ? c.status : null;

  const { timeMin, timeMax } = dayRange(date, acc.timeZone);
  let instances;
  try {
    instances = await google.instances(
      acc.token,
      acc.calendarId,
      series.google_event_id,
      timeMin,
      timeMax,
    );
  } catch (e) {
    // The user deleted the event in Google: rebuild the series.
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) {
      await admin.from("calendar_series").delete().eq("id", series.id);
      await admin
        .from("calendar_sync_jobs")
        .insert({ user_id: userId, habit_id: habitId, op: "sync_series" });
      return;
    }
    throw e;
  }
  const instance = instances[0];
  if (!instance) return; // A day off or a paused day: no event that day.
  await google.patchEvent(
    acc.token,
    acc.calendarId,
    instance.id,
    instancePatch(habitRes.data, state),
  );
}

/** Rebuilds everything: a sync job per synced habit (Integrations §3.6 full_resync). */
async function fullResync(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("habits")
    .select("id, calendar_sync, deleted_at")
    .eq("user_id", userId);
  if (error) throw dbError("load habits", error);
  const ids = (data ?? []).filter((h) => h.calendar_sync && h.deleted_at === null).map((h) => h.id);
  if (ids.length === 0) return;
  const { error: insertError } = await admin
    .from("calendar_sync_jobs")
    .insert(ids.map((habit_id) => ({ user_id: userId, habit_id, op: "sync_series" })));
  if (insertError) throw dbError("queue calendar jobs", insertError);
}
