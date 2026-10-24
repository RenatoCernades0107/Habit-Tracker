import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

import { mapAuthError, type AuthErrorKey } from "./errors";
import { oauthCallbackUrl } from "./routes";
import type { WeekStart } from "./week-start";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Whether the Google provider is on, from Supabase Auth's public settings. When it's off,
 * Supabase answers the OAuth redirect with a bare JSON error page, so we check first and
 * show a friendly message instead. Unknown (null) when the settings can't be read.
 */
async function isGoogleEnabled(): Promise<boolean | null> {
  const env = getPublicEnv();
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.external)) return null;
  return body.external.google === true;
}

/**
 * Starts Google sign-in (FR-ACC-1) in the browser. On success the page navigates away to
 * Google and this resolves to null; otherwise it resolves to the message to show.
 */
export async function startGoogleSignIn(options: {
  next: string;
  weekStart?: WeekStart;
}): Promise<AuthErrorKey | null> {
  try {
    if ((await isGoogleEnabled()) === false) return "googleUnavailable";

    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthCallbackUrl(window.location.origin, options.next, options.weekStart),
        // Lets people with several Google accounts pick the right one.
        queryParams: { prompt: "select_account" },
      },
    });
    return error ? mapAuthError(error, "oauth") : null;
  } catch (error) {
    return mapAuthError(error, "oauth");
  }
}
