"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useData } from "@/data/hooks";

import { HabitForm } from "./habit-form";
import { HabitManage } from "./habit-manage";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from "./templates";

/** /habits/new: templates first (FR-HAB-2), then the form. */
export function NewHabit() {
  const t = useTranslations("habits.templates");
  const params = useSearchParams();
  const { isLoading } = useData();
  const raw = params.get("template");
  const template = TEMPLATE_KEYS.find((k) => k === raw);
  const custom = raw === "custom";

  if (isLoading) return null;
  if (template || custom) return <HabitForm key={raw} template={template} />;

  return (
    <section aria-labelledby="templates-title" className="grid gap-3">
      <h2 id="templates-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        <li>
          <Link
            href="/habits/new?template=custom"
            className="flex min-h-16 items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Plus aria-hidden="true" className="size-6 text-primary" />
            <span className="grid">
              <span className="font-medium">{t("custom")}</span>
              <span className="text-sm text-muted-foreground">{t("customDescription")}</span>
            </span>
          </Link>
        </li>
        {TEMPLATE_KEYS.map((key: TemplateKey) => (
          <li key={key}>
            <Link
              href={`/habits/new?template=${key}`}
              className="flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 py-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span aria-hidden="true" className="text-2xl">
                {TEMPLATES[key].icon}
              </span>
              <span className="font-medium">{t(`${key}.name`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /habits/[id]/edit. Waits for the local data so the form starts from the saved habit. */
export function EditHabit({ habitId }: { habitId: string }) {
  const { data, isLoading } = useData();
  if (isLoading) return null;
  const habit = data.habits.find((h) => h.id === habitId && h.deleted_at === null);
  return (
    <div className="grid gap-6">
      <HabitForm key={habitId} habitId={habitId} />
      {habit ? <HabitManage habit={habit} /> : null}
    </div>
  );
}
