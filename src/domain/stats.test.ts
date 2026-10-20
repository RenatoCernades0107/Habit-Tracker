import { describe, expect, it } from "vitest";

import { addDays } from "./dates";
import {
  bestStreak,
  completionRate,
  dailyScores,
  histories,
  needsAttention,
  perfectDays,
  reachedMilestone,
  weekdayRates,
  weeklyScores,
  weeksStruggling,
} from "./stats";
import type { CheckInRow, HabitRow } from "./types";

const TODAY = "2026-10-20"; // Tuesday

let seq = 0;
function habit(overrides: Partial<HabitRow> = {}): HabitRow {
  seq++;
  return {
    id: `s${seq}`,
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
    start_date: "2026-09-28",
    archived_on: null,
    deleted_at: null,
    ...overrides,
  };
}
const done = (h: HabitRow, date: string, extra: Partial<CheckInRow> = {}): CheckInRow => ({
  habit_id: h.id,
  local_date: date,
  status: "done",
  value: null,
  skip_reason: null,
  note: null,
  source: "app",
  deleted_at: null,
  ...extra,
});
const input = (habits: HabitRow[], checkIns: CheckInRow[]) =>
  histories({ today: TODAY, weekStart: 1, habits, versions: [], pauses: [], checkIns });

describe("milestones", () => {
  it("fires when a streak lands on 3, 7, 14, …", () => {
    expect(reachedMilestone(2, 3)).toBe(3);
    expect(reachedMilestone(6, 7)).toBe(7);
    expect(reachedMilestone(7, 7)).toBeNull();
    expect(reachedMilestone(3, 4)).toBeNull();
  });
});

describe("dailyScores and perfect days", () => {
  const a = habit();
  const b = habit({ start_date: "2026-10-19" });
  const hs = input(
    [a, b],
    [done(a, "2026-10-18"), done(a, "2026-10-19"), done(b, "2026-10-19"), done(a, TODAY)],
  );
  const scores = dailyScores(hs, "2026-10-17", "2026-10-21", TODAY);

  it("scores each day; today is so far; the future is empty", () => {
    expect(scores.map((s) => s.score)).toEqual([0, 1, 1, 0.5, null]);
  });

  it("counts perfect days", () => {
    expect(perfectDays(scores)).toBe(2);
  });
});

describe("completion rate and best streak", () => {
  const h = habit({ start_date: "2026-10-01" });
  const dates = [
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
  ];
  const hs = input(
    [h],
    [...dates.map((d) => done(h, d)), done(h, "2026-10-04", { status: "skipped" })],
  );

  it("R-SCORE-4: done / (scheduled − skipped); today counts only once done", () => {
    // 1–19 Oct: 19 days, 1 skipped → 18 chances, 7 done. Today (pending) is left out.
    expect(completionRate(hs[0]!, "2026-10-01", TODAY, TODAY, 1)).toBeCloseTo(7 / 18);
  });

  it("R-STREAK-3: the longest run; a skip doesn't break it", () => {
    expect(bestStreak(hs[0]!, TODAY, 1)).toBe(7);
  });

  it("flexible habits: weeks that met the target", () => {
    const gym = habit({
      schedule_type: "times_per_week",
      times_per_week: 2,
      start_date: "2026-09-28",
    });
    const gh = input(
      [gym],
      ["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-13"].map((d) => done(gym, d)),
    );
    expect(bestStreak(gh[0]!, TODAY, 1)).toBe(2);
    // Weeks of 28 Sep (0/2), 5 Oct (2/2), 12 Oct (2/2); the current week isn't met yet → left out.
    expect(completionRate(gh[0]!, "2026-09-28", TODAY, TODAY, 1)).toBeCloseTo(4 / 6);
  });
});

describe("weekly scores", () => {
  it("R-SCORE-3: fixed credits plus capped flexible progress", () => {
    const daily = habit({ start_date: "2026-10-12" });
    const gym = habit({
      schedule_type: "times_per_week",
      times_per_week: 2,
      start_date: "2026-10-12",
    });
    const checkIns = [
      ...["2026-10-12", "2026-10-13", "2026-10-14"].map((d) => done(daily, d)),
      ...["2026-10-12", "2026-10-13", "2026-10-14"].map((d) => done(gym, d)),
    ];
    const [week] = weeklyScores(
      input([daily, gym], checkIns),
      "2026-10-12",
      "2026-10-12",
      TODAY,
      1,
    );
    // daily: 3 of 7; gym: min(3, 2) of 2 → (3 + 2) / (7 + 2)
    expect(week?.score).toBeCloseTo(5 / 9);
  });
});

describe("weekday rates", () => {
  it("averages by ISO weekday", () => {
    const h = habit({ start_date: "2026-10-05" });
    const hs = input([h], [done(h, "2026-10-05"), done(h, "2026-10-12")]); // Mondays
    const rates = weekdayRates(hs, "2026-10-05", "2026-10-18", TODAY);
    expect(rates[0]).toMatchObject({ weekday: 1, rate: 1, count: 2 });
    expect(rates[1]).toMatchObject({ weekday: 2, rate: 0, count: 2 });
  });
});

describe("needs attention", () => {
  it("flags habits under 50% over the last 3 weeks, for weeks in a row", () => {
    const weak = habit({ start_date: "2026-09-01" });
    const strong = habit({ start_date: "2026-09-01" });
    const checkIns: CheckInRow[] = [];
    for (let d = "2026-09-28"; d < TODAY; d = addDays(d, 1)) {
      checkIns.push(done(strong, d));
      if (d.endsWith("1") || d.endsWith("5")) checkIns.push(done(weak, d));
    }
    const [w, s] = input([weak, strong], checkIns);
    expect(needsAttention(w!, TODAY, 1)).toBe(true);
    expect(needsAttention(s!, TODAY, 1)).toBe(false);
    expect(weeksStruggling(w!, TODAY, 1)).toBeGreaterThanOrEqual(3);
    expect(weeksStruggling(s!, TODAY, 1)).toBe(0);
  });
});
