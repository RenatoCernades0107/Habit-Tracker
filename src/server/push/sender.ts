import "server-only";

import { sendNotification } from "web-push";

import { isAllowedPushEndpoint } from "@/lib/push/endpoint";

import type { DeliveryPolicy } from "./policy";
import { mapWithConcurrency } from "./pool";
import type { VapidDetails } from "./vapid";

/** A row of push_subscriptions, as much as sending and bookkeeping need. */
export type DeviceSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
};

/**
 * What happened when sending to one device (docs/spec/06-integrations.md §4.3):
 * - delivered: the push service accepted it (2xx).
 * - gone: 404 / 410, the subscription no longer exists; delete it.
 * - retryable: 429, 5xx or a network error; try again in a later tick.
 * - rejected: any other 4xx, or a request we refuse to make; retrying won't help.
 * - skipped: the tick ran out of time before sending.
 * `error` is short and never contains endpoints, keys or response bodies.
 */
export type DeliveryOutcome =
  | { status: "delivered" }
  | { status: "gone"; error: string }
  | { status: "retryable"; error: string }
  | { status: "rejected"; error: string }
  | { status: "skipped" };

export type DeviceResult = { subscription: DeviceSubscription; outcome: DeliveryOutcome };

/** Socket timeout per request, so one slow push service can't stall a whole tick. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Concurrent requests to push services, across all devices and notifications. */
export const SEND_CONCURRENCY = 10;

export function classifyPushError(
  error: unknown,
): Exclude<DeliveryOutcome, { status: "delivered" | "skipped" }> {
  if (error && typeof error === "object") {
    // WebPushError: the push service answered with a non-2xx status.
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") {
      if (statusCode === 404 || statusCode === 410) {
        return { status: "gone", error: `push service ${statusCode}: subscription expired` };
      }
      if (statusCode === 429 || statusCode >= 500) {
        return { status: "retryable", error: `push service ${statusCode}` };
      }
      return { status: "rejected", error: `push service ${statusCode}` };
    }
    // Node network errors carry a code (ECONNRESET, ETIMEDOUT, ENOTFOUND…); web-push's own
    // socket timeout is a plain Error.
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{2,32}$/.test(code)) {
      return { status: "retryable", error: `network ${code}` };
    }
    if ((error as { message?: unknown }).message === "Socket timeout") {
      return { status: "retryable", error: "network timeout" };
    }
  }
  // web-push validates keys and VAPID details before sending: a bad row or bad config.
  return { status: "rejected", error: "not sent: invalid subscription keys or VAPID details" };
}

/** Sends one encrypted push. Never throws. */
export async function sendToDevice(
  subscription: DeviceSubscription,
  payload: string,
  policy: DeliveryPolicy,
  vapid: VapidDetails,
): Promise<DeliveryOutcome> {
  // Defense in depth: the API only stores allowed endpoints, but never POST anywhere else.
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    return { status: "rejected", error: "endpoint is not an allowed push service" };
  }
  try {
    await sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      {
        vapidDetails: vapid,
        TTL: policy.ttlSeconds,
        urgency: policy.urgency,
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    return { status: "delivered" };
  } catch (error) {
    const outcome = classifyPushError(error);
    if (outcome.status === "rejected") {
      // Messages from web-push's own checks are fixed text; never log the endpoint.
      const message = error instanceof Error ? error.message.slice(0, 160) : typeof error;
      console.warn(`[push] ${outcome.error} (subscription ${subscription.id}): ${message}`);
    }
    return outcome;
  }
}

export type SendJob = {
  subscription: DeviceSubscription;
  payload: string;
  policy: DeliveryPolicy;
};

/**
 * Sends every job with bounded concurrency. Jobs that haven't started when `shouldStop`
 * returns true are skipped, so the caller can stay within its time budget.
 */
export async function sendAll(
  jobs: readonly SendJob[],
  vapid: VapidDetails,
  {
    concurrency = SEND_CONCURRENCY,
    shouldStop = () => false,
  }: { concurrency?: number; shouldStop?: () => boolean } = {},
): Promise<DeviceResult[]> {
  return mapWithConcurrency(jobs, concurrency, async (job) => ({
    subscription: job.subscription,
    outcome: shouldStop()
      ? ({ status: "skipped" } as const)
      : await sendToDevice(job.subscription, job.payload, job.policy, vapid),
  }));
}
