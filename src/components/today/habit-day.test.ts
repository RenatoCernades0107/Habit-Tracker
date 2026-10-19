import { describe, expect, it } from "vitest";

import { dateOfHabitDay, habitDay } from "./habit-day";

// R-DAY-2: local_date(t) = calendar date of (t in the user's timezone − day_start_hour).
describe("habitDay", () => {
  it("is still yesterday before 04:00 local time", () => {
    // 03:59 in Lima (UTC−5).
    expect(habitDay(new Date("2026-10-20T08:59:00Z"), "America/Lima")).toBe("2026-10-19");
  });

  it("turns at 04:00 local time", () => {
    expect(habitDay(new Date("2026-10-20T09:00:00Z"), "America/Lima")).toBe("2026-10-20");
  });

  it("uses the timezone's date, not UTC's", () => {
    // 23:30 UTC is already 08:30 the next day in Tokyo.
    expect(habitDay(new Date("2026-10-19T23:30:00Z"), "Asia/Tokyo")).toBe("2026-10-20");
    // 02:00 UTC is still 21:00 the previous day in Lima.
    expect(habitDay(new Date("2026-10-20T02:00:00Z"), "America/Lima")).toBe("2026-10-19");
  });

  it("follows the configured start hour", () => {
    const at = new Date("2026-10-20T06:30:00Z"); // 01:30 in Lima
    expect(habitDay(at, "America/Lima", 0)).toBe("2026-10-20");
    expect(habitDay(at, "America/Lima", 2)).toBe("2026-10-19");
  });

  it("crosses month and year boundaries", () => {
    expect(habitDay(new Date("2027-01-01T03:00:00Z"), "UTC")).toBe("2026-12-31");
    expect(habitDay(new Date("2026-03-01T01:00:00Z"), "UTC")).toBe("2026-02-28");
  });

  it("counts wall-clock hours on a spring-forward night", () => {
    // New York jumps from 02:00 to 03:00 on 2026-03-08. 03:30 EDT is 07:30 UTC.
    expect(habitDay(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toBe("2026-03-07");
    // 04:00 EDT starts the new habit day.
    expect(habitDay(new Date("2026-03-08T08:00:00Z"), "America/New_York")).toBe("2026-03-08");
  });

  it("counts wall-clock hours on a fall-back night", () => {
    // New York repeats 01:00–02:00 on 2026-11-01. 03:59 EST is 08:59 UTC.
    expect(habitDay(new Date("2026-11-01T08:59:00Z"), "America/New_York")).toBe("2026-10-31");
    expect(habitDay(new Date("2026-11-01T09:00:00Z"), "America/New_York")).toBe("2026-11-01");
  });
});

describe("dateOfHabitDay", () => {
  it("prints the same date in any language when formatted in UTC", () => {
    const date = dateOfHabitDay("2026-10-20");
    const options = { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" } as const;
    expect(new Intl.DateTimeFormat("en", options).format(date)).toBe("Tuesday, October 20");
    expect(new Intl.DateTimeFormat("es", options).format(date)).toBe("martes, 20 de octubre");
  });
});
