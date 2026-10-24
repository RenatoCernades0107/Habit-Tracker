import { after } from "next/server";

import { getUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleClient } from "@/server/calendar/setup";
import { underLimit } from "@/server/rate-limit";
import { processCalendarJobs } from "@/server/calendar/worker";
import { apiError, json, unauthorized } from "@/server/push/http";

/** POST /api/calendar/google/resync: queues a full rebuild and starts on it right away. */
export async function POST() {
  const user = await getUser();
  if (!user) return unauthorized();
  const admin = createAdminClient();
  // A full rebuild spends the Google quota every user shares: once every 5 minutes.
  if (!(await underLimit(admin, `resync:${user.id}`, 1, "5 minutes"))) {
    return apiError(429, "rate_limited", "Try again in a few minutes");
  }
  const { error } = await admin
    .from("calendar_sync_jobs")
    .insert({ user_id: user.id, op: "full_resync" });
  if (error) return apiError(500, "internal", "Could not queue the resync");
  const google = googleClient();
  if (google) {
    after(() =>
      processCalendarJobs(admin, google, { userId: user.id, max: 50 })
        .then(() => processCalendarJobs(admin, google, { userId: user.id, max: 50 }))
        .catch(() => undefined),
    );
  }
  return json({ queued: true }, 202);
}
