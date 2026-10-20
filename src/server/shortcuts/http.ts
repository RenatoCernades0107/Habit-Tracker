import "server-only";

import { isLocale } from "@/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminClient } from "@/server/push/subscriptions";

import { shortcutsT } from "./i18n";
import { hashToken, byteaHex } from "./tokens";

export type Scope = "habits:read" | "checkins:write" | "health:write";

export type ShortcutsErrorCode =
  | "unauthorized"
  | "forbidden_scope"
  | "habit_not_found"
  | "habit_id_not_found"
  | "ambiguous_habit"
  | "nothing_to_undo"
  | "validation_error"
  | "outside_edit_window"
  | "not_allowed_for_habit"
  | "skip_limit_reached"
  | "rate_limited"
  | "internal";

const STATUS: Record<ShortcutsErrorCode, number> = {
  unauthorized: 401,
  forbidden_scope: 403,
  habit_not_found: 404,
  habit_id_not_found: 404,
  nothing_to_undo: 404,
  ambiguous_habit: 409,
  validation_error: 422,
  outside_edit_window: 422,
  not_allowed_for_habit: 422,
  skip_limit_reached: 422,
  rate_limited: 429,
  internal: 500,
};

const HEADERS = { "cache-control": "private, no-store" };

export function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}

/** docs/spec/05-api.md §1: every error carries a `speech` for Siri to say. */
export async function shortcutsError(
  code: ShortcutsErrorCode,
  locale: string,
  values: Record<string, string> = {},
  extra: Record<string, unknown> = {},
): Promise<Response> {
  const t = await shortcutsT(locale);
  const speech = t(`errors.${code}`, values);
  // "habit_id_not_found" is the same error to clients.
  const wire = code === "habit_id_not_found" ? "habit_not_found" : code;
  const headers: Record<string, string> = { ...HEADERS };
  if (code === "rate_limited") headers["retry-after"] = "60";
  return Response.json(
    { error: { code: wire, message: speech, speech }, ...extra },
    { status: STATUS[code], headers },
  );
}

/** `?lang=es|en` overrides the profile language (API §1). */
export function langOverride(request: Request): string | null {
  const lang = new URL(request.url).searchParams.get("lang");
  return lang && isLocale(lang) ? lang : null;
}

export type ShortcutsAuth = { admin: AdminClient; userId: string; tokenId: string };

const FAILURES_PER_MINUTE = 10;
const CALLS_PER_MINUTE = 60;

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Bearer token → user (docs/spec/03-architecture.md §10). 60 calls a minute per token, and at
 * most 10 failed attempts a minute per IP.
 */
export async function authenticate(
  request: Request,
  scope: Scope,
): Promise<{ ok: true; auth: ShortcutsAuth } | { ok: false; response: Response }> {
  const locale = langOverride(request) ?? "en";
  const admin = createAdminClient();
  const ip = clientIp(request);

  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer (ht_[A-Za-z0-9_-]{20,100})$/.exec(header)?.[1];
  const verified = token
    ? await admin.rpc("srv_verify_api_token", { p_hash: byteaHex(hashToken(token)) })
    : null;
  if (verified?.error) return { ok: false, response: await shortcutsError("internal", locale) };
  const row = verified?.data?.[0];

  if (!row) {
    const { data: allowed } = await admin.rpc("srv_rate_limit", {
      p_key: `authfail:${ip}`,
      p_max: FAILURES_PER_MINUTE,
      p_window: "1 minute",
    });
    return {
      ok: false,
      response: await shortcutsError(allowed === false ? "rate_limited" : "unauthorized", locale),
    };
  }
  if (!row.scopes.includes(scope)) {
    return { ok: false, response: await shortcutsError("forbidden_scope", locale) };
  }
  const { data: allowed, error } = await admin.rpc("srv_rate_limit", {
    p_key: `token:${row.token_id}`,
    p_max: CALLS_PER_MINUTE,
    p_window: "1 minute",
  });
  if (error) return { ok: false, response: await shortcutsError("internal", locale) };
  if (!allowed) return { ok: false, response: await shortcutsError("rate_limited", locale) };
  return { ok: true, auth: { admin, userId: row.user_id, tokenId: row.token_id } };
}

/** The current recipe version (shortcuts/README.md). */
export const SHORTCUT_VERSION = "1.0";

function older(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x)) return false;
    if (x !== y) return x < y;
  }
  return false;
}

/** Whether to mention a newer shortcut, once a day per token (API §2, X-Shortcut-Version). */
export async function updateHint(request: Request, auth: ShortcutsAuth): Promise<boolean> {
  const version = request.headers.get("x-shortcut-version");
  if (!version || !older(version, SHORTCUT_VERSION)) return false;
  const { data } = await auth.admin.rpc("srv_rate_limit", {
    p_key: `hint:${auth.tokenId}`,
    p_max: 1,
    p_window: "1 day",
  });
  return data === true;
}
