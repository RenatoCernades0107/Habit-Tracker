import "server-only";

import { z } from "zod";

const serverSchema = z.object({
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

let serverEnv: ServerEnv | undefined;

/** Server-only secrets. Validated on first use. Never import this from client code. */
export function getServerEnv(): ServerEnv {
  serverEnv ??= serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || undefined,
    ACTION_TOKEN_SECRET: process.env.ACTION_TOKEN_SECRET || undefined,
  });
  return serverEnv;
}
