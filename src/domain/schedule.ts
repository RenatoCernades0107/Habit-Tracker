import { inRange, isoWeekday, type IsoDate } from "./dates";
import type { HabitRow, HabitVersionRow, PauseRow } from "./types";

export type Schedule = {
  type: HabitRow["schedule_type"];
  daysOfWeek: number[] | null;
  timesPerWeek: number | null;
  kind: HabitRow["kind"];
  target: number | null;
};

function fromRow(row: HabitRow | HabitVersionRow): Schedule {
  return {
    type: row.schedule_type,
    daysOfWeek: row.days_of_week,
    timesPerWeek: row.times_per_week,
    kind: row.kind,
    target: row.target_value,
  };
}

/**
 * R-SCHED-0: the schedule in force on `date`, from the latest version that started on or
 * before it. Falls back to the habit's current schedule.
 */
export function scheduleOn(
  habit: HabitRow,
  versions: readonly HabitVersionRow[],
  date: IsoDate,
): Schedule {
  let best: HabitVersionRow | undefined;
  for (const v of versions) {
    if (
      v.habit_id === habit.id &&
      v.valid_from <= date &&
      (!best || v.valid_from > best.valid_from)
    ) {
      best = v;
    }
  }
  return fromRow(best ?? habit);
}

export function isFixed(schedule: Schedule): boolean {
  return schedule.type !== "times_per_week";
}

/** A pause of this habit, or a global pause (vacation mode), covers `date`. */
export function isPaused(habitId: string, pauses: readonly PauseRow[], date: IsoDate): boolean {
  return pauses.some(
    (p) =>
      p.deleted_at === null &&
      (p.habit_id === null || p.habit_id === habitId) &&
      inRange(date, p.start_date, p.end_date),
  );
}

/** R-SCHED-1: started, not archived or deleted, not paused. */
export function isActive(habit: HabitRow, pauses: readonly PauseRow[], date: IsoDate): boolean {
  return (
    habit.deleted_at === null &&
    habit.start_date <= date &&
    (habit.archived_on === null || habit.archived_on > date) &&
    !isPaused(habit.id, pauses, date)
  );
}

/** R-SCHED-2: a fixed-schedule occurrence falls on `date` (activity is checked separately). */
export function fallsOn(schedule: Schedule, date: IsoDate): boolean {
  if (schedule.type === "daily") return true;
  if (schedule.type === "days_of_week")
    return schedule.daysOfWeek?.includes(isoWeekday(date)) ?? false;
  return false;
}

export function isScheduled(
  habit: HabitRow,
  versions: readonly HabitVersionRow[],
  pauses: readonly PauseRow[],
  date: IsoDate,
): boolean {
  return isActive(habit, pauses, date) && fallsOn(scheduleOn(habit, versions, date), date);
}

/** R-SCHED-4: weekly target scaled by the active days, halves rounded up. */
export function effectiveWeeklyTarget(timesPerWeek: number, activeDays: number): number {
  return Math.floor((timesPerWeek * activeDays) / 7 + 0.5);
}
