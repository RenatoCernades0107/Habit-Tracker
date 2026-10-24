import { addDays, type IsoDate } from "@/domain/dates";
import { zonedTimeToUtc } from "@/domain/zoned";

import type { GoogleEvent } from "./google";

/** What a habit's series needs to know (docs/spec/06-integrations.md §3.5). */
export type SeriesHabit = {
  id: string;
  name: string;
  icon: string | null;
  cue: string | null;
  description: string | null;
  schedule_type: "daily" | "days_of_week" | "times_per_week";
  days_of_week: number[] | null;
  time_of_day: string | null;
  duration_min: number | null;
  start_date: string;
  archived_on: string | null;
  deleted_at: string | null;
  calendar_sync: boolean;
};

export type SeriesPause = {
  start_date: string;
  end_date: string | null;
  deleted_at: string | null;
};

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
/** Google Calendar's "Basil" (green), for done days. */
export const DONE_COLOR = "10";
/** Pauses far in the future aren't listed one by one. */
const EXDATE_HORIZON_DAYS = 400;

/** The time the habit happens: its own, or its routine's start (R-SCHED-5). */
export function seriesTime(habit: SeriesHabit, routineStart: string | null): string | null {
  return (habit.time_of_day ?? routineStart)?.slice(0, 5) ?? null;
}

/** FR-CAL-5: only fixed-schedule habits with a time are synced. */
export function isSyncable(habit: SeriesHabit, routineStart: string | null): boolean {
  return (
    habit.calendar_sync &&
    habit.deleted_at === null &&
    habit.archived_on === null &&
    habit.schedule_type !== "times_per_week" &&
    seriesTime(habit, routineStart) !== null
  );
}

export function rruleOf(habit: Pick<SeriesHabit, "schedule_type" | "days_of_week">): string {
  if (habit.schedule_type === "days_of_week" && habit.days_of_week?.length) {
    const days = [...habit.days_of_week].sort((a, b) => a - b).map((d) => BYDAY[d - 1]);
    return `RRULE:FREQ=WEEKLY;BYDAY=${days.join(",")}`;
  }
  return "RRULE:FREQ=DAILY";
}

/**
 * Identifies a series' shape. When it changes, the old series ends and a new one starts, so past
 * events keep how they were (FR-CAL-4). Stored in calendar_series.rrule.
 */
export function seriesSignature(habit: SeriesHabit, time: string): string {
  return `${rruleOf(habit)};T=${time};D=${habit.duration_min ?? 15}`;
}

const compact = (date: IsoDate) => date.replaceAll("-", "");
const hhmmss = (time: string) => `${time.replace(":", "")}00`;

/** `UNTIL` for a series that ends after `last` (inclusive): the end of that day, in UTC. */
export function untilAfter(last: IsoDate, timeZone: string): string {
  const end = new Date(zonedTimeToUtc(addDays(last, 1), "00:00", timeZone).getTime() - 1000);
  return end
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Paused days, and the day an open-ended pause starts (the series stops there). */
export function pausedDays(
  pauses: readonly SeriesPause[],
  from: IsoDate,
): { exdates: IsoDate[]; stopBefore: IsoDate | null } {
  const exdates = new Set<IsoDate>();
  let stopBefore: IsoDate | null = null;
  const horizon = addDays(from, EXDATE_HORIZON_DAYS);
  for (const p of pauses) {
    if (p.deleted_at !== null) continue;
    if (p.end_date === null) {
      const start = p.start_date < from ? from : p.start_date;
      if (!stopBefore || start < stopBefore) stopBefore = start;
      continue;
    }
    for (
      let d = p.start_date < from ? from : p.start_date;
      d <= p.end_date && d <= horizon;
      d = addDays(d, 1)
    ) {
      exdates.add(d);
    }
  }
  return { exdates: [...exdates].sort(), stopBefore };
}

export type SeriesSpec = {
  habit: SeriesHabit;
  time: string;
  timeZone: string;
  from: IsoDate;
  /** Last day of the series, inclusive; null = open-ended. */
  until: IsoDate | null;
  pauses: readonly SeriesPause[];
  appUrl: string;
};

export function baseSummary(habit: Pick<SeriesHabit, "icon" | "name">): string {
  return habit.icon ? `${habit.icon} ${habit.name}` : habit.name;
}

/** The recurring event of one series period (Integrations §3.5). */
export function seriesEvent(spec: SeriesSpec): GoogleEvent {
  const { habit, time, timeZone, from, appUrl } = spec;
  const minutes = habit.duration_min ?? 15;
  const [h = 0, m = 0] = time.split(":").map(Number);
  const endMinutes = h * 60 + m + minutes;
  // Events that run past midnight end on the next day.
  const endDay = addDays(from, Math.floor(endMinutes / 1440));
  const endTime = `${String(Math.floor((endMinutes % 1440) / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  const { exdates, stopBefore } = pausedDays(spec.pauses, from);
  let until = spec.until;
  if (stopBefore && (!until || addDays(stopBefore, -1) < until)) until = addDays(stopBefore, -1);

  let rule = rruleOf(habit);
  if (until) rule += `;UNTIL=${untilAfter(until, timeZone)}`;
  const recurrence = [rule];
  const inRange = exdates.filter((d) => !until || d <= until);
  if (inRange.length) {
    recurrence.push(
      `EXDATE;TZID=${timeZone}:${inRange.map((d) => `${compact(d)}T${hhmmss(time)}`).join(",")}`,
    );
  }

  const description = [
    habit.cue,
    habit.description,
    `${appUrl.replace(/\/$/, "")}/habits/${habit.id}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: baseSummary(habit),
    description,
    start: { dateTime: `${from}T${time}:00`, timeZone },
    end: { dateTime: `${endDay}T${endTime}:00`, timeZone },
    recurrence,
    // FR-CAL-6: no Google reminders, shown as free.
    reminders: { useDefault: false, overrides: [] },
    transparency: "transparent",
    extendedProperties: { private: { habitId: habit.id } },
  };
}

/** How a day's instance looks for a check-in state (FR-CAL-3). */
export function instancePatch(
  habit: Pick<SeriesHabit, "icon" | "name">,
  state: "done" | "skipped" | null,
): GoogleEvent {
  if (state === "done") return { summary: `✅ ${habit.name}`, colorId: DONE_COLOR };
  if (state === "skipped") return { summary: `⏭️ ${habit.name}`, colorId: null };
  return { summary: baseSummary(habit), colorId: null };
}

/** [start, end) of a habit day's instance search, as RFC 3339 instants. */
export function dayRange(date: IsoDate, timeZone: string): { timeMin: string; timeMax: string } {
  return {
    timeMin: zonedTimeToUtc(date, "00:00", timeZone).toISOString(),
    timeMax: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone).toISOString(),
  };
}
