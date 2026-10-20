import "server-only";

import { CHECK_IN_HISTORY_DAYS } from "@/data/sync";
import { addDays } from "@/domain/dates";
import { habitDay } from "@/domain/day";
import type { NotifyData, NotifyHabit, NotifyRoutine } from "@/domain/notifications";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { dbError, type AdminClient } from "@/server/push/subscriptions";

/** One user's data for planning and sending, as the device would see it (decision D10). */
export type UserNotifyData = { data: NotifyData; locale: Locale; today: string };

const PROFILE_COLUMNS =
  "id, locale, timezone, day_start_hour, week_start, reminder_lead_min, daily_report_enabled, daily_report_time, weekly_review_enabled, weekly_review_dow, weekly_review_time, quiet_hours_start, quiet_hours_end, muted_until";
const HABIT_COLUMNS =
  "id, user_id, name, icon, color, cue, kind, target_value, unit, increment_step, schedule_type, days_of_week, times_per_week, time_of_day, routine_id, category_id, sort_order, start_date, archived_on, deleted_at, reminder_enabled, reminder_lead_min";
const IN_CHUNK = 100;

/** Profiles, habits, schedules, pauses, routines and recent check-ins of each user. */
export async function loadNotifyData(
  admin: AdminClient,
  userIds: readonly string[],
  now: Date,
): Promise<Map<string, UserNotifyData>> {
  const out = new Map<string, UserNotifyData>();
  const unique = [...new Set(userIds)];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const ids = unique.slice(i, i + IN_CHUNK);
    // Streaks look back at most this far, like the device cache.
    const since = addDays(now.toISOString().slice(0, 10), -(CHECK_IN_HISTORY_DAYS + 1));
    const [profiles, habits, versions, pauses, routines, checkIns] = await Promise.all([
      admin.from("profiles").select(PROFILE_COLUMNS).in("id", ids),
      admin.from("habits").select(HABIT_COLUMNS).in("user_id", ids),
      admin
        .from("habit_versions")
        .select(
          "user_id, habit_id, valid_from, schedule_type, days_of_week, times_per_week, kind, target_value",
        )
        .in("user_id", ids),
      admin
        .from("pauses")
        .select("id, user_id, habit_id, start_date, end_date, deleted_at")
        .in("user_id", ids),
      admin
        .from("routines")
        .select(
          "id, user_id, system_key, name, icon, start_time, sort_order, deleted_at, digest_enabled",
        )
        .in("user_id", ids),
      admin
        .from("check_ins")
        .select(
          "user_id, habit_id, local_date, status, value, skip_reason, note, source, deleted_at",
        )
        .in("user_id", ids)
        .gte("local_date", since),
    ]);
    for (const [name, r] of Object.entries({
      profiles,
      habits,
      versions,
      pauses,
      routines,
      checkIns,
    })) {
      if (r.error) throw dbError(`load ${name}`, r.error);
    }
    const byUser = <T extends { user_id: string }>(rows: readonly T[] | null, id: string) =>
      (rows ?? []).filter((r) => r.user_id === id);

    for (const p of profiles.data ?? []) {
      const data: NotifyData = {
        profile: {
          timezone: p.timezone || "UTC",
          day_start_hour: p.day_start_hour,
          week_start: p.week_start,
          reminder_lead_min: p.reminder_lead_min,
          daily_report_enabled: p.daily_report_enabled,
          daily_report_time: p.daily_report_time,
          weekly_review_enabled: p.weekly_review_enabled,
          weekly_review_dow: p.weekly_review_dow,
          weekly_review_time: p.weekly_review_time,
          quiet_hours_start: p.quiet_hours_start,
          quiet_hours_end: p.quiet_hours_end,
          muted_until: p.muted_until,
        },
        habits: byUser(habits.data, p.id) as NotifyHabit[],
        versions: byUser(versions.data, p.id),
        pauses: byUser(pauses.data, p.id),
        routines: byUser(routines.data, p.id) as NotifyRoutine[],
        checkIns: byUser(checkIns.data, p.id),
      };
      out.set(p.id, {
        data,
        locale: isLocale(p.locale) ? p.locale : defaultLocale,
        today: safeHabitDay(now, data.profile.timezone, data.profile.day_start_hour),
      });
    }
  }
  return out;
}

function safeHabitDay(now: Date, timeZone: string, dayStartHour: number): string {
  try {
    return habitDay(now, timeZone, dayStartHour);
  } catch {
    return habitDay(now, "UTC", dayStartHour);
  }
}
