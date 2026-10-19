import { z } from "zod";

import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "./endpoint";

/** Unpadded or padded base64url, the encoding PushSubscription.toJSON() uses for keys. */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Bytes encoded by a base64url string (ignores padding). */
export function base64UrlByteLength(value: string): number {
  const unpadded = value.replace(/=+$/, "");
  return Math.floor((unpadded.length * 3) / 4);
}

const base64UrlKey = (min: number, max: number) =>
  z
    .string()
    .max(Math.ceil((max * 4) / 3) + 2)
    .regex(BASE64URL, "Must be base64url")
    .refine(
      (value) => {
        const bytes = base64UrlByteLength(value);
        return bytes >= min && bytes <= max;
      },
      `Must encode ${min === max ? min : `${min}-${max}`} bytes`,
    );

export const PLATFORMS = ["ios", "android", "desktop"] as const;

export const MAX_DEVICE_LABEL_LENGTH = 80;

/**
 * POST /api/push/subscriptions (docs/spec/05-api.md §3): what `subscription.toJSON()` gives,
 * plus where it came from. Keys follow RFC 8291: p256dh is an uncompressed P-256 point
 * (65 bytes) and auth is a 16-byte secret (web-push accepts longer ones).
 */
export const subscriptionBodySchema = z.object({
  endpoint: z
    .string()
    .max(MAX_ENDPOINT_LENGTH)
    .refine(isAllowedPushEndpoint, "Not a supported push service"),
  keys: z.object({
    p256dh: base64UrlKey(65, 65),
    auth: base64UrlKey(16, 32),
  }),
  platform: z.enum(PLATFORMS).optional(),
  device_label: z
    .string()
    .trim()
    .max(MAX_DEVICE_LABEL_LENGTH)
    .transform((label) => label || undefined)
    .optional(),
});

export type SubscriptionBody = z.infer<typeof subscriptionBodySchema>;

/** DELETE /api/push/subscriptions. Any URL: removing a row is always safe. */
export const unsubscribeBodySchema = z.object({
  endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH),
});

export type UnsubscribeBody = z.infer<typeof unsubscribeBodySchema>;

export const MAX_TEST_DELAY_SECONDS = 600;
export const DEFAULT_TEST_DELAY_SECONDS = 60;

/**
 * POST /api/push/test. "now" sends right away; "scheduled" queues a row so the whole
 * pg_cron → tick chain runs (spike S2). An empty body means "now" (spec 05 §3).
 */
export const testBodySchema = z
  .object({
    mode: z.enum(["now", "scheduled"]).default("now"),
    delaySeconds: z.number().int().min(0).max(MAX_TEST_DELAY_SECONDS).optional(),
  })
  .transform(({ mode, delaySeconds }) =>
    mode === "now"
      ? { mode, delaySeconds: 0 }
      : { mode, delaySeconds: delaySeconds ?? DEFAULT_TEST_DELAY_SECONDS },
  );

export type TestBody = z.infer<typeof testBodySchema>;
