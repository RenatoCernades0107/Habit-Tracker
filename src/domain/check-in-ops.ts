import type { Tables } from "@/lib/supabase/database.types";

import type { Schedule } from "./schedule";

export type CheckIn = Tables<"check_ins">;
export type CheckInOp = "complete" | "increment" | "set_value" | "skip" | "clear" | "set_note";
export type CheckInPayload = {
  amount?: number;
  value?: number;
  reason?: NonNullable<CheckIn["skip_reason"]>;
  note?: string;
};

export type OpInput = {
  op: CheckInOp;
  payload: CheckInPayload;
  current: CheckIn | undefined;
  schedule: Schedule;
  incrementStep: number;
  userId: string;
  habitId: string;
  date: string;
  source: CheckIn["source"];
  now: string;
};

/**
 * The client's copy of `private.apply_check_in_op` (supabase/migrations/20261020000100_habits.sql),
 * used to show a change before the server confirms it. Validation stays on the server; this only
 * has to predict the resulting row.
 */
export function applyOpLocally(input: OpInput): CheckIn {
  const { op, payload, current, schedule, now } = input;
  const live = current && current.deleted_at === null ? current : undefined;
  let status = live?.status ?? null;
  let value = live?.value ?? null;
  let reason = live?.skip_reason ?? null;
  let note = live?.note ?? current?.note ?? null;
  let deletedAt: string | null = null;
  let source = input.source;
  let autoDismissed = current?.auto_dismissed ?? false;

  switch (op) {
    case "complete":
      value = schedule.kind === "measurable" ? schedule.target : null;
      status = "done";
      reason = null;
      break;
    case "increment":
    case "set_value": {
      const amount =
        op === "increment" ? (payload.amount ?? input.incrementStep) : (payload.value ?? 0);
      const base = op === "increment" && status !== "skipped" ? (value ?? 0) : 0;
      value = Math.max(0, base + amount);
      reason = null;
      status = value >= (schedule.target ?? Infinity) ? "done" : "partial";
      if (value === 0) deletedAt = now;
      break;
    }
    case "skip":
      status = "skipped";
      value = null;
      reason = payload.reason ?? "other";
      break;
    case "clear":
      if (!live) return current ?? emptyRow(input);
      deletedAt = now;
      autoDismissed = autoDismissed || live.source === "health";
      break;
    case "set_note":
      note = payload.note?.trim().slice(0, 500) || null;
      source = live?.source ?? source;
      break;
  }

  return {
    ...(current ?? emptyRow(input)),
    status: status ?? "done",
    value,
    skip_reason: reason,
    note,
    source,
    auto_dismissed: autoDismissed,
    completed_at: status === "done" && deletedAt === null ? (current?.completed_at ?? now) : null,
    deleted_at: deletedAt,
    updated_at: now,
  };
}

function emptyRow(input: OpInput): CheckIn {
  return {
    id: `local:${input.habitId}:${input.date}`,
    user_id: input.userId,
    habit_id: input.habitId,
    local_date: input.date,
    status: "done",
    value: null,
    skip_reason: null,
    note: null,
    source: input.source,
    health_verified: false,
    auto_dismissed: false,
    completed_at: null,
    created_at: input.now,
    updated_at: input.now,
    deleted_at: input.now,
  };
}
