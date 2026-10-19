"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { loggableError } from "./log";
import { LOGIN_PATH } from "./routes";

// Supabase session cookies: "sb-<ref>-auth-token", chunked as ".0", ".1", … when large,
// plus the PKCE "-code-verifier".
const AUTH_COOKIE = /^sb-[^.]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

/** Signs out on this device only. Other devices keep their sessions. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    // supabase-js keeps the cookies when the Auth server can't be reached. Signing out of
    // this device must always work, so drop them here; the refresh token expires on its own.
    console.warn("[auth] sign-out failed, clearing cookies:", loggableError(error));
    const cookieStore = await cookies();
    for (const { name } of cookieStore.getAll()) {
      if (AUTH_COOKIE.test(name)) cookieStore.delete(name);
    }
  }
  redirect(LOGIN_PATH);
}

/**
 * Revokes every session of this user, on all devices (FR-ACC-6). Throws if the Auth
 * server can't confirm it, so the caller can say it didn't work instead of pretending.
 */
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    console.error("[auth] global sign-out failed:", loggableError(error));
    throw new Error("Could not sign out of all devices");
  }
  redirect(LOGIN_PATH);
}
