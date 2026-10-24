import { isLocale, isValidTimeZone, negotiateLocale, type Locale } from "@/i18n/config";

import type { WeekStart } from "./week-start";

/** The profile columns sign-in looks at (docs/spec/04-data-model.md §2.1). */
export type ProfileSnapshot = {
  locale: string;
  timezone: string;
  week_start: number;
  onboarding_completed_at: string | null;
};

/** What this device tells us about the user's language and region. */
export type DeviceHints = {
  /** Value of the language cookie, if any. */
  cookieLocale?: string;
  acceptLanguage?: string | null;
  timeZone?: string;
  weekStart?: WeekStart;
};

export type ProfileUpdate = { locale?: Locale; timezone?: string; week_start?: WeekStart };

export type ProfileSyncPlan =
  | { kind: "update"; values: ProfileUpdate }
  | { kind: "setLocaleCookie"; locale: Locale }
  | { kind: "none" };

/**
 * Decides what to do with the profile right after signing in (FR-ACC-2):
 * - Before onboarding, the profile follows this device: language (cookie, then the browser),
 *   timezone and week start. This matters for Google sign-ups, which carry no metadata.
 * - After onboarding, the profile is the source of truth: a returning user on a new device
 *   gets their saved language through the language cookie.
 * Only changed values are written.
 */
export function planProfileSync(profile: ProfileSnapshot, hints: DeviceHints): ProfileSyncPlan {
  if (profile.onboarding_completed_at !== null) {
    if (isLocale(profile.locale) && profile.locale !== hints.cookieLocale) {
      return { kind: "setLocaleCookie", locale: profile.locale };
    }
    return { kind: "none" };
  }

  const values: ProfileUpdate = {};
  const locale = isLocale(hints.cookieLocale)
    ? hints.cookieLocale
    : negotiateLocale(hints.acceptLanguage);
  if (locale !== profile.locale) values.locale = locale;
  if (isValidTimeZone(hints.timeZone) && hints.timeZone !== profile.timezone) {
    values.timezone = hints.timeZone;
  }
  if (hints.weekStart !== undefined && hints.weekStart !== profile.week_start) {
    values.week_start = hints.weekStart;
  }

  return Object.keys(values).length > 0 ? { kind: "update", values } : { kind: "none" };
}
