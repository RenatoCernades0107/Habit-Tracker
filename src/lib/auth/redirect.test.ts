import { describe, expect, it } from "vitest";

import { MAX_NEXT_PATH_LENGTH, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/today", "/today"],
    ["/habits/123/edit", "/habits/123/edit"],
    ["/stats?range=30d", "/stats?range=30d"],
    ["/settings#notifications", "/settings#notifications"],
    ["/", "/"],
    ["/routine/abc?step=2#top", "/routine/abc?step=2#top"],
    ["/habits/a%2Fb", "/habits/a%2Fb"],
    ["/search?q=a%20b", "/search?q=a%20b"],
    ["/authors", "/authors"],
    ["/login-help", "/login-help"],
  ])("accepts %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("normalizes dot segments", () => {
    expect(safeNextPath("/habits/../stats")).toBe("/stats");
    expect(safeNextPath("/./today")).toBe("/today");
  });

  it.each([
    // Not a string, empty or too long.
    [undefined],
    [null],
    [42],
    [["/today"]],
    [""],
    [`/${"a".repeat(MAX_NEXT_PATH_LENGTH)}`],
    // Absolute and scheme URLs.
    ["https://evil.example"],
    ["http:/evil.example"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["mailto:me@example.com"],
    ["today"],
    ["./today"],
    ["../today"],
    // Protocol-relative and backslash tricks.
    ["//evil.example"],
    ["///evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/today\\..\\..\\evil"],
    // Control characters that URL parsers strip.
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["/\r/evil.example"],
    ["/\u0000"],
    ["/today\u007f"],
    // Percent-encoded versions.
    ["/%2F%2Fevil.example"],
    ["/%2fevil.example"],
    ["%2F%2Fevil.example"],
    ["/%5Cevil.example"],
    ["/%5cevil.example"],
    ["/%09/evil.example"],
    ["/%0A/evil.example"],
    ["/%00"],
    ["/%252F%252Fevil.example"],
    ["/%25252F%25252Fevil.example"],
    ["%68ttps://evil.example"],
    // Malformed escapes.
    ["/%E0%A4%A"],
    ["/%"],
    // Full-width solidus and reverse solidus.
    ["/／evil.example"],
    ["/＼evil.example"],
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/today");
  });

  it.each([
    ["/login"],
    ["/login?next=%2Ftoday"],
    ["/login/"],
    ["/LOGIN"],
    ["/auth/callback"],
    ["/auth/callback?code=abc"],
    ["/auth"],
    ["/today/../login"],
    ["/%2e%2e/login"],
  ])("never returns the sign-in flow: %j", (input) => {
    expect(safeNextPath(input)).toBe("/today");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.example", "/habits")).toBe("/habits");
    expect(safeNextPath(undefined, "/settings")).toBe("/settings");
  });

  it("accepts a path exactly at the length limit", () => {
    const path = `/${"a".repeat(MAX_NEXT_PATH_LENGTH - 1)}`;
    expect(path).toHaveLength(MAX_NEXT_PATH_LENGTH);
    expect(safeNextPath(path)).toBe(path);
  });
});
