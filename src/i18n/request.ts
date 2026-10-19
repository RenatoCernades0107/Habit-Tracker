import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import {
  isLocale,
  isValidTimeZone,
  LOCALE_COOKIE,
  negotiateLocale,
  TIMEZONE_COOKIE,
  type Locale,
} from "./config";
import { loadMessages } from "./messages";

/**
 * Language for this request: an explicit locale (e.g. a notification rendered for a user),
 * then the language cookie, then the browser's Accept-Language. There is no locale
 * prefix in app URLs (docs/spec/03-architecture.md §7).
 */
export default getRequestConfig(async ({ locale: requested }) => {
  const cookieStore = await cookies();
  const locale: Locale = isLocale(requested)
    ? requested
    : await resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  const tzCookie = cookieStore.get(TIMEZONE_COOKIE)?.value;
  const timeZone = isValidTimeZone(tzCookie) ? tzCookie : "UTC";

  return { locale, timeZone, messages: await loadMessages(locale) };
});

async function resolveLocale(cookieValue: string | undefined): Promise<Locale> {
  if (isLocale(cookieValue)) return cookieValue;
  return negotiateLocale((await headers()).get("accept-language"));
}
