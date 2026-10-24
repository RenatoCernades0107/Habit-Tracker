/** A habit day or calendar date as `YYYY-MM-DD`. Arithmetic is done in UTC, so it never shifts. */
export type IsoDate = string;

const DAY_MS = 86_400_000;

// Statistics walk years of days for every habit, and parsing and formatting dates dominates
// that work (NFR-PERF-8). Both directions are cached; the cache is cleared if it ever grows large.
const msOf = new Map<IsoDate, number>();
const dateOf = new Map<number, IsoDate>();
const CACHE_MAX = 50_000;

function toMs(date: IsoDate): number {
  let ms = msOf.get(date);
  if (ms === undefined) {
    if (msOf.size >= CACHE_MAX) msOf.clear();
    msOf.set(date, (ms = Date.parse(`${date}T00:00:00Z`)));
  }
  return ms;
}

function fromMs(ms: number): IsoDate {
  let date = dateOf.get(ms);
  if (date === undefined) {
    if (dateOf.size >= CACHE_MAX) dateOf.clear();
    dateOf.set(ms, (date = new Date(ms).toISOString().slice(0, 10)));
  }
  return date;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Whole days from `b` to `a` (positive when `a` is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toMs(a) - toMs(b)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = new Date(toMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** First day of the week containing `date` (R-DAY-4). */
export function weekStartOf(date: IsoDate, weekStart: number): IsoDate {
  const offset = (isoWeekday(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

/** The 7 days of the week that starts on `start`. */
export function weekDays(start: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function sameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** True if `date` is within [from, to], where a missing `to` means "open-ended". */
export function inRange(date: IsoDate, from: IsoDate, to: IsoDate | null | undefined): boolean {
  return date >= from && (to == null || date <= to);
}
