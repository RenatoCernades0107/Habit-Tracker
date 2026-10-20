import type { IsoDate } from "./dates";
import { currentStreak, needsAttention, weekProgress, type HabitHistory } from "./progress";
import { fallsOn, isActive, isFixed, scheduleOn, type Schedule } from "./schedule";
import { credit, liveCheckIn, occurrenceState, progress, type OccurrenceState } from "./state";
import type { CheckInRow, HabitRow, HabitVersionRow, PauseRow, RoutineRow } from "./types";

export type DayItem = {
  habit: HabitRow;
  schedule: Schedule;
  state: OccurrenceState;
  checkIn: CheckInRow | undefined;
  /** 0…1 toward today's target. */
  progress: number;
  streak: number;
  /** "Don't miss twice" (fixed) or "week at risk" (flexible). */
  attention: boolean;
  /** Own time or the routine's start time (R-SCHED-5), `HH:MM:SS`. */
  time: string | null;
};

export type WeeklyItem = DayItem & { weekDone: number; weekTarget: number };

export type DaySection = { routine: RoutineRow | null; items: DayItem[] };

export type DayView = {
  date: IsoDate;
  /** R-SCORE-1: 0…1, or null on a rest day. */
  score: number | null;
  done: number;
  total: number;
  sections: DaySection[];
  weekly: WeeklyItem[];
  bestStreak: { habit: HabitRow; days: number } | null;
};

export type DayInput = {
  date: IsoDate;
  today: IsoDate;
  weekStart: number;
  habits: readonly HabitRow[];
  versions: readonly HabitVersionRow[];
  pauses: readonly PauseRow[];
  checkIns: readonly CheckInRow[];
  routines: readonly RoutineRow[];
};

/** Everything Today shows for one habit day (FR-TOD-1…3). Pure, so it runs on every render. */
export function buildDayView(input: DayInput): DayView {
  const { date, today, weekStart } = input;
  const byHabit = new Map<string, Map<IsoDate, CheckInRow>>();
  for (const c of input.checkIns) {
    let m = byHabit.get(c.habit_id);
    if (!m) byHabit.set(c.habit_id, (m = new Map()));
    m.set(c.local_date, c);
  }
  const routines = input.routines
    .filter((r) => r.deleted_at === null)
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.sort_order - b.sort_order);
  const routineById = new Map(routines.map((r) => [r.id, r]));

  const fixed: DayItem[] = [];
  const weekly: WeeklyItem[] = [];
  let bestStreak: DayView["bestStreak"] = null;

  for (const habit of input.habits) {
    if (!isActive(habit, input.pauses, date)) continue;
    const schedule = scheduleOn(habit, input.versions, date);
    const history: HabitHistory = {
      habit,
      versions: input.versions,
      pauses: input.pauses,
      checkIns: byHabit.get(habit.id) ?? new Map(),
    };
    const checkIn = history.checkIns.get(date);
    const routine = habit.routine_id ? routineById.get(habit.routine_id) : undefined;
    const item: DayItem = {
      habit,
      schedule,
      checkIn: liveCheckIn(checkIn),
      state: occurrenceState(schedule, checkIn, date, today),
      progress: progress(schedule, checkIn),
      streak: currentStreak(history, date, weekStart),
      attention: needsAttention(history, date, today, weekStart),
      time: habit.time_of_day ?? routine?.start_time ?? null,
    };
    if (item.streak > 0 && (!bestStreak || item.streak > bestStreak.days)) {
      bestStreak = { habit, days: item.streak };
    }
    if (isFixed(schedule)) {
      if (fallsOn(schedule, date)) fixed.push(item);
    } else {
      const p = weekProgress(history, date, today, weekStart);
      weekly.push({ ...item, weekDone: p.done, weekTarget: p.target });
    }
  }

  const order = (a: DayItem, b: DayItem) =>
    a.habit.sort_order - b.habit.sort_order ||
    (a.time ?? "99").localeCompare(b.time ?? "99") ||
    a.habit.name.localeCompare(b.habit.name);

  const sections: DaySection[] = [];
  for (const routine of routines) {
    const items = fixed.filter((i) => i.habit.routine_id === routine.id).sort(order);
    if (items.length) sections.push({ routine, items });
  }
  const anytime = fixed
    .filter((i) => !i.habit.routine_id || !routineById.has(i.habit.routine_id))
    .sort(order);
  if (anytime.length) sections.push({ routine: null, items: anytime });

  let sum = 0;
  let total = 0;
  let done = 0;
  for (const item of fixed) {
    const c = credit(item.state, item.schedule, item.checkIn);
    if (c === null) continue;
    sum += c;
    total++;
    if (item.state === "done") done++;
  }

  return {
    date,
    score: total === 0 ? null : sum / total,
    done,
    total,
    sections,
    weekly: weekly.sort(order),
    bestStreak,
  };
}
