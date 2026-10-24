import { describe, expect, it } from "vitest";

import { isLocale, isValidTimeZone, negotiateLocale } from "./config";

describe("negotiateLocale", () => {
  it.each([
    ["es-PE,es;q=0.9,en;q=0.8", "es"],
    ["en-US,en;q=0.9", "en"],
    ["fr-FR,fr;q=0.9,es;q=0.5", "es"],
    ["fr-FR,de;q=0.9", "en"],
    ["en;q=0.5,es;q=0.9", "es"],
    ["es;q=0,en", "en"],
    ["*", "en"],
    ["", "en"],
  ])("%j → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("falls back to English without a header", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale(undefined)).toBe("en");
  });

  it("ignores malformed quality values", () => {
    expect(negotiateLocale("es;q=abc,en")).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isValidTimeZone("America/Lima")).toBe(true);
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});
