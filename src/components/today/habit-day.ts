/** Default `day_start_hour` (R-DAY-1): a habit day runs from 04:00 to 04:00. */
export const DEFAULT_DAY_START_HOUR = 4;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The habit day of `now` as `YYYY-MM-DD` (R-DAY-2, R-DAY-3): the calendar date of the local
 * wall-clock time in `timeZone` minus `dayStartHour` hours. Working on the wall clock (not
 * the instant) keeps DST days right: at 03:30 on a spring-forward night it's still yesterday.
 *
 * TODO(R-DAY-2): Phase 0 uses the device timezone (cookie) and the default start hour.
 * Once Today reads the profile, pass its `timezone` and `day_start_hour`, and move this to
 * the shared domain code next to its twin, `srv_user_today`.
 */
export function habitDay(
  now: Date,
  timeZone: string,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  // Midnight UTC of the local calendar date; stepping back a whole day is then exact.
  let date = Date.UTC(part("year"), part("month") - 1, part("day"));
  if (part("hour") < dayStartHour) date -= DAY_MS;
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * A `Date` for formatting a `YYYY-MM-DD` habit day. Format it with `timeZone: "UTC"`, so
 * the printed date can't shift with the viewer's offset.
 */
export function dateOfHabitDay(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00Z`);
}
