/**
 * Browser helpers for Web Push (docs/spec/06-integrations.md §4.2): turning the VAPID key
 * into bytes, waiting for the service worker, and the calls to /api/push/*.
 * Every function is safe to import on the server; they only touch browser APIs when called.
 */
import type { Platform } from "@/lib/pwa/platform";

/** Decodes base64url (padding optional) into bytes, e.g. the VAPID public key. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(trimmed) || trimmed.replace(/=+$/, "").length % 4 === 1) {
    throw new TypeError("Not a base64url string");
  }
  const base64 = trimmed.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The VAPID public key as `applicationServerKey`: an uncompressed P-256 point (65 bytes
 * starting with 0x04). Null when it's missing or malformed.
 */
export function parseVapidPublicKey(key: string | undefined): Uint8Array<ArrayBuffer> | null {
  if (!key) return null;
  try {
    const bytes = urlBase64ToUint8Array(key);
    return bytes.length === 65 && bytes[0] === 0x04 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * True when a subscription was made with this VAPID key. After a key rotation the old
 * subscription can't receive our pushes and has to be replaced.
 */
export function usesApplicationServerKey(
  subscription: Pick<PushSubscription, "options">,
  key: Uint8Array,
): boolean {
  const current = subscription.options?.applicationServerKey;
  // Some browsers don't expose the key; assume it matches rather than churn.
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

/** Web Push needs a service worker, the Push API and the Notifications API. */
export function supportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export class ServiceWorkerTimeoutError extends Error {
  constructor() {
    super("The service worker did not become ready in time");
    this.name = "ServiceWorkerTimeoutError";
  }
}

/**
 * The active service worker registration. `navigator.serviceWorker.ready` never settles
 * when no worker is registered (e.g. in development), so this gives up after `timeoutMs`.
 */
export async function waitForServiceWorker(
  timeoutMs = 10_000,
  container: Pick<ServiceWorkerContainer, "ready"> = navigator.serviceWorker,
): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      container.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ServiceWorkerTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The browser's current subscription, without waiting for a worker that may not exist. */
export async function currentSubscription(
  container: Pick<ServiceWorkerContainer, "getRegistration"> = navigator.serviceWorker,
): Promise<PushSubscription | null> {
  const registration = await container.getRegistration();
  return (await registration?.pushManager?.getSubscription()) ?? null;
}

// ---------------------------------------------------------------------------------------
// /api/push/*

/** An error response from our API ({ error: { code, message } }, docs/spec/05-api.md §1). */
export class PushApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Push API responded ${status} (${code})`);
    this.name = "PushApiError";
  }
}

export type SubscriptionMeta = { platform: Platform; deviceLabel: string };

export type TestResult =
  { mode: "now"; sent: number; failed: number } | { mode: "scheduled"; scheduledFor: string };

type Fetch = typeof fetch;

async function callApi(
  path: string,
  method: "POST" | "DELETE",
  body: unknown,
  fetchImpl: Fetch,
): Promise<unknown> {
  const response = await fetchImpl(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 204) return null;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object"
        ? (data.error as { code?: unknown }).code
        : undefined;
    throw new PushApiError(response.status, typeof code === "string" ? code : "unknown");
  }
  return data;
}

/** Stores (or refreshes) this device's subscription for the signed-in user. Idempotent. */
export async function saveSubscription(
  subscription: PushSubscription,
  meta: SubscriptionMeta,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const { endpoint, keys } = subscription.toJSON();
  await callApi(
    "/api/push/subscriptions",
    "POST",
    { endpoint, keys, platform: meta.platform, device_label: meta.deviceLabel || undefined },
    fetchImpl,
  );
}

export async function deleteSubscription(
  endpoint: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  await callApi("/api/push/subscriptions", "DELETE", { endpoint }, fetchImpl);
}

/** "now": straight to every device. "scheduled": through pg_cron and the tick (spike S2). */
export async function sendTestNotification(
  mode: "now" | "scheduled",
  { delaySeconds = 60, fetchImpl = fetch }: { delaySeconds?: number; fetchImpl?: Fetch } = {},
): Promise<TestResult> {
  const data = (await callApi(
    "/api/push/test",
    "POST",
    mode === "now" ? { mode } : { mode, delaySeconds },
    fetchImpl,
  )) as Record<string, unknown> | null;
  if (mode === "scheduled") {
    return { mode, scheduledFor: typeof data?.scheduledFor === "string" ? data.scheduledFor : "" };
  }
  return {
    mode,
    sent: typeof data?.sent === "number" ? data.sent : 0,
    failed: typeof data?.failed === "number" ? data.failed : 0,
  };
}
