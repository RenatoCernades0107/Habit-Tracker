import type { IsoDate } from "./dates";
import type { Schedule } from "./schedule";
import type { CheckInRow } from "./types";

export type OccurrenceState = "done" | "partial" | "skipped" | "pending" | "missed";

/** A check-in that counts: present and not cleared. */
export function liveCheckIn(checkIn: CheckInRow | undefined): CheckInRow | undefined {
  return checkIn && checkIn.deleted_at === null ? checkIn : undefined;
}

/** R-STATE: the state of one occurrence, judged by the schedule in force that day. */
export function occurrenceState(
  schedule: Schedule,
  checkIn: CheckInRow | undefined,
  date: IsoDate,
  today: IsoDate,
): OccurrenceState {
  const live = liveCheckIn(checkIn);
  if (live?.status === "skipped") return "skipped";
  if (schedule.kind === "measurable") {
    const value = live?.value ?? 0;
    if (schedule.target !== null && value >= schedule.target) return "done";
    if (value > 0) return "partial";
  } else if (live?.status === "done") {
    return "done";
  }
  return date >= today ? "pending" : "missed";
}

/** Progress toward the target, 0…1 (measurable), or 0/1 (boolean). */
export function progress(schedule: Schedule, checkIn: CheckInRow | undefined): number {
  const live = liveCheckIn(checkIn);
  if (!live || live.status === "skipped") return 0;
  if (schedule.kind === "measurable") {
    if (!schedule.target) return 0;
    return Math.min((live.value ?? 0) / schedule.target, 1);
  }
  return live.status === "done" ? 1 : 0;
}

/** Credit for scores (R-STATE); `null` when the occurrence doesn't count (skipped). */
export function credit(
  state: OccurrenceState,
  schedule: Schedule,
  checkIn: CheckInRow | undefined,
): number | null {
  if (state === "skipped") return null;
  if (state === "done") return 1;
  if (state === "partial") return progress(schedule, checkIn);
  return 0;
}
