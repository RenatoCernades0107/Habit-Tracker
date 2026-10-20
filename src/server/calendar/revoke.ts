import "server-only";

import type { AdminClient } from "@/server/push/subscriptions";

import { decrypt, fromBytea } from "./crypto";
import { googleClient } from "./setup";

/**
 * Revokes Restart's Google access for a user, optionally deleting the Habits calendar first.
 * Best effort: Google being down must not keep anyone connected (FR-CAL-7, FR-ACC-5).
 */
export async function revokeGoogle(
  admin: AdminClient,
  userId: string,
  { deleteCalendar = false }: { deleteCalendar?: boolean } = {},
): Promise<void> {
  const { data: conn } = await admin
    .from("calendar_connections")
    .select("calendar_id, refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle();
  const google = googleClient();
  if (!conn || !google) return;
  try {
    const refresh = decrypt(fromBytea(conn.refresh_token_enc as unknown as string));
    if (deleteCalendar && conn.calendar_id) {
      const token = await google.accessToken(refresh);
      await google.deleteCalendar(token, conn.calendar_id);
    }
    await google.revoke(refresh);
  } catch (e) {
    console.warn("[calendar] revoke: Google call failed:", e instanceof Error ? e.message : "");
  }
}
