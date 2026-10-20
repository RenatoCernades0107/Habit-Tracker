"use client";

import { ChartColumn, Flame, NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import { useDayFormat, useGroupNames, useWeekdayNames } from "@/components/habits/labels";
import { SegmentedControl } from "@/components/settings/segmented-control";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { addDays, weekStartOf } from "@/domain/dates";
import { currentStreak, type HabitHistory } from "@/domain/progress";
import { isFixed, scheduleOn } from "@/domain/schedule";
import {
  completionRate,
  dailyScores,
  groupRate,
  needsAttention,
  perfectDays,
  weekdayRates,
  weeklyScores,
} from "@/domain/stats";

import { Bars, RateBar } from "./bars";
import { ChartFrame, Panel } from "./chart-frame";
import { Heatmap } from "./heatmap";
import { PERIODS, useStats, type Period } from "./use-stats";

/** Heatmaps show at most a year (53 weeks), whatever the period. */
const HEATMAP_DAYS = 371;

/** /stats (FR-STA-1…7, docs/spec/07-ux.md §4.6). Everything is computed on the device. */
export function StatsView() {
  const t = useTranslations("stats");
  const tHabits = useTranslations("habits");
  const format = useFormatter();
  const day = useDayFormat();
  const names = useGroupNames();
  const weekday = useWeekdayNames();
  const periodLabel = useId();
  const [period, setPeriod] = useState<Period>("90d");
  const { data, hs, today, weekStart, rangeFor, isLoading } = useStats();
  const { from, to } = rangeFor(period);

  const percent = (v: number | null) => (v === null ? t("noData") : t("rate", { rate: v }));

  const stats = useMemo(() => {
    const heatFrom =
      addDays(to, -(HEATMAP_DAYS - 1)) > from ? addDays(to, -(HEATMAP_DAYS - 1)) : from;
    const scores = dailyScores(hs, from, to, today);
    // Today counts once everything is done, so the average doesn't dip each morning.
    const judged = scores.filter((s) => s.score !== null && (s.date < today || s.done === s.total));
    const average = judged.length
      ? judged.reduce((sum, s) => sum + (s.score ?? 0), 0) / judged.length
      : null;
    const thisWeek = weekStartOf(today, weekStart);
    const weeks = weeklyScores(hs, addDays(thisWeek, -7 * 11), thisWeek, today, weekStart);
    const byWeekday = weekdayRates(hs, from, to, today);
    const ranked = byWeekday.filter((w) => w.rate !== null && w.count >= 2);
    const best = ranked.reduce<(typeof ranked)[number] | null>(
      (b, w) => (!b || (w.rate ?? 0) > (b.rate ?? 0) ? w : b),
      null,
    );
    const worst = ranked.reduce<(typeof ranked)[number] | null>(
      (b, w) => (!b || (w.rate ?? 1) < (b.rate ?? 1) ? w : b),
      null,
    );
    const active = hs.filter((h) => h.habit.archived_on === null);
    const group = (pick: (h: HabitHistory) => string | null) => {
      const keys = new Map<string | null, HabitHistory[]>();
      for (const h of active) {
        const k = pick(h);
        keys.set(k, [...(keys.get(k) ?? []), h]);
      }
      return keys;
    };
    const streaks = active
      .map((h) => ({
        h,
        streak: currentStreak(h, today, weekStart),
        weekly: !isFixed(scheduleOn(h.habit, h.versions, today)),
      }))
      .filter((s) => s.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 5);
    return {
      scores,
      heat: dailyScores(hs, heatFrom, to, today),
      average,
      perfect: perfectDays(scores),
      weeks,
      thisWeekScore: weeks[weeks.length - 1]?.score ?? null,
      lastWeekScore: weeks[weeks.length - 2]?.score ?? null,
      byWeekday,
      best: best && worst && best.weekday !== worst.weekday ? best : null,
      worst: best && worst && best.weekday !== worst.weekday ? worst : null,
      byRoutine: group((h) => h.habit.routine_id),
      byCategory: group((h) => h.habit.category_id),
      attention: active
        .filter((h) => needsAttention(h, today, weekStart))
        .map((h) => ({
          h,
          rate: completionRate(h, addDays(thisWeek, -21), addDays(thisWeek, -1), today, weekStart),
        })),
      streaks,
      rate: (list: HabitHistory[]) => groupRate(list, from, to, today, weekStart),
    };
  }, [hs, from, to, today, weekStart]);

  if (isLoading) return null;
  if (hs.length === 0) {
    return (
      <EmptyState
        icon={ChartColumn}
        title={t("empty.title")}
        description={t("empty.description")}
        action={
          <Button asChild size="lg">
            <Link href="/habits/new">
              <Plus aria-hidden="true" />
              {tHabits("list.empty.action")}
            </Link>
          </Button>
        }
      />
    );
  }

  const delta =
    stats.thisWeekScore !== null && stats.lastWeekScore !== null
      ? stats.thisWeekScore - stats.lastWeekScore
      : null;
  const routines = data.routines
    .filter((r) => r.deleted_at === null)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const categories = data.categories
    .filter((c) => c.deleted_at === null)
    .sort((a, b) => a.sort_order - b.sort_order);

  const groupRows = (entries: { key: string; name: string; list: HabitHistory[] | undefined }[]) =>
    entries.filter((e) => e.list?.length).map((e) => ({ ...e, rate: stats.rate(e.list ?? []) }));
  const routineRows = groupRows([
    ...routines.map((r) => ({
      key: r.id,
      name: names.routine(r),
      list: stats.byRoutine.get(r.id),
    })),
    {
      key: "anytime",
      name: names.routine(null),
      list: [...stats.byRoutine.entries()]
        .filter(([k]) => k === null || !routines.some((r) => r.id === k))
        .flatMap(([, v]) => v),
    },
  ]);
  const categoryRows = groupRows([
    ...categories.map((c) => ({
      key: c.id,
      name: names.category(c),
      list: stats.byCategory.get(c.id),
    })),
    {
      key: "none",
      name: names.category(null),
      list: [...stats.byCategory.entries()]
        .filter(([k]) => k === null || !categories.some((c) => c.id === k))
        .flatMap(([, v]) => v),
    },
  ]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full gap-1 sm:max-w-md">
          <span id={periodLabel} className="sr-only">
            {t("periods.label")}
          </span>
          <SegmentedControl
            labelledBy={periodLabel}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p, label: t(`periods.${p}`) }))}
          />
        </div>
        <Button asChild variant="outline">
          <Link href="/review">
            <NotebookPen aria-hidden="true" />
            {t("reviewLink")}
          </Link>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t("overview.score")} value={percent(stats.average)} />
        <Tile label={t("overview.perfectDays")} value={format.number(stats.perfect)} />
        <Tile
          className="col-span-2 sm:col-span-1"
          label={t("overview.thisWeek")}
          value={percent(stats.thisWeekScore)}
          note={
            delta === null
              ? null
              : Math.abs(delta) < 0.005
                ? t("overview.noChange")
                : t("overview.change", { delta })
          }
        />
      </dl>

      <ChartFrame
        title={t("heatmap.title")}
        summary={t("heatmap.description")}
        columns={[t("heatmap.date"), t("heatmap.scoreCol")]}
        rows={stats.heat
          .filter((s) => s.date <= today)
          .toReversed()
          .map((s) => [day(s.date), s.score === null ? t("heatmap.rest") : percent(s.score)])}
      >
        <Heatmap days={stats.heat} weekStart={weekStart} formatValue={(d) => percent(d.score)} />
      </ChartFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title={t("weekly.title")}
          summary={t("weekly.description")}
          columns={[t("heatmap.date"), t("heatmap.scoreCol")]}
          rows={stats.weeks.map((w) => [day(w.weekStart), percent(w.score)])}
        >
          <Bars
            gridLabels={[percent(0), percent(0.5), percent(1)]}
            labelEvery={3}
            bars={stats.weeks.map((w) => ({
              key: w.weekStart,
              value: w.score,
              label: day(w.weekStart, { month: "short", day: "numeric" }),
              tooltip: t("weekly.bar", { date: day(w.weekStart), score: percent(w.score) }),
            }))}
          />
        </ChartFrame>

        <ChartFrame
          title={t("weekdays.title")}
          summary={
            stats.best && stats.worst ? (
              <>
                {t("weekdays.best", { day: weekday(stats.best.weekday, "long") })} ·{" "}
                {t("weekdays.worst", { day: weekday(stats.worst.weekday, "long") })}
              </>
            ) : null
          }
          columns={[t("weekdays.title"), t("heatmap.scoreCol")]}
          rows={stats.byWeekday.map((w) => [weekday(w.weekday, "long"), percent(w.rate)])}
        >
          <RateList
            rows={stats.byWeekday.map((w) => ({
              key: String(w.weekday),
              name: weekday(w.weekday, "long"),
              rate: w.rate,
            }))}
            percent={percent}
          />
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title={t("groups.routines")}
          columns={[t("groups.routines"), t("heatmap.scoreCol")]}
          rows={routineRows.map((r) => [r.name, percent(r.rate)])}
        >
          <RateList rows={routineRows} percent={percent} />
        </ChartFrame>
        <ChartFrame
          title={t("groups.categories")}
          columns={[t("groups.categories"), t("heatmap.scoreCol")]}
          rows={categoryRows.map((r) => [r.name, percent(r.rate)])}
        >
          <RateList rows={categoryRows} percent={percent} />
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("attention.title")} description={t("attention.description")}>
          {stats.attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("attention.none")}</p>
          ) : (
            <ul className="divide-y">
              {stats.attention.map(({ h, rate }) => (
                <HabitLink key={h.habit.id} habit={h.habit} detail={percent(rate)} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t("strongest.title")}>
          {stats.streaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("strongest.none")}</p>
          ) : (
            <ul className="divide-y">
              {stats.streaks.map(({ h, streak, weekly }) => (
                <HabitLink
                  key={h.habit.id}
                  habit={h.habit}
                  detail={
                    <span className="inline-flex items-center gap-1">
                      <Flame aria-hidden="true" className="size-3.5 text-warning" />
                      {t(weekly ? "habit.weeks" : "habit.days", { count: streak })}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** A stat tile: a label and one big number (dataviz: a headline number is not a chart). */
export function Tile({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-1 rounded-xl border bg-card p-4 ${className ?? ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

export function RateList({
  rows,
  percent,
}: {
  rows: readonly { key: string; name: string; rate: number | null }[];
  percent: (v: number | null) => string;
}) {
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[minmax(0,7rem)_1fr_3rem] items-center gap-3 text-sm"
        >
          <span className="truncate">{r.name}</span>
          <RateBar value={r.rate} />
          <span className="text-right text-muted-foreground tabular-nums">{percent(r.rate)}</span>
        </li>
      ))}
    </ul>
  );
}

function HabitLink({
  habit,
  detail,
}: {
  habit: { id: string; name: string; icon: string | null };
  detail: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={`/habits/${habit.id}`}
        className="flex min-h-11 items-center gap-3 rounded-md px-1 py-2 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="w-5 text-center">
          {habit.icon}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{habit.name}</span>
        <span className="text-muted-foreground tabular-nums">{detail}</span>
      </Link>
    </li>
  );
}
