"use client";

import { useMemo } from "react";

import { useData } from "@/data/hooks";
import { CHECK_IN_HISTORY_DAYS } from "@/data/sync";
import { addDays, type IsoDate } from "@/domain/dates";
import { histories } from "@/domain/stats";

export const PERIODS = ["7d", "30d", "90d", "12m", "all"] as const;
export type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

/**
 * Habit histories for statistics, computed on the device from the local cache (FR-STA-7).
 * `earliest` is the first day there is data for: the oldest start date, but no further back
 * than the check-ins kept on the device.
 */
export function useStats() {
  const { data, today, isLoading } = useData();
  const weekStart = data.profile?.week_start ?? 1;
  const hs = useMemo(
    () =>
      histories({
        today,
        weekStart,
        habits: data.habits,
        versions: data.versions,
        pauses: data.pauses,
        checkIns: data.checkIns,
      }),
    [data.habits, data.versions, data.pauses, data.checkIns, today, weekStart],
  );
  const horizon = addDays(today, -(CHECK_IN_HISTORY_DAYS - 1));
  const oldest = hs.reduce<IsoDate>(
    (min, h) => (h.habit.start_date < min ? h.habit.start_date : min),
    today,
  );
  const earliest = oldest > horizon ? oldest : horizon;

  const rangeFor = (period: Period): { from: IsoDate; to: IsoDate } => {
    const from = period === "all" ? earliest : addDays(today, -(PERIOD_DAYS[period] - 1));
    return { from: from < earliest ? earliest : from, to: today };
  };

  return { data, hs, today, weekStart, earliest, rangeFor, isLoading };
}
