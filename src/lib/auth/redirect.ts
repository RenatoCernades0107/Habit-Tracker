import { DEFAULT_AFTER_SIGN_IN, isAuthPath } from "./routes";

export const MAX_NEXT_PATH_LENGTH = 512;

// Placeholder origin used only to parse and normalize relative paths.
const BASE = "http://restart.invalid";

// C0 controls, DEL and C1 controls. URL parsers silently drop tabs and newlines, so
// "/\t/evil.com" would become "//evil.com".
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** A string that could make a browser leave this origin, or that can't be trusted. */
function isUnsafe(path: string): boolean {
  return (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    CONTROL_CHARS.test(path) ||
    // Full-width "/" and "\", which Unicode normalization (NFKC) turns into the real ones.
    /[／＼]/.test(path)
  );
}

/**
 * Returns `next` when it's a same-origin relative path that is safe to redirect to after
 * signing in, and `fallback` otherwise. Guards against open redirects ("//evil.com",
 * "/\\evil.com", "https://…", "javascript:…", control characters, and percent-encoded
 * versions of all of these), and never returns the sign-in flow itself (/login, /auth/*),
 * which would loop. The result is normalized ("/a/../today" → "/today").
 */
export function safeNextPath(next: unknown, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_NEXT_PATH_LENGTH) {
    return fallback;
  }

  // Check the raw value and every decoded layer, so "/%2F%2Fevil.com" or
  // "/%252F%252Fevil.com" are rejected even if something downstream decodes them.
  let layer = next;
  for (let i = 0; i < 3; i++) {
    if (isUnsafe(layer)) return fallback;
    let decoded: string;
    try {
      decoded = decodeURIComponent(layer);
    } catch {
      return fallback; // Malformed escapes: don't guess.
    }
    if (decoded === layer) break;
    layer = decoded;
  }
  if (isUnsafe(layer)) return fallback;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (isAuthPath(url.pathname)) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
