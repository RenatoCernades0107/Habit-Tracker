import type { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env.server";
import { secretsMatch } from "@/lib/security/constant-time";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, json } from "@/server/push/http";
import { getVapidDetails, PushConfigError } from "@/server/push/vapid";
import { planDueUsers } from "@/server/notifications/planner";
import { dispatchDueNotifications } from "@/server/tick/dispatch";

// Claims stop after ~25 s and sends after ~40 s; this leaves room to record the outcomes.
export const maxDuration = 60;

/**
 * The scheduler tick (docs/spec/03-architecture.md §5, docs/spec/05-api.md §4). pg_cron's
 * srv_tick_if_due() calls it every minute when work is due, with `x-cron-secret` read from
 * Supabase Vault. It plans the users whose plan is out of date, then sends what's due.
 * Calendar jobs arrive in a later phase.
 * Other methods get 405 from Next.js. Not behind the session proxy (src/proxy.ts).
 */
export async function POST(request: NextRequest) {
  let secret: string;
  try {
    secret = getServerEnv().CRON_SECRET;
  } catch {
    console.error("[tick] server environment is incomplete (see .env.example)");
    return apiError(500, "internal", "Server misconfigured");
  }

  if (!secretsMatch(request.headers.get("x-cron-secret"), secret)) {
    return apiError(401, "unauthorized", "Missing or wrong x-cron-secret");
  }

  let vapid;
  try {
    vapid = getVapidDetails();
  } catch (error) {
    // Fail before claiming anything, so no notification is used up by a config mistake.
    console.error(
      "[tick]",
      error instanceof PushConfigError ? error.message : "VAPID config invalid",
    );
    return apiError(500, "internal", "Push is not configured");
  }

  try {
    const admin = createAdminClient();
    // A planning failure must not hold back what's already due.
    const planned = await planDueUsers(admin, new Date()).catch((error: unknown) => {
      console.error("[tick] planning failed:", error instanceof Error ? error.message : "unknown");
      return 0;
    });
    const counts = { planned, ...(await dispatchDueNotifications({ admin, vapid })) };
    if (counts.claimed > 0 || planned > 0) console.info("[tick]", JSON.stringify(counts));
    return json(counts);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("[tick] failed:", error instanceof Error ? error.name : typeof error, code);
    return apiError(500, "internal", "Tick failed");
  }
}
