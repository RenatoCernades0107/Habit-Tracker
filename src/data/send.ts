import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/supabase/database.types";

import type { PendingChange } from "./overlay";

export type ChangeResult =
  | { table: "check_ins"; row: Tables<"check_ins"> }
  | { table: "habits"; row: Tables<"habits"> }
  | { table: "routines"; row: Tables<"routines"> }
  | { table: "categories"; row: Tables<"categories"> }
  | { table: "pauses"; row: Tables<"pauses"> };

/** Sends one change to Supabase and returns the row the server stored. */
export async function sendChange(
  supabase: SupabaseClient<Database>,
  change: PendingChange,
): Promise<ChangeResult> {
  switch (change.kind) {
    case "checkin": {
      const { data, error } = await supabase
        .rpc("apply_check_in_op", {
          p_op_id: change.opId,
          p_habit_id: change.habitId,
          p_local_date: change.date,
          p_op: change.op,
          p_payload: change.payload,
          p_source: change.source,
        })
        .single();
      if (error) throw error;
      return { table: "check_ins", row: data };
    }
    case "undo": {
      const { data, error } = await supabase.rpc("undo_op", { p_op_id: change.opId }).single();
      if (error) throw error;
      return { table: "check_ins", row: data };
    }
    case "upsert": {
      // updated_at and created_at are the server's; never send the device clock.
      const { updated_at: _u, created_at: _c, ...row } = change.row as Tables<"habits">;
      void _u;
      void _c;
      const { data, error } = await supabase
        .from(change.table)
        .upsert(row as never)
        .select()
        .single();
      if (error) throw error;
      return { table: change.table, row: data } as ChangeResult;
    }
  }
}

/** Postgres error code of a rejected change, or the RPC's message (e.g. skip_limit_reached). */
export function changeErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; code?: unknown };
    if (typeof e.message === "string" && /^[a-z_]+$/.test(e.message)) return e.message;
    if (typeof e.code === "string") return e.code;
  }
  return "unknown";
}

/** Network failures are retried; anything the server answered is final. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /fetch|network|Failed to fetch|Load failed/i.test(message);
}
