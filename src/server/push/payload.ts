import "server-only";

import { createTranslator } from "next-intl";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type { Messages } from "@/i18n/types";
import type { PushKind, PushPayloadV1 } from "@/lib/push/payload";

/** What the builder needs from a notification. Tests sent "now" have no row, only an id. */
export type PayloadSource = {
  id: number | string;
  kind: PushKind;
  /** `send_at` of a queued notification; absent for tests sent right away. */
  sendAt?: string;
};

/** Where and when the notification is read: the user's profile (FR-NTF-11). */
export type PayloadContext = { locale: string; timeZone: string; now: Date };

const translators = new Map<Locale, Promise<ReturnType<typeof translatorFor>>>();

function translatorFor(locale: Locale, messages: Messages) {
  return createTranslator({ locale, messages, namespace: "push.notifications" });
}

/** Message catalogs are loaded once per language and process, with no request context. */
function translator(locale: Locale) {
  let pending = translators.get(locale);
  if (!pending) {
    pending = loadMessages(locale).then((messages) => translatorFor(locale, messages));
    // A failed load must not be cached forever.
    pending.catch(() => translators.delete(locale));
    translators.set(locale, pending);
  }
  return pending;
}

function formatTime(date: Date, locale: Locale, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
  }
}

/**
 * The push payload for a notification, in the user's language (docs/spec/06-integrations.md
 * §4.4, §4.6). Null for kinds that are not built yet: Phase 3 adds reminders, digests, the
 * daily report and the weekly review.
 */
export async function buildPushPayload(
  source: PayloadSource,
  context: PayloadContext,
): Promise<PushPayloadV1 | null> {
  const locale = isLocale(context.locale) ? context.locale : defaultLocale;

  switch (source.kind) {
    case "test": {
      const t = await translator(locale);
      // Queued tests show when they were due and sent, so spike S2 can measure the delay.
      const body = source.sendAt
        ? t("test.scheduledBody", {
            due: formatTime(new Date(source.sendAt), locale, context.timeZone),
            sent: formatTime(context.now, locale, context.timeZone),
          })
        : t("test.body");
      return {
        v: 1,
        kind: "test",
        title: t("test.title"),
        body,
        tag: `test:${source.id}`,
        url: "/settings#notifications",
        badge: 1,
      };
    }
    case "habit_reminder":
    case "routine_digest":
    case "daily_report":
    case "weekly_review":
      return null;
  }
}
