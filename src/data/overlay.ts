import {
  applyOpLocally,
  type CheckIn,
  type CheckInOp,
  type CheckInPayload,
} from "@/domain/check-in-ops";
import { scheduleOn } from "@/domain/schedule";
import type { Tables } from "@/lib/supabase/database.types";

import { rowKey, type Snapshot } from "./snapshot";

export type CheckInVariables = {
  kind: "checkin";
  opId: string;
  habitId: string;
  date: string;
  op: CheckInOp;
  payload: CheckInPayload;
  source: "app" | "routine_mode";
  /** The row as shown before this operation, so Undo can restore it instantly. */
  prev: CheckIn | undefined;
};

export type UndoVariables = {
  kind: "undo";
  opId: string;
  habitId: string;
  date: string;
  restore: CheckIn | undefined;
};

export type EditableTable = "habits" | "routines" | "categories" | "pauses";

export type UpsertVariables =
  | { kind: "upsert"; table: "habits"; row: Tables<"habits"> }
  | { kind: "upsert"; table: "routines"; row: Tables<"routines"> }
  | { kind: "upsert"; table: "categories"; row: Tables<"categories"> }
  | { kind: "upsert"; table: "pauses"; row: Tables<"pauses"> };

export type PendingChange = CheckInVariables | UndoVariables | UpsertVariables;

/**
 * Replays changes that haven't been confirmed yet (in the order they were made) on top of the
 * server snapshot. Pending changes survive reloads and offline periods, so the screen always shows
 * what the user did, and a background sync can never overwrite it.
 */
export function overlay(
  snapshot: Snapshot,
  pending: readonly PendingChange[],
  now: string,
): Snapshot {
  if (pending.length === 0) return snapshot;
  const next: Snapshot = { ...snapshot };
  const userId = snapshot.profile?.id ?? "";

  for (const change of pending) {
    if (change.kind === "upsert") {
      // A pending change is newer than anything synced, whatever the device clock says.
      const row = { ...change.row, updated_at: now };
      switch (change.table) {
        case "habits":
          next.habits = replaceRow(next.habits, row as Tables<"habits">, rowKey.habits);
          break;
        case "routines":
          next.routines = replaceRow(next.routines, row as Tables<"routines">, rowKey.routines);
          break;
        case "categories":
          next.categories = replaceRow(
            next.categories,
            row as Tables<"categories">,
            rowKey.categories,
          );
          break;
        case "pauses":
          next.pauses = replaceRow(next.pauses, row as Tables<"pauses">, rowKey.pauses);
          break;
      }
      continue;
    }

    const key = `${change.habitId}|${change.date}`;
    const current = next.checkIns.find((c) => rowKey.check_ins(c) === key);
    let updated: CheckIn | undefined;
    if (change.kind === "undo") {
      updated = change.restore
        ? { ...change.restore, updated_at: now }
        : current && { ...current, deleted_at: now, completed_at: null, updated_at: now };
    } else {
      const habit = next.habits.find((h) => h.id === change.habitId);
      if (!habit) continue;
      updated = applyOpLocally({
        op: change.op,
        payload: change.payload,
        current,
        schedule: scheduleOn(habit, next.versions, change.date),
        incrementStep: habit.increment_step,
        userId,
        habitId: change.habitId,
        date: change.date,
        source: change.source,
        now,
      });
    }
    if (updated) next.checkIns = replaceRow(next.checkIns, updated, rowKey.check_ins);
  }
  return next;
}

function replaceRow<T>(rows: readonly T[], row: T, key: (r: T) => string): T[] {
  const k = key(row);
  return [...rows.filter((r) => key(r) !== k), row];
}
