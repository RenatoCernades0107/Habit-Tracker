/**
 * The JSON body of every Web Push message (docs/spec/06-integrations.md §4.4). Built on the
 * server (src/server/push/payload.ts) and read by the service worker (public/sw.js), which
 * accepts exactly this shape. Breaking changes need a new `v` so old workers can tell.
 */
export type PushKind =
  "habit_reminder" | "routine_digest" | "daily_report" | "weekly_review" | "test";

export type PushAction = { action: string; title: string };

export type PushPayloadV1 = {
  v: 1;
  kind: PushKind;
  title: string;
  body: string;
  /** A newer notification with the same tag replaces the older one (same habit and day). */
  tag: string;
  /** Same-origin path opened on tap, e.g. "/today?habit=…". */
  url: string;
  /** App icon badge: habits still pending today (FR-NTF-9). */
  badge?: number;
  /** "Done" / "Snooze" buttons where the platform has them (FR-NTF-10); ignored on iPhone. */
  actions?: PushAction[];
  /** Signed one-time token for POST /api/notifications/action (Phase 3). */
  actionToken?: string;
};

export const PUSH_PAYLOAD_VERSION = 1;

export const PUSH_KINDS = [
  "habit_reminder",
  "routine_digest",
  "daily_report",
  "weekly_review",
  "test",
] as const satisfies readonly PushKind[];
