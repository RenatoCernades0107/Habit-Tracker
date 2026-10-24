import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRAND_COLORS } from "./brand";
import { oklchToHex, parseOklch } from "./color";

describe("oklchToHex", () => {
  it.each([
    [[1, 0, 0], "#ffffff"],
    [[0, 0, 0], "#000000"],
    [[0.62796, 0.25768, 29.2339], "#ff0000"],
    [[0.5999, 0, 0], "#808080"],
  ] as const)("converts oklch(%j) to %s", ([l, c, h], hex) => {
    expect(oklchToHex(l, c, h)).toBe(hex);
  });

  it("clamps colors outside the sRGB gamut", () => {
    expect(oklchToHex(0.9, 0.4, 140)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("parseOklch", () => {
  it("reads the numbers of an oklch() value", () => {
    expect(parseOklch("oklch(0.5 0.1 168)")).toEqual([0.5, 0.1, 168]);
    expect(parseOklch("oklch(1 0 0 / 10%)")).toEqual([1, 0, 0]);
    expect(parseOklch("#fff")).toBeNull();
  });
});

/** Reads `--name: oklch(...)` from the :root (light) or .dark block of globals.css. */
function cssToken(block: ":root" | ".dark", name: string): [number, number, number] {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const start = css.indexOf(`${block} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const line = body.split("\n").find((l) => l.trim().startsWith(`--${name}:`));
  const value = line ? parseOklch(line) : null;
  if (!value) throw new Error(`--${name} not found in ${block}`);
  return value;
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

describe("brand colors match the theme tokens", () => {
  it.each([
    ["primary", ":root", "primary"],
    ["primaryDark", ".dark", "primary"],
    ["background", ":root", "background"],
    ["backgroundDark", ".dark", "background"],
  ] as const)("%s ≈ %s --%s", (key, block, token) => {
    const expected = channels(oklchToHex(...cssToken(block, token)));
    const actual = channels(BRAND_COLORS[key]);
    actual.forEach((value, i) =>
      expect(Math.abs(value - (expected[i] ?? -99))).toBeLessThanOrEqual(1),
    );
  });
});
