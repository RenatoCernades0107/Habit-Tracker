"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Laptop, Smartphone, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Field, selectClass } from "@/components/habits/form-fields";
import { useWeekdayNames } from "@/components/habits/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData } from "@/data/hooks";
import { addDays } from "@/domain/dates";
import { zonedTimeToUtc } from "@/domain/zoned";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const LEADS = [0, 5, 10, 15, 30, 60];
const hhmm = (time: string | null | undefined) => time?.slice(0, 5) ?? "";

/**
 * What gets sent and when (FR-NTF-2…8): lead time, daily report, weekly review, quiet hours and
 * "Mute for today". The server plans again after a change (profiles_mark_plan_dirty).
 */
export function NotificationPrefs() {
  const t = useTranslations("settings.notifications.prefs");
  const tErrors = useTranslations("habits.errors");
  const weekday = useWeekdayNames();
  const queryClient = useQueryClient();
  const { data, today, isLoading } = useData();
  const profile = data.profile;
  if (isLoading || !profile) return null;

  const update = async (patch: TablesUpdate<"profiles">, message = t("saved")) => {
    const { error } = await createClient().from("profiles").update(patch).eq("id", profile.id);
    if (error) {
      toast.error(tErrors("generic"));
      return;
    }
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ["snapshot"] });
  };

  const dayStart = (day: string) =>
    zonedTimeToUtc(day, `${String(profile.day_start_hour).padStart(2, "0")}:00`, profile.timezone);
  // Muted while muted_until reaches past the start of the current habit day.
  const muted =
    profile.muted_until !== null && Date.parse(profile.muted_until) > dayStart(today).getTime();
  // Until the next habit day starts (R-DAY-1).
  const muteUntil = () => dayStart(addDays(today, 1)).toISOString();
  const timeInput = (id: string, value: string | null, onSave: (v: string) => void) => (
    // Keyed by the value: the cache renders first, the synced profile may follow.
    <TimeField key={value ?? ""} id={id} value={hhmm(value)} onSave={onSave} />
  );

  return (
    <div className="grid gap-5 border-t pt-5">
      <h3 className="text-sm font-semibold">{t("title")}</h3>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={muted ? "secondary" : "outline"}
          aria-pressed={muted}
          onClick={() =>
            void update(
              { muted_until: muted ? null : muteUntil() },
              muted ? t("saved") : t("muted"),
            )
          }
        >
          <BellOff aria-hidden="true" />
          {muted ? t("unmute") : t("mute")}
        </Button>
        {muted ? <p className="text-sm text-muted-foreground">{t("muted")}</p> : null}
      </div>

      <Field id="notify-lead" label={t("lead")}>
        <select
          id="notify-lead"
          className={selectClass}
          key={profile.reminder_lead_min}
          defaultValue={profile.reminder_lead_min}
          onChange={(e) => void update({ reminder_lead_min: Number(e.target.value) })}
        >
          {LEADS.map((m) => (
            <option key={m} value={m}>
              {t("leadValue", { minutes: m })}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{t("report")}</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            key={String(profile.daily_report_enabled)}
            defaultChecked={profile.daily_report_enabled}
            onChange={(e) => void update({ daily_report_enabled: e.target.checked })}
          />
          {t("reportHint")}
        </label>
        {profile.daily_report_enabled ? (
          <Field id="report-time" label={t("time")}>
            {timeInput(
              "report-time",
              profile.daily_report_time,
              (v) => void update({ daily_report_time: v }),
            )}
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{t("review")}</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            key={String(profile.weekly_review_enabled)}
            defaultChecked={profile.weekly_review_enabled}
            onChange={(e) => void update({ weekly_review_enabled: e.target.checked })}
          />
          {t("review")}
        </label>
        {profile.weekly_review_enabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="review-day" label={t("reviewDay")}>
              <select
                id="review-day"
                className={selectClass}
                key={profile.weekly_review_dow}
                defaultValue={profile.weekly_review_dow}
                onChange={(e) => void update({ weekly_review_dow: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {weekday(d, "long")}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="review-time" label={t("time")}>
              {timeInput(
                "review-time",
                profile.weekly_review_time,
                (v) => void update({ weekly_review_time: v }),
              )}
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{t("quiet")}</legend>
        <p className="text-xs text-muted-foreground">{t("quietHint")}</p>
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <Field id="quiet-from" label={t("quietFrom")}>
            {timeInput(
              "quiet-from",
              profile.quiet_hours_start,
              (v) =>
                void update({
                  quiet_hours_start: v,
                  quiet_hours_end: profile.quiet_hours_end ?? "07:00",
                }),
            )}
          </Field>
          <Field id="quiet-to" label={t("quietTo")}>
            {timeInput(
              "quiet-to",
              profile.quiet_hours_end,
              (v) =>
                void update({
                  quiet_hours_end: v,
                  quiet_hours_start: profile.quiet_hours_start ?? "22:00",
                }),
            )}
          </Field>
          {profile.quiet_hours_start ? (
            <Button
              variant="ghost"
              onClick={() => void update({ quiet_hours_start: null, quiet_hours_end: null })}
            >
              {t("quietOff")}
            </Button>
          ) : null}
        </div>
      </fieldset>

      <Devices />
    </div>
  );
}

/**
 * A time that saves itself: shortly after a change (phone time pickers may never blur), or
 * right away on blur.
 */
function TimeField({
  id,
  value,
  onSave,
}: {
  id: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  const saved = useRef(value);
  const flush = (next: string) => {
    window.clearTimeout(timer.current);
    if (!/^\d{2}:\d{2}$/.test(next) || next === saved.current) return;
    saved.current = next;
    onSave(next);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Input
      id={id}
      type="time"
      defaultValue={value}
      onChange={(e) => {
        const next = e.target.value;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(next), 800);
      }}
      onBlur={(e) => flush(e.target.value)}
    />
  );
}

/** FR-NTF-1: every device with notifications on, and a way to remove one. */
function Devices() {
  const t = useTranslations("settings.notifications.prefs");
  const format = useFormatter();
  const { data: devices, refetch } = useQuery({
    queryKey: ["push-devices"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("push_subscriptions")
        .select("id, platform, device_label, last_success_at, created_at")
        .order("created_at");
      if (error) throw error;
      return data;
    },
    gcTime: 0,
  });

  const remove = async (id: string) => {
    const { error } = await createClient().from("push_subscriptions").delete().eq("id", id);
    if (!error) void refetch();
  };

  return (
    <section className="grid gap-2" aria-labelledby="devices-title">
      <h3 id="devices-title" className="text-sm font-medium">
        {t("devices")}
      </h3>
      {!devices || devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("devicesEmpty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {devices.map((d) => {
            const name = d.device_label || t("deviceUnknown");
            const Icon = d.platform === "desktop" ? Laptop : Smartphone;
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.last_success_at
                      ? t("deviceLastSeen", {
                          date: format.relativeTime(new Date(d.last_success_at)),
                        })
                      : t("deviceNever")}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("deviceRemove", { name })}
                  onClick={() => void remove(d.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
