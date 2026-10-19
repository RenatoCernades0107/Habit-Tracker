/** Where users land after signing in when there's no (valid) `next` path. */
export const DEFAULT_AFTER_SIGN_IN = "/today";

export const LOGIN_PATH = "/login";

/** Callback for Google sign-in (src/app/auth/callback/route.ts). */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Signed-in areas. The proxy sends signed-out visitors to /login; pages still call
 * `requireUser()` because the proxy is only an optimistic check.
 */
export const PROTECTED_PATH_PREFIXES = [
  "/today",
  "/habits",
  "/stats",
  "/settings",
  "/routine",
  "/review",
  "/onboarding",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/** The sign-in flow itself. Never a destination after signing in (it would loop). */
export function isAuthPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return matchesPrefix(path, LOGIN_PATH) || matchesPrefix(path, "/auth");
}

/** `/login?next=…`. `nextPath` must already be safe (see `safeNextPath`). */
export function loginPathFor(nextPath?: string): string {
  return nextPath ? `${LOGIN_PATH}?next=${encodeURIComponent(nextPath)}` : LOGIN_PATH;
}

/**
 * Where Google sends the user back to (`redirectTo`). Carries the safe `next` path and,
 * because OAuth sign-ups have no metadata, the device's week start (FR-ACC-2).
 */
export function oauthCallbackUrl(origin: string, nextPath: string, weekStart?: 1 | 7): string {
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set("next", nextPath);
  if (weekStart !== undefined) url.searchParams.set("week_start", String(weekStart));
  return url.toString();
}
