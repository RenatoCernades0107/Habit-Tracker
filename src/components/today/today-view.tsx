"use client";

import { ChevronLeft, ChevronRight, Play, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useGroupNames, useTimeFormat } from "@/components/habits/labels";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { useCheckIns, useData } from "@/data/hooks";
import type { CheckIn, CheckInOp, CheckInPayload } from "@/domain/check-in-ops";
import { addDays } from "@/domain/dates";
import { dateOfHabitDay } from "@/domain/day";
import { buildDayView, type DayItem } from "@/domain/day-view";
import { applyOpLocally } from "@/domain/check-in-ops";
import { skipsLeft, skipsUsed } from "@/domain/skips";
import { cn } from "@/lib/utils";

import { CheckInRow } from "./check-in-row";
import { useCelebrate } from "./celebrate";
import { CheckInSheet } from "./check-in-sheet";
import { MoodCard } from "./mood-card";
import { RestIllustration } from "./rest-illustration";
import { ScoreRing } from "./score-ring";
import { SyncIndicator } from "./sync-indicator";

const DATE_PARAM = "day";

/** Today (FR-TOD-1…7), rendered from the device cache (NFR-PERF-1/2). */
export function TodayView({ setup }: { setup: ReactNode }) {
  const t = useTranslations("today");
  const tHabits = useTranslations("habits");
  const tRoutine = useTranslations("stats.routine");
  const celebrate = useCelebrate();
  const format = useFormatter();
  const names = useGroupNames();
  const time = useTimeFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data, today, isLoading, error } = useData();
  const apply = useCheckIns(data);
  const [sheetFor, setSheetFor] = useState<string | null>(null);

  const editWindow = data.profile?.retro_edit_days ?? 7;
  const earliest = addDays(today, -editWindow);
  const requested = params.get(DATE_PARAM);
  const date =
    requested &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    requested <= today &&
    requested >= earliest
      ? requested
      : today;

  const view = useMemo(
    () =>
      buildDayView({
        date,
        today,
        weekStart: data.profile?.week_start ?? 1,
        habits: data.habits.filter((h) => h.deleted_at === null),
        versions: data.versions,
        pauses: data.pauses,
        checkIns: data.checkIns,
        routines: data.routines,
      }),
    [data, date, today],
  );

  const goTo = (day: string) => {
    const next = new URLSearchParams(params);
    if (day === today) next.delete(DATE_PARAM);
    else next.set(DATE_PARAM, day);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const allItems: DayItem[] = [...view.sections.flatMap((s) => s.items), ...view.weekly];
  const sheetItem = allItems.find((i) => i.habit.id === sheetFor) ?? null;

  const run = (item: DayItem, op: CheckInOp, payload: CheckInPayload = {}) => {
    const name = item.habit.name;
    // Predict the result to word the toast; the screen itself updates from the queued change.
    const next = applyOpLocally({
      op,
      payload,
      // Day items hold full cached rows; the domain type only names the columns it reads.
      current: item.checkIn as CheckIn | undefined,
      schedule: item.schedule,
      incrementStep: item.habit.increment_step,
      userId: "",
      habitId: item.habit.id,
      date,
      source: "app",
      now: new Date().toISOString(),
    });
    celebrate(data, today, next);
    const undo = apply(item.habit.id, date, op, payload);
    const message =
      op === "set_note"
        ? t("toast.noted")
        : next.deleted_at
          ? t("toast.cleared", { name })
          : next.status === "skipped"
            ? t("toast.skipped", { name })
            : next.status === "done"
              ? t("toast.done", { name })
              : t("toast.partial", { name });
    // FR-CHK-4: Undo for 5 seconds instead of confirmations.
    toast(message, { duration: 5000, action: { label: t("toast.undo"), onClick: undo } });
  };

  const tap = (item: DayItem) => {
    if (item.schedule.kind === "measurable") {
      run(item, item.state === "done" ? "clear" : "increment");
    } else {
      run(item, item.state === "done" ? "clear" : "complete");
    }
  };

  const activeHabits = data.habits.filter((h) => h.deleted_at === null && h.archived_on === null);
  const dayLabel =
    date === today ? t("day.today") : date === addDays(today, -1) ? t("day.yesterday") : null;

  const header = (
    <header className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-3 size-9"
            aria-label={t("day.previous")}
            disabled={date <= earliest}
            onClick={() => goTo(addDays(date, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p className="text-sm font-medium text-primary">{dayLabel ?? t("eyebrow")}</p>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t("day.next")}
            disabled={date >= today}
            onClick={() => goTo(addDays(date, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          {date !== today ? (
            <Button variant="link" size="sm" className="h-9" onClick={() => goTo(today)}>
              {t("day.backToToday")}
            </Button>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase sm:text-3xl">
          <time dateTime={date}>
            {format.dateTime(dateOfHabitDay(date), {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
        </h1>
        {view.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("score.summary", { done: view.done, total: view.total })}
            {view.bestStreak ? (
              <>
                {" "}
                ·{" "}
                {t("bestStreak", { name: view.bestStreak.habit.name, days: view.bestStreak.days })}
              </>
            ) : null}
          </p>
        ) : null}
        <SyncIndicator />
      </div>
      {activeHabits.length > 0 ? (
        <div className="grid justify-items-center gap-1">
          <ScoreRing
            value={view.score}
            label={
              view.score === null
                ? "–"
                : t("score.value", { percent: Math.round(view.score * 100) })
            }
          />
          <span className="sr-only">
            {t("score.label")}:{" "}
            {view.score === null
              ? t("score.rest")
              : t("score.value", { percent: Math.round(view.score * 100) })}
          </span>
        </div>
      ) : null}
    </header>
  );

  let body: ReactNode;
  if (isLoading) {
    body = <p className="text-muted-foreground">{t("loading")}</p>;
  } else if (error) {
    body = (
      <p role="alert" className="text-destructive">
        {t("loadError")}
      </p>
    );
  } else if (activeHabits.length === 0) {
    body = (
      <EmptyState
        illustration={<RestIllustration />}
        title={t("empty.title")}
        description={t("empty.description")}
        action={
          <Button asChild size="lg">
            <Link href="/habits/new">
              <Plus aria-hidden="true" />
              {t("empty.action")}
            </Link>
          </Button>
        }
      />
    );
  } else if (view.sections.length === 0 && view.weekly.length === 0) {
    body = (
      <div className="grid gap-4">
        <EmptyState
          illustration={<RestIllustration />}
          title={t("restDay.title")}
          description={t("restDay.description")}
        />
        <MoodCard
          key={date}
          date={date}
          entry={data.dailyEntries.find((e) => e.local_date === date)}
        />
      </div>
    );
  } else {
    body = (
      <div className="grid gap-4">
        {view.sections.map((section) => {
          const sectionDone = section.items.filter((i) => i.state === "done").length;
          return (
            <section
              key={section.routine?.id ?? "anytime"}
              className="rounded-xl border bg-card px-4 py-2"
            >
              <h2 className="flex items-center justify-between border-b py-2 text-sm font-semibold">
                <span>
                  {names.routine(section.routine)}
                  {section.routine ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {time(section.routine.start_time)}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 font-normal text-muted-foreground tabular-nums">
                  {sectionDone}/{section.items.length}
                  {section.routine &&
                  date === today &&
                  section.items.some((i) => i.state === "pending" || i.state === "partial") ? (
                    <Button asChild size="sm" variant="secondary" className="h-8">
                      <Link
                        href={`/routine/${section.routine.id}`}
                        aria-label={tRoutine("startLabel", {
                          name: names.routine(section.routine),
                        })}
                      >
                        <Play aria-hidden="true" />
                        {tRoutine("start")}
                      </Link>
                    </Button>
                  ) : null}
                </span>
              </h2>
              <ul className="divide-y">
                {section.items.map((item) => (
                  <CheckInRow
                    key={item.habit.id}
                    item={item}
                    onTap={() => tap(item)}
                    onMore={() => setSheetFor(item.habit.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
        {view.weekly.length > 0 ? (
          <section className="rounded-xl border bg-card px-4 py-2">
            <h2 className="border-b py-2 text-sm font-semibold">{tHabits("thisWeek")}</h2>
            <ul className="divide-y">
              {view.weekly.map((item) => (
                <CheckInRow
                  key={item.habit.id}
                  item={item}
                  weekLabel={t("weekProgress", { done: item.weekDone, target: item.weekTarget })}
                  onTap={() => tap(item)}
                  onMore={() => setSheetFor(item.habit.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
        <MoodCard
          key={date}
          date={date}
          entry={data.dailyEntries.find((e) => e.local_date === date)}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {header}
      <div
        className={cn(
          "grid gap-6 lg:items-start",
          setup && "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]",
        )}
      >
        {setup ? <div className="lg:col-start-2 lg:row-start-1">{setup}</div> : null}
        <div className="lg:col-start-1 lg:row-start-1">{body}</div>
      </div>
      <CheckInSheet
        item={sheetItem}
        skipsLeft={
          sheetItem
            ? skipsLeft(
                data.profile?.max_skips_per_month ?? 4,
                skipsUsed(sheetItem.habit.id, data.checkIns, date),
              )
            : 0
        }
        onClose={() => setSheetFor(null)}
        onOp={(op, payload) => {
          if (sheetItem) run(sheetItem, op, payload);
          setSheetFor(null);
        }}
      />
    </div>
  );
}
