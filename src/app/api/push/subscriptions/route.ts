import type { NextRequest } from "next/server";

import { getUser } from "@/lib/auth/session";
import { subscriptionBodySchema, unsubscribeBodySchema } from "@/lib/push/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, json, noContent, parseJsonBody, unauthorized } from "@/server/push/http";
import { upsertSubscription } from "@/server/push/subscriptions";

/**
 * POST: stores this device's push subscription for the signed-in user (FR-NTF-1,
 * docs/spec/05-api.md §3). Upsert by endpoint, so calling it again on every app start is
 * safe (docs/spec/06-integrations.md §4.2 step 3). Only real push services are accepted:
 * the tick POSTs to whatever is stored here.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();

  const body = await parseJsonBody(request, subscriptionBodySchema);
  if (!body.ok) return body.response;

  try {
    // Users can't write push_subscriptions under RLS; the session was checked above.
    const { id } = await upsertSubscription(createAdminClient(), user.id, body.data);
    return json({ id }, 201);
  } catch (error) {
    console.error("[push] saving subscription failed:", describe(error));
    return apiError(500, "internal", "Could not save the subscription");
  }
}

/** DELETE: forgets this device ("Turn off on this device"). Only the user's own row. */
export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();

  const body = await parseJsonBody(request, unsubscribeBodySchema);
  if (!body.ok) return body.response;

  // The user's own client: RLS allows deleting only their rows, and the filter says so too.
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", body.data.endpoint);
  if (error) {
    console.error("[push] deleting subscription failed:", error.code || "unknown");
    return apiError(500, "internal", "Could not delete the subscription");
  }
  return noContent();
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
    return `${error.name}${code}`;
  }
  return typeof error;
}
