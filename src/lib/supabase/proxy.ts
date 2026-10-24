import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { loggableError } from "@/lib/auth/log";
import { getPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/** "unknown" when the Auth server couldn't be reached: don't sign anyone out over it. */
export type SessionState = "signed-in" | "signed-out" | "unknown";

type CookieToSet = Parameters<SetAllCookies>[0][number];

export type SessionUpdate = {
  state: SessionState;
  /** Continues the request, with refreshed session cookies for the browser and for pages. */
  readonly response: NextResponse;
  /** Copies refreshed cookies and no-cache headers onto another response, e.g. a redirect. */
  carryOver: (target: NextResponse) => NextResponse;
  /**
   * Asks the Auth server whether the session is still valid. A JWT stays valid until it
   * expires even after "sign out of all devices" (FR-ACC-6); a revoked session is cleared
   * from this browser so /login and the app can't bounce the user between each other.
   */
  confirm: () => Promise<SessionState>;
};

/**
 * Refreshes the Supabase session for this request (docs/spec/03-architecture.md §6) and
 * tells the proxy whether someone is signed in. `getClaims()` verifies the access token
 * locally with the project's JWKS (cached), refreshing it first when it has expired, so most
 * requests make no network call. Pages still verify with `requireUser()`.
 */
export async function updateSession(
  request: NextRequest,
  /** Extra request headers for pages, e.g. the CSP nonce. */
  extraHeaders: Record<string, string> = {},
): Promise<SessionUpdate> {
  const env = getPublicEnv();
  // Rebuilt after cookies change, so pages see both the new cookies and the extra headers.
  const next = () => {
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();
  // Merged across calls: the latest value per cookie wins, and @supabase/ssr only passes
  // the cache headers with the first write.
  const cookiesToSet = new Map<string, CookieToSet>();
  const cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies, headers) {
          for (const cookie of cookies) cookiesToSet.set(cookie.name, cookie);
          Object.assign(cacheHeaders, headers);
          // Server Components in this request must see the new tokens too.
          for (const { name, value } of cookies) request.cookies.set(name, value);
          response = next();
          applyTo(response);
        },
      },
    },
  );

  // Session cookies must never be cached by a CDN and served to someone else.
  function applyTo(target: NextResponse): NextResponse {
    for (const { name, value, options } of cookiesToSet.values()) {
      target.cookies.set(name, value, options);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) target.headers.set(key, value);
    return target;
  }

  let state: SessionState;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (data?.claims) state = "signed-in";
    else if (error && isAuthRetryableFetchError(error)) state = "unknown";
    else state = "signed-out";
  } catch (error) {
    console.error("[auth] session refresh failed:", loggableError(error));
    state = "unknown";
  }

  return {
    state,
    get response() {
      return response;
    },
    carryOver: applyTo,
    async confirm() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (data.user) return "signed-in";
        if (error && isAuthRetryableFetchError(error)) return "unknown";
        await supabase.auth.signOut({ scope: "local" });
        return "signed-out";
      } catch (error) {
        console.error("[auth] session check failed:", loggableError(error));
        return "unknown";
      }
    },
  };
}
