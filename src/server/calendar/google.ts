import "server-only";

/** A Google API error, reduced to what the worker acts on (docs/spec/06-integrations.md §3.7). */
export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Google ${status} ${reason}`);
    this.name = "GoogleError";
  }
  /** The refresh token no longer works: the user must reconnect. */
  get needsReauth() {
    return this.reason === "invalid_grant" || this.status === 401;
  }
  get retryable() {
    return (
      this.status === 429 || this.status >= 500 || this.reason.toLowerCase().includes("ratelimit")
    );
  }
}

export type Fetch = typeof fetch;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = "openid email https://www.googleapis.com/auth/calendar.app.created";

export type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  colorId?: string | null;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  recurrence?: string[];
  reminders?: { useDefault: boolean; overrides?: unknown[] };
  transparency?: "transparent" | "opaque";
  extendedProperties?: { private?: Record<string, string> };
};

async function failure(res: Response): Promise<GoogleError> {
  let reason = res.statusText || "error";
  try {
    const body = (await res.json()) as {
      error?: string | { status?: string; errors?: { reason?: string }[] };
    };
    if (typeof body.error === "string") reason = body.error;
    else reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? reason;
  } catch {
    // Not JSON.
  }
  return new GoogleError(res.status, reason);
}

/** OAuth and the few Calendar calls Restart makes. `fetchImpl` is replaced in tests. */
export class GoogleClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async form(url: string, params: Record<string, string>) {
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw await failure(res);
    return res.json() as Promise<Record<string, unknown>>;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const body = await this.form(TOKEN_URL, {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    return {
      refreshToken: String(body.refresh_token ?? ""),
      accessToken: String(body.access_token ?? ""),
      email: emailFromIdToken(String(body.id_token ?? "")),
    };
  }

  async accessToken(refreshToken: string): Promise<string> {
    const body = await this.form(TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
    });
    return String(body.access_token);
  }

  async revoke(token: string): Promise<void> {
    await this.fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }

  private async call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw await failure(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  createCalendar(token: string, summary: string, timeZone: string) {
    return this.call<{ id: string }>(token, "POST", "/calendars", { summary, timeZone });
  }
  deleteCalendar(token: string, calendarId: string) {
    return this.call<void>(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}`);
  }
  insertEvent(token: string, calendarId: string, event: GoogleEvent) {
    return this.call<{ id: string }>(
      token,
      "POST",
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      event,
    );
  }
  patchEvent(token: string, calendarId: string, eventId: string, patch: GoogleEvent) {
    return this.call<{ id: string }>(
      token,
      "PATCH",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      patch,
    );
  }
  async deleteEvent(token: string, calendarId: string, eventId: string) {
    try {
      await this.call<void>(
        token,
        "DELETE",
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
    } catch (e) {
      // Already gone (deleted in Google, or 410): nothing to do.
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  }
  /** The instances of a recurring event in [timeMin, timeMax). */
  async instances(
    token: string,
    calendarId: string,
    eventId: string,
    timeMin: string,
    timeMax: string,
  ) {
    const q = new URLSearchParams({ timeMin, timeMax, maxResults: "5" });
    const body = await this.call<{ items?: { id: string; summary?: string }[] }>(
      token,
      "GET",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/instances?${q}`,
    );
    return body.items ?? [];
  }
}

/** The email claim of an ID token received straight from Google's token endpoint over TLS. */
function emailFromIdToken(idToken: string): string | null {
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString()) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}
