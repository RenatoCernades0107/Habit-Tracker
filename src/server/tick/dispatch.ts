import "server-only";

import { defaultLocale } from "@/i18n/config";
import type { Database } from "@/lib/supabase/database.types";
import { buildPushPayload } from "@/server/push/payload";
import { DELIVERY_POLICY, isStale } from "@/server/push/policy";
import { sendAll, type DeviceResult, type SendJob } from "@/server/push/sender";
import {
  dbError,
  loadRecipients,
  recordDeliveryResults,
  type AdminClient,
  type Recipient,
} from "@/server/push/subscriptions";
import type { VapidDetails } from "@/server/push/vapid";

type NotificationRow = Database["public"]["Tables"]["scheduled_notifications"]["Row"];
type NotificationUpdate = Database["public"]["Tables"]["scheduled_notifications"]["Update"];

/** Response of POST /api/internal/tick (docs/spec/05-api.md §4). */
export type TickCounts = {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
  /** Retryable failures put back for a later tick. */
  retried: number;
  /** Claimed but not attempted before the time budget ran out; back in the queue as-is. */
  deferred: number;
  ms: number;
};

export type SuppressedReason = "stale" | "not_implemented" | "no_subscriptions";

export type DispatchOptions = {
  admin: AdminClient;
  vapid: VapidDetails;
  now?: () => number;
  /** Rows per srv_claim_due_notifications call. */
  batchSize?: number;
  /** No new claims after this (docs/spec/03-architecture.md §5 step 5). */
  claimBudgetMs?: number;
  /** No new pushes after this, leaving time to record results within maxDuration. */
  sendBudgetMs?: number;
  concurrency?: number;
};

/** 1 send + 2 retries (docs/spec/06-integrations.md §4.3); the claim counts attempts. */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 60 * 1000;

const MAX_ERROR_LENGTH = 500;

type Decision =
  | { type: "suppress"; reason: SuppressedReason }
  | { type: "send"; jobs: SendJob[] }
  | { type: "retry-or-fail"; error: string };

/**
 * Sends the notifications that are due (docs/spec/03-architecture.md §5 step 3): claim a
 * batch, drop the ones that no longer make sense, send the rest to every device of their
 * user, record each outcome, and repeat until nothing is due or the time budget is spent.
 * Overlapping ticks are safe: each row is claimed by exactly one of them (SKIP LOCKED).
 */
export async function dispatchDueNotifications({
  admin,
  vapid,
  now = Date.now,
  batchSize = 200,
  claimBudgetMs = 25_000,
  sendBudgetMs = 40_000,
  concurrency,
}: DispatchOptions): Promise<TickCounts> {
  const start = now();
  const counts: TickCounts = {
    claimed: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
    retried: 0,
    deferred: 0,
    ms: 0,
  };

  while (now() - start < claimBudgetMs) {
    const { data: rows, error } = await admin.rpc("srv_claim_due_notifications", {
      p_max: batchSize,
    });
    if (error) throw dbError("claim due notifications", error);
    counts.claimed += rows.length;
    if (rows.length === 0) break;

    await processBatch(rows, {
      admin,
      vapid,
      now,
      counts,
      concurrency,
      shouldStop: () => now() - start >= sendBudgetMs,
    });

    if (rows.length < batchSize) break;
  }

  counts.ms = now() - start;
  return counts;
}

type BatchContext = {
  admin: AdminClient;
  vapid: VapidDetails;
  now: () => number;
  counts: TickCounts;
  concurrency?: number;
  shouldStop: () => boolean;
};

async function processBatch(rows: NotificationRow[], ctx: BatchContext): Promise<void> {
  const { admin, now, counts } = ctx;

  let recipients: Map<string, Recipient>;
  try {
    recipients = await loadRecipients(
      admin,
      rows.map((row) => row.user_id),
    );
  } catch (error) {
    // Nothing was sent: put the batch back untouched rather than waiting 5 minutes for
    // the stuck-row recovery.
    await release(admin, rows);
    counts.deferred += rows.length;
    throw error;
  }

  const decisions = await Promise.all(
    rows.map((row) => decide(row, recipients.get(row.user_id), now())),
  );

  const jobs = decisions.flatMap((decision) => (decision.type === "send" ? decision.jobs : []));
  const results = await sendAll(jobs, ctx.vapid, {
    concurrency: ctx.concurrency,
    shouldStop: ctx.shouldStop,
  });

  // Results come back in job order; hand each notification its own slice.
  const writes = new UpdateGroups();
  const toRelease: NotificationRow[] = [];
  const nowMs = now();
  const nowIso = new Date(nowMs).toISOString();
  let offset = 0;

  rows.forEach((row, index) => {
    const decision = decisions[index];
    if (!decision) return;

    if (decision.type === "suppress") {
      writes.add({ status: "suppressed", suppressed_reason: decision.reason }, row.id);
      counts.suppressed++;
      return;
    }

    let outcome: Outcome;
    if (decision.type === "retry-or-fail") {
      outcome = { type: "retryable", error: decision.error };
    } else {
      const mine = results.slice(offset, offset + decision.jobs.length);
      offset += decision.jobs.length;
      outcome = summarize(mine);
    }

    switch (outcome.type) {
      case "sent":
        writes.add({ status: "sent", sent_at: nowIso }, row.id);
        counts.sent++;
        break;
      case "deferred":
        toRelease.push(row);
        counts.deferred++;
        break;
      case "retryable":
        if (row.attempts < MAX_ATTEMPTS) {
          writes.add(
            {
              status: "pending",
              claimed_at: null,
              send_at: new Date(nowMs + RETRY_DELAY_MS).toISOString(),
              last_error: outcome.error,
            },
            row.id,
          );
          counts.retried++;
        } else {
          writes.add({ status: "failed", last_error: outcome.error }, row.id);
          counts.failed++;
        }
        break;
      case "failed":
        writes.add({ status: "failed", last_error: outcome.error }, row.id);
        counts.failed++;
        break;
    }
  });

  await Promise.all([
    writes.flush(admin),
    release(admin, toRelease),
    recordDeliveryResults(admin, results, nowIso).catch((error: unknown) => {
      console.error("[tick] subscription bookkeeping failed:", errorCode(error));
    }),
  ]);
}

/** Whether to send a notification, and to which devices. */
async function decide(
  row: NotificationRow,
  recipient: Recipient | undefined,
  nowMs: number,
): Promise<Decision> {
  if (isStale(row.kind, row.send_at, nowMs)) return { type: "suppress", reason: "stale" };

  let payload: string | null;
  try {
    const built = await buildPushPayload(
      { id: row.id, kind: row.kind, sendAt: row.send_at },
      {
        locale: recipient?.locale ?? defaultLocale,
        timeZone: recipient?.timeZone ?? "UTC",
        now: new Date(nowMs),
      },
    );
    payload = built ? JSON.stringify(built) : null;
  } catch (error) {
    console.error("[tick] payload failed for notification", row.id, errorCode(error));
    return { type: "retry-or-fail", error: "could not build the payload" };
  }

  // Phase 3 builds reminders, digests, reports and reviews (and their suppression rules).
  if (payload === null) return { type: "suppress", reason: "not_implemented" };
  if (!recipient || recipient.devices.length === 0) {
    return { type: "suppress", reason: "no_subscriptions" };
  }

  const policy = DELIVERY_POLICY[row.kind];
  return {
    type: "send",
    jobs: recipient.devices.map((subscription) => ({ subscription, payload, policy })),
  };
}

type Outcome =
  | { type: "sent" }
  | { type: "deferred" }
  | { type: "retryable"; error: string }
  | { type: "failed"; error: string };

/**
 * One notification's result from its devices: sent if any device got it; otherwise
 * retried if any failure might be temporary; otherwise failed.
 */
export function summarize(results: readonly DeviceResult[]): Outcome {
  if (results.some((r) => r.outcome.status === "delivered")) return { type: "sent" };

  const errors = [
    ...new Set(results.flatMap((r) => ("error" in r.outcome ? [r.outcome.error] : []))),
  ];
  const error = errors.join("; ").slice(0, MAX_ERROR_LENGTH);

  if (results.some((r) => r.outcome.status === "retryable")) return { type: "retryable", error };
  if (results.some((r) => r.outcome.status === "skipped")) return { type: "deferred" };
  return { type: "failed", error: error || "no device accepted the notification" };
}

/** Groups rows that get the same update, so a batch takes a handful of queries. */
class UpdateGroups {
  private groups = new Map<string, { values: NotificationUpdate; ids: number[] }>();

  add(values: NotificationUpdate, id: number) {
    const key = JSON.stringify(values);
    const group = this.groups.get(key);
    if (group) group.ids.push(id);
    else this.groups.set(key, { values, ids: [id] });
  }

  async flush(admin: AdminClient): Promise<void> {
    await Promise.all(
      [...this.groups.values()].map(async ({ values, ids }) => {
        // Only rows still claimed by a tick: never overwrite a row that changed meanwhile.
        const { error } = await admin
          .from("scheduled_notifications")
          .update(values)
          .in("id", ids)
          .eq("status", "sending");
        // The rows stay in "sending" and the claim recovery picks them up in 5 minutes.
        if (error) console.error("[tick] could not record outcomes:", error.code || "unknown");
      }),
    );
  }
}

/** Back to the queue as if never claimed: the attempt the claim counted is undone. */
async function release(admin: AdminClient, rows: readonly NotificationRow[]): Promise<void> {
  const groups = new UpdateGroups();
  for (const row of rows) {
    groups.add(
      { status: "pending", claimed_at: null, attempts: Math.max(0, row.attempts - 1) },
      row.id,
    );
  }
  await groups.flush(admin);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.name : typeof error;
}
