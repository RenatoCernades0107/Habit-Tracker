import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let publicEnv: PublicEnv | undefined;

/**
 * Variables that are safe in the browser. Each one is read by its full name so that
 * Next.js can inline it into client bundles. Validated on first use, not at import,
 * so builds don't fail where a variable isn't needed.
 */
export function getPublicEnv(): PublicEnv {
  publicEnv ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
  });
  return publicEnv;
}
