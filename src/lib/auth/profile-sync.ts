import "server-only";

import { cookies, headers } from "next/headers";

import { LOCALE_COOKIE, TIMEZONE_COOKIE } from "@/i18n/config";
import type { createClient } from "@/lib/supabase/server";

import { loggableError } from "./log";
import { planProfileSync } from "./profile-sync-plan";
import type { WeekStart } from "./week-start";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

// Same cookie as setUserLocale (src/i18n/actions.ts).
const LOCALE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * Lines the profile up with this device right after a sign-in (see `planProfileSync`).
 * Uses the signed-in client, so RLS applies. Never throws: a failure here must not undo
 * a successful sign-in, so it's logged and skipped.
 */
export async function syncProfileAfterSignIn(
  supabase: ServerSupabase,
  userId: string,
  options: { timeZone?: string; weekStart?: WeekStart } = {},
): Promise<void> {
  try {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("locale, timezone, week_start, onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) {
      // The signup trigger (handle_new_user) creates it; nothing to sync without it.
      console.warn("[auth] profile sync skipped: no profile row");
      return;
    }

    const plan = planProfileSync(profile, {
      cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerList.get("accept-language"),
      // Next.js decodes cookie values, so this is "America/Lima", not "America%2FLima".
      timeZone: options.timeZone ?? cookieStore.get(TIMEZONE_COOKIE)?.value,
      weekStart: options.weekStart,
    });

    if (plan.kind === "update") {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(plan.values)
        .eq("id", userId);
      if (updateError) throw updateError;
    } else if (plan.kind === "setLocaleCookie") {
      cookieStore.set(LOCALE_COOKIE, plan.locale, LOCALE_COOKIE_OPTIONS);
    }
  } catch (error) {
    console.error("[auth] profile sync failed:", loggableError(error));
  }
}
