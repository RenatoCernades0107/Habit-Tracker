import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/domain/dates";
import type { Database } from "@/lib/supabase/database.types";

import {
  cursorWithOverlap,
  mergeRows,
  nextCursor,
  rowKey,
  type Snapshot,
  type SyncedTable,
} from "./snapshot";

type Client = SupabaseClient<Database>;

/** Check-ins older than this stay on the server (spec 03 §3: about a year of history). */
export const CHECK_IN_HISTORY_DAYS = 400;

const PAGE = 1000;

async function fetchTable<T extends SyncedTable>(
  supabase: Client,
  table: T,
  since: string | undefined,
  fromDate?: string,
): Promise<Database["public"]["Tables"][T]["Row"][]> {
  const rows: Database["public"]["Tables"][T]["Row"][] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from(table)
      .select("*")
      .order("updated_at")
      .range(offset, offset + PAGE - 1);
    if (since) query = query.gt("updated_at", since);
    if (fromDate && table === "check_ins") query = query.gte("local_date", fromDate);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as unknown as Database["public"]["Tables"][T]["Row"][]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Rows changed on the server since a snapshot's cursors. */
export type Delta = {
  profile: Snapshot["profile"];
  routines: Snapshot["routines"];
  categories: Snapshot["categories"];
  habits: Snapshot["habits"];
  versions: Snapshot["versions"];
  pauses: Snapshot["pauses"];
  checkIns: Snapshot["checkIns"];
  dailyEntries: Snapshot["dailyEntries"];
  weeklyReviews: Snapshot["weeklyReviews"];
};

/**
 * The profile, then only rows changed since each table's cursor. Soft-deleted rows come too,
 * so deletions reach every device (spec 03 §3).
 */
export async function fetchDelta(
  supabase: Client,
  previous: Snapshot,
  today: string,
): Promise<Delta> {
  const c = previous.cursors;
  const since = (t: SyncedTable) => cursorWithOverlap(c[t]);
  const historyStart = addDays(today, -CHECK_IN_HISTORY_DAYS);

  const [
    profile,
    routines,
    categories,
    habits,
    versions,
    pauses,
    checkIns,
    dailyEntries,
    weeklyReviews,
  ] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    fetchTable(supabase, "routines", since("routines")),
    fetchTable(supabase, "categories", since("categories")),
    fetchTable(supabase, "habits", since("habits")),
    fetchTable(supabase, "habit_versions", since("habit_versions")),
    fetchTable(supabase, "pauses", since("pauses")),
    fetchTable(supabase, "check_ins", since("check_ins"), c.check_ins ? undefined : historyStart),
    fetchTable(supabase, "daily_entries", since("daily_entries")),
    fetchTable(supabase, "weekly_reviews", since("weekly_reviews")),
  ]);
  if (profile.error) throw profile.error;
  return {
    profile: profile.data,
    routines,
    categories,
    habits,
    versions,
    pauses,
    checkIns,
    dailyEntries,
    weeklyReviews,
  };
}

/**
 * Merges a delta into a snapshot, row by row, keeping whichever copy is newer. Applied to the
 * cache as it is when the delta arrives, not as it was when it was asked for: a change confirmed
 * in between is newer than what the delta fetched, and stays.
 */
export function applyDelta(base: Snapshot, delta: Delta, today: string): Snapshot {
  const c = base.cursors;
  const historyStart = addDays(today, -CHECK_IN_HISTORY_DAYS);
  const profile =
    delta.profile && (!base.profile || base.profile.updated_at <= delta.profile.updated_at)
      ? delta.profile
      : base.profile;
  return {
    profile,
    routines: mergeRows(base.routines, delta.routines, rowKey.routines),
    categories: mergeRows(base.categories, delta.categories, rowKey.categories),
    habits: mergeRows(base.habits, delta.habits, rowKey.habits),
    versions: mergeRows(base.versions, delta.versions, rowKey.habit_versions),
    pauses: mergeRows(base.pauses, delta.pauses, rowKey.pauses),
    checkIns: mergeRows(base.checkIns, delta.checkIns, rowKey.check_ins).filter(
      (row) => row.local_date >= historyStart,
    ),
    dailyEntries: mergeRows(base.dailyEntries ?? [], delta.dailyEntries, rowKey.daily_entries),
    weeklyReviews: mergeRows(base.weeklyReviews ?? [], delta.weeklyReviews, rowKey.weekly_reviews),
    cursors: {
      routines: nextCursor(c.routines, delta.routines),
      categories: nextCursor(c.categories, delta.categories),
      habits: nextCursor(c.habits, delta.habits),
      habit_versions: nextCursor(c.habit_versions, delta.versions),
      pauses: nextCursor(c.pauses, delta.pauses),
      check_ins: nextCursor(c.check_ins, delta.checkIns),
      daily_entries: nextCursor(c.daily_entries, delta.dailyEntries),
      weekly_reviews: nextCursor(c.weekly_reviews, delta.weeklyReviews),
    },
  };
}

/** Merges one row pushed by Realtime into the snapshot. */
export function applyRealtimeRow(snapshot: Snapshot, table: SyncedTable, row: unknown): Snapshot {
  switch (table) {
    case "routines":
      return {
        ...snapshot,
        routines: mergeRows(
          snapshot.routines,
          [row as Snapshot["routines"][number]],
          rowKey.routines,
        ),
      };
    case "categories":
      return {
        ...snapshot,
        categories: mergeRows(
          snapshot.categories,
          [row as Snapshot["categories"][number]],
          rowKey.categories,
        ),
      };
    case "habits":
      return {
        ...snapshot,
        habits: mergeRows(snapshot.habits, [row as Snapshot["habits"][number]], rowKey.habits),
      };
    case "habit_versions":
      return {
        ...snapshot,
        versions: mergeRows(
          snapshot.versions,
          [row as Snapshot["versions"][number]],
          rowKey.habit_versions,
        ),
      };
    case "pauses":
      return {
        ...snapshot,
        pauses: mergeRows(snapshot.pauses, [row as Snapshot["pauses"][number]], rowKey.pauses),
      };
    case "daily_entries":
      return {
        ...snapshot,
        dailyEntries: mergeRows(
          snapshot.dailyEntries,
          [row as Snapshot["dailyEntries"][number]],
          rowKey.daily_entries,
        ),
      };
    case "weekly_reviews":
      return {
        ...snapshot,
        weeklyReviews: mergeRows(
          snapshot.weeklyReviews,
          [row as Snapshot["weeklyReviews"][number]],
          rowKey.weekly_reviews,
        ),
      };
    case "check_ins":
      return {
        ...snapshot,
        checkIns: mergeRows(
          snapshot.checkIns,
          [row as Snapshot["checkIns"][number]],
          rowKey.check_ins,
        ),
      };
  }
}
