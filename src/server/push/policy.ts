import type { Urgency } from "web-push";

import type { PushKind } from "@/lib/push/payload";

export type DeliveryPolicy = {
  /** How long the push service keeps an undelivered message (seconds). */
  ttlSeconds: number;
  urgency: Urgency;
  /** After this long past `send_at`, the notification is no longer useful: suppress it. */
  staleAfterMs: number;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * TTL and urgency per kind (docs/spec/06-integrations.md §4.3). A reminder that arrives
 * an hour late is noise, so TTL and staleness match. Tests behave like reminders, so
 * spike S2 measures the path real reminders take.
 */
export const DELIVERY_POLICY: Record<PushKind, DeliveryPolicy> = {
  habit_reminder: { ttlSeconds: 10 * 60, urgency: "high", staleAfterMs: 10 * MINUTE },
  test: { ttlSeconds: 10 * 60, urgency: "high", staleAfterMs: 10 * MINUTE },
  routine_digest: { ttlSeconds: 30 * 60, urgency: "normal", staleAfterMs: 30 * MINUTE },
  daily_report: { ttlSeconds: 2 * 60 * 60, urgency: "normal", staleAfterMs: 2 * HOUR },
  weekly_review: { ttlSeconds: 12 * 60 * 60, urgency: "normal", staleAfterMs: 12 * HOUR },
};

export function isStale(kind: PushKind, sendAt: string, now: number): boolean {
  const due = Date.parse(sendAt);
  return Number.isFinite(due) && now - due > DELIVERY_POLICY[kind].staleAfterMs;
}
