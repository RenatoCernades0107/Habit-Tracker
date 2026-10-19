export type Platform = "ios" | "android" | "desktop";

/**
 * Detects the platform from the user agent (FR-PWA-1: the install guide differs per platform).
 * iPadOS reports a Mac user agent by default, so a "Macintosh" with a touch screen is iOS.
 * Every browser on iOS (Chrome, Firefox, Edge) uses WebKit and installs the same way.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

const STANDALONE_QUERY = "(display-mode: standalone)";

/** True when running as an installed app (Home Screen on iOS, installed PWA elsewhere). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.(STANDALONE_QUERY).matches === true || nav.standalone === true;
}

/** Calls `onChange` when the display mode changes (e.g. the browser hands over to the app). */
export function subscribeToDisplayMode(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

export type IosVersion = { major: number; minor: number };

/**
 * iOS version from the user agent: "iPhone OS 17_4" on iPhone, or Safari's "Version/17.4"
 * when iPadOS asks for the desktop site. Since iOS 26 the OS part is frozen at 18_6, so
 * the larger of the two wins. Null when unknown.
 */
export function parseIosVersion(userAgent: string): IosVersion | null {
  const candidates: IosVersion[] = [];
  const os = /\bOS (\d+)[_.](\d+)/.exec(userAgent);
  if (os && /iPhone|iPad|iPod/i.test(userAgent)) {
    candidates.push({ major: Number(os[1]), minor: Number(os[2]) });
  }
  const safari = /\bVersion\/(\d+)(?:\.(\d+))?.*Safari/.exec(userAgent);
  if (safari) candidates.push({ major: Number(safari[1]), minor: Number(safari[2] ?? 0) });

  return candidates.reduce<IosVersion | null>(
    (best, v) =>
      !best || v.major > best.major || (v.major === best.major && v.minor > best.minor) ? v : best,
    null,
  );
}

/** Web Push reaches installed Home Screen apps from iOS 16.4 (docs/spec/06-integrations.md §4.7). */
export function iosSupportsWebPush(version: IosVersion | null): boolean {
  if (!version) return true; // Unknown: don't block; the feature check decides.
  return version.major > 16 || (version.major === 16 && version.minor >= 4);
}
