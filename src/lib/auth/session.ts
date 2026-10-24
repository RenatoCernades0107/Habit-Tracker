import "server-only";

import { isAuthSessionMissingError, type User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { loggableError } from "./log";
import { safeNextPath } from "./redirect";
import { loginPathFor } from "./routes";

/**
 * The signed-in user for this request, or null. Cached per request (React `cache`).
 *
 * Uses `auth.getUser()`, which asks the Auth server, so a revoked session (e.g. after
 * "sign out of all devices", FR-ACC-6) is rejected here even while its JWT hasn't
 * expired. The proxy does the cheaper local `getClaims()` check on every request.
 * Without a session cookie this returns null without a network call.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // No session is the normal signed-out case; anything else is worth a log line.
    if (!isAuthSessionMissingError(error)) {
      console.warn("[auth] getUser failed:", loggableError(error));
    }
    return null;
  }
  return data.user;
});

/**
 * The signed-in user. Signed-out visitors are redirected to /login and come back to
 * `nextPath` (a same-origin path) afterwards.
 */
export async function requireUser(nextPath = "/today"): Promise<User> {
  const user = await getUser();
  if (!user) redirect(loginPathFor(safeNextPath(nextPath)));
  return user;
}
