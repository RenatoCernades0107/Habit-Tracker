/**
 * Checks that every language has the same message keys and the same ICU arguments
 * as English (FR-I18N-1). Run with `npm run i18n:check`; CI fails on any difference.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { locales } from "../src/i18n/config";
import { namespaces } from "../src/i18n/messages";

type Tree = { [key: string]: string | Tree };

const REFERENCE = "en";

/** Flattens nested messages into `a.b.c` → text. */
export function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** Top-level ICU argument names in a message, e.g. `{count, plural, …}` → `count`. */
export function icuArguments(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    if (char === "'") {
      // ICU apostrophe quoting: skip quoted literal text.
      const end = message.indexOf("'", i + 1);
      if (end > i + 1) i = end;
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        const match = /^\{\s*([A-Za-z_][\w]*)/.exec(message.slice(i));
        if (match?.[1]) names.add(match[1]);
      }
      depth++;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return [...names].sort();
}

export function compareCatalogs(
  reference: Map<string, string>,
  other: Map<string, string>,
): string[] {
  const problems: string[] = [];
  for (const [key, text] of reference) {
    const translated = other.get(key);
    if (translated === undefined) {
      problems.push(`missing key "${key}"`);
      continue;
    }
    const expected = icuArguments(text).join(",");
    const actual = icuArguments(translated).join(",");
    if (expected !== actual) {
      problems.push(`key "${key}" has arguments [${actual}], expected [${expected}]`);
    }
  }
  for (const key of other.keys()) {
    if (!reference.has(key)) problems.push(`extra key "${key}" (not in ${REFERENCE})`);
  }
  return problems;
}

function readCatalog(locale: string, namespace: string): Map<string, string> {
  const file = join(process.cwd(), "messages", locale, `${namespace}.json`);
  return flatten(JSON.parse(readFileSync(file, "utf8")) as Tree);
}

function main(): number {
  let failures = 0;

  for (const locale of locales) {
    const files = readdirSync(join(process.cwd(), "messages", locale)).filter((f) =>
      f.endsWith(".json"),
    );
    for (const file of files) {
      const namespace = file.replace(/\.json$/, "");
      if (!(namespaces as readonly string[]).includes(namespace)) {
        console.error(`✗ messages/${locale}/${file}: namespace not listed in src/i18n/messages.ts`);
        failures++;
      }
    }
  }

  for (const namespace of namespaces) {
    const reference = readCatalog(REFERENCE, namespace);
    for (const locale of locales) {
      if (locale === REFERENCE) continue;
      for (const problem of compareCatalogs(reference, readCatalog(locale, namespace))) {
        console.error(`✗ messages/${locale}/${namespace}.json: ${problem}`);
        failures++;
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} problem(s) found.`);
    return 1;
  }
  console.log(`✓ ${namespaces.length} namespaces match across ${locales.join(", ")}.`);
  return 0;
}

if (process.argv[1]?.endsWith("check-i18n.ts")) {
  process.exit(main());
}
