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

/**
 * Brings `previous` up to date: the profile, then only rows changed since each table's cursor.
 * Soft-deleted rows come too, so deletions reach every device (spec 03 §3).
 */
export async function syncSnapshot(
  supabase: Client,
  previous: Snapshot,
  today: string,
): Promise<Snapshot> {
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
    profile: profile.data ?? previous.profile,
    routines: mergeRows(previous.routines, routines, rowKey.routines),
    categories: mergeRows(previous.categories, categories, rowKey.categories),
    habits: mergeRows(previous.habits, habits, rowKey.habits),
    versions: mergeRows(previous.versions, versions, rowKey.habit_versions),
    pauses: mergeRows(previous.pauses, pauses, rowKey.pauses),
    checkIns: mergeRows(previous.checkIns, checkIns, rowKey.check_ins).filter(
      (row) => row.local_date >= historyStart,
    ),
    dailyEntries: mergeRows(previous.dailyEntries ?? [], dailyEntries, rowKey.daily_entries),
    weeklyReviews: mergeRows(previous.weeklyReviews ?? [], weeklyReviews, rowKey.weekly_reviews),
    cursors: {
      routines: nextCursor(c.routines, routines),
      categories: nextCursor(c.categories, categories),
      habits: nextCursor(c.habits, habits),
      habit_versions: nextCursor(c.habit_versions, versions),
      pauses: nextCursor(c.pauses, pauses),
      check_ins: nextCursor(c.check_ins, checkIns),
      daily_entries: nextCursor(c.daily_entries, dailyEntries),
      weekly_reviews: nextCursor(c.weekly_reviews, weeklyReviews),
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
