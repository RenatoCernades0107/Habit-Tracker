import { z } from "zod";

import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, noContent, parseJsonBody, unauthorized } from "@/server/push/http";

const bodySchema = z.object({ confirm: z.enum(["DELETE", "BORRAR"]) });

/**
 * DELETE /api/account (FR-ACC-5). Deleting the auth user removes every row through
 * `on delete cascade`, push subscriptions included. Google access is revoked here once
 * Calendar exists (Phase 6).
 */
export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] delete failed:", error.name);
    return apiError(500, "internal", "Could not delete the account");
  }
  // The session belongs to a user that no longer exists; clear its cookies.
  await (await createClient()).auth.signOut({ scope: "local" }).catch(() => undefined);
  return noContent();
}
