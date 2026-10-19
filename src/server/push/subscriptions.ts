import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import type { SubscriptionBody } from "@/lib/push/schemas";
import type { createAdminClient } from "@/lib/supabase/admin";

import type { DeviceResult, DeviceSubscription } from "./sender";

export type AdminClient = ReturnType<typeof createAdminClient>;

/** A database call failed. Only the Postgres/PostgREST code is kept: messages can hold data. */
export class DatabaseError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
  ) {
    super(`${operation} failed (${code})`);
    this.name = "DatabaseError";
  }
}

export function dbError(
  operation: string,
  error: Pick<PostgrestError, "code"> | null,
): DatabaseError {
  return new DatabaseError(operation, error?.code || "unknown");
}

/** Who gets a notification, and how to word it (FR-NTF-11). */
export type Recipient = { locale: Locale; timeZone: string; devices: DeviceSubscription[] };

const DEVICE_COLUMNS = "id, user_id, endpoint, p256dh, auth, failure_count";

/** `in (...)` lists go in the URL; 100 uuids keep it far below proxy limits. */
const IN_CHUNK = 100;

function chunks<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Devices and language of each user, in two batched queries per 100 users. */
export async function loadRecipients(
  admin: AdminClient,
  userIds: readonly string[],
): Promise<Map<string, Recipient>> {
  const recipients = new Map<string, Recipient>();
  const unique = [...new Set(userIds)];
  for (const id of unique)
    recipients.set(id, { locale: defaultLocale, timeZone: "UTC", devices: [] });

  for (const ids of chunks(unique)) {
    const [profiles, devices] = await Promise.all([
      admin.from("profiles").select("id, locale, timezone").in("id", ids),
      admin.from("push_subscriptions").select(DEVICE_COLUMNS).in("user_id", ids),
    ]);
    if (profiles.error) throw dbError("load profiles", profiles.error);
    if (devices.error) throw dbError("load push subscriptions", devices.error);

    for (const profile of profiles.data) {
      const recipient = recipients.get(profile.id);
      if (!recipient) continue;
      recipient.locale = isLocale(profile.locale) ? profile.locale : defaultLocale;
      recipient.timeZone = profile.timezone || "UTC";
    }
    for (const device of devices.data) recipients.get(device.user_id)?.devices.push(device);
  }
  return recipients;
}

/**
 * Bookkeeping after sending (docs/spec/06-integrations.md §4.3): delivered devices get
 * `last_success_at` and a clean `failure_count`; 404/410 devices are deleted; other
 * failures add one to `failure_count`. Returns how many subscriptions were deleted.
 */
export async function recordDeliveryResults(
  admin: AdminClient,
  results: readonly DeviceResult[],
  nowIso: string,
): Promise<{ removed: number }> {
  const delivered = new Set<string>();
  const gone = new Set<string>();
  const failures = new Map<string, number>();
  for (const { subscription, outcome } of results) {
    if (outcome.status === "delivered") delivered.add(subscription.id);
    else if (outcome.status === "gone") gone.add(subscription.id);
    else if (outcome.status === "retryable" || outcome.status === "rejected") {
      failures.set(subscription.id, subscription.failure_count + 1);
    }
  }
  // A device that succeeded for one notification is fine, whatever else happened.
  for (const id of delivered) failures.delete(id);
  for (const id of gone) {
    delivered.delete(id);
    failures.delete(id);
  }

  const byFailureCount = new Map<number, string[]>();
  for (const [id, count] of failures) {
    // smallint column; the exact number past "a lot" doesn't matter.
    const capped = Math.min(count, 32_000);
    byFailureCount.set(capped, [...(byFailureCount.get(capped) ?? []), id]);
  }

  const writes: PromiseLike<{ error: PostgrestError | null }>[] = [];
  for (const ids of chunks([...delivered])) {
    writes.push(
      admin
        .from("push_subscriptions")
        .update({ last_success_at: nowIso, failure_count: 0 })
        .in("id", ids),
    );
  }
  for (const ids of chunks([...gone])) {
    writes.push(admin.from("push_subscriptions").delete().in("id", ids));
  }
  for (const [count, allIds] of byFailureCount) {
    for (const ids of chunks(allIds)) {
      writes.push(admin.from("push_subscriptions").update({ failure_count: count }).in("id", ids));
    }
  }

  const outcomes = await Promise.all(writes);
  for (const { error } of outcomes) {
    if (error) console.error("[push] subscription bookkeeping failed:", error.code || "unknown");
  }
  return { removed: gone.size };
}

/** Devices kept per user. A reinstalled app gets a new endpoint; the oldest ones go. */
export const MAX_DEVICES_PER_USER = 10;

/**
 * Stores this device for the user (docs/spec/05-api.md §3). Endpoints are unique across
 * users, so a device that switches accounts moves to the new one. Uses the secret key:
 * users may only read and delete their subscriptions, never write them (RLS).
 */
export async function upsertSubscription(
  admin: AdminClient,
  userId: string,
  body: SubscriptionBody,
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        platform: body.platform ?? null,
        device_label: body.device_label ?? null,
        // New keys or a new owner: earlier failures say nothing about this subscription.
        failure_count: 0,
      },
      { onConflict: "endpoint" },
    )
    .select("id")
    .single();
  if (error || !data) throw dbError("upsert push subscription", error);

  await pruneSubscriptions(admin, userId, data.id);
  return { id: data.id };
}

/** Keeps the user's most recently used devices, always including `keepId`. Best effort. */
async function pruneSubscriptions(admin: AdminClient, userId: string, keepId: string) {
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, created_at, last_success_at")
    .eq("user_id", userId);
  if (error) {
    console.warn("[push] could not list subscriptions to prune:", error.code || "unknown");
    return;
  }
  if (data.length <= MAX_DEVICES_PER_USER) return;

  const lastUsed = (row: { created_at: string; last_success_at: string | null }) =>
    Math.max(Date.parse(row.created_at), Date.parse(row.last_success_at ?? "") || 0);
  const extra = data
    .filter((row) => row.id !== keepId)
    .sort((a, b) => lastUsed(b) - lastUsed(a))
    .slice(MAX_DEVICES_PER_USER - 1)
    .map((row) => row.id);
  if (extra.length === 0) return;

  const { error: deleteError } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .in("id", extra);
  if (deleteError)
    console.warn("[push] could not prune subscriptions:", deleteError.code || "unknown");
}
