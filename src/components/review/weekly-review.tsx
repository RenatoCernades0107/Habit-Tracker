"use client";

import { ChevronLeft, ChevronRight, Flame, Pencil } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useDayFormat, useWeekdayNames } from "@/components/habits/labels";
import { RateBar } from "@/components/stats/bars";
import { Tile } from "@/components/stats/stats-view";
import { useStats } from "@/components/stats/use-stats";
import { Button } from "@/components/ui/button";
import { useSave } from "@/data/hooks";
import { useUserId } from "@/data/provider";
import { addDays, weekStartOf } from "@/domain/dates";
import { currentStreak, weekProgress } from "@/domain/progress";
import { isFixed, scheduleOn } from "@/domain/schedule";
import {
  dailyScores,
  habitDays,
  perfectDays,
  weekdayRates,
  weeklyScores,
  weeksStruggling,
} from "@/domain/stats";
import type { Tables } from "@/lib/supabase/database.types";

const MOOD_EMOJI = ["", "😞", "🙁", "😐", "🙂", "😄"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Weekly review (FR-REV-2…4, docs/spec/07-ux.md §4.7). Without a week, it opens the week that
 * just ended, or this week on its last day.
 */
export function WeeklyReview({ week: requested }: { week: string | null }) {
  const t = useTranslations("stats.review");
  const tStats = useTranslations("stats");
  const day = useDayFormat();
  const format = useFormatter();
  const userId = useUserId();
  const save = useSave();
  const { data, hs, today, weekStart, isLoading } = useStats();

  const thisWeek = weekStartOf(today, weekStart);
  const fallback = addDays(thisWeek, 6) === today ? thisWeek : addDays(thisWeek, -7);
  const week =
    requested && ISO.test(requested) && !Number.isNaN(Date.parse(requested))
      ? weekStartOf(requested, weekStart) > thisWeek
        ? thisWeek
        : weekStartOf(requested, weekStart)
      : fallback;
  const end = addDays(week, 6);
  const last = end < today ? end : today;

  const review = useMemo(() => {
    const [prev, cur] = weeklyScores(hs, addDays(week, -7), week, today, weekStart);
    const scores = dailyScores(hs, week, end, today);
    const active = hs.filter(
      (h) => h.habit.start_date <= end && (h.habit.archived_on ?? "9999") > week,
    );
    const perHabit = active
      .map((h) => {
        const fixed = isFixed(scheduleOn(h.habit, h.versions, last));
        if (!fixed) {
          const p = weekProgress(h, week, today, weekStart);
          // A finished week that didn't reach the target is a miss (R-STREAK-2).
          const missed = end < today ? Math.max(0, p.target - p.rawDone) : 0;
          return { h, done: p.done, total: p.target, missed, fixed };
        }
        const days = habitDays(h, week, end, today);
        const judged = days.filter(
          (d) => d.state && d.state !== "skipped" && d.state !== "pending",
        );
        return {
          h,
          done: judged.filter((d) => d.state === "done").length,
          total: judged.length,
          // Partly done counts as a miss, as it does for streaks (R-STREAK-1).
          missed: judged.filter((d) => d.state === "missed" || d.state === "partial").length,
          fixed,
        };
      })
      .filter((r) => r.total > 0);
    const wins = perHabit
      .filter((r) => r.missed === 0 && r.done > 0)
      // Judge streaks as of the day after a finished week, so that week counts as complete and
      // not as "in progress" (R-STREAK-1/2).
      .map((r) => ({
        ...r,
        streak: currentStreak(r.h, end < today ? addDays(end, 1) : today, weekStart),
      }))
      .filter((r) => r.streak > 0);
    const notes = [
      ...data.dailyEntries
        .filter(
          (e) => e.deleted_at === null && e.local_date >= week && e.local_date <= end && e.note,
        )
        .map((e) => ({ key: `d${e.local_date}`, date: e.local_date, name: null, note: e.note! })),
      ...active.flatMap((h) =>
        [...h.checkIns.values()]
          .filter(
            (c) => c.deleted_at === null && c.note && c.local_date >= week && c.local_date <= end,
          )
          .map((c) => ({
            key: `${h.habit.id}${c.local_date}`,
            date: c.local_date,
            name: h.habit.name,
            note: c.note!,
          })),
      ),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const moods = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(week, i);
      const e = data.dailyEntries.find((x) => x.local_date === date && x.deleted_at === null);
      return { date, mood: e?.mood ?? null };
    });
    // FR-REV-4: only for the latest weeks, where a change still helps.
    const suggestions =
      week >= addDays(thisWeek, -7)
        ? active
            .filter((h) => h.habit.archived_on === null)
            .map((h) => ({ h, weeks: weeksStruggling(h, today, weekStart) }))
            .filter((s) => s.weeks >= 3)
        : [];
    return {
      score: cur?.score ?? null,
      delta: cur?.score != null && prev?.score != null ? cur.score - prev.score : null,
      perfect: perfectDays(scores),
      perHabit,
      wins,
      misses: perHabit.filter((r) => r.missed > 0),
      notes,
      moods,
      suggestions,
    };
  }, [hs, data.dailyEntries, week, end, last, today, weekStart, thisWeek]);

  if (isLoading) return null;

  const percent = (v: number | null) =>
    v === null ? tStats("noData") : tStats("rate", { rate: v });
  const saved = data.weeklyReviews.find((r) => r.week_start === week);

  return (
    <div className="grid gap-4 lg:max-w-3xl">
      <header className="grid gap-1">
        <p className="text-sm font-medium text-primary">{t("title")}</p>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="-ml-3 size-9">
            <Link href={`/review/${addDays(week, -7)}`} aria-label={t("previous")}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase sm:text-3xl">
            {t("week", { date: day(week, { month: "long", day: "numeric" }) })}
          </h1>
          {week < thisWeek ? (
            <Button asChild variant="ghost" size="icon" className="size-9">
              <Link href={`/review/${addDays(week, 7)}`} aria-label={t("next")}>
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <Tile
          label={t("score")}
          value={percent(review.score)}
          note={review.delta === null ? null : t("vsLast", { delta: review.delta })}
        />
        <Tile label={tStats("overview.perfectDays")} value={format.number(review.perfect)} />
      </dl>

      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("perHabit")}</h2>
        {review.perHabit.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHabits")}</p>
        ) : (
          <ul className="grid gap-2">
            {review.perHabit.map((r) => (
              <li
                key={r.h.habit.id}
                className="grid grid-cols-[minmax(0,10rem)_1fr_4rem] items-center gap-3 text-sm"
              >
                <Link href={`/habits/${r.h.habit.id}`} className="truncate hover:underline">
                  {r.h.habit.icon ? <span aria-hidden="true">{r.h.habit.icon} </span> : null}
                  {r.h.habit.name}
                </Link>
                <RateBar value={r.total ? r.done / r.total : null} />
                <span className="text-right text-muted-foreground tabular-nums">
                  {t("habitProgress", { done: r.done, total: r.total })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="grid content-start gap-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("wins")}</h2>
          {review.wins.length === 0 && review.perfect === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noWins")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {review.perfect > 0 ? (
                <li>🎉 {t("perfectDays", { count: review.perfect })}</li>
              ) : null}
              {review.wins.map((w) => (
                <li key={w.h.habit.id} className="flex items-center gap-1.5">
                  <Flame aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
                  {w.fixed
                    ? t("streakKept", { name: w.h.habit.name, days: w.streak })
                    : `${w.h.habit.name}: ${tStats("habit.weeks", { count: w.streak })}`}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid content-start gap-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("misses")}</h2>
          {review.misses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noMisses")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {review.misses.map((m) => (
                <li key={m.h.habit.id}>{t("missed", { name: m.h.habit.name, count: m.missed })}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">{t("moodTrend")}</h2>
        <ol className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {review.moods.map((m) => (
            <li key={m.date} className="grid gap-1">
              <span>{day(m.date, { weekday: "narrow" })}</span>
              <span className="text-xl" aria-hidden="true">
                {m.mood ? MOOD_EMOJI[m.mood] : "·"}
              </span>
              <span className="sr-only">
                {day(m.date, { weekday: "long" })}:{" "}
                {m.mood ? tStats(`mood.labels.${m.mood as 1 | 2 | 3 | 4 | 5}`) : tStats("noData")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {review.notes.length > 0 ? (
        <section className="grid gap-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("notes")}</h2>
          <ul className="grid gap-2 text-sm">
            {review.notes.map((n) => (
              <li key={n.key}>
                <span className="text-xs text-muted-foreground">
                  {day(n.date, { weekday: "short", day: "numeric" })}
                  {n.name ? ` · ${n.name}` : ""}
                </span>
                <p className="whitespace-pre-wrap">{n.note}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review.suggestions.length > 0 ? (
        <section className="grid gap-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("suggestions")}</h2>
          <ul className="grid gap-3">
            {review.suggestions.map(({ h, weeks }) => (
              <Suggestion key={h.habit.id} habitId={h.habit.id} weeks={weeks} />
            ))}
          </ul>
        </section>
      ) : null}

      <Reflection
        key={`${week}${saved ? "s" : ""}`}
        saved={saved}
        onSave={(reflection) => {
          const now = new Date().toISOString();
          save({
            table: "weekly_reviews",
            row: {
              user_id: userId,
              week_start: week,
              reflection,
              completed_at: saved?.completed_at ?? now,
              created_at: saved?.created_at ?? now,
              updated_at: now,
            },
          });
          toast(t("saved"));
        }}
      />
    </div>
  );
}

function Reflection({
  saved,
  onSave,
}: {
  saved: Tables<"weekly_reviews"> | undefined;
  onSave: (reflection: string | null) => void;
}) {
  const t = useTranslations("stats.review");
  const [text, setText] = useState(saved?.reflection ?? "");
  const unchanged = (text.trim() || null) === (saved?.reflection ?? null);

  return (
    <form
      className="grid gap-2 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text.trim() || null);
      }}
    >
      <label htmlFor="reflection" className="text-sm font-semibold">
        {t("reflection")}
      </label>
      <textarea
        id="reflection"
        value={text}
        maxLength={2000}
        rows={4}
        placeholder={t("reflectionPrompt")}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring md:text-sm"
      />
      <Button type="submit" className="justify-self-end" disabled={unchanged && !!saved}>
        {t("save")}
      </Button>
    </form>
  );
}

/** FR-REV-4: one-tap changes for a habit that has struggled for weeks. */
function Suggestion({ habitId, weeks }: { habitId: string; weeks: number }) {
  const t = useTranslations("stats.review");
  const format = useFormatter();
  const weekday = useWeekdayNames();
  const save = useSave();
  const { hs, today, weekStart } = useStats();
  const [applied, setApplied] = useState(false);
  const h = hs.find((x) => x.habit.id === habitId);
  if (!h || applied) return null;
  // Full row: histories keep the row as cached.
  const habit = h.habit as Tables<"habits">;

  const step = habit.increment_step;
  const decimals = (String(step).split(".")[1] ?? "").length;
  const lowerTarget =
    habit.kind === "measurable" && habit.target_value && habit.target_value > step
      ? Number(
          Math.max(step, Math.round((habit.target_value * 0.75) / step) * step).toFixed(decimals),
        )
      : null;
  // Fixed schedules: drop the weekday that went worst over the last 3 weeks.
  const days =
    habit.schedule_type === "daily"
      ? [1, 2, 3, 4, 5, 6, 7]
      : habit.schedule_type === "days_of_week"
        ? (habit.days_of_week ?? [])
        : [];
  const weakest =
    days.length > 1
      ? weekdayRates([h], addDays(weekStartOf(today, weekStart), -21), addDays(today, -1), today)
          .filter((w) => days.includes(w.weekday) && w.rate !== null)
          .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))[0]?.weekday
      : undefined;
  const fewerTimes =
    habit.schedule_type === "times_per_week" && (habit.times_per_week ?? 0) > 1
      ? (habit.times_per_week ?? 0) - 1
      : null;
  const apply = (row: Tables<"habits">) => {
    save({ table: "habits", row });
    setApplied(true);
    toast(t("applied", { name: habit.name }));
  };

  return (
    <li className="grid gap-2 text-sm">
      <p>{t("suggestion", { name: habit.name, weeks })}</p>
      <div className="flex flex-wrap gap-2">
        {lowerTarget !== null && lowerTarget < (habit.target_value ?? 0) ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => apply({ ...habit, target_value: lowerTarget })}
          >
            {t("suggestTarget", {
              value: `${format.number(lowerTarget)} ${habit.unit ?? ""}`.trim(),
            })}
          </Button>
        ) : null}
        {weakest !== undefined ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              apply({
                ...habit,
                schedule_type: "days_of_week",
                days_of_week: days.filter((d) => d !== weakest),
              })
            }
          >
            {t("suggestDays", { day: weekday(weakest, "long") })}
          </Button>
        ) : null}
        {fewerTimes !== null ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => apply({ ...habit, times_per_week: fewerTimes })}
          >
            {t("suggestTimes", { count: fewerTimes })}
          </Button>
        ) : null}
        <Button asChild size="sm" variant="ghost">
          <Link href={`/habits/${habit.id}/edit`}>
            <Pencil aria-hidden="true" />
            {t("suggestEdit")}
          </Link>
        </Button>
      </div>
    </li>
  );
}
