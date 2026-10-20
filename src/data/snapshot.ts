import type { Tables } from "@/lib/supabase/database.types";

/** Everything the app keeps on the device for one user (docs/spec/03-architecture.md §3). */
export type Snapshot = {
  profile: Tables<"profiles"> | null;
  routines: Tables<"routines">[];
  categories: Tables<"categories">[];
  habits: Tables<"habits">[];
  versions: Tables<"habit_versions">[];
  pauses: Tables<"pauses">[];
  checkIns: Tables<"check_ins">[];
  dailyEntries: Tables<"daily_entries">[];
  weeklyReviews: Tables<"weekly_reviews">[];
  /** Highest `updated_at` seen per table: the next sync asks only for newer rows. */
  cursors: Partial<Record<SyncedTable, string>>;
};

export type SyncedTable =
  | "routines"
  | "categories"
  | "habits"
  | "habit_versions"
  | "pauses"
  | "check_ins"
  | "daily_entries"
  | "weekly_reviews";

export const EMPTY_SNAPSHOT: Snapshot = {
  profile: null,
  routines: [],
  categories: [],
  habits: [],
  versions: [],
  pauses: [],
  checkIns: [],
  dailyEntries: [],
  weeklyReviews: [],
  cursors: {},
};

export const rowKey = {
  routines: (r: { id: string }) => r.id,
  categories: (r: { id: string }) => r.id,
  habits: (r: { id: string }) => r.id,
  pauses: (r: { id: string }) => r.id,
  habit_versions: (r: { habit_id: string; valid_from: string }) => `${r.habit_id}|${r.valid_from}`,
  // By habit and day: an optimistic row and the server's row share this key.
  check_ins: (r: { habit_id: string; local_date: string }) => `${r.habit_id}|${r.local_date}`,
  daily_entries: (r: { local_date: string }) => r.local_date,
  weekly_reviews: (r: { week_start: string }) => r.week_start,
} as const;

/**
 * Merges `incoming` rows into `existing` by key. A row replaces the existing one unless the
 * existing one is newer (a late delta must not undo a Realtime update).
 */
export function mergeRows<T extends { updated_at: string }>(
  existing: readonly T[],
  incoming: readonly T[],
  key: (row: T) => string,
): T[] {
  if (incoming.length === 0) return existing as T[];
  const map = new Map(existing.map((r) => [key(r), r]));
  for (const row of incoming) {
    const k = key(row);
    const old = map.get(k);
    if (!old || old.updated_at <= row.updated_at) map.set(k, row);
  }
  return [...map.values()];
}

export function removeRows<T>(
  rows: readonly T[],
  key: (row: T) => string,
  keys: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => !keys.has(key(r)));
}

/** The newest `updated_at` among `rows`, or the previous cursor. */
export function nextCursor(
  previous: string | undefined,
  rows: readonly { updated_at: string }[],
): string | undefined {
  let max = previous;
  for (const r of rows) if (!max || r.updated_at > max) max = r.updated_at;
  return max;
}

/**
 * Rows can commit after rows with a later `updated_at`; asking again from a little before the
 * cursor catches them. Merging is idempotent, so the overlap costs nothing but a few rows.
 */
export function cursorWithOverlap(
  cursor: string | undefined,
  overlapMs = 120_000,
): string | undefined {
  if (!cursor) return undefined;
  return new Date(Date.parse(cursor) - overlapMs).toISOString();
}
