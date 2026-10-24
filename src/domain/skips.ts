import { sameMonth, type IsoDate } from "./dates";
import type { CheckInRow } from "./types";

/** R-SKIP-1: skips of a habit in the calendar month of `date`, excluding `date` itself. */
export function skipsUsed(habitId: string, checkIns: readonly CheckInRow[], date: IsoDate): number {
  return checkIns.filter(
    (c) =>
      c.habit_id === habitId &&
      c.deleted_at === null &&
      c.status === "skipped" &&
      c.local_date !== date &&
      sameMonth(c.local_date, date),
  ).length;
}

/** Skips of a habit in the calendar month of `date`, `date` included (for display). */
export function skipsInMonth(
  habitId: string,
  checkIns: readonly CheckInRow[],
  date: IsoDate,
): number {
  return checkIns.filter(
    (c) =>
      c.habit_id === habitId &&
      c.deleted_at === null &&
      c.status === "skipped" &&
      sameMonth(c.local_date, date),
  ).length;
}

export function skipsLeft(maxPerMonth: number, used: number): number {
  return Math.max(0, maxPerMonth - used);
}
