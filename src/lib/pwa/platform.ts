export type Platform = "ios" | "android" | "desktop";

/**
 * Detects the platform from the user agent. iPadOS reports a Mac user agent,
 * so a "Macintosh" with a touch screen is treated as iOS.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** True when running as an installed app (Home Screen on iOS, installed PWA elsewhere). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}
