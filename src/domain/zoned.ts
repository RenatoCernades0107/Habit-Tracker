import type { IsoDate } from "./dates";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock time of an instant in `timeZone`, written as if it were UTC (ms). */
function wallClock(instant: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
}

/** UTC offset of `timeZone` at an instant, in ms (whole minutes). */
function offsetAt(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / MINUTE_MS) * MINUTE_MS;
  return wallClock(floored, timeZone) - floored;
}

/** "07:30:00" or "07:30" → minutes after midnight. */
export function minutesOf(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The instant of a local date and time in `timeZone` (R-NTF-6). A time that doesn't exist
 * (clocks jump forward) moves to the first valid minute after it; a time that happens twice
 * (clocks go back) is the first one.
 */
export function zonedTimeToUtc(date: IsoDate, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d) + minutesOf(time) * MINUTE_MS;
  const before = offsetAt(wall - DAY_MS, timeZone);
  const after = offsetAt(wall + DAY_MS, timeZone);
  const candidates = [...new Set([wall - before, wall - after])].sort((a, b) => a - b);
  const valid = candidates.filter((c) => wallClock(c, timeZone) === wall);
  if (valid.length > 0) return new Date(valid[0]!);

  // In a gap: the first minute after it is the moment the clocks jumped.
  let lo = candidates[0]!;
  let hi = candidates[candidates.length - 1]!;
  const offsetLo = offsetAt(lo, timeZone);
  while (hi - lo > MINUTE_MS) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS;
    if (offsetAt(mid, timeZone) === offsetLo) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/** Minutes after local midnight of an instant in `timeZone`. */
export function localMinutes(instant: Date, timeZone: string): number {
  const wall = wallClock(instant.getTime(), timeZone);
  return Math.round((wall % DAY_MS) / MINUTE_MS);
}

/**
 * Whether an instant falls in quiet hours (FR-NTF-7). The range may cross midnight
 * (22:00–07:00); equal or missing ends mean no quiet hours.
 */
export function inQuietHours(
  instant: Date,
  timeZone: string,
  start: string | null,
  end: string | null,
): boolean {
  return minutesInQuietHours(localMinutes(instant, timeZone), start, end);
}

/** The same test on minutes after midnight (R-NTF-10: the editor's warning). */
export function minutesInQuietHours(
  minutes: number,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false;
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  const m = ((minutes % 1440) + 1440) % 1440;
  return s < e ? m >= s && m < e : m >= s || m < e;
}
