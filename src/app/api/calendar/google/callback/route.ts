import { NextResponse, type NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, toBytea } from "@/server/calendar/crypto";
import { googleClient, redirectUri, STATE_COOKIE, verifyState } from "@/server/calendar/setup";

const done = (request: NextRequest, result: "connected" | "error" | "denied") => {
  const res = NextResponse.redirect(new URL(`/settings?calendar=${result}#calendar`, request.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/calendar/google" });
  return res;
};

/**
 * GET /api/calendar/google/callback (Integrations §3.4): exchanges the code, stores the encrypted
 * refresh token, creates the app's own calendar, and queues a full resync.
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", request.url));
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return done(request, "denied");
  const code = params.get("code");
  const state = params.get("state") ?? "";
  if (!code || !verifyState(state, user.id, request.cookies.get(STATE_COOKIE)?.value)) {
    return done(request, "error");
  }
  const google = googleClient();
  if (!google) return done(request, "error");

  const admin = createAdminClient();
  try {
    const { refreshToken, accessToken, email } = await google.exchangeCode(code, redirectUri());
    if (!refreshToken) return done(request, "error");
    const { data: profile } = await admin
      .from("profiles")
      .select("timezone, locale")
      .eq("id", user.id)
      .maybeSingle();

    // Reuse the app's calendar when reconnecting the same account.
    const { data: existing } = await admin
      .from("calendar_connections")
      .select("calendar_id, google_email")
      .eq("user_id", user.id)
      .maybeSingle();
    let calendarId = existing?.google_email === email ? existing?.calendar_id : null;
    if (!calendarId) {
      const created = await google.createCalendar(
        accessToken,
        profile?.locale === "es" ? "Hábitos" : "Habits",
        profile?.timezone || "UTC",
      );
      calendarId = created.id;
      // A different calendar: old series point nowhere.
      await admin.from("calendar_series").delete().eq("user_id", user.id);
    }

    const { error } = await admin.from("calendar_connections").upsert({
      user_id: user.id,
      google_email: email,
      calendar_id: calendarId,
      refresh_token_enc: toBytea(encrypt(refreshToken)),
      status: "active",
      connected_at: new Date().toISOString(),
    });
    if (error) return done(request, "error");
    await admin.from("calendar_sync_jobs").insert({ user_id: user.id, op: "full_resync" });
    return done(request, "connected");
  } catch (e) {
    console.error("[calendar] connect failed:", e instanceof Error ? e.message : "unknown");
    return done(request, "error");
  }
}
