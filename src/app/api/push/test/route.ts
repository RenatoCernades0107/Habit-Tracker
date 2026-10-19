import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { defaultLocale } from "@/i18n/config";
import { getUser } from "@/lib/auth/session";
import { testBodySchema } from "@/lib/push/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, parseJsonBody, unauthorized } from "@/server/push/http";
import { buildPushPayload } from "@/server/push/payload";
import { DELIVERY_POLICY } from "@/server/push/policy";
import { sendAll } from "@/server/push/sender";
import {
  dbError,
  loadRecipients,
  recordDeliveryResults,
  type AdminClient,
} from "@/server/push/subscriptions";
import { getVapidDetails, PushConfigError, type VapidDetails } from "@/server/push/vapid";

// A handful of devices with a 10 s socket timeout each, sent in parallel.
export const maxDuration = 30;

/** Queued tests a user may have waiting at once. */
const MAX_PENDING_TESTS = 5;

/** Older pending tests are stale (they'd be suppressed) and don't count against the limit. */
const PENDING_WINDOW_MS = 10 * 60 * 1000;

/**
 * "Send test" (FR-NTF-1, docs/spec/05-api.md §3).
 * - `{ "mode": "now" }` (or no body): sends to every device of the user right away, with
 *   the same sender as the tick. 200 `{ sent, failed }`.
 * - `{ "mode": "scheduled", "delaySeconds": 60 }`: queues a `test` notification, so the
 *   whole pg_cron → tick → web-push chain runs (spike S2). 202 `{ id, scheduledFor }`.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();

  const body = await parseJsonBody(request, testBodySchema);
  if (!body.ok) return body.response;

  let vapid: VapidDetails;
  try {
    vapid = getVapidDetails();
  } catch (error) {
    console.error(
      "[push]",
      error instanceof PushConfigError ? error.message : "VAPID config invalid",
    );
    return apiError(500, "internal", "Push is not configured");
  }

  const admin = createAdminClient();
  try {
    return body.data.mode === "scheduled"
      ? await scheduleTest(admin, user.id, body.data.delaySeconds)
      : await sendTestNow(admin, user.id, vapid);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("[push] test failed:", error instanceof Error ? error.name : typeof error, code);
    return apiError(500, "internal", "Could not send the test");
  }
}

async function scheduleTest(admin: AdminClient, userId: string, delaySeconds: number) {
  const now = Date.now();

  const { count, error: countError } = await admin
    .from("scheduled_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "test")
    .in("status", ["pending", "sending"])
    .gte("send_at", new Date(now - PENDING_WINDOW_MS).toISOString());
  if (countError) throw dbError("count pending tests", countError);
  if ((count ?? 0) >= MAX_PENDING_TESTS) {
    return apiError(429, "rate_limited", `At most ${MAX_PENDING_TESTS} pending tests`, {
      "Retry-After": "60",
    });
  }

  // The habit day the test belongs to (R-DAY-3). Null only if the profile is missing.
  const { data: today, error: todayError } = await admin.rpc("srv_user_today", {
    p_user_id: userId,
  });
  if (todayError) throw dbError("read user today", todayError);
  const localDate =
    typeof today === "string" && today ? today : new Date(now).toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("scheduled_notifications")
    .insert({
      user_id: userId,
      kind: "test",
      local_date: localDate,
      send_at: new Date(now + delaySeconds * 1000).toISOString(),
      dedupe_key: `test:${userId}:${randomUUID()}`,
    })
    .select("id, send_at")
    .single();
  if (error || !data) throw dbError("queue test notification", error);

  return json({ id: data.id, scheduledFor: data.send_at }, 202);
}

async function sendTestNow(admin: AdminClient, userId: string, vapid: VapidDetails) {
  const recipient = (await loadRecipients(admin, [userId])).get(userId);
  const devices = recipient?.devices ?? [];
  if (devices.length === 0) return json({ sent: 0, failed: 0 });

  const now = new Date();
  const payload = await buildPushPayload(
    { id: randomUUID(), kind: "test" },
    { locale: recipient?.locale ?? defaultLocale, timeZone: recipient?.timeZone ?? "UTC", now },
  );
  if (!payload) throw new Error("Test payload missing");

  const body = JSON.stringify(payload);
  const results = await sendAll(
    devices.map((subscription) => ({ subscription, payload: body, policy: DELIVERY_POLICY.test })),
    vapid,
  );
  await recordDeliveryResults(admin, results, new Date().toISOString());

  const sent = results.filter((r) => r.outcome.status === "delivered").length;
  return json({ sent, failed: results.length - sent });
}
