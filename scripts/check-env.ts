/**
 * Checks an env file against the rules the app enforces at runtime, without printing any
 * value. Run with `npm run env:check -- .env.prod` (defaults to .env.local) before pasting
 * the values into Vercel.
 */
import { readFileSync } from "node:fs";

import { serverEnvInput, serverEnvIssues, serverSchema } from "../src/lib/env.schema";
import { parseVapidPublicKey } from "../src/lib/push/client";

type Problem = { name: string; problem: string };

/** Minimal dotenv parser: `KEY=value`, optional `export`, quotes and `# comments`. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    const [, name, rest] = match ?? [];
    if (!name || rest === undefined) continue;
    let value = rest.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[name] = value;
  }
  return out;
}

function isLocalUrl(value: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** Every problem in `env`, as variable name + rule. Values never appear in the result. */
export function checkEnv(env: Record<string, string>): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    const value = env[name];
    if (!value) errors.push({ name, problem: "missing" });
    else if (!URL.canParse(value)) errors.push({ name, problem: "not a URL" });
    else if (isLocalUrl(value)) errors.push({ name, problem: "points to localhost" });
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    errors.push({ name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", problem: "missing" });
  }
  if (!parseVapidPublicKey(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)) {
    errors.push({
      name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      problem: "missing or not a P-256 public key",
    });
  }

  const server = serverSchema.safeParse(serverEnvInput(env));
  if (!server.success) errors.push(...serverEnvIssues(server.error));

  if (env.SUPABASE_SECRET_KEY?.startsWith("sb_publishable_")) {
    errors.push({ name: "SUPABASE_SECRET_KEY", problem: "is the publishable key, not the secret" });
  }
  const google = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"];
  const missingGoogle = google.filter((name) => !env[name]);
  if (missingGoogle.length > 0 && missingGoogle.length < google.length) {
    errors.push(...missingGoogle.map((name) => ({ name, problem: "needed for Google Calendar" })));
  } else if (missingGoogle.length === google.length) {
    warnings.push({ name: google.join(", "), problem: "unset: Google Calendar stays off" });
  }
  for (const [name, value] of Object.entries(env)) {
    if (value !== value.trim()) warnings.push({ name, problem: "has leading/trailing spaces" });
  }
  return { errors, warnings };
}

function main(): number {
  const file = process.argv[2] ?? ".env.local";
  const { errors, warnings } = checkEnv(parseEnvFile(readFileSync(file, "utf8")));
  for (const w of warnings) console.warn(`warning  ${w.name}: ${w.problem}`);
  for (const e of errors) console.error(`error    ${e.name}: ${e.problem}`);
  if (errors.length > 0) {
    console.error(`\n${file}: ${errors.length} problem(s). Fix them in Vercel too, then redeploy.`);
    return 1;
  }
  console.log(`✓ ${file}: OK. Copy the same values to Vercel (Production) and redeploy.`);
  return 0;
}

if (process.argv[1]?.endsWith("check-env.ts")) {
  process.exit(main());
}
