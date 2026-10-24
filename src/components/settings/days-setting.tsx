"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Field, selectClass } from "@/components/habits/form-fields";
import { useData } from "@/data/hooks";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const HOURS = [0, 1, 2, 3, 4, 5, 6];

/** Day end, week start, edit window, skips per month, timezone (FR-ACC-3, R-DAY, R-SKIP). */
export function DaysSetting() {
  const t = useTranslations("settings.days");
  const tHabits = useTranslations("habits.errors");
  const queryClient = useQueryClient();
  const { data, isLoading } = useData();
  const profile = data.profile;
  if (isLoading || !profile) return null;

  const update = async (patch: TablesUpdate<"profiles">) => {
    const { error } = await createClient().from("profiles").update(patch).eq("id", profile.id);
    if (error) {
      toast.error(tHabits("generic"));
      return;
    }
    toast.success(t("saved"));
    void queryClient.invalidateQueries({ queryKey: ["snapshot"] });
  };

  let zones: string[] = [profile.timezone];
  try {
    zones = Intl.supportedValuesOf("timeZone");
    if (!zones.includes(profile.timezone)) zones = [profile.timezone, ...zones];
  } catch {
    // Older browsers: only the current zone is offered.
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="day-end" label={t("dayEnd")} hint={t("dayEndHint")}>
        <select
          id="day-end"
          className={selectClass}
          key={String(profile.day_start_hour)}
          defaultValue={profile.day_start_hour}
          onChange={(e) => void update({ day_start_hour: Number(e.target.value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </Field>
      <Field id="week-start" label={t("weekStart")}>
        <select
          id="week-start"
          className={selectClass}
          key={String(profile.week_start)}
          defaultValue={profile.week_start}
          onChange={(e) => void update({ week_start: Number(e.target.value) })}
        >
          <option value={1}>{t("monday")}</option>
          <option value={7}>{t("sunday")}</option>
        </select>
      </Field>
      <Field id="edit-window" label={t("editWindow")}>
        <select
          id="edit-window"
          className={selectClass}
          key={String(profile.retro_edit_days)}
          defaultValue={profile.retro_edit_days}
          onChange={(e) => void update({ retro_edit_days: Number(e.target.value) })}
        >
          {[0, 1, 2, 3, 7, 14, 30].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field id="skips" label={t("skips")}>
        <select
          id="skips"
          className={selectClass}
          key={String(profile.max_skips_per_month)}
          defaultValue={profile.max_skips_per_month}
          onChange={(e) => void update({ max_skips_per_month: Number(e.target.value) })}
        >
          {Array.from({ length: 11 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field id="timezone" label={t("timezone")} className="sm:col-span-2">
        <select
          id="timezone"
          className={selectClass}
          key={String(profile.timezone)}
          defaultValue={profile.timezone}
          onChange={(e) => void update({ timezone: e.target.value })}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
