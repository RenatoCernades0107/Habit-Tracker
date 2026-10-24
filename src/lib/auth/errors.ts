import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Friendly, translated error messages for sign-in (messages/<locale>/auth.json → errors).
 * None of them reveal whether an account exists for an email (FR-ACC-1).
 */
export const AUTH_ERROR_KEYS = [
  "invalidEmail",
  "codeFormat",
  "invalidCode",
  "rateLimited",
  "network",
  "googleUnavailable",
  "googleFailed",
  "googleCancelled",
  "linkExpired",
  "generic",
] as const;

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[number];

export function isAuthErrorKey(value: unknown): value is AuthErrorKey {
  return typeof value === "string" && (AUTH_ERROR_KEYS as readonly string[]).includes(value);
}

/** Which step failed: sending the code, checking it, or starting Google sign-in. */
export type AuthStep = "send" | "verify" | "oauth";

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

const PROVIDER_DISABLED_CODES = new Set([
  "provider_disabled",
  "oauth_provider_not_supported",
  "email_provider_disabled",
]);

function describe(error: unknown): { code?: string; status?: number; message: string } {
  if (isAuthError(error)) {
    return { code: error.code, status: error.status, message: error.message };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "" };
}

/** Maps a Supabase Auth error (or a thrown fetch error) to a message key. */
export function mapAuthError(error: unknown, step: AuthStep): AuthErrorKey {
  // No response at all (offline, DNS, 502–504). `TypeError` is what `fetch` throws in browsers.
  if (isAuthRetryableFetchError(error) || error instanceof TypeError) return "network";

  const { code, status, message } = describe(error);

  if (status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) return "rateLimited";

  switch (step) {
    case "send":
      if (code === "email_address_invalid" || code === "validation_failed") return "invalidEmail";
      return "generic";
    case "verify":
      // GoTrue answers 403 `otp_expired` for both wrong and expired codes, also for
      // emails without an account, which keeps account existence private.
      if (code === "otp_expired" || code === "invalid_credentials" || status === 403) {
        return "invalidCode";
      }
      if (code === "validation_failed") return "codeFormat";
      return "generic";
    case "oauth":
      if (
        (code !== undefined && PROVIDER_DISABLED_CODES.has(code)) ||
        /provider is not enabled|unsupported provider/i.test(message)
      ) {
        return "googleUnavailable";
      }
      return "googleFailed";
  }
}

/**
 * Error codes that /auth/callback puts in `/login?error=…`. Only these fixed values are
 * shown; the provider's own `error_description` is never echoed back to the page.
 */
export const CALLBACK_ERROR_CODES = {
  access_denied: "googleCancelled",
  oauth_failed: "googleFailed",
  exchange_failed: "linkExpired",
  missing_code: "linkExpired",
} as const satisfies Record<string, AuthErrorKey>;

export type CallbackErrorCode = keyof typeof CALLBACK_ERROR_CODES;

/** The code to send back to /login for an OAuth `error` parameter. */
export function callbackErrorForProvider(providerError: string): CallbackErrorCode {
  return providerError === "access_denied" ? "access_denied" : "oauth_failed";
}

/** The message key for `/login?error=…`, or undefined if the value isn't one of ours. */
export function authErrorFromCallback(value: unknown): AuthErrorKey | undefined {
  if (typeof value !== "string" || !Object.hasOwn(CALLBACK_ERROR_CODES, value)) return undefined;
  return CALLBACK_ERROR_CODES[value as CallbackErrorCode];
}
