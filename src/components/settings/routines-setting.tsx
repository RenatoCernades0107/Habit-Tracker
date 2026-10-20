"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useGroupNames } from "@/components/habits/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData, useSave } from "@/data/hooks";
import type { Tables } from "@/lib/supabase/database.types";

/** Routines (FR-RTN-1, FR-RTN-2, FR-RTN-4): rename, change the start time, add, delete. */
export function RoutinesSetting() {
  const t = useTranslations("settings.routines");
  const names = useGroupNames();
  const { data, isLoading } = useData();
  const save = useSave();
  if (isLoading) return null;

  const routines = data.routines
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const update = (row: Tables<"routines">, patch: Partial<Tables<"routines">>) =>
    save({ table: "routines", row: { ...row, ...patch } });

  const add = () => {
    const now = new Date().toISOString();
    save({
      table: "routines",
      row: {
        id: crypto.randomUUID(),
        user_id: data.profile?.id ?? "",
        system_key: null,
        name: t("newName"),
        icon: null,
        start_time: "12:00:00",
        end_time: null,
        digest_enabled: true,
        sort_order: routines.length,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  };

  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {routines.map((r) => (
          <li key={r.id} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("name")}
              <Input
                defaultValue={names.routine(r)}
                maxLength={40}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== names.routine(r)) update(r, { name });
                }}
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t("start")}
              <Input
                type="time"
                defaultValue={r.start_time.slice(0, 5)}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== r.start_time.slice(0, 5))
                    update(r, { start_time: e.target.value });
                }}
              />
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("delete", { name: names.routine(r) })}
              onClick={() => update(r, { deleted_at: new Date().toISOString() })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
            <label className="col-span-3 flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={r.digest_enabled}
                onChange={(e) => update(r, { digest_enabled: e.target.checked })}
              />
              {t("digest")}
            </label>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="justify-self-start" onClick={add}>
        <Plus aria-hidden="true" />
        {t("add")}
      </Button>
    </div>
  );
}
