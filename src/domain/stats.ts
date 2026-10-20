import { addDays, isoWeekday, weekStartOf, type IsoDate } from "./dates";
import { weekProgress, type HabitHistory } from "./progress";
import { fallsOn, isActive, isFixed, scheduleOn } from "./schedule";
import { credit, occurrenceState } from "./state";
import type { CheckInRow, HabitRow, HabitVersionRow, PauseRow } from "./types";

export type StatsInput = {
  today: IsoDate;
  weekStart: number;
  habits: readonly HabitRow[];
  versions: readonly HabitVersionRow[];
  pauses: readonly PauseRow[];
  checkIns: readonly CheckInRow[];
};

/** Celebrated streak lengths (R-STREAK-5). */
export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

/** The milestone a check-in just reached, if the streak went from `before` to `after`. */
export function reachedMilestone(before: number, after: number): number | null {
  return after > before && (MILESTONES as readonly number[]).includes(after) ? after : null;
}

/** Per-habit histories, built once and shared by every statistic. */
export function histories(input: StatsInput): HabitHistory[] {
  const byHabit = new Map<string, Map<IsoDate, CheckInRow>>();
  for (const c of input.checkIns) {
    let m = byHabit.get(c.habit_id);
    if (!m) byHabit.set(c.habit_id, (m = new Map()));
    m.set(c.local_date, c);
  }
  return input.habits
    .filter((h) => h.deleted_at === null)
    .map((habit) => ({
      habit,
      versions: input.versions,
      pauses: input.pauses,
      checkIns: byHabit.get(habit.id) ?? new Map(),
    }));
}

type Occurrence = { credit: number; done: boolean };

/**
 * A fixed-schedule occurrence that counts toward scores and rates, or null. Skipped and paused
 * days never count. Today counts once done; with `soFar` it counts as 0 while pending (R-SCORE-2).
 */
function fixedOccurrence(
  h: HabitHistory,
  date: IsoDate,
  today: IsoDate,
  soFar = false,
): Occurrence | null {
  if (date > today || !isActive(h.habit, h.pauses, date)) return null;
  const schedule = scheduleOn(h.habit, h.versions, date);
  if (!isFixed(schedule) || !fallsOn(schedule, date)) return null;
  const checkIn = h.checkIns.get(date);
  const state = occurrenceState(schedule, checkIn, date, today);
  const c = credit(state, schedule, checkIn);
  if (c === null) return null;
  if (date === today && state !== "done" && !soFar) return null;
  return { credit: c, done: state === "done" };
}

/** R-SCORE-1 for each day of [from, to]; null = rest day (or future). */
export function dailyScores(
  hs: readonly HabitHistory[],
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
) {
  const out: { date: IsoDate; score: number | null; done: number; total: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    let sum = 0;
    let total = 0;
    let done = 0;
    for (const h of hs) {
      const o = fixedOccurrence(h, d, today, true);
      if (!o) continue;
      sum += o.credit;
      total++;
      if (o.done) done++;
    }
    out.push({ date: d, score: total === 0 ? null : sum / total, done, total });
  }
  return out;
}

/** R-SCORE-3 for each week starting in [from, to]. Unfinished flexible weeks count once met. */
export function weeklyScores(
  hs: readonly HabitHistory[],
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
  weekStart: number,
) {
  const out: { weekStart: IsoDate; score: number | null }[] = [];
  for (let w = weekStartOf(from, weekStart); w <= to; w = addDays(w, 7)) {
    let num = 0;
    let den = 0;
    for (const h of hs) {
      for (let i = 0; i < 7; i++) {
        const o = fixedOccurrence(h, addDays(w, i), today);
        if (o) {
          num += o.credit;
          den++;
        }
      }
      const flex = flexibleWeek(h, w, today, weekStart);
      if (flex) {
        num += flex.done;
        den += flex.target;
      }
    }
    out.push({ weekStart: w, score: den === 0 ? null : num / den });
  }
  return out;
}

function flexibleWeek(h: HabitHistory, week: IsoDate, today: IsoDate, weekStart: number) {
  if (week > today) return null;
  const end = addDays(week, 6);
  if (isFixed(scheduleOn(h.habit, h.versions, end < today ? end : today))) return null;
  const p = weekProgress(h, week, today, weekStart);
  if (p.target === 0) return null;
  // An unfinished week counts once its target is met (R-SCORE-4).
  if (end >= today && p.rawDone < p.target) return null;
  return { done: p.done, target: p.target };
}

/** R-SCORE-4: completion rate of one habit over [from, to], or null with nothing to judge. */
export function completionRate(
  h: HabitHistory,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
  weekStart: number,
): number | null {
  let num = 0;
  let den = 0;
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    const o = fixedOccurrence(h, d, today);
    if (o) {
      num += o.done ? 1 : 0;
      den++;
    }
  }
  for (let w = weekStartOf(from, weekStart); w <= to; w = addDays(w, 7)) {
    const flex = flexibleWeek(h, w, today, weekStart);
    if (flex) {
      num += flex.done;
      den += flex.target;
    }
  }
  return den === 0 ? null : num / den;
}

/** R-STREAK-3: the longest run in the whole history, under the current-streak rules. */
export function bestStreak(h: HabitHistory, today: IsoDate, weekStart: number): number {
  let best = 0;
  let run = 0;
  if (isFixed(scheduleOn(h.habit, h.versions, today))) {
    for (let d = h.habit.start_date; d <= today; d = addDays(d, 1)) {
      if (!isActive(h.habit, h.pauses, d)) continue;
      const schedule = scheduleOn(h.habit, h.versions, d);
      if (!fallsOn(schedule, d)) continue;
      const state = occurrenceState(schedule, h.checkIns.get(d), d, today);
      if (state === "done") best = Math.max(best, ++run);
      else if (state === "skipped" || d === today) continue;
      else run = 0;
    }
    return best;
  }
  for (let w = weekStartOf(h.habit.start_date, weekStart); w <= today; w = addDays(w, 7)) {
    const p = weekProgress(h, w, today, weekStart);
    if (p.target === 0) continue;
    if (p.rawDone >= p.target) best = Math.max(best, ++run);
    else if (addDays(w, 6) >= today) continue;
    else run = 0;
  }
  return best;
}

/** Average credit per ISO weekday (FR-STA-5), fixed habits only. */
export function weekdayRates(
  hs: readonly HabitHistory[],
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
) {
  const sums = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    const slot = sums[isoWeekday(d) - 1]!;
    for (const h of hs) {
      const o = fixedOccurrence(h, d, today);
      if (o) {
        slot.sum += o.credit;
        slot.count++;
      }
    }
  }
  return sums.map((s, i) => ({
    weekday: i + 1,
    rate: s.count ? s.sum / s.count : null,
    count: s.count,
  }));
}

/** Days in [from, to] where every scheduled habit was done (FR-STK-5). */
export function perfectDays(scores: ReturnType<typeof dailyScores>): number {
  return scores.filter((s) => s.score === 1 && s.total > 0).length;
}

/**
 * FR-STA-4 "needs attention": under 50% over the last 3 weeks (with at least 3 chances).
 * FR-REV-4 uses the same test week by week.
 */
export function needsAttention(h: HabitHistory, today: IsoDate, weekStart: number): boolean {
  const from = addDays(weekStartOf(today, weekStart), -21);
  const to = addDays(weekStartOf(today, weekStart), -1);
  let chances = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (fixedOccurrence(h, d, today)) chances++;
  const rate = completionRate(h, from, to, today, weekStart);
  const flexible = !isFixed(scheduleOn(h.habit, h.versions, today));
  return rate !== null && rate < 0.5 && (flexible || chances >= 3);
}

/** Weeks in a row (ending last week) where the habit stayed under 50% (FR-REV-4). */
export function weeksStruggling(h: HabitHistory, today: IsoDate, weekStart: number): number {
  let weeks = 0;
  for (let w = addDays(weekStartOf(today, weekStart), -7); weeks < 12; w = addDays(w, -7)) {
    if (addDays(w, 6) < h.habit.start_date) break;
    const rate = completionRate(h, w, addDays(w, 6), today, weekStart);
    if (rate === null || rate >= 0.5) break;
    weeks++;
  }
  return weeks;
}
