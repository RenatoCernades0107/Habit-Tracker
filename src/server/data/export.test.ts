import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkInsCsv, csvField } from "./export";

describe("csvField", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(8)).toBe("8");
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-5")).toBe("'-5");
  });
});

describe("checkInsCsv", () => {
  it("joins habit names, skips cleared rows and sorts newest first", () => {
    const base = {
      user_id: "u",
      value: null,
      skip_reason: null,
      note: null,
      source: "app",
      health_verified: false,
      auto_dismissed: false,
      completed_at: null,
      created_at: "",
      updated_at: "",
      deleted_at: null,
    } as const;
    const csv = checkInsCsv(
      [{ id: "h", name: "Agua", unit: "vasos" }],
      [
        { ...base, id: "1", habit_id: "h", local_date: "2026-10-19", status: "done" },
        { ...base, id: "2", habit_id: "h", local_date: "2026-10-20", status: "partial", value: 3 },
        {
          ...base,
          id: "3",
          habit_id: "h",
          local_date: "2026-10-18",
          status: "done",
          deleted_at: "x",
        },
      ],
    );
    expect(csv.split("\r\n")).toEqual([
      "﻿date,habit,status,value,unit,skip_reason,note,source",
      "2026-10-20,Agua,partial,3,vasos,,,app",
      "2026-10-19,Agua,done,,vasos,,,app",
      "",
    ]);
  });
});
