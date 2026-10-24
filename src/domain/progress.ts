import { addDays, weekDays, weekStartOf, type IsoDate } from "./dates";
import { effectiveWeeklyTarget, fallsOn, isActive, isFixed, scheduleOn } from "./schedule";
import { occurrenceState } from "./state";
import type { CheckInRow, HabitRow, HabitVersionRow, PauseRow } from "./types";

export type HabitHistory = {
  habit: HabitRow;
  versions: readonly HabitVersionRow[];
  pauses: readonly PauseRow[];
  /** This habit's check-ins, by local date. */
  checkIns: ReadonlyMap<IsoDate, CheckInRow>;
};

/** How far back streaks look. Longer runs are still correct up to this horizon. */
const MAX_LOOKBACK_DAYS = 800;

function stateOn(h: HabitHistory, date: IsoDate, today: IsoDate) {
  return occurrenceState(scheduleOn(h.habit, h.versions, date), h.checkIns.get(date), date, today);
}

/** Days in the week where a flexible habit is done (at most one per day, R-SCHED-3). */
export function weekProgress(h: HabitHistory, date: IsoDate, today: IsoDate, weekStart: number) {
  const days = weekDays(weekStartOf(date, weekStart));
  const activeDays = days.filter((d) => isActive(h.habit, h.pauses, d)).length;
  const schedule = scheduleOn(h.habit, h.versions, date);
  const target = effectiveWeeklyTarget(schedule.timesPerWeek ?? 0, activeDays);
  const done = days.filter((d) => d <= today && stateOn(h, d, today) === "done").length;
  const activeLeft = days.filter((d) => d >= today && isActive(h.habit, h.pauses, d)).length;
  return { done: Math.min(done, target), rawDone: done, target, activeLeft, days };
}

/** R-STREAK-1 / R-STREAK-2: the current streak. */
export function currentStreak(h: HabitHistory, today: IsoDate, weekStart: number): number {
  return isFixed(scheduleOn(h.habit, h.versions, today))
    ? fixedStreak(h, today)
    : weeklyStreak(h, today, weekStart);
}

function fixedStreak(h: HabitHistory, today: IsoDate): number {
  let streak = 0;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const date = addDays(today, -i);
    if (date < h.habit.start_date) break;
    // Paused or archived days are neutral (R-STREAK-1).
    if (!isActive(h.habit, h.pauses, date)) continue;
    const schedule = scheduleOn(h.habit, h.versions, date);
    if (!fallsOn(schedule, date)) continue;
    const state = stateOn(h, date, today);
    if (state === "done") streak++;
    else if (state === "skipped" || date === today) continue;
    else break;
  }
  return streak;
}

function weeklyStreak(h: HabitHistory, today: IsoDate, weekStart: number): number {
  let streak = 0;
  let week = weekStartOf(today, weekStart);
  for (let i = 0; i < MAX_LOOKBACK_DAYS / 7; i++, week = addDays(week, -7)) {
    if (addDays(week, 6) < h.habit.start_date) break;
    const p = weekProgress(h, week, today, weekStart);
    const isCurrent = i === 0;
    if (p.target === 0) continue;
    if (p.rawDone >= p.target) streak++;
    else if (isCurrent) continue;
    else break;
  }
  return streak;
}

/**
 * R-STREAK-6 "don't miss twice": the previous scheduled occurrence of a fixed habit was missed.
 * For flexible habits: the week is at risk when the completions still needed fill every active
 * day left.
 */
export function needsAttention(
  h: HabitHistory,
  date: IsoDate,
  today: IsoDate,
  weekStart: number,
): boolean {
  const schedule = scheduleOn(h.habit, h.versions, date);
  if (!isFixed(schedule)) {
    const p = weekProgress(h, date, today, weekStart);
    const needed = p.target - p.rawDone;
    return needed > 0 && needed >= p.activeLeft;
  }
  for (let i = 1; i <= 31; i++) {
    const d = addDays(date, -i);
    if (d < h.habit.start_date) return false;
    if (!isActive(h.habit, h.pauses, d) || !fallsOn(scheduleOn(h.habit, h.versions, d), d))
      continue;
    const state = stateOn(h, d, today);
    if (state === "skipped") continue;
    return state === "missed" || state === "partial";
  }
  return false;
}
