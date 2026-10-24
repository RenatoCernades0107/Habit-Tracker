import { z } from "zod";

import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeGoogle } from "@/server/calendar/revoke";
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
  await revokeGoogle(admin, user.id, { deleteCalendar: parsed.data.delete_calendar });
  await admin.from("calendar_sync_jobs").delete().eq("user_id", user.id);
  await admin.from("calendar_series").delete().eq("user_id", user.id);
  await admin.from("calendar_connections").delete().eq("user_id", user.id);
  return noContent();
}
