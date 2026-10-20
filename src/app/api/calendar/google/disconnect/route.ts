import { z } from "zod";

import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, fromBytea } from "@/server/calendar/crypto";
import { googleClient } from "@/server/calendar/setup";
import { noContent, parseJsonBody, unauthorized } from "@/server/push/http";

const bodySchema = z.object({ delete_calendar: z.boolean().default(false) });

/**
 * POST /api/calendar/google/disconnect (FR-CAL-7): stops syncing, optionally deletes the Habits
 * calendar, revokes access and forgets the connection. Best effort with Google: the link is
 * always removed here.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("calendar_connections")
    .select("calendar_id, refresh_token_enc")
    .eq("user_id", user.id)
    .maybeSingle();
  const google = googleClient();
  if (conn && google) {
    try {
      const refresh = decrypt(fromBytea(conn.refresh_token_enc as unknown as string));
      if (parsed.data.delete_calendar && conn.calendar_id) {
        const token = await google.accessToken(refresh);
        await google.deleteCalendar(token, conn.calendar_id);
      }
      await google.revoke(refresh);
    } catch (e) {
      console.warn(
        "[calendar] disconnect: Google call failed:",
        e instanceof Error ? e.message : "",
      );
    }
  }
  await admin.from("calendar_sync_jobs").delete().eq("user_id", user.id);
  await admin.from("calendar_series").delete().eq("user_id", user.id);
  await admin.from("calendar_connections").delete().eq("user_id", user.id);
  return noContent();
}
