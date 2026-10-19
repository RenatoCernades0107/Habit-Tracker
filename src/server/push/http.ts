import "server-only";

import type { z } from "zod";

/** Error codes from docs/spec/05-api.md §1 that these endpoints use. */
export type ApiErrorCode = "unauthorized" | "validation_error" | "rate_limited" | "internal";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** `{ error: { code, message } }`. Messages are for developers; the UI maps the code. */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
): Response {
  return json({ error: { code, message } }, status, headers);
}

export const unauthorized = () => apiError(401, "unauthorized", "Sign in first");

/** Request bodies here are a few hundred bytes; anything bigger is refused unread. */
export const MAX_BODY_BYTES = 8 * 1024;

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Reads a small JSON body and validates it. Requiring `application/json` also means a
 * cross-site page can't send it without a CORS preflight, which this API never allows.
 * An empty body is parsed as `{}` so schemas can supply defaults.
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<Parsed<z.output<Schema>>> {
  const contentType = request.headers.get("content-type") ?? "";
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "validation_error", "Body too large") };
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "validation_error", "Body too large") };
  }

  let value: unknown = {};
  if (text.trim() !== "") {
    if (!/^application\/json\b/i.test(contentType)) {
      return {
        ok: false,
        response: apiError(415, "validation_error", "Send JSON (application/json)"),
      };
    }
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, response: apiError(422, "validation_error", "Body is not valid JSON") };
    }
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    // Paths only: issue messages could echo the submitted values.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "body"))];
    return {
      ok: false,
      response: apiError(422, "validation_error", `Invalid fields: ${fields.join(", ")}`),
    };
  }
  return { ok: true, data: result.data };
}
