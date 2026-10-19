import { describe, expect, it } from "vitest";

import { compareCatalogs, flatten, icuArguments } from "./check-i18n";

describe("flatten", () => {
  it("joins nested keys with dots", () => {
    expect([...flatten({ a: "x", b: { c: "y", d: { e: "z" } } })]).toEqual([
      ["a", "x"],
      ["b.c", "y"],
      ["b.d.e", "z"],
    ]);
  });
});

describe("icuArguments", () => {
  it("finds simple and plural arguments, but not nested ones", () => {
    expect(icuArguments("Hi {name}")).toEqual(["name"]);
    expect(icuArguments("{count, plural, one {# day} other {# days}} for {habit}")).toEqual([
      "count",
      "habit",
    ]);
    expect(icuArguments("No arguments")).toEqual([]);
  });

  it("ignores text quoted with apostrophes", () => {
    expect(icuArguments("Use '{braces}' literally, {name}")).toEqual(["name"]);
  });
});

describe("compareCatalogs", () => {
  const en = new Map([
    ["title", "Hello {name}"],
    ["count", "{n, plural, one {# habit} other {# habits}}"],
  ]);

  it("passes when keys and arguments match", () => {
    const es = new Map([
      ["title", "Hola {name}"],
      ["count", "{n, plural, one {# hábito} other {# hábitos}}"],
    ]);
    expect(compareCatalogs(en, es)).toEqual([]);
  });

  it("reports missing, extra and mismatched keys", () => {
    const es = new Map([
      ["title", "Hola {nombre}"],
      ["extra", "Extra"],
    ]);
    expect(compareCatalogs(en, es)).toEqual([
      'key "title" has arguments [nombre], expected [name]',
      'missing key "count"',
      'extra key "extra" (not in en)',
    ]);
  });
});
