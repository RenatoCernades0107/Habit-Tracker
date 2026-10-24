"use client";

import { Flame, Minus, Pause, Play, Plus, Timer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useGroupNames } from "@/components/habits/labels";
import { useCelebrate } from "@/components/today/celebrate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCheckIns, useData } from "@/data/hooks";
import {
  applyOpLocally,
  type CheckIn,
  type CheckInOp,
  type CheckInPayload,
} from "@/domain/check-in-ops";
import { buildDayView, type DayItem } from "@/domain/day-view";
import { skipsLeft, skipsUsed } from "@/domain/skips";
import { cn } from "@/lib/utils";

const REASONS = ["sick", "travel", "rest", "other"] as const;

type Result = "done" | "partial" | "skipped";

/**
 * Routine mode (FR-RMD-1…4, docs/spec/07-ux.md §4.2): one pending habit at a time, full screen.
 * Every step is saved as it happens, so leaving halfway keeps what was logged.
 */
export function RoutineMode({ routineId }: { routineId: string }) {
  const t = useTranslations("stats.routine");
  const tToday = useTranslations("today");
  const names = useGroupNames();
  const { data, today, isLoading } = useData();
  const apply = useCheckIns(data);
  const celebrate = useCelebrate();
  const router = useRouter();
  const titleId = useId();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});

  const routine = data.routines.find((r) => r.id === routineId && r.deleted_at === null);
  const view = useMemo(
    () =>
      buildDayView({
        date: today,
        today,
        weekStart: data.profile?.week_start ?? 1,
        habits: data.habits.filter((h) => h.deleted_at === null),
        versions: data.versions,
        pauses: data.pauses,
        checkIns: data.checkIns,
        routines: data.routines,
      }),
    [data, today],
  );
  const items = view.sections.find((s) => s.routine?.id === routineId)?.items ?? [];

  // The steps are fixed when the routine starts: what was still to do, in order (FR-RMD-1).
  if (queue === null && !isLoading) {
    const pending = items.filter((i) => i.state === "pending" || i.state === "partial");
    setQueue(pending.map((i) => i.habit.id));
    setTotal(pending.length);
  }

  useWakeLock(queue !== null && queue.length > 0);

  if (isLoading || queue === null) return null;

  const current = items.find((i) => i.habit.id === queue[0]);
  const step = total - queue.length + 1;
  const advance = (id: string, result?: Result) => {
    setQueue((q) => (q ?? []).filter((x) => x !== id));
    if (result) setResults((r) => ({ ...r, [id]: result }));
  };

  const run = (item: DayItem, op: CheckInOp, payload: CheckInPayload = {}) => {
    const next = applyOpLocally({
      op,
      payload,
      current: item.checkIn as CheckIn | undefined,
      schedule: item.schedule,
      incrementStep: item.habit.increment_step,
      userId: "",
      habitId: item.habit.id,
      date: today,
      source: "routine_mode",
      now: new Date().toISOString(),
    });
    apply(item.habit.id, today, op, payload, "routine_mode");
    if (next.deleted_at === null && next.status === "done") {
      window.setTimeout(() => celebrate(data, today, next), 0);
    }
    advance(item.habit.id, next.status === "skipped" ? "skipped" : (next.status as Result));
  };

  return (
    <FullScreen labelledBy={titleId} onEscape={() => router.push("/today")}>
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-medium break-words text-primary">
            {names.routine(routine)}
          </p>
          {current ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("progress", { current: step, total })}
            </p>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label={t("exit")}>
          <Link href="/today">
            <X aria-hidden="true" />
          </Link>
        </Button>
      </header>
      {total > 0 ? (
        <ol className="flex justify-center gap-1.5 px-4" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <li
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full sm:max-w-10",
                i < total - queue.length
                  ? "bg-primary"
                  : i === total - queue.length
                    ? "bg-primary/40"
                    : "bg-muted",
              )}
            />
          ))}
        </ol>
      ) : null}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
        {current ? (
          <Step
            key={current.habit.id}
            item={current}
            fullHabit={data.habits.find((h) => h.id === current.habit.id)}
            skipsLeft={skipsLeft(
              data.profile?.max_skips_per_month ?? 4,
              skipsUsed(current.habit.id, data.checkIns, today),
            )}
            canLater={queue.length > 1}
            onOp={(op, payload) => run(current, op, payload)}
            onLater={() => setQueue((q) => [...(q ?? []).slice(1), q?.[0] ?? ""].filter(Boolean))}
            reasonLabel={(r) => tToday(`reasons.${r}`)}
          />
        ) : (
          <Summary total={total} results={results} items={items} nothingToDo={total === 0} />
        )}
      </div>
    </FullScreen>
  );
}

function Step({
  item,
  fullHabit,
  skipsLeft: left,
  canLater,
  onOp,
  onLater,
  reasonLabel,
}: {
  item: DayItem;
  fullHabit:
    { description: string | null; cue: string | null; duration_min: number | null } | undefined;
  skipsLeft: number;
  canLater: boolean;
  onOp: (op: CheckInOp, payload?: CheckInPayload) => void;
  onLater: () => void;
  reasonLabel: (r: (typeof REASONS)[number]) => string;
}) {
  const t = useTranslations("stats.routine");
  const tToday = useTranslations("today");
  const format = useFormatter();
  const { habit, schedule } = item;
  const measurable = schedule.kind === "measurable";
  const target = schedule.target ?? 1;
  // "Done" means done: start from the target, or from more if more was logged.
  const [value, setValue] = useState(() => Math.max(item.checkIn?.value ?? 0, target));
  const heading = useRef<HTMLHeadingElement>(null);
  // Each step is a new screen: move focus to its name (keyboard and screen readers).
  useEffect(() => heading.current?.focus(), []);
  const [skipping, setSkipping] = useState(false);

  return (
    <div className="my-auto grid gap-6 text-center">
      <div className="grid gap-2">
        {habit.icon ? (
          <span aria-hidden="true" className="text-6xl">
            {habit.icon}
          </span>
        ) : null}
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight text-balance outline-none"
        >
          {habit.name}
        </h1>
        {fullHabit?.cue ? <p className="text-muted-foreground">{fullHabit.cue}</p> : null}
        {fullHabit?.description ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {fullHabit.description}
          </p>
        ) : null}
      </div>

      {measurable ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("subtract", { step: habit.increment_step, name: habit.name })}
            onClick={() => setValue((v) => Math.max(0, v - habit.increment_step))}
          >
            <Minus aria-hidden="true" />
          </Button>
          <label className="grid gap-1 text-sm">
            <span className="sr-only">{tToday("sheet.value")}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={habit.increment_step}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
              className="w-24 text-center text-xl tabular-nums"
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label={tToday("row.add", { step: habit.increment_step, name: habit.name })}
            onClick={() => setValue((v) => v + habit.increment_step)}
          >
            <Plus aria-hidden="true" />
          </Button>
          <span className="text-sm text-muted-foreground">
            / {format.number(target)} {habit.unit}
          </span>
        </div>
      ) : null}

      {fullHabit?.duration_min ? <StepTimer minutes={fullHabit.duration_min} /> : null}

      <div className="grid gap-3">
        <Button
          size="lg"
          className="h-14 text-lg"
          onClick={() => (measurable ? onOp("set_value", { value }) : onOp("complete"))}
        >
          {t("done")}
        </Button>
        {skipping ? (
          <fieldset className="grid gap-2" disabled={left === 0}>
            <legend className="mb-1 text-sm font-medium">{tToday("sheet.skipReason")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((reason) => (
                <Button key={reason} variant="outline" onClick={() => onOp("skip", { reason })}>
                  {reasonLabel(reason)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {tToday("sheet.skipsLeft", { count: left })}
            </p>
          </fieldset>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setSkipping(true)}>
              {t("skip")}
            </Button>
            <Button variant="ghost" disabled={!canLater} onClick={onLater}>
              {t("later")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepTimer({ minutes }: { minutes: number }) {
  const t = useTranslations("stats.routine");
  const [left, setLeft] = useState(minutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const end = Date.now() + left * 1000;
    const id = window.setInterval(() => {
      const next = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) {
        setRunning(false);
        navigator.vibrate?.(200);
      }
    }, 250);
    return () => window.clearInterval(id);
    // `left` is read once when the timer (re)starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="grid justify-items-center gap-2">
      <p
        role="timer"
        aria-label={t("timerRunning", { time: `${mm}:${ss}` })}
        className="text-4xl font-semibold tabular-nums"
      >
        {mm}:{ss}
      </p>
      <p className="sr-only" aria-live="polite">
        {left === 0 ? t("timerDone") : ""}
      </p>
      <Button variant="secondary" onClick={() => setRunning((r) => !r)} disabled={left === 0}>
        {running ? (
          <Pause aria-hidden="true" />
        ) : left === minutes * 60 ? (
          <Timer aria-hidden="true" />
        ) : (
          <Play aria-hidden="true" />
        )}
        {left === 0 ? t("timerDone") : running ? t("pause") : t("timer")}
      </Button>
    </div>
  );
}

function Summary({
  total,
  results,
  items,
  nothingToDo,
}: {
  total: number;
  results: Record<string, Result>;
  items: DayItem[];
  nothingToDo: boolean;
}) {
  const t = useTranslations("stats.routine");
  const tToday = useTranslations("today");
  const done = Object.values(results).filter((r) => r === "done").length;
  const streaks = items.filter((i) => results[i.habit.id] === "done" && i.streak > 0);

  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="my-auto grid gap-6 text-center">
      <div className="grid gap-2">
        <span aria-hidden="true" className="text-6xl">
          {nothingToDo ? "✨" : "🎉"}
        </span>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight outline-none"
        >
          {nothingToDo ? t("allDone") : t("summaryTitle")}
        </h1>
        {!nothingToDo ? (
          <p className="text-lg text-muted-foreground" role="status">
            {t("summary", { done, total })}
          </p>
        ) : null}
      </div>
      {streaks.length > 0 ? (
        <section className="grid gap-2 rounded-xl border bg-card p-4 text-left">
          <h2 className="text-sm font-semibold">{t("streaks")}</h2>
          <ul className="grid gap-1 text-sm">
            {streaks.map((i) => (
              <li key={i.habit.id} className="flex items-center gap-2">
                <Flame aria-hidden="true" className="size-4 text-warning" />
                <span className="min-w-0 flex-1 truncate">{i.habit.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {tToday("streak", { days: i.streak })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Button asChild size="lg">
        <Link href="/today">{t("backToToday")}</Link>
      </Button>
    </div>
  );
}

/** Keeps the screen on while a routine is running, where the browser supports it (FR-RMD-2). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [active]);
}

/**
 * Routine mode covers the whole app (docs/spec/07-ux.md §3): drawn on <body> above the tab bar,
 * with the app behind it made inert so focus can't reach it.
 */
function FullScreen({
  children,
  labelledBy,
  onEscape,
}: {
  children: ReactNode;
  labelledBy: string;
  onEscape: () => void;
}) {
  // Only rendered on the client (after the cache is restored), so `document` exists.
  const [host] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  useEffect(() => {
    if (!host) return;
    // Toasts stay reachable: Undo and celebrations show while the routine runs.
    const behind = [...document.body.children].filter(
      (c): c is HTMLElement =>
        c instanceof HTMLElement && !c.inert && !c.hasAttribute("data-react-aria-top-layer"),
    );
    document.body.appendChild(host);
    behind.forEach((c) => (c.inert = true));
    return () => {
      behind.forEach((c) => (c.inert = false));
      host.remove();
    };
  }, [host]);
  if (!host) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) onEscape();
      }}
      className="fixed inset-0 z-50 flex flex-col bg-background pt-safe pr-safe pb-safe pl-safe"
    >
      {children}
    </div>,
    host,
  );
}
