"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData, useSave } from "@/data/hooks";
import { minutesInQuietHours, minutesOf } from "@/domain/zoned";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { Field, FormSection, selectClass } from "./form-fields";
import { useGroupNames, useScheduleSummary, useWeekdayNames } from "./labels";
import { TEMPLATES, type TemplateKey } from "./templates";

type Habit = Tables<"habits">;

type Draft = {
  name: string;
  icon: string;
  category_id: string;
  kind: Habit["kind"];
  target: string;
  unit: string;
  step: string;
  schedule_type: Habit["schedule_type"];
  days_of_week: number[];
  times_per_week: string;
  routine_id: string;
  time_of_day: string;
  start_date: string;
  reminder_enabled: boolean;
  reminder_lead_min: string;
  description: string;
  cue: string;
  duration_min: string;
  aliases: string;
  health_metric: "" | NonNullable<Habit["health_metric"]>;
  health_target: string;
};

type Errors = Partial<Record<"name" | "target" | "days" | "health", string>>;

const HEALTH_METRICS = [
  "steps",
  "exercise_minutes",
  "active_energy_kcal",
  "distance_km",
  "mindful_minutes",
  "workouts",
  "sleep_hours",
] as const;

const str = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : String(v);
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

function draftFrom(habit: Habit): Draft {
  return {
    name: habit.name,
    icon: habit.icon ?? "",
    category_id: habit.category_id ?? "",
    kind: habit.kind,
    target: str(habit.target_value),
    unit: habit.unit ?? "",
    step: str(habit.increment_step),
    schedule_type: habit.schedule_type,
    days_of_week: habit.days_of_week ?? [],
    times_per_week: str(habit.times_per_week ?? 3),
    routine_id: habit.routine_id ?? "",
    time_of_day: habit.time_of_day?.slice(0, 5) ?? "",
    start_date: habit.start_date,
    reminder_enabled: habit.reminder_enabled,
    reminder_lead_min: str(habit.reminder_lead_min),
    description: habit.description ?? "",
    cue: habit.cue ?? "",
    duration_min: str(habit.duration_min),
    aliases: habit.voice_aliases.join(", "),
    health_metric: habit.health_metric ?? "",
    health_target: str(habit.health_target),
  };
}

/** Create or edit a habit (FR-HAB-1, docs/spec/07-ux.md §4.4). */
export function HabitForm({ habitId, template }: { habitId?: string; template?: TemplateKey }) {
  const t = useTranslations("habits");
  const router = useRouter();
  const names = useGroupNames();
  const day = useWeekdayNames();
  const summary = useScheduleSummary();
  const { data, today } = useData();
  const save = useSave();
  const existing = habitId
    ? data.habits.find((h) => h.id === habitId && h.deleted_at === null)
    : undefined;
  const weekStart = data.profile?.week_start ?? 1;

  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) return draftFrom(existing);
    const tpl = template ? TEMPLATES[template] : undefined;
    const routine = tpl?.routine
      ? data.routines.find((r) => r.system_key === tpl.routine && !r.deleted_at)
      : undefined;
    const category = tpl
      ? data.categories.find((c) => c.system_key === tpl.category && !c.deleted_at)
      : undefined;
    return {
      name: template ? t(`templates.${template}.name`) : "",
      icon: tpl?.icon ?? "",
      category_id: category?.id ?? "",
      kind: tpl?.kind ?? "boolean",
      target: str(tpl?.target_value),
      unit: template && tpl?.hasUnit ? t(`templates.${template as "water"}.unit`) : "",
      step: str(tpl?.increment_step ?? 1),
      schedule_type: tpl?.schedule_type ?? "daily",
      days_of_week: [1, 2, 3, 4, 5],
      times_per_week: str(tpl?.times_per_week ?? 3),
      routine_id: routine?.id ?? "",
      time_of_day: "",
      start_date: today,
      reminder_enabled: true,
      reminder_lead_min: "",
      description: "",
      cue: "",
      duration_min: str(tpl?.duration_min),
      aliases: "",
      health_metric: tpl?.health_metric ?? "",
      health_target: str(tpl?.health_target),
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [showMore, setShowMore] = useState(false);

  if (habitId && !existing) {
    return <p className="text-muted-foreground">{t("errors.notFound")}</p>;
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const routines = data.routines
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const categories = data.categories
    .filter((c) => !c.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  const orderedDays = [1, 2, 3, 4, 5, 6, 7].sort(
    (a, b) => ((a - weekStart + 7) % 7) - ((b - weekStart + 7) % 7),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = num(draft.target);
    const next: Errors = {};
    if (!draft.name.trim()) next.name = t("errors.nameRequired");
    if (draft.kind === "measurable" && !(target && target > 0))
      next.target = t("errors.targetRequired");
    if (draft.schedule_type === "days_of_week" && draft.days_of_week.length === 0)
      next.days = t("errors.daysRequired");
    const healthTarget = num(draft.health_target);
    if (draft.health_metric && !(healthTarget && healthTarget > 0))
      next.health = t("form.healthTargetRequired");
    setErrors(next);
    if (Object.keys(next).length) return;

    const now = new Date().toISOString();
    const row: Habit = {
      ...(existing ?? {
        id: crypto.randomUUID(),
        user_id: data.profile?.id ?? "",
        calendar_sync: false,
        sort_order: data.habits.length,
        archived_on: null,
        created_at: now,
        deleted_at: null,
        color: null,
      }),
      updated_at: now,
      name: draft.name.trim(),
      icon: draft.icon.trim() || null,
      category_id: draft.category_id || null,
      kind: draft.kind,
      target_value: draft.kind === "measurable" ? target : null,
      unit: draft.kind === "measurable" ? draft.unit.trim() || null : null,
      increment_step: draft.kind === "measurable" ? (num(draft.step) ?? 1) || 1 : 1,
      schedule_type: draft.schedule_type,
      days_of_week: draft.schedule_type === "days_of_week" ? draft.days_of_week : null,
      times_per_week:
        draft.schedule_type === "times_per_week" ? (num(draft.times_per_week) ?? 3) : null,
      routine_id: draft.routine_id || null,
      time_of_day: draft.time_of_day || null,
      start_date: draft.start_date || today,
      reminder_enabled: draft.reminder_enabled,
      reminder_lead_min: num(draft.reminder_lead_min),
      description: draft.description.trim() || null,
      cue: draft.cue.trim() || null,
      duration_min: num(draft.duration_min),
      voice_aliases: draft.aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 10),
      health_metric: draft.health_metric || null,
      health_target: draft.health_metric ? healthTarget : null,
    };
    save({ table: "habits", row });
    toast.success(existing ? t("form.saved") : t("form.created"));
    router.push(existing ? "/habits" : "/today");
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="rounded-lg bg-muted px-4 py-3 text-sm" aria-live="polite">
        <span className="font-medium">{t("form.summary")}: </span>
        {summary(
          {
            schedule_type: draft.schedule_type,
            days_of_week: draft.days_of_week,
            times_per_week: num(draft.times_per_week),
            time_of_day: draft.time_of_day || null,
          },
          weekStart,
        )}
        {draft.kind === "measurable" && num(draft.target)
          ? ` · ${t("schedule.target", { value: num(draft.target) ?? 0, unit: draft.unit })}`
          : null}
      </p>

      <FormSection title={t("form.what")}>
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field id="habit-icon" label={t("form.icon")} hint={t("form.iconHint")}>
            <Input
              id="habit-icon"
              value={draft.icon}
              maxLength={8}
              onChange={(e) => set("icon", e.target.value)}
              className="text-center text-xl"
            />
          </Field>
          <Field id="habit-name" label={t("form.name")} error={errors.name}>
            <Input
              id="habit-name"
              value={draft.name}
              maxLength={80}
              required
              placeholder={t("form.namePlaceholder")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "habit-name-error" : undefined}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
        </div>
        <Field id="habit-category" label={t("form.category")}>
          <select
            id="habit-category"
            className={selectClass}
            value={draft.category_id}
            onChange={(e) => set("category_id", e.target.value)}
          >
            <option value="">{t("categories.none")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}
                {names.category(c)}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title={t("form.howMuch")}>
        <div role="radiogroup" aria-label={t("form.kind")} className="grid grid-cols-2 gap-2">
          {(["boolean", "measurable"] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind}
              variant={draft.kind === kind ? "default" : "outline"}
              onClick={() => set("kind", kind)}
            >
              {t(kind === "boolean" ? "form.kindBoolean" : "form.kindMeasurable")}
            </Button>
          ))}
        </div>
        {draft.kind === "measurable" ? (
          <div className="grid grid-cols-3 gap-3">
            <Field id="habit-target" label={t("form.target")} error={errors.target}>
              <Input
                id="habit-target"
                inputMode="decimal"
                value={draft.target}
                aria-invalid={!!errors.target}
                onChange={(e) => set("target", e.target.value)}
              />
            </Field>
            <Field id="habit-unit" label={t("form.unit")}>
              <Input
                id="habit-unit"
                value={draft.unit}
                maxLength={20}
                placeholder={t("form.unitPlaceholder")}
                onChange={(e) => set("unit", e.target.value)}
              />
            </Field>
            <Field id="habit-step" label={t("form.step")}>
              <Input
                id="habit-step"
                inputMode="decimal"
                value={draft.step}
                onChange={(e) => set("step", e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </FormSection>

      <FormSection title={t("form.when")}>
        <div role="radiogroup" aria-label={t("form.schedule")} className="grid grid-cols-3 gap-2">
          {(
            [
              ["daily", "form.scheduleDaily"],
              ["days_of_week", "form.scheduleDays"],
              ["times_per_week", "form.scheduleWeekly"],
            ] as const
          ).map(([type, label]) => (
            <Button
              key={type}
              type="button"
              role="radio"
              aria-checked={draft.schedule_type === type}
              variant={draft.schedule_type === type ? "default" : "outline"}
              className="h-auto min-h-11 px-2 text-xs whitespace-normal sm:text-sm"
              onClick={() => set("schedule_type", type)}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        {draft.schedule_type === "days_of_week" ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("form.days")}</legend>
            <div className="flex flex-wrap gap-2">
              {orderedDays.map((d) => {
                const on = draft.days_of_week.includes(d);
                return (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    aria-pressed={on}
                    variant={on ? "default" : "outline"}
                    className="h-11 min-w-11"
                    onClick={() =>
                      set(
                        "days_of_week",
                        on ? draft.days_of_week.filter((x) => x !== d) : [...draft.days_of_week, d],
                      )
                    }
                  >
                    <span aria-hidden="true">{day(d)}</span>
                    <span className="sr-only">{day(d, "long")}</span>
                  </Button>
                );
              })}
            </div>
            {errors.days ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.days}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        {draft.schedule_type === "times_per_week" ? (
          <Field id="habit-times" label={t("form.timesPerWeek")}>
            <select
              id="habit-times"
              className={selectClass}
              value={draft.times_per_week}
              onChange={(e) => set("times_per_week", e.target.value)}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="habit-routine" label={t("form.routine")}>
            <select
              id="habit-routine"
              className={selectClass}
              value={draft.routine_id}
              onChange={(e) => set("routine_id", e.target.value)}
            >
              <option value="">{t("anytime")}</option>
              {routines.map((r) => (
                <option key={r.id} value={r.id}>
                  {names.routine(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="habit-time" label={t("form.time")} hint={t("form.timeHint")}>
            <Input
              id="habit-time"
              type="time"
              value={draft.time_of_day}
              onChange={(e) => set("time_of_day", e.target.value)}
            />
          </Field>
        </div>
        {!existing ? (
          <Field id="habit-start" label={t("form.startDate")}>
            <Input
              id="habit-start"
              type="date"
              value={draft.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </Field>
        ) : (
          <p className="text-xs text-muted-foreground">{t("form.changeNote")}</p>
        )}
      </FormSection>

      <FormSection title={t("form.reminder")}>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={draft.reminder_enabled}
            onChange={(e) => set("reminder_enabled", e.target.checked)}
          />
          {t("form.reminderEnabled")}
        </label>
        {draft.reminder_enabled ? (
          <Field id="habit-lead" label={t("form.reminderLead")}>
            <select
              id="habit-lead"
              className={selectClass}
              value={draft.reminder_lead_min}
              onChange={(e) => set("reminder_lead_min", e.target.value)}
            >
              <option value="">
                {t("form.reminderLeadDefault", { minutes: data.profile?.reminder_lead_min ?? 5 })}
              </option>
              {[0, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {draft.reminder_enabled &&
        draft.time_of_day &&
        minutesInQuietHours(
          minutesOf(draft.time_of_day) -
            (draft.reminder_lead_min === ""
              ? (data.profile?.reminder_lead_min ?? 5)
              : Number(draft.reminder_lead_min)),
          data.profile?.quiet_hours_start ?? null,
          data.profile?.quiet_hours_end ?? null,
        ) ? (
          <p role="status" className="text-sm text-warning-foreground dark:text-warning">
            {t("form.reminderQuiet")}
          </p>
        ) : null}
      </FormSection>

      <FormSection title={t("form.health")}>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field id="habit-health-metric" label={t("form.healthMetric")}>
            <select
              id="habit-health-metric"
              className={selectClass}
              value={draft.health_metric}
              onChange={(e) => set("health_metric", e.target.value as Draft["health_metric"])}
            >
              <option value="">{t("form.healthNone")}</option>
              {HEALTH_METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(`health.${m}`)}
                </option>
              ))}
            </select>
          </Field>
          {draft.health_metric ? (
            <Field id="habit-health-target" label={t("form.healthTarget")} error={errors.health}>
              <Input
                id="habit-health-target"
                inputMode="decimal"
                value={draft.health_target}
                aria-invalid={errors.health ? true : undefined}
                onChange={(e) => set("health_target", e.target.value)}
              />
            </Field>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("form.healthHint")}</p>
      </FormSection>

      <div className="rounded-xl border bg-card">
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="habit-more"
          onClick={() => setShowMore((v) => !v)}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between px-4 text-sm font-semibold sm:px-6"
        >
          {t("form.more")}
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 transition-transform", showMore && "rotate-180")}
          />
        </button>
        {showMore ? (
          <div id="habit-more" className="grid gap-4 border-t p-4 sm:p-6">
            <Field id="habit-description" label={t("form.description")}>
              <textarea
                id="habit-description"
                rows={2}
                maxLength={500}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />
            </Field>
            <Field id="habit-cue" label={t("form.cue")} hint={t("form.cueHint")}>
              <Input
                id="habit-cue"
                value={draft.cue}
                maxLength={120}
                placeholder={t("form.cuePlaceholder")}
                onChange={(e) => set("cue", e.target.value)}
              />
            </Field>
            <Field id="habit-duration" label={t("form.duration")}>
              <Input
                id="habit-duration"
                inputMode="numeric"
                value={draft.duration_min}
                onChange={(e) => set("duration_min", e.target.value)}
              />
            </Field>
            <Field id="habit-aliases" label={t("form.aliases")} hint={t("form.aliasesHint")}>
              <Input
                id="habit-aliases"
                value={draft.aliases}
                onChange={(e) => set("aliases", e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" size="lg">
          {existing ? t("form.save") : t("form.create")}
        </Button>
      </div>
    </form>
  );
}
