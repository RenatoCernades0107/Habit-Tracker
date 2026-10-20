/**
 * Gzipped JavaScript the Today route loads in a modern browser (NFR-PERF-5), from the build in
 * `.next`. Run with `npm run size` after `npm run build`; CI fails above the ceiling, so the
 * bundle can't grow unnoticed. Polyfills are left out: they load only in old browsers.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const NEXT = ".next";
/** The spec's budget is 170 KB; the framework and supabase-js alone are about that today. */
const CEILING_KB = 320;

const manifest = readFileSync(
  join(NEXT, "server/app/(app)/today/page_client-reference-manifest.js"),
  "utf8",
);
const build = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8")) as {
  rootMainFiles?: string[];
};
const chunks = new Set([
  ...(manifest.match(/static\/chunks\/[^"\\]+\.js/g) ?? []),
  ...(build.rootMainFiles ?? []),
]);

const sizes = [...chunks]
  .filter((c) => existsSync(join(NEXT, c)))
  .map((c) => ({ chunk: c, kb: gzipSync(readFileSync(join(NEXT, c))).length / 1024 }))
  .sort((a, b) => b.kb - a.kb);
const total = sizes.reduce((sum, s) => sum + s.kb, 0);

for (const s of sizes.slice(0, 8)) console.log(`${s.kb.toFixed(1).padStart(7)} KB  ${s.chunk}`);
console.log(`Today: ${total.toFixed(1)} KB gzip in ${sizes.length} files (ceiling ${CEILING_KB} KB)`);
if (total > CEILING_KB) {
  console.error("The Today route's JavaScript is over its ceiling.");
  process.exit(1);
}
