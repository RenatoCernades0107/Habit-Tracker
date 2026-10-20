import "server-only";

import { addDays } from "@/domain/dates";
import { planNotifications } from "@/domain/notifications";
import { dbError, type AdminClient } from "@/server/push/subscriptions";

import { loadNotifyData } from "./data";

/** Users planned per tick (docs/spec/03-architecture.md §5 step 2). */
export const PLAN_BATCH = 200;

/**
 * Step 2 of the tick: for users whose plan is out of date, replace their pending notifications
 * from today on with a new plan for today and tomorrow (R-NTF-1). Returns how many were planned.
 */
export async function planDueUsers(admin: AdminClient, now: Date): Promise<number> {
  const { data: claimed, error } = await admin.rpc("srv_claim_profiles_to_plan", {
    p_max: PLAN_BATCH,
  });
  if (error) throw dbError("claim profiles to plan", error);
  if (!claimed || claimed.length === 0) return 0;

  let users: Awaited<ReturnType<typeof loadNotifyData>>;
  try {
    users = await loadNotifyData(
      admin,
      claimed.map((c) => c.user_id),
      now,
    );
  } catch (e) {
    await markDirty(
      admin,
      claimed.map((c) => c.user_id),
    );
    throw e;
  }

  let planned = 0;
  const failed: string[] = [];
  for (const { user_id, today: dbToday } of claimed) {
    const user = users.get(user_id);
    if (!user) continue;
    const today = user.today || dbToday;
    const rows = planNotifications(user_id, user.data, today, now).map((n) => ({
      kind: n.kind,
      habit_id: n.habitId ?? "",
      routine_id: n.routineId ?? "",
      local_date: n.localDate,
      send_at: n.sendAt.toISOString(),
      dedupe_key: n.dedupeKey,
    }));
    const { error: replaceError } = await admin.rpc("srv_replace_plan", {
      p_user_id: user_id,
      p_from: today,
      p_through: addDays(today, 1),
      p_rows: rows,
    });
    if (replaceError) {
      console.error("[tick] plan failed:", replaceError.code || "unknown");
      failed.push(user_id);
      continue;
    }
    planned++;
  }
  if (failed.length) await markDirty(admin, failed);
  return planned;
}

/** Puts users back in the planning queue after a failure. */
async function markDirty(admin: AdminClient, userIds: readonly string[]) {
  const { error } = await admin.from("profiles").update({ plan_dirty: true }).in("id", userIds);
  if (error) console.error("[tick] could not re-mark plans:", error.code || "unknown");
}
