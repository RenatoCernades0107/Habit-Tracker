import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_KEYS,
  authErrorFromCallback,
  callbackErrorForProvider,
  isAuthErrorKey,
  mapAuthError,
} from "./errors";

const api = (status: number, code: string, message = "error") =>
  new AuthApiError(message, status, code);

describe("mapAuthError", () => {
  it("reports network failures", () => {
    expect(mapAuthError(new AuthRetryableFetchError("fetch failed", 0), "send")).toBe("network");
    expect(mapAuthError(new AuthRetryableFetchError("bad gateway", 502), "verify")).toBe("network");
    expect(mapAuthError(new TypeError("Failed to fetch"), "oauth")).toBe("network");
  });

  it("reports rate limits on every step", () => {
    for (const step of ["send", "verify", "oauth"] as const) {
      expect(mapAuthError(api(429, "over_email_send_rate_limit"), step)).toBe("rateLimited");
      expect(mapAuthError(api(429, "over_request_rate_limit"), step)).toBe("rateLimited");
      expect(mapAuthError(api(429, "something_new"), step)).toBe("rateLimited");
    }
  });

  it("maps a bad email when sending", () => {
    expect(mapAuthError(api(400, "validation_failed"), "send")).toBe("invalidEmail");
    expect(mapAuthError(api(400, "email_address_invalid"), "send")).toBe("invalidEmail");
  });

  it("keeps other send errors generic (no account enumeration)", () => {
    expect(mapAuthError(api(422, "signup_disabled"), "send")).toBe("generic");
    expect(mapAuthError(api(400, "user_banned"), "send")).toBe("generic");
    expect(mapAuthError(api(500, "unexpected_failure"), "send")).toBe("generic");
  });

  it("maps wrong or expired codes", () => {
    expect(mapAuthError(api(403, "otp_expired", "Token has expired or is invalid"), "verify")).toBe(
      "invalidCode",
    );
    expect(mapAuthError(api(400, "invalid_credentials"), "verify")).toBe("invalidCode");
    expect(mapAuthError(new AuthApiError("Forbidden", 403, undefined), "verify")).toBe(
      "invalidCode",
    );
    expect(mapAuthError(api(400, "validation_failed"), "verify")).toBe("codeFormat");
  });

  it("detects a disabled Google provider", () => {
    expect(
      mapAuthError(
        api(400, "validation_failed", "Unsupported provider: provider is not enabled"),
        "oauth",
      ),
    ).toBe("googleUnavailable");
    expect(mapAuthError(api(400, "provider_disabled"), "oauth")).toBe("googleUnavailable");
    expect(mapAuthError(api(500, "unexpected_failure"), "oauth")).toBe("googleFailed");
  });

  it("falls back to generic for unknown values", () => {
    expect(mapAuthError(new Error("boom"), "send")).toBe("generic");
    expect(mapAuthError("weird", "verify")).toBe("generic");
    expect(mapAuthError(undefined, "verify")).toBe("generic");
    expect(mapAuthError(new AuthSessionMissingError(), "verify")).toBe("generic");
  });
});

describe("callback errors", () => {
  it("only accepts known codes", () => {
    expect(authErrorFromCallback("access_denied")).toBe("googleCancelled");
    expect(authErrorFromCallback("oauth_failed")).toBe("googleFailed");
    expect(authErrorFromCallback("exchange_failed")).toBe("linkExpired");
    expect(authErrorFromCallback("missing_code")).toBe("linkExpired");
    expect(authErrorFromCallback("<script>")).toBeUndefined();
    expect(authErrorFromCallback("toString")).toBeUndefined();
    expect(authErrorFromCallback("__proto__")).toBeUndefined();
    expect(authErrorFromCallback(undefined)).toBeUndefined();
    expect(authErrorFromCallback(["access_denied"])).toBeUndefined();
  });

  it("maps provider errors", () => {
    expect(callbackErrorForProvider("access_denied")).toBe("access_denied");
    expect(callbackErrorForProvider("server_error")).toBe("oauth_failed");
  });

  it("every callback code maps to a real message key", () => {
    for (const code of ["access_denied", "oauth_failed", "exchange_failed", "missing_code"]) {
      expect(isAuthErrorKey(authErrorFromCallback(code))).toBe(true);
    }
    expect(AUTH_ERROR_KEYS).toContain("generic");
  });
});
