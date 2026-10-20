import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { isProtectedPath, LOGIN_PATH, loginPathFor } from "@/lib/auth/routes";
import { getPublicEnv } from "@/lib/env";
import { contentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request (Next.js 16 renamed Middleware to Proxy):
 * 1. Refreshes the Supabase session cookies.
 * 2. Optimistic routing: signed-out visitors of the app go to /login?next=…, and signed-in
 *    visitors of /login go to the app. Pages and Server Functions still check the session
 *    themselves (`requireUser`), because a proxy is not an authorization layer.
 */
export async function proxy(request: NextRequest) {
  // 3. A Content-Security-Policy with a fresh nonce; Next.js adds it to its own scripts.
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce, {
    supabaseUrl: getPublicEnv().NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  const session = await updateSession(request, {
    "x-nonce": nonce,
    "content-security-policy": csp,
  });
  const { pathname, search } = request.nextUrl;
  const withCsp = (res: NextResponse) => {
    res.headers.set("content-security-policy", csp);
    return res;
  };

  // Only redirect page loads. Server Functions are POSTs to the page's URL; redirecting
  // them would break their response, and they check the session on their own.
  if (request.method !== "GET" && request.method !== "HEAD") return withCsp(session.response);

  if (session.state === "signed-out" && isProtectedPath(pathname)) {
    const url = new URL(loginPathFor(`${pathname}${search}`), request.url);
    return session.carryOver(NextResponse.redirect(url));
  }

  // /login is rare, so it can afford the Auth server round trip that confirms the session.
  if (session.state === "signed-in" && pathname === LOGIN_PATH) {
    if ((await session.confirm()) === "signed-in") {
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));
      return session.carryOver(NextResponse.redirect(new URL(next, request.url)));
    }
  }

  return withCsp(session.response);
}

export const config = {
  matcher: [
    // Everything except static files, the PWA's own files (these must work signed out and
    // offline), and APIs that authenticate with a secret or token instead of cookies.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|icons/|offline|spikes/|api/internal|api/v1|api/notifications/action|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|woff2?)$).*)",
  ],
};
