"use client";

import { useFormatter, useTranslations, type DateTimeFormatOptions } from "next-intl";

import { useCallback } from "react";

import { dateOfHabitDay } from "@/domain/day";
import type { Tables } from "@/lib/supabase/database.types";

type Named = { system_key: string | null; name: string | null };

const ROUTINE_KEYS = ["morning", "evening"] as const;
const CATEGORY_KEYS = ["health", "fitness", "mind", "learning", "productivity", "home"] as const;

/**
 * Display names for routines and categories. Defaults are translated until the user renames
 * them (FR-I18N-4).
 */
export function useGroupNames() {
  const t = useTranslations("habits");
  const routine = useCallback(
    (r: Named | null | undefined) => {
      if (!r) return t("anytime");
      if (r.name) return r.name;
      const key = ROUTINE_KEYS.find((k) => k === r.system_key);
      return key ? t(`routines.${key}`) : "";
    },
    [t],
  );
  const category = useCallback(
    (c: Named | null | undefined) => {
      if (!c) return t("categories.none");
      if (c.name) return c.name;
      const key = CATEGORY_KEYS.find((k) => k === c.system_key);
      return key ? t(`categories.${key}`) : "";
    },
    [t],
  );
  return { routine, category };
}

/** "07:00:00" → localized short time. */
export function useTimeFormat() {
  const format = useFormatter();
  return useCallback(
    (time: string | null | undefined) => {
      if (!time) return "";
      const [h = 0, m = 0] = time.split(":").map(Number);
      return format.dateTime(new Date(Date.UTC(2000, 0, 1, h, m)), {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      });
    },
    [format],
  );
}

/** A habit day ("2026-10-20") as localized text; medium date style by default. */
export function useDayFormat() {
  const format = useFormatter();
  return useCallback(
    (day: string, options: DateTimeFormatOptions = { dateStyle: "medium" }) =>
      format.dateTime(dateOfHabitDay(day), { ...options, timeZone: "UTC" }),
    [format],
  );
}

/** Short weekday names for ISO days 1…7 in the current language. */
export function useWeekdayNames() {
  const format = useFormatter();
  return useCallback(
    (isoDay: number, width: "short" | "long" = "short") =>
      // 2024-01-01 was a Monday.
      format.dateTime(new Date(Date.UTC(2024, 0, isoDay, 12)), { weekday: width, timeZone: "UTC" }),
    [format],
  );
}

/** "Every day at 7:00 AM", "Mon, Wed, Fri", "3 times a week" (docs/spec/07-ux.md §4.4). */
export function useScheduleSummary() {
  const t = useTranslations("habits.schedule");
  const day = useWeekdayNames();
  const time = useTimeFormat();
  return useCallback(
    (
      h: Pick<
        Tables<"habits">,
        "schedule_type" | "days_of_week" | "times_per_week" | "time_of_day"
      >,
      weekStart = 1,
    ) => {
      let text: string;
      if (h.schedule_type === "daily") text = t("daily");
      else if (h.schedule_type === "times_per_week")
        text = t("timesPerWeek", { count: h.times_per_week ?? 1 });
      else {
        const order = (d: number) => (d - weekStart + 7) % 7;
        const days = [...(h.days_of_week ?? [])].sort((a, b) => order(a) - order(b));
        text = t("days", { days: days.map((d) => day(d)).join(", ") });
      }
      return h.time_of_day ? `${text} ${t("at", { time: time(h.time_of_day) })}` : text;
    },
    [t, day, time],
  );
}
