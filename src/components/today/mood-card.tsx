"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSave } from "@/data/hooks";
import { useUserId } from "@/data/provider";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const MOODS = [
  { value: 1, emoji: "😞" },
  { value: 2, emoji: "🙁" },
  { value: 3, emoji: "😐" },
  { value: 4, emoji: "🙂" },
  { value: 5, emoji: "😄" },
] as const;

type Entry = Tables<"daily_entries">;

/** Optional mood (1–5) and a note for the day (FR-REV-1). */
export function MoodCard({ date, entry }: { date: string; entry: Entry | undefined }) {
  const t = useTranslations("stats.mood");
  const userId = useUserId();
  const save = useSave();
  const live = entry?.deleted_at === null ? entry : undefined;
  const [note, setNote] = useState(live?.note ?? "");

  const write = (patch: Partial<Pick<Entry, "mood" | "note">>) => {
    const now = new Date().toISOString();
    save({
      table: "daily_entries",
      row: {
        user_id: userId,
        local_date: date,
        mood: live?.mood ?? null,
        note: live?.note ?? null,
        created_at: entry?.created_at ?? now,
        updated_at: now,
        deleted_at: null,
        ...patch,
      },
    });
  };

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4" aria-labelledby="mood-title">
      <h2 id="mood-title" className="text-sm font-semibold">
        {t("title")}
      </h2>
      <div role="radiogroup" aria-labelledby="mood-title" className="flex justify-between gap-1">
        {MOODS.map((m) => {
          const selected = live?.mood === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(`labels.${m.value}`)}
              onClick={() => write({ mood: selected ? null : m.value })}
              className={cn(
                "flex size-12 cursor-pointer items-center justify-center rounded-full border-2 border-transparent text-2xl transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-primary bg-accent" : "opacity-70 hover:opacity-100",
              )}
            >
              <span aria-hidden="true">{m.emoji}</span>
            </button>
          );
        })}
      </div>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          write({ note: note.trim() || null });
          toast(t("saved"));
        }}
      >
        <label htmlFor="mood-note" className="sr-only">
          {t("note")}
        </label>
        <textarea
          id="mood-note"
          value={note}
          maxLength={1000}
          rows={2}
          placeholder={t("notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="justify-self-end"
          disabled={(note.trim() || null) === (live?.note ?? null)}
        >
          {t("save")}
        </Button>
      </form>
    </section>
  );
}
