/** ISO weekday the week starts on: 1 Monday, 7 Sunday (profiles.week_start). */
export type WeekStart = 1 | 7;

type WeekInfo = { firstDay?: unknown };

/**
 * `Intl.Locale#getWeekInfo()` (newer engines) or the older `weekInfo` getter. Neither is
 * in TypeScript's lib yet, and Firefox doesn't have them at all.
 */
type LocaleWithWeekInfo = { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };

export function parseWeekStart(value: unknown): WeekStart | undefined {
  if (value === 1 || value === "1") return 1;
  if (value === 7 || value === "7") return 7;
  return undefined;
}

/**
 * The first day of the week for a language tag with region ("en-US" → 7, "es-ES" → 1),
 * for new profiles (FR-ACC-2). Undefined when the browser can't tell or the locale starts
 * the week on another day (e.g. Saturday); the profile then keeps its default, Monday.
 */
export function detectWeekStart(
  languageTag: string | undefined,
  createLocale: (tag: string) => unknown = (tag) => new Intl.Locale(tag),
): WeekStart | undefined {
  if (!languageTag) return undefined;
  try {
    const locale = createLocale(languageTag) as LocaleWithWeekInfo;
    const info = typeof locale.getWeekInfo === "function" ? locale.getWeekInfo() : locale.weekInfo;
    return parseWeekStart(info?.firstDay);
  } catch {
    return undefined; // Invalid tag or an engine without week data.
  }
}
