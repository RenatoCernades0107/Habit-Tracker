import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth/session";
import { apiError } from "@/server/push/http";
import { GOOGLE_SCOPES } from "@/server/calendar/google";
import { createState, googleClient, redirectUri, STATE_COOKIE } from "@/server/calendar/setup";
import { getServerEnv } from "@/lib/env.server";

/** GET /api/calendar/google/connect (FR-CAL-1): to Google's consent screen. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", request.url));
  if (!googleClient()) return apiError(500, "internal", "Google Calendar is not configured");

  const { state, nonce } = createState(user.id);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: getServerEnv().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/calendar/google",
    maxAge: 600,
  });
  return res;
}
