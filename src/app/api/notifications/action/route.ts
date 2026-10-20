import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { opIdFor, verifyActionToken } from "@/server/notifications/action-token";
import { apiError, json, parseJsonBody } from "@/server/push/http";

const bodySchema = z.object({
  token: z.string().min(1).max(4096),
  action: z.enum(["done", "snooze"]),
  minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(15),
});

/**
 * POST /api/notifications/action (docs/spec/05-api.md §4): the Done and Snooze buttons of a
 * reminder (FR-NTF-8, FR-NTF-10). No session: the notification carries a signed token, and each
 * notification's buttons work once ("done" through a fixed op_id, "snooze" through a fixed
 * dedupe key). Not behind the session proxy (src/proxy.ts).
 */
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { token, action, minutes } = parsed.data;

  const now = new Date();
  const claims = verifyActionToken(token, now);
  if (!claims) return apiError(401, "unauthorized", "Invalid or expired token");

  const admin = createAdminClient();
  if (action === "done") {
    const { error } = await admin.rpc("srv_apply_check_in_op", {
      p_user_id: claims.u,
      p_op_id: opIdFor(claims),
      p_habit_id: claims.h,
      p_local_date: claims.d,
      p_op: "complete",
      p_payload: {},
      p_source: "notification",
    });
    if (error) {
      // E.g. outside_edit_window, habit_not_found: nothing to retry.
      console.warn("[notifications] done failed:", error.code || "unknown");
      return json({ ok: false }, 409);
    }
    return json({ ok: true });
  }

  // R-NTF-8: a new reminder at now + N minutes, checked like any other when it's due.
  const { error } = await admin.from("scheduled_notifications").upsert(
    {
      user_id: claims.u,
      kind: "habit_reminder",
      habit_id: claims.h,
      local_date: claims.d,
      send_at: new Date(now.getTime() + minutes * 60_000).toISOString(),
      dedupe_key: `habit_reminder:${claims.h}:${claims.d}:snooze:${claims.n}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[notifications] snooze failed:", error.code || "unknown");
    return apiError(500, "internal", "Could not snooze");
  }
  return json({ ok: true });
}
