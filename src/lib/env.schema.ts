import { z } from "zod";

/**
 * Rules for the server-only variables. Kept apart from env.server.ts (which imports
 * `server-only`) so `npm run env:check` can apply the same rules to a local file.
 */
export const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z
    .string()
    .refine((v) => v.startsWith("mailto:") || v.startsWith("https://"), "Use mailto: or https://"),
  // Later phases. Optional until the feature that needs them exists.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  ACTION_TOKEN_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

type Source = Record<string, string | undefined>;

/** Picks the server variables out of `source`; empty optional values count as unset. */
export function serverEnvInput(source: Source) {
  return {
    SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY,
    CRON_SECRET: source.CRON_SECRET,
    VAPID_PRIVATE_KEY: source.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: source.VAPID_SUBJECT,
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET || undefined,
    TOKEN_ENCRYPTION_KEY: source.TOKEN_ENCRYPTION_KEY || undefined,
    ACTION_TOKEN_SECRET: source.ACTION_TOKEN_SECRET || undefined,
  };
}

/** One problem per variable, naming the variable and the rule but never the value. */
export function serverEnvIssues(error: z.ZodError): { name: string; problem: string }[] {
  return error.issues.map((issue) => ({
    name: String(issue.path[0]),
    problem:
      issue.code === "invalid_type"
        ? "missing"
        : issue.code === "too_small" && issue.minimum === 1
          ? "empty"
          : issue.message,
  }));
}
