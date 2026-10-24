import "server-only";

import { createTranslator } from "next-intl";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type { Messages } from "@/i18n/types";
import type { NotificationContent } from "@/domain/notifications";
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
 * The push payload of a test notification, in the user's language (docs/spec/06-integrations.md
 * §4.4, §4.6). Null for the other kinds: they're built from what they say, with
 * `buildNotificationPayload`.
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

/** A queued reminder, digest, report or review, with what it says (src/domain/notifications). */
export type NotificationSource = {
  id: number;
  localDate: string;
  content: NotificationContent;
};

export type NotificationContext = {
  locale: string;
  /** The user's habit day now: links to other days carry `?day=`. */
  today: string;
  /** Pending habits today (FR-NTF-9). */
  badge: number;
  /** For the Done / Snooze buttons of a habit reminder (FR-NTF-10). */
  actionToken?: string;
};

const MAX_LISTED = 4;

function list(names: readonly string[], more: (count: number) => string): string {
  const shown = names.slice(0, MAX_LISTED).join(", ");
  return names.length > MAX_LISTED ? `${shown} ${more(names.length - MAX_LISTED)}` : shown;
}

/** The push payload of a planned notification, in the user's language (FR-NTF-11). */
export async function buildNotificationPayload(
  source: NotificationSource,
  context: NotificationContext,
): Promise<PushPayloadV1> {
  const locale = isLocale(context.locale) ? context.locale : defaultLocale;
  const t = await translator(locale);
  const { content, localDate } = source;
  const dayParam = localDate === context.today ? "" : `day=${localDate}`;
  const base = { v: 1 as const, badge: context.badge };

  switch (content.kind) {
    case "habit_reminder": {
      const name = content.icon ? `${content.icon} ${content.name}` : content.name;
      const streak =
        content.streak > 0
          ? t(content.weekly ? "reminder.streakWeeks" : "reminder.streakDays", {
              count: content.streak,
            })
          : null;
      const body = [content.cue, streak].filter(Boolean).join(" · ") || t("reminder.body");
      const query = [`habit=${content.habitId}`, dayParam].filter(Boolean).join("&");
      return {
        ...base,
        kind: "habit_reminder",
        title:
          content.leadMinutes > 0
            ? t("reminder.title", { name, minutes: content.leadMinutes })
            : t("reminder.titleNow", { name }),
        body,
        tag: `habit:${content.habitId}:${localDate}`,
        url: `/today?${query}`,
        ...(context.actionToken
          ? {
              actions: [
                { action: "done", title: t("reminder.done") },
                { action: "snooze", title: t("reminder.snooze") },
              ],
              actionToken: context.actionToken,
            }
          : {}),
      };
    }
    case "routine_digest": {
      const r = content.routine;
      const routine =
        r.name ?? (r.system_key === "evening" ? t("digest.evening") : t("digest.morning"));
      return {
        ...base,
        kind: "routine_digest",
        title: t("digest.title", {
          icon: r.icon ?? "⏰",
          routine,
          count: content.names.length,
        }).trim(),
        body: list(content.names, (count) => t("digest.more", { count })),
        tag: `routine:${content.routineId}:${localDate}`,
        url: `/routine/${content.routineId}`,
      };
    }
    case "daily_report": {
      const perfect = content.total > 0 && content.done === content.total;
      const more = (count: number) => t("digest.more", { count });
      const body = perfect
        ? t("report.perfectBody")
        : [
            content.best ? t("report.best", content.best) : null,
            content.attention.length
              ? t("report.attention", { list: list(content.attention, more) })
              : null,
            content.left.length ? t("report.left", { list: list(content.left, more) }) : null,
          ]
            .filter(Boolean)
            .join(" ") || t("report.allDone");
      return {
        ...base,
        kind: "daily_report",
        title: perfect
          ? t("report.perfectTitle")
          : content.total === 0
            ? t("report.titleFlexible")
            : t("report.title", {
                score: content.score,
                done: content.done,
                total: content.total,
              }),
        body,
        tag: `report:${localDate}`,
        url: `/today?${["mood=1", dayParam].filter(Boolean).join("&")}`,
      };
    }
    case "weekly_review": {
      const title =
        content.score === null
          ? t("review.titleEmpty")
          : content.delta === null
            ? t("review.title", { score: content.score })
            : t("review.titleDelta", { score: content.score, delta: content.delta });
      return {
        ...base,
        kind: "weekly_review",
        title,
        body: t("review.body"),
        tag: `review:${content.weekStart}`,
        url: `/review/${content.weekStart}`,
      };
    }
  }
}
