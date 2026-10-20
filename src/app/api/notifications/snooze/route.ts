import { z } from "zod";

import { addDays } from "@/domain/dates";
import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, json, parseJsonBody, unauthorized } from "@/server/push/http";
import { underLimit } from "@/server/rate-limit";

const bodySchema = z.object({
  habitId: z.uuid(),
  date: z.iso.date(),
  minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
});

/** Snoozes waiting at once per habit and day: enough for real use, not for spam. */
const MAX_PENDING_SNOOZES = 3;

/**
 * POST /api/notifications/snooze: "Remind me in 15 / 30 / 60 min" from the app, for iPhone,
 * where notifications have no buttons (FR-NTF-8, R-NTF-8). The new reminder goes through the
 * same suppression as any other when it's due.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { habitId, date, minutes } = parsed.data;

  // RLS: only the user's own habit is found.
  const supabase = await createClient();
  const { data: habit, error: habitError } = await supabase
    .from("habits")
    .select("id")
    .eq("id", habitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (habitError) return apiError(500, "internal", "Could not snooze");
  if (!habit) return apiError(422, "validation_error", "Unknown habit");

  const admin = createAdminClient();
  // Today's (or yesterday's, late at night) reminders only, and a few a minute.
  const { data: today } = await admin.rpc("srv_user_today", { p_user_id: user.id });
  if (typeof today === "string" && date !== today && date !== addDays(today, -1)) {
    return apiError(422, "validation_error", "Only today's habits can be snoozed");
  }
  if (!(await underLimit(admin, `snooze:${user.id}`, 10, "1 minute"))) {
    return apiError(429, "rate_limited", "Too many snoozes");
  }
  const prefix = `habit_reminder:${habitId}:${date}:snooze:app:`;
  const { count, error: countError } = await admin
    .from("scheduled_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .like("dedupe_key", `${prefix}%`);
  if (countError) return apiError(500, "internal", "Could not snooze");
  if ((count ?? 0) >= MAX_PENDING_SNOOZES) {
    return apiError(429, "rate_limited", "Too many snoozes waiting");
  }

  const now = Date.now();
  const sendAt = new Date(now + minutes * 60_000).toISOString();
  const { error } = await admin.from("scheduled_notifications").upsert(
    {
      user_id: user.id,
      kind: "habit_reminder",
      habit_id: habitId,
      local_date: date,
      send_at: sendAt,
      // One per minute: a double tap doesn't queue two.
      dedupe_key: `${prefix}${Math.floor(now / 60_000)}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) return apiError(500, "internal", "Could not snooze");
  return json({ sendAt }, 201);
}
