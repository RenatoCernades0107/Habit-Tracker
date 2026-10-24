"use client";

import { Copy, Pencil, Trophy } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shell/empty-state";
import { Bars } from "@/components/stats/bars";
import { ChartFrame, Panel } from "@/components/stats/chart-frame";
import { Heatmap } from "@/components/stats/heatmap";
import { RateList, Tile } from "@/components/stats/stats-view";
import { useStats } from "@/components/stats/use-stats";
import { Button } from "@/components/ui/button";
import { addDays } from "@/domain/dates";
import { currentStreak } from "@/domain/progress";
import { isFixed, scheduleOn } from "@/domain/schedule";
import { skipsInMonth } from "@/domain/skips";
import { occurrenceState } from "@/domain/state";
import { bestStreak, completionRate, habitDays, weekdayRates } from "@/domain/stats";

import { useDayFormat, useScheduleSummary, useWeekdayNames } from "./labels";

const VALUE_DAYS = 30;
const HISTORY_ROWS = 60;

/** /habits/[id] (FR-STA-2, docs/spec/07-ux.md §4.5). */
export function HabitDetail({ habitId }: { habitId: string }) {
  const t = useTranslations("stats");
  const tHabits = useTranslations("habits");
  const tShortcuts = useTranslations("shortcuts");
  const format = useFormatter();
  const day = useDayFormat();
  const summary = useScheduleSummary();
  const weekday = useWeekdayNames();
  const { data, hs, today, weekStart, earliest, isLoading } = useStats();
  const h = hs.find((x) => x.habit.id === habitId);
  const habit = data.habits.find((x) => x.id === habitId && x.deleted_at === null);

  const stats = useMemo(() => {
    if (!h) return null;
    const from = h.habit.start_date > earliest ? h.habit.start_date : earliest;
    const rate = (days: number | null) =>
      completionRate(
        h,
        days === null ? from : addDays(today, -(days - 1)),
        today,
        today,
        weekStart,
      );
    const heatFrom = addDays(today, -370) > from ? addDays(today, -370) : from;
    const checkIns = [...h.checkIns.values()]
      .filter((c) => c.deleted_at === null)
      .sort((a, b) => b.local_date.localeCompare(a.local_date));
    const valueFrom = addDays(today, -(VALUE_DAYS - 1));
    return {
      weekly: !isFixed(scheduleOn(h.habit, h.versions, today)),
      current: currentStreak(h, today, weekStart),
      best: bestStreak(h, today, weekStart),
      rates: [
        { key: "7", name: t("habit.rate7"), rate: rate(7) },
        { key: "30", name: t("habit.rate30"), rate: rate(30) },
        { key: "90", name: t("habit.rate90"), rate: rate(90) },
        { key: "all", name: t("habit.rateAll"), rate: rate(null) },
      ],
      heat: habitDays(h, heatFrom, today, today),
      weekdays: weekdayRates([h], from, today, today),
      values: Array.from({ length: VALUE_DAYS }, (_, i) => {
        const date = addDays(valueFrom, i);
        const c = h.checkIns.get(date);
        return {
          date,
          value: c && c.deleted_at === null && c.status !== "skipped" ? (c.value ?? 0) : null,
        };
      }),
      notes: checkIns.filter((c) => c.note?.trim()),
      history: checkIns.slice(0, HISTORY_ROWS),
    };
  }, [h, today, weekStart, earliest, t]);

  if (isLoading) return null;
  if (!h || !habit || !stats) {
    return <EmptyState title={tHabits("errors.notFound")} description="" headingLevel={1} />;
  }

  const percent = (v: number | null) => (v === null ? t("noData") : t("rate", { rate: v }));
  const streak = (n: number) => t(stats.weekly ? "habit.weeks" : "habit.days", { count: n });
  const measurable = habit.kind === "measurable";
  const target = scheduleOn(h.habit, h.versions, today).target;
  const maxValue = Math.max(target ?? 0, ...stats.values.map((v) => v.value ?? 0), 1);
  const editableFrom = addDays(today, -(data.profile?.retro_edit_days ?? 7));
  const fmtValue = (v: number) => format.number(v, { maximumFractionDigits: 2 });

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {habit.icon ? (
              <span aria-hidden="true" className="mr-2">
                {habit.icon}
              </span>
            ) : null}
            {habit.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {summary(habit, weekStart)}
            {habit.cue ? ` · ${habit.cue}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/habits/${habit.id}/edit`}>
              <Pencil aria-hidden="true" />
              {t("habit.edit")}
            </Link>
          </Button>
          {/* FR-SIR-7: direct shortcuts ("I meditated") use the ID, so renaming doesn't break them. */}
          <Button
            variant="ghost"
            onClick={() =>
              void navigator.clipboard
                .writeText(habit.id)
                .then(() => toast(tShortcuts("copiedId")))
                .catch(() => {})
            }
          >
            <Copy aria-hidden="true" />
            {tShortcuts("copyId")}
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t("habit.current")} value={streak(stats.current)} />
        <Tile label={t("habit.best")} value={streak(stats.best)} />
        <Tile
          className="col-span-2 sm:col-span-1"
          label={t("habit.skipsUsed")}
          value={t("habit.skipsValue", {
            used: skipsInMonth(habit.id, data.checkIns, today),
            max: data.profile?.max_skips_per_month ?? 4,
          })}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title={t("habit.rates")}
          columns={[t("periods.label"), t("heatmap.scoreCol")]}
          rows={stats.rates.map((r) => [r.name, percent(r.rate)])}
        >
          <RateList rows={stats.rates} percent={percent} />
        </ChartFrame>
        <ChartFrame
          title={t("weekdays.title")}
          columns={[t("weekdays.title"), t("heatmap.scoreCol")]}
          rows={stats.weekdays.map((w) => [weekday(w.weekday, "long"), percent(w.rate)])}
        >
          <RateList
            rows={stats.weekdays.map((w) => ({
              key: String(w.weekday),
              name: weekday(w.weekday, "long"),
              rate: w.rate,
            }))}
            percent={percent}
          />
        </ChartFrame>
      </div>

      <ChartFrame
        title={t("heatmap.title")}
        summary={t("heatmap.description")}
        columns={[t("heatmap.date"), t("heatmap.scoreCol")]}
        rows={stats.heat
          .toReversed()
          .map((d) => [day(d.date), d.state ? t(`habit.state.${d.state}`) : t("heatmap.rest")])}
      >
        <Heatmap
          days={stats.heat}
          weekStart={weekStart}
          formatValue={(d) => {
            const s = stats.heat.find((x) => x.date === d.date)?.state;
            return s ? t(`habit.state.${s}`) : percent(d.score);
          }}
        />
      </ChartFrame>

      {measurable ? (
        <ChartFrame
          title={t("habit.values")}
          summary={
            target
              ? t("habit.target", { value: `${fmtValue(target)} ${habit.unit ?? ""}`.trim() })
              : null
          }
          columns={[t("heatmap.date"), t("habit.values")]}
          rows={stats.values
            .toReversed()
            .map((v) => [day(v.date), v.value === null ? t("noData") : fmtValue(v.value)])}
        >
          <Bars
            max={maxValue}
            target={target}
            gridLabels={[fmtValue(0), fmtValue(maxValue / 2), fmtValue(maxValue)]}
            labelEvery={7}
            bars={stats.values.map((v) => ({
              key: v.date,
              value: v.value,
              label: day(v.date, { month: "short", day: "numeric" }),
              tooltip: `${day(v.date)}: ${v.value === null ? t("noData") : `${fmtValue(v.value)} ${habit.unit ?? ""}`}`,
            }))}
          />
        </ChartFrame>
      ) : null}

      {stats.notes.length > 0 ? (
        <Panel title={t("habit.notes")}>
          <ul className="grid gap-2">
            {stats.notes.slice(0, 20).map((c) => (
              <li key={c.local_date} className="text-sm">
                <span className="text-xs text-muted-foreground">{day(c.local_date)}</span>
                <p className="whitespace-pre-wrap">{c.note}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title={t("habit.history")}>
        {stats.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("habit.historyEmpty")}</p>
        ) : (
          <ul className="divide-y">
            {stats.history.map((c) => {
              const state = occurrenceState(
                scheduleOn(h.habit, h.versions, c.local_date),
                c,
                c.local_date,
                today,
              );
              const editable = c.local_date >= editableFrom;
              const text = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{day(c.local_date)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`habit.state.${state}`)}
                      {measurable && c.value !== null
                        ? ` · ${fmtValue(c.value)} ${habit.unit ?? ""}`
                        : ""}
                      {` · ${t(`habit.source.${c.source}`)}`}
                    </span>
                  </span>
                  {state === "done" ? (
                    <Trophy aria-hidden="true" className="size-4 text-success" />
                  ) : null}
                </>
              );
              return (
                <li key={c.local_date}>
                  {editable ? (
                    <Link
                      href={c.local_date === today ? "/today" : `/today?day=${c.local_date}`}
                      className="flex min-h-11 items-center gap-3 rounded-md px-1 py-2 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
                    >
                      {text}
                      <span className="sr-only">
                        {t("habit.openDay", { date: day(c.local_date) })}
                      </span>
                    </Link>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 px-1 py-2 text-sm">{text}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
