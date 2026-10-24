import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const EXPORTED = [
  "routines",
  "categories",
  "habits",
  "habit_versions",
  "pauses",
  "check_ins",
  "daily_entries",
  "weekly_reviews",
] as const;

const PAGE = 1000;

async function all<T extends (typeof EXPORTED)[number]>(supabase: Client, table: T) {
  const rows: Tables<T>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as unknown as Tables<T>[]));
    if (data.length < PAGE) return rows;
  }
}

/** Everything the signed-in user owns (RLS limits each query to their rows). FR-DAT-1. */
export async function exportAll(supabase: Client) {
  const { data: profile, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) throw error;
  const entries = await Promise.all(
    EXPORTED.map(async (t) => [t, await all(supabase, t)] as const),
  );
  return { exported_at: new Date().toISOString(), profile, ...Object.fromEntries(entries) } as {
    exported_at: string;
    profile: Tables<"profiles"> | null;
  } & { [K in (typeof EXPORTED)[number]]: Tables<K>[] };
}

/** RFC 4180 field: quoted when it holds a comma, quote or line break; formulas neutralized. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Spreadsheets run cells starting with these as formulas (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Check-ins as CSV, one row per habit and day, newest first. */
export function checkInsCsv(
  habits: Pick<Tables<"habits">, "id" | "name" | "unit">[],
  checkIns: Tables<"check_ins">[],
): string {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const header = ["date", "habit", "status", "value", "unit", "skip_reason", "note", "source"];
  const rows = checkIns
    .filter((c) => c.deleted_at === null)
    .sort((a, b) => b.local_date.localeCompare(a.local_date))
    .map((c) => {
      const h = byId.get(c.habit_id);
      return [c.local_date, h?.name, c.status, c.value, h?.unit, c.skip_reason, c.note, c.source]
        .map(csvField)
        .join(",");
    });
  // BOM so spreadsheet apps read accents (es) correctly.
  return `﻿${[header.join(","), ...rows].join("\r\n")}\r\n`;
}
