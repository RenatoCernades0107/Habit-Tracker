import { z } from "zod";

import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json, parseJsonBody, unauthorized } from "@/server/push/http";
import { byteaHex, generateToken } from "@/server/shortcuts/tokens";

const bodySchema = z.object({ name: z.string().trim().min(1).max(40) });

/** Live tokens a user may have. */
const MAX_TOKENS = 10;

/**
 * POST /api/tokens (docs/spec/05-api.md §3, FR-SIR-1): a new Shortcuts token. The token is in
 * this response only; the database keeps its hash.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (countError) return apiError(500, "internal", "Could not create the token");
  if ((count ?? 0) >= MAX_TOKENS) return apiError(429, "rate_limited", "Too many tokens");

  const { token, prefix, hash } = generateToken();
  const { data, error } = await admin
    .from("api_tokens")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      token_prefix: prefix,
      token_hash: byteaHex(hash),
    })
    .select("id")
    .single();
  if (error) return apiError(500, "internal", "Could not create the token");
  return json({ id: data.id, token, prefix }, 201);
}
