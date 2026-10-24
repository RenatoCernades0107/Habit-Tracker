"use client";

import { useEffect } from "react";

import { TIMEZONE_COOKIE } from "./config";

/**
 * Stores the device timezone in a cookie so server-rendered dates use it.
 * The profile's timezone (R-DAY-1) is updated separately, with the user's consent.
 */
export function TimezoneCookie() {
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIMEZONE_COOKIE}=`))
      ?.split("=")[1];
    if (current && decodeURIComponent(current) === timeZone) return;
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
