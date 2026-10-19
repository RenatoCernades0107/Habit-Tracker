export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

/** Used when the browser prefers neither Spanish nor English (decision 2026-10-19). */
export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";
export const TIMEZONE_COOKIE = "RESTART_TZ";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Picks the first supported language from an `Accept-Language` header, by quality
 * and then by order. Region subtags are ignored (`es-PE` → `es`).
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [rawTag = "", ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = qParam === undefined ? 1 : Number(qParam.slice(2));
      return {
        tag: rawTag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.tag !== "" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return defaultLocale;
}

/** True if `timeZone` is an IANA name this runtime understands. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone === "" || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}
