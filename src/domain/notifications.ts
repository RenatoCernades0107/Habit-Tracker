import { addDays, isoWeekday, weekStartOf, type IsoDate } from "./dates";
import { buildDayView, type DayView } from "./day-view";
import { minutesOf, inQuietHours, zonedTimeToUtc } from "./zoned";
import { currentStreak, weekProgress } from "./progress";
import { fallsOn, isActive, isFixed, scheduleOn } from "./schedule";
import { histories, weeklyScores } from "./stats";
import type { CheckInRow, HabitRow, HabitVersionRow, PauseRow, RoutineRow } from "./types";

export type NotificationKind =
  "habit_reminder" | "routine_digest" | "daily_report" | "weekly_review";

export type NotifyProfile = {
  timezone: string;
  day_start_hour: number;
  week_start: number;
  reminder_lead_min: number;
  daily_report_enabled: boolean;
  daily_report_time: string;
  weekly_review_enabled: boolean;
  weekly_review_dow: number;
  weekly_review_time: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  muted_until: string | null;
};

export type NotifyHabit = HabitRow & {
  reminder_enabled: boolean;
  reminder_lead_min: number | null;
};
export type NotifyRoutine = RoutineRow & { digest_enabled: boolean };

export type NotifyData = {
  profile: NotifyProfile;
  habits: readonly NotifyHabit[];
  versions: readonly HabitVersionRow[];
  pauses: readonly PauseRow[];
  routines: readonly NotifyRoutine[];
  checkIns: readonly CheckInRow[];
};

export type PlannedNotification = {
  kind: NotificationKind;
  habitId: string | null;
  routineId: string | null;
  /** The habit day it's about. */
  localDate: IsoDate;
  sendAt: Date;
  dedupeKey: string;
};

/**
 * Unique across all users: reminders and digests name their habit or routine (ids are global);
 * reports and reviews name the user.
 */
export const dedupeKey = (kind: NotificationKind, id: string, date: IsoDate) =>
  `${kind}:${id}:${date}`;

/**
 * The instant of a time on a habit day. Times before the day's start belong to the end of the
 * habit day, so they fall on the next calendar date (R-NTF-4: 00:30 with h = 4 is "tonight").
 */
export function instantOnHabitDay(
  day: IsoDate,
  time: string,
  profile: Pick<NotifyProfile, "timezone" | "day_start_hour">,
): Date {
  const calendar = minutesOf(time) < profile.day_start_hour * 60 ? addDays(day, 1) : day;
  return zonedTimeToUtc(calendar, time, profile.timezone);
}

function liveHabits(data: NotifyData) {
  return data.habits.filter((h) => h.deleted_at === null);
}

/**
 * R-NTF-1…5: the notifications of the habit days `today` and `tomorrow`, leaving out the ones
 * whose time has passed. Suppression (R-NTF-7) is decided again when each one is sent.
 */
export function planNotifications(
  userId: string,
  data: NotifyData,
  today: IsoDate,
  now: Date,
): PlannedNotification[] {
  const { profile } = data;
  const out: PlannedNotification[] = [];
  const push = (n: Omit<PlannedNotification, "dedupeKey">) => {
    if (n.sendAt.getTime() < now.getTime()) return;
    out.push({
      ...n,
      dedupeKey: dedupeKey(n.kind, n.habitId ?? n.routineId ?? userId, n.localDate),
    });
  };

  for (const day of [today, addDays(today, 1)]) {
    const habits = liveHabits(data).filter((h) => isActive(h, data.pauses, day));

    // R-NTF-2: habits with their own time.
    for (const h of habits) {
      if (!h.reminder_enabled || !h.time_of_day) continue;
      const schedule = scheduleOn(h, data.versions, day);
      if (isFixed(schedule) && !fallsOn(schedule, day)) continue;
      const lead = h.reminder_lead_min ?? profile.reminder_lead_min;
      const at = instantOnHabitDay(day, h.time_of_day, profile);
      push({
        kind: "habit_reminder",
        habitId: h.id,
        routineId: null,
        localDate: day,
        sendAt: new Date(at.getTime() - lead * 60_000),
      });
    }

    // R-NTF-3: routines with at least one occurrence that day.
    for (const r of data.routines) {
      if (r.deleted_at !== null || !r.digest_enabled) continue;
      const due = habits.some((h) => {
        if (h.routine_id !== r.id) return false;
        const schedule = scheduleOn(h, data.versions, day);
        return isFixed(schedule) && fallsOn(schedule, day);
      });
      if (!due) continue;
      push({
        kind: "routine_digest",
        habitId: null,
        routineId: r.id,
        localDate: day,
        sendAt: instantOnHabitDay(day, r.start_time, profile),
      });
    }

    // R-NTF-4
    if (profile.daily_report_enabled) {
      push({
        kind: "daily_report",
        habitId: null,
        routineId: null,
        localDate: day,
        sendAt: instantOnHabitDay(day, profile.daily_report_time, profile),
      });
    }

    // R-NTF-5: on the chosen weekday, about the week that's ending.
    if (profile.weekly_review_enabled && isoWeekday(day) === profile.weekly_review_dow) {
      push({
        kind: "weekly_review",
        habitId: null,
        routineId: null,
        localDate: day,
        sendAt: instantOnHabitDay(day, profile.weekly_review_time, profile),
      });
    }
  }
  return out;
}

export type SuppressionReason =
  | "muted"
  | "quiet_hours"
  | "inactive"
  | "not_scheduled"
  | "done"
  | "target_met"
  | "nothing_pending"
  | "rest_day";

export type DueNotification = {
  kind: NotificationKind;
  habitId: string | null;
  routineId: string | null;
  localDate: IsoDate;
  sendAt: Date;
};

function dayView(data: NotifyData, date: IsoDate, today: IsoDate): DayView {
  return buildDayView({
    date,
    today,
    weekStart: data.profile.week_start,
    habits: liveHabits(data),
    versions: data.versions,
    pauses: data.pauses,
    checkIns: data.checkIns,
    routines: data.routines,
  });
}

/** R-NTF-7: why a due notification shouldn't be sent now, or null to send it. */
export function suppressionFor(
  n: DueNotification,
  data: NotifyData,
  today: IsoDate,
  now: Date,
): SuppressionReason | null {
  const { profile } = data;
  if (profile.muted_until && Date.parse(profile.muted_until) > now.getTime()) return "muted";
  if (
    inQuietHours(n.sendAt, profile.timezone, profile.quiet_hours_start, profile.quiet_hours_end)
  ) {
    return "quiet_hours";
  }

  switch (n.kind) {
    case "habit_reminder": {
      const habit = liveHabits(data).find((h) => h.id === n.habitId);
      if (!habit || !habit.reminder_enabled || !isActive(habit, data.pauses, n.localDate)) {
        return "inactive";
      }
      const schedule = scheduleOn(habit, data.versions, n.localDate);
      const checkIn = data.checkIns.find(
        (c) => c.habit_id === habit.id && c.local_date === n.localDate && c.deleted_at === null,
      );
      if (checkIn && (checkIn.status === "done" || checkIn.status === "skipped")) return "done";
      if (isFixed(schedule)) {
        if (!fallsOn(schedule, n.localDate)) return "not_scheduled";
      } else {
        const [h] = histories({ ...data, today, weekStart: profile.week_start, habits: [habit] });
        const p = h && weekProgress(h, n.localDate, today, profile.week_start);
        if (p && p.rawDone >= p.target) return "target_met";
      }
      return null;
    }
    case "routine_digest": {
      const section = dayView(data, n.localDate, today).sections.find(
        (s) => s.routine?.id === n.routineId,
      );
      const pending = section?.items.some((i) => i.state === "pending" || i.state === "partial");
      return pending ? null : "nothing_pending";
    }
    case "daily_report": {
      const view = dayView(data, n.localDate, today);
      return view.total === 0 && view.weekly.length === 0 ? "rest_day" : null;
    }
    case "weekly_review":
      return null;
  }
}

/** R-NTF-9: fixed-schedule occurrences still pending today. */
export function badgeCount(data: NotifyData, today: IsoDate): number {
  return dayView(data, today, today)
    .sections.flatMap((s) => s.items)
    .filter((i) => i.state === "pending" || i.state === "partial").length;
}

/** What a notification says (docs/spec/06-integrations.md §4.6), before translation. */
export type NotificationContent =
  | {
      kind: "habit_reminder";
      habitId: string;
      name: string;
      icon: string | null;
      cue: string | null;
      leadMinutes: number;
      streak: number;
      weekly: boolean;
    }
  | {
      kind: "routine_digest";
      routineId: string;
      routine: NotifyRoutine;
      names: string[];
    }
  | {
      kind: "daily_report";
      score: number;
      done: number;
      total: number;
      best: { name: string; days: number } | null;
      left: string[];
      attention: string[];
    }
  | { kind: "weekly_review"; weekStart: IsoDate; score: number | null; delta: number | null };

export function contentFor(
  n: DueNotification,
  data: NotifyData,
  today: IsoDate,
): NotificationContent | null {
  const { profile } = data;
  switch (n.kind) {
    case "habit_reminder": {
      const habit = liveHabits(data).find((h) => h.id === n.habitId);
      if (!habit) return null;
      const [h] = histories({ ...data, today, weekStart: profile.week_start, habits: [habit] });
      const weekly = !isFixed(scheduleOn(habit, data.versions, n.localDate));
      return {
        kind: "habit_reminder",
        habitId: habit.id,
        name: habit.name,
        icon: habit.icon,
        cue: habit.cue,
        leadMinutes: habit.reminder_lead_min ?? profile.reminder_lead_min,
        streak: h ? currentStreak(h, n.localDate, profile.week_start) : 0,
        weekly,
      };
    }
    case "routine_digest": {
      const routine = data.routines.find((r) => r.id === n.routineId);
      if (!routine) return null;
      const section = dayView(data, n.localDate, today).sections.find(
        (s) => s.routine?.id === n.routineId,
      );
      const names = (section?.items ?? [])
        .filter((i) => i.state === "pending" || i.state === "partial")
        .map((i) => i.habit.name);
      return { kind: "routine_digest", routineId: routine.id, routine, names };
    }
    case "daily_report": {
      const view = dayView(data, n.localDate, today);
      const items = view.sections.flatMap((s) => s.items);
      const open = items.filter((i) => i.state === "pending" || i.state === "partial");
      return {
        kind: "daily_report",
        score: view.score ?? 0,
        done: view.done,
        total: view.total,
        best: view.bestStreak
          ? { name: view.bestStreak.habit.name, days: view.bestStreak.days }
          : null,
        left: open.map((i) => i.habit.name),
        attention: open.filter((i) => i.attention).map((i) => i.habit.name),
      };
    }
    case "weekly_review": {
      const week = weekStartOf(n.localDate, profile.week_start);
      const hs = histories({
        ...data,
        today,
        weekStart: profile.week_start,
        habits: liveHabits(data),
      });
      const [prev, cur] = weeklyScores(hs, addDays(week, -7), week, today, profile.week_start);
      return {
        kind: "weekly_review",
        weekStart: week,
        score: cur?.score ?? null,
        delta: cur?.score != null && prev?.score != null ? cur.score - prev.score : null,
      };
    }
  }
}
