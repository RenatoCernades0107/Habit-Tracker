"use server";

import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { getLocale } from "next-intl/server";

import { isValidTimeZone, TIMEZONE_COOKIE } from "@/i18n/config";
import { mapAuthError, type AuthErrorKey } from "@/lib/auth/errors";
import { loggableError } from "@/lib/auth/log";
import { syncProfileAfterSignIn } from "@/lib/auth/profile-sync";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  sendCodeSchema,
  verifyCodeSchema,
  type SendCodeInput,
  type VerifyCodeInput,
} from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export type SendCodeResult = { ok: true } | { ok: false; error: AuthErrorKey };

/** Only failures come back: on success the action redirects to the `next` page. */
export type VerifyCodeResult = { ok: false; error: AuthErrorKey };

/** The device's timezone: the form's value, else the cookie set by <TimezoneCookie />. */
async function deviceTimeZone(fromForm: string | undefined): Promise<string | undefined> {
  if (fromForm) return fromForm;
  const fromCookie = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  return isValidTimeZone(fromCookie) ? fromCookie : undefined;
}

/**
 * Step 1 of email sign-in (FR-ACC-1): emails a 6-digit code. New accounts are created on
 * the fly, with the language, timezone and week start of this device as sign-up metadata;
 * the `handle_new_user` trigger copies them into the profile (FR-ACC-2).
 */
export async function sendCode(input: SendCodeInput): Promise<SendCodeResult> {
  const parsed = sendCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidEmail" };
  const { email, weekStart } = parsed.data;

  const [locale, timezone] = await Promise.all([getLocale(), deviceTimeZone(parsed.data.timeZone)]);
  const metadata: Record<string, string | number> = { locale };
  if (timezone) metadata.timezone = timezone;
  if (weekStart) metadata.week_start = weekStart;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: metadata },
    });
    if (error) {
      console.warn("[auth] sendCode failed:", loggableError(error));
      return { ok: false, error: mapAuthError(error, "send") };
    }
  } catch (error) {
    console.error("[auth] sendCode threw:", loggableError(error));
    return { ok: false, error: mapAuthError(error, "send") };
  }
  return { ok: true };
}

/**
 * Step 2: checks the code. On success the session cookies are set, the profile is synced
 * with this device, and the user is sent to `next` (a same-origin path, default /today).
 */
export async function verifyCode(input: VerifyCodeInput): Promise<VerifyCodeResult> {
  const parsed = verifyCodeSchema.safeParse(input);
  if (!parsed.success) {
    const codeIssue = parsed.error.issues.some((issue) => issue.path[0] === "code");
    return { ok: false, error: codeIssue ? "codeFormat" : "generic" };
  }
  const { email, code, weekStart } = parsed.data;
  const next = safeNextPath(parsed.data.next);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.user) {
      if (error) console.warn("[auth] verifyCode failed:", loggableError(error));
      return { ok: false, error: error ? mapAuthError(error, "verify") : "generic" };
    }
    await syncProfileAfterSignIn(supabase, data.user.id, {
      timeZone: await deviceTimeZone(parsed.data.timeZone),
      weekStart,
    });
  } catch (error) {
    console.error("[auth] verifyCode threw:", loggableError(error));
    return { ok: false, error: mapAuthError(error, "verify") };
  }

  // Outside the try: redirect() works by throwing. Replace, so Back doesn't return to /login.
  redirect(next, RedirectType.replace);
}
