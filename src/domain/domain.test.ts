import { describe, expect, it } from "vitest";

import { addDays, diffDays, isoWeekday, weekStartOf } from "./dates";
import { buildDayView } from "./day-view";
import { currentStreak, needsAttention, weekProgress, type HabitHistory } from "./progress";
import { effectiveWeeklyTarget, isScheduled, scheduleOn } from "./schedule";
import { skipsLeft, skipsUsed } from "./skips";
import { occurrenceState } from "./state";
import type { CheckInRow, HabitRow, HabitVersionRow, PauseRow, RoutineRow } from "./types";

// Examples from docs/spec/02-domain-rules.md. "Today" is Tuesday 2026-10-20.
const TODAY = "2026-10-20";

let seq = 0;
function habit(overrides: Partial<HabitRow> = {}): HabitRow {
  seq++;
  return {
    id: `h${seq}`,
    name: `Habit ${seq}`,
    icon: null,
    color: null,
    cue: null,
    kind: "boolean",
    target_value: null,
    unit: null,
    increment_step: 1,
    schedule_type: "daily",
    days_of_week: null,
    times_per_week: null,
    time_of_day: null,
    routine_id: null,
    category_id: null,
    sort_order: 0,
    start_date: "2026-01-01",
    archived_on: null,
    deleted_at: null,
    ...overrides,
  };
}

function checkIn(h: HabitRow, date: string, overrides: Partial<CheckInRow> = {}): CheckInRow {
  return {
    habit_id: h.id,
    local_date: date,
    status: "done",
    value: null,
    skip_reason: null,
    note: null,
    source: "app",
    deleted_at: null,
    ...overrides,
  };
}

function history(
  h: HabitRow,
  checkIns: CheckInRow[],
  pauses: PauseRow[] = [],
  versions: HabitVersionRow[] = [],
): HabitHistory {
  return { habit: h, versions, pauses, checkIns: new Map(checkIns.map((c) => [c.local_date, c])) };
}

describe("dates", () => {
  it("knows weekdays and weeks", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(weekStartOf(TODAY, 1)).toBe("2026-10-19");
    expect(weekStartOf(TODAY, 7)).toBe("2026-10-18");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(diffDays("2026-10-20", "2026-10-13")).toBe(7);
  });
});

describe("R-SCHED", () => {
  it("R-SCHED-4: scales the weekly target by active days, halves up", () => {
    expect(effectiveWeeklyTarget(4, 5)).toBe(3);
    expect(effectiveWeeklyTarget(4, 7)).toBe(4);
    expect(effectiveWeeklyTarget(1, 3)).toBe(0);
  });

  it("R-SCHED-0: past days keep the schedule that applied then", () => {
    const h = habit({ schedule_type: "days_of_week", days_of_week: [1, 3, 5] });
    const versions: HabitVersionRow[] = [
      {
        habit_id: h.id,
        valid_from: "2026-01-01",
        schedule_type: "daily",
        days_of_week: null,
        times_per_week: null,
        kind: "boolean",
        target_value: null,
      },
      {
        habit_id: h.id,
        valid_from: "2026-10-19",
        schedule_type: "days_of_week",
        days_of_week: [1, 3, 5],
        times_per_week: null,
        kind: "boolean",
        target_value: null,
      },
    ];
    expect(scheduleOn(h, versions, "2026-10-13").type).toBe("daily");
    expect(isScheduled(h, versions, [], "2026-10-13")).toBe(true); // a Tuesday, daily then
    expect(isScheduled(h, versions, [], TODAY)).toBe(false); // a Tuesday, Mon/Wed/Fri now
  });

  it("R-SCHED-1: paused, archived and not-yet-started habits are not expected", () => {
    const h = habit({ start_date: "2026-10-01", archived_on: "2026-10-30" });
    const pause: PauseRow = {
      id: "p",
      habit_id: null,
      start_date: "2026-10-10",
      end_date: "2026-10-12",
      deleted_at: null,
    };
    expect(isScheduled(h, [], [], "2026-09-30")).toBe(false);
    expect(isScheduled(h, [], [pause], "2026-10-11")).toBe(false);
    expect(isScheduled(h, [], [pause], "2026-10-13")).toBe(true);
    expect(isScheduled(h, [], [], "2026-10-30")).toBe(false);
  });
});

describe("R-STATE", () => {
  const measurable = scheduleOn(habit({ kind: "measurable", target_value: 8 }), [], TODAY);
  const h = habit();
  it("derives the state from value and date", () => {
    expect(occurrenceState(measurable, checkIn(h, TODAY, { value: 8 }), TODAY, TODAY)).toBe("done");
    expect(
      occurrenceState(measurable, checkIn(h, TODAY, { value: 3, status: "partial" }), TODAY, TODAY),
    ).toBe("partial");
    expect(occurrenceState(measurable, undefined, TODAY, TODAY)).toBe("pending");
    expect(occurrenceState(measurable, undefined, "2026-10-19", TODAY)).toBe("missed");
    expect(
      occurrenceState(measurable, checkIn(h, TODAY, { value: 8, deleted_at: "x" }), TODAY, TODAY),
    ).toBe("pending");
    expect(
      occurrenceState(measurable, checkIn(h, TODAY, { status: "skipped" }), TODAY, TODAY),
    ).toBe("skipped");
  });
});

describe("R-SCORE-1: daily score example (56%)", () => {
  const meditate = habit({ name: "Meditate" });
  const read = habit({ name: "Read", kind: "measurable", target_value: 20 });
  const water = habit({ name: "Water", kind: "measurable", target_value: 8 });
  const stretch = habit({ name: "Stretch" });
  const journal = habit({ name: "Journal" });
  const gym = habit({ name: "Gym", schedule_type: "times_per_week", times_per_week: 4 });
  const view = buildDayView({
    date: TODAY,
    today: TODAY,
    weekStart: 1,
    habits: [meditate, read, water, stretch, journal, gym],
    versions: [],
    pauses: [],
    routines: [],
    checkIns: [
      checkIn(meditate, TODAY),
      checkIn(read, TODAY, { status: "partial", value: 10 }),
      checkIn(water, TODAY, { status: "partial", value: 6 }),
      checkIn(stretch, TODAY, { status: "skipped", skip_reason: "sick" }),
      checkIn(gym, TODAY),
      checkIn(gym, "2026-10-19"),
    ],
  });

  it("averages credits over fixed, non-skipped occurrences", () => {
    expect(view.score).toBeCloseTo(0.5625);
    expect(view.total).toBe(4);
    expect(view.done).toBe(1);
  });

  it("shows flexible habits as weekly progress", () => {
    expect(view.weekly.map((w) => [w.habit.name, w.weekDone, w.weekTarget])).toEqual([
      ["Gym", 2, 4],
    ]);
  });

  it("is null on a rest day", () => {
    expect(
      buildDayView({
        date: TODAY,
        today: TODAY,
        weekStart: 1,
        habits: [gym],
        versions: [],
        pauses: [],
        routines: [],
        checkIns: [],
      }).score,
    ).toBeNull();
  });
});

describe("R-STREAK: Train Mon, Tue, Thu, Fri", () => {
  const train = habit({
    schedule_type: "days_of_week",
    days_of_week: [1, 2, 4, 5],
    start_date: "2026-10-01",
  });
  const base = [
    checkIn(train, "2026-10-12"),
    checkIn(train, "2026-10-15"),
    checkIn(train, "2026-10-16"),
    checkIn(train, "2026-10-19", { status: "skipped", skip_reason: "travel" }),
  ];

  it("counts done occurrences back to the last miss; skips and today are neutral", () => {
    expect(currentStreak(history(train, base), TODAY, 1)).toBe(2);
  });

  it("is 3 once today is done", () => {
    expect(currentStreak(history(train, [...base, checkIn(train, TODAY)]), TODAY, 1)).toBe(3);
  });

  it("flags the next occurrence after a miss (don't miss twice)", () => {
    expect(needsAttention(history(train, base), "2026-10-15", TODAY, 1)).toBe(true);
    expect(needsAttention(history(train, base), TODAY, TODAY, 1)).toBe(false);
  });

  it("R-STREAK-2: flexible habits count weeks that met the target", () => {
    const gym = habit({
      schedule_type: "times_per_week",
      times_per_week: 2,
      start_date: "2026-09-28",
    });
    const done = ["2026-10-05", "2026-10-07", "2026-10-13", "2026-10-14", TODAY].map((d) =>
      checkIn(gym, d),
    );
    // Week of 28 Sep missed, 5 Oct met, 12 Oct met, current week (19 Oct) 1 of 2: in progress.
    expect(currentStreak(history(gym, done), TODAY, 1)).toBe(2);
    expect(weekProgress(history(gym, done), TODAY, TODAY, 1)).toMatchObject({ done: 1, target: 2 });
  });
});

describe("R-SKIP", () => {
  it("counts skips in the same calendar month, excluding the day itself", () => {
    const h = habit();
    const rows = [
      checkIn(h, "2026-10-02", { status: "skipped" }),
      checkIn(h, "2026-10-09", { status: "skipped" }),
      checkIn(h, "2026-10-12", { status: "skipped", deleted_at: "x" }),
      checkIn(h, "2026-09-30", { status: "skipped" }),
    ];
    expect(skipsUsed(h.id, rows, TODAY)).toBe(2);
    expect(skipsUsed(h.id, rows, "2026-10-09")).toBe(1);
    expect(skipsLeft(4, 2)).toBe(2);
    expect(skipsLeft(1, 2)).toBe(0);
  });
});

describe("day view sections", () => {
  it("groups by routine in time order, then Anytime", () => {
    const morning: RoutineRow = {
      id: "m",
      system_key: "morning",
      name: null,
      icon: null,
      start_time: "07:00:00",
      sort_order: 0,
      deleted_at: null,
    };
    const evening: RoutineRow = {
      id: "e",
      system_key: "evening",
      name: null,
      icon: null,
      start_time: "21:00:00",
      sort_order: 1,
      deleted_at: null,
    };
    const a = habit({ routine_id: "e" });
    const b = habit({ routine_id: "m" });
    const c = habit();
    const view = buildDayView({
      date: TODAY,
      today: TODAY,
      weekStart: 1,
      habits: [a, b, c],
      versions: [],
      pauses: [],
      routines: [evening, morning],
      checkIns: [],
    });
    expect(view.sections.map((s) => s.routine?.id ?? null)).toEqual(["m", "e", null]);
    expect(view.sections[0]?.items[0]?.time).toBe("07:00:00");
  });
});
