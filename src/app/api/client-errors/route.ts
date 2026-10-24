import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { noContent, parseJsonBody } from "@/server/push/http";

const bodySchema = z.object({
  source: z.enum(["boundary", "window", "promise"]),
  name: z.string().max(100),
  message: z.string().max(500),
  stack: z.string().max(2000).nullable(),
  digest: z.string().max(100).nullable(),
  path: z.string().max(200),
});

/** Reports a page may send per minute and IP. */
const PER_MINUTE = 20;

/**
 * POST /api/client-errors: browser errors into the server logs (Vercel), as one JSON line each.
 * Open to signed-out pages too, so it's rate limited; it never answers with details.
 */
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return noContent();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data: allowed } = await createAdminClient().rpc("srv_rate_limit", {
    p_key: `client-errors:${ip}`,
    p_max: PER_MINUTE,
    p_window: "1 minute",
  });
  if (allowed === false) return noContent();
  const { path, ...rest } = parsed.data;
  // The path without anything that could identify a user (ids in /habits/<id> are kept short).
  const page = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").split("?")[0];
  console.error(
    JSON.stringify({
      type: "client_error",
      page,
      ...rest,
      ua: request.headers.get("user-agent")?.slice(0, 160),
    }),
  );
  return noContent();
}
