import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

// Stub. Owned by the auth area, which may refine it.

/** The signed-in user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The signed-in user; redirects to /login otherwise. */
export async function requireUser(nextPath = "/today"): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
