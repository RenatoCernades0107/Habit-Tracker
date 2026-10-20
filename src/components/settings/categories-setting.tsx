"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useGroupNames } from "@/components/habits/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData, useSave } from "@/data/hooks";
import type { Tables } from "@/lib/supabase/database.types";

/** Categories (FR-HAB-3): rename, add, delete. */
export function CategoriesSetting() {
  const t = useTranslations("settings.categories");
  const names = useGroupNames();
  const { data, isLoading } = useData();
  const save = useSave();
  if (isLoading) return null;

  const categories = data.categories
    .filter((c) => !c.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  const update = (row: Tables<"categories">, patch: Partial<Tables<"categories">>) =>
    save({ table: "categories", row: { ...row, ...patch } });

  const add = () => {
    const now = new Date().toISOString();
    save({
      table: "categories",
      row: {
        id: crypto.randomUUID(),
        user_id: data.profile?.id ?? "",
        system_key: null,
        name: t("newName"),
        color: "slate",
        icon: null,
        sort_order: categories.length,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  };

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {categories.map((c) => (
          <li key={c.id} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2">
            <Input
              aria-label={`${t("name")} (emoji)`}
              defaultValue={c.icon ?? ""}
              maxLength={8}
              className="text-center"
              onBlur={(e) => {
                const icon = e.target.value.trim() || null;
                if (icon !== c.icon) update(c, { icon });
              }}
            />
            <Input
              aria-label={t("name")}
              defaultValue={names.category(c)}
              maxLength={40}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== names.category(c)) update(c, { name });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("delete", { name: names.category(c) })}
              onClick={() => update(c, { deleted_at: new Date().toISOString() })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
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
