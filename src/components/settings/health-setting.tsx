"use client";

import { Trash2 } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useData } from "@/data/hooks";
import { createClient } from "@/lib/supabase/client";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Settings → Apple Health (FR-HLT-3, FR-HLT-6, docs/spec/06-integrations.md §2.4). */
export function HealthSetting() {
  const t = useTranslations("shortcuts.health");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { data, isLoading } = useData();
  if (isLoading || !data.profile) return null;
  const last = data.profile.last_health_sync_at;
  const usesHealth = data.habits.some((h) => h.deleted_at === null && h.health_metric);
  const stale = last !== null && now.getTime() - Date.parse(last) > DAY_MS;

  const remove = async () => {
    if (!window.confirm(t("deleteConfirm"))) return;
    // RLS limits the delete to the user's own rows; the filter is required by PostgREST.
    const { error } = await createClient()
      .from("health_metric_days")
      .delete()
      .eq("user_id", data.profile!.id);
    if (error) toast.error(t("failed"));
    else toast.success(t("deleted"));
  };

  return (
    <div className="grid gap-4">
      <div role="status" className="grid gap-1 text-sm">
        <p>
          {last ? t("lastSync", { when: format.relativeTime(new Date(last), now) }) : t("never")}
        </p>
        {stale && usesHealth ? (
          <p className="text-warning-foreground dark:text-warning">⚠️ {t("stale")}</p>
        ) : null}
      </div>
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">{t("guideTitle")}</h3>
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
          <li>{t("guide1")}</li>
          <li>{t("guide2")}</li>
          <li>{t("guide3")}</li>
        </ol>
      </section>
      <Button
        variant="ghost"
        className="justify-self-start text-destructive hover:text-destructive"
        onClick={() => void remove()}
      >
        <Trash2 aria-hidden="true" />
        {t("delete")}
      </Button>
    </div>
  );
}
