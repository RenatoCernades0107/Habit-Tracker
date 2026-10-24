export type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
};

let publicEnv: PublicEnv | undefined;

// Checked by hand rather than with zod: this module ships to the browser, and zod would add
// tens of kilobytes to every screen (NFR-PERF-5).
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function url(name: string, value: string | undefined): string {
  const v = required(name, value);
  if (!URL.canParse(v)) throw new Error(`Environment variable ${name} is not a URL`);
  return v;
}

/**
 * Variables that are safe in the browser. Each one is read by its full name so that
 * Next.js can inline it into client bundles. Validated on first use, not at import,
 * so builds don't fail where a variable isn't needed.
 */
export function getPublicEnv(): PublicEnv {
  publicEnv ??= {
    NEXT_PUBLIC_SUPABASE_URL: url("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    NEXT_PUBLIC_APP_URL: url("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
  };
  return publicEnv;
}
