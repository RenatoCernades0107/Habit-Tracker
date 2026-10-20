import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { apiError, noContent, unauthorized } from "@/server/push/http";

/** DELETE /api/tokens/:id: revokes a token (sets revoked_at). RLS limits it to the user's own. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(422, "validation_error", "Bad id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) return apiError(500, "internal", "Could not revoke the token");
  return noContent();
}
