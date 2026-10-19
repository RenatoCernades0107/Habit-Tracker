import { describe, expect, it } from "vitest";

import { detectWeekStart, parseWeekStart } from "./week-start";

const withGetter = (firstDay: unknown) => () => ({ getWeekInfo: () => ({ firstDay }) });
const withProperty = (firstDay: unknown) => () => ({ weekInfo: { firstDay } });

describe("detectWeekStart", () => {
  it("reads getWeekInfo()", () => {
    expect(detectWeekStart("en-US", withGetter(7))).toBe(7);
    expect(detectWeekStart("es-ES", withGetter(1))).toBe(1);
  });

  it("reads the older weekInfo getter", () => {
    expect(detectWeekStart("en-US", withProperty(7))).toBe(7);
    expect(detectWeekStart("en-GB", withProperty(1))).toBe(1);
  });

  it("omits days a profile can't store", () => {
    expect(detectWeekStart("ar-EG", withGetter(6))).toBeUndefined();
    expect(detectWeekStart("xx", withGetter(undefined))).toBeUndefined();
  });

  it("omits when the engine has no week data", () => {
    expect(detectWeekStart("en-US", () => ({}))).toBeUndefined();
  });

  it("omits when the tag is missing or invalid", () => {
    expect(detectWeekStart(undefined)).toBeUndefined();
    expect(detectWeekStart("")).toBeUndefined();
    expect(detectWeekStart("not a tag!")).toBeUndefined();
  });

  it("works with this runtime's Intl when it has week data", () => {
    const result = detectWeekStart("en-US");
    expect(result === undefined || result === 7).toBe(true);
  });
});

describe("parseWeekStart", () => {
  it.each([
    [1, 1],
    [7, 7],
    ["1", 1],
    ["7", 7],
  ])("accepts %j", (input, expected) => {
    expect(parseWeekStart(input)).toBe(expected);
  });

  it.each([0, 2, 6, "", "mon", null, undefined, 1.5])("rejects %j", (input) => {
    expect(parseWeekStart(input)).toBeUndefined();
  });
});
