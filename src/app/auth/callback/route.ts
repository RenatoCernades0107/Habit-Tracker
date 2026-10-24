import { NextResponse, type NextRequest } from "next/server";

import { callbackErrorForProvider, type CallbackErrorCode } from "@/lib/auth/errors";
import { loggableError } from "@/lib/auth/log";
import { syncProfileAfterSignIn } from "@/lib/auth/profile-sync";
import { safeNextPath } from "@/lib/auth/redirect";
import { DEFAULT_AFTER_SIGN_IN, LOGIN_PATH } from "@/lib/auth/routes";
import { parseWeekStart } from "@/lib/auth/week-start";
import { createClient } from "@/lib/supabase/server";

/**
 * Google sends the user back here (FR-ACC-1). Exchanges the one-time `code` for a session
 * (PKCE: the code verifier is in a cookie set by the browser client), syncs the profile with
 * this device, and continues to the requested page. Every redirect stays on this origin.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));

  // `path` is a safe relative path; resolving it against this request keeps the origin.
  // Never cached: these responses carry session cookies.
  const redirectTo = (path: string) => {
    const { origin } = request.nextUrl;
    const url = new URL(path, origin);
    const response = NextResponse.redirect(
      url.origin === origin ? url : new URL(LOGIN_PATH, origin),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const toLogin = (error: CallbackErrorCode) => {
    const search = new URLSearchParams({ error });
    if (next !== DEFAULT_AFTER_SIGN_IN) search.set("next", next);
    return redirectTo(`${LOGIN_PATH}?${search.toString()}`);
  };

  // The provider (or Supabase) reports a failure, e.g. the user pressed "Cancel".
  // Only a fixed code goes back to the page; `error_description` is never echoed.
  const providerError = params.get("error");
  if (providerError) {
    console.warn("[auth] OAuth callback error:", providerError.slice(0, 64));
    return toLogin(callbackErrorForProvider(providerError));
  }

  const code = params.get("code");
  if (!code) return toLogin("missing_code");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      console.warn("[auth] code exchange failed:", loggableError(error));
      return toLogin("exchange_failed");
    }
    await syncProfileAfterSignIn(supabase, data.user.id, {
      weekStart: parseWeekStart(params.get("week_start")),
    });
  } catch (error) {
    console.error("[auth] OAuth callback threw:", loggableError(error));
    return toLogin("exchange_failed");
  }

  return redirectTo(next);
}
