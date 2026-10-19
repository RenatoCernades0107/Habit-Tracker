"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Saves the language in a cookie and, when signed in, in the profile (FR-I18N-1). */
export async function setUserLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) throw new Error("Unsupported locale");

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase.from("profiles").update({ locale }).eq("id", user.id);
    if (error) throw new Error("Could not save the language");
  }
}
