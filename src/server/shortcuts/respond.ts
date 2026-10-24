import "server-only";

import type { IsoDate } from "@/domain/dates";
import { buildDayView, type DayItem, type DayView } from "@/domain/day-view";
import type { NotifyData, NotifyRoutine } from "@/domain/notifications";
import { isFixed } from "@/domain/schedule";
import { celebrationFor } from "@/domain/stats";
import type { CheckInRow } from "@/domain/types";

import { listOf, type ShortcutsT } from "./i18n";

export type Speaker = { t: ShortcutsT; locale: string };

export function dayViewOf(data: NotifyData, date: IsoDate, today: IsoDate): DayView {
  return buildDayView({
    date,
    today,
    weekStart: data.profile.week_start,
    habits: data.habits.filter((h) => h.deleted_at === null),
    versions: data.versions,
    pauses: data.pauses,
    checkIns: data.checkIns,
    routines: data.routines,
  });
}

export function routineName(
  r: Pick<NotifyRoutine, "name" | "system_key"> | null | undefined,
  t: ShortcutsT,
) {
  if (!r) return null;
  if (r.name) return r.name;
  return r.system_key === "evening" ? t("routines.evening") : t("routines.morning");
}

const open = (i: DayItem) => i.state === "pending" || i.state === "partial";

/** Items still to do: fixed ones pending, and weekly ones short of their target and not done today. */
export function pendingItems(view: DayView): DayItem[] {
  return [
    ...view.sections.flatMap((s) => s.items).filter(open),
    ...view.weekly.filter((w) => w.state !== "done" && w.weekDone < w.weekTarget),
  ];
}

function numberText(v: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
}

function itemJson(i: DayItem, routine: string | null) {
  const measurable = i.schedule.kind === "measurable";
  return {
    id: i.habit.id,
    name: i.habit.name,
    routine,
    kind: i.schedule.kind,
    state: i.state,
    value: measurable ? (i.checkIn?.value ?? 0) : null,
    target: measurable ? i.schedule.target : null,
    streak: i.streak,
  };
}

/** GET /api/v1/today (docs/spec/05-api.md §2). */
export function todayBody(
  data: NotifyData,
  today: IsoDate,
  { include, routine }: { include: "pending" | "all"; routine: string | null },
  { t, locale }: Speaker,
) {
  const view = dayViewOf(data, today, today);
  const routineOf = (i: DayItem) => data.routines.find((r) => r.id === i.habit.routine_id) ?? null;
  const wanted = (i: DayItem) => {
    if (!routine) return true;
    const r = routineOf(i);
    return !!r && (r.id === routine || r.system_key === routine);
  };
  const pending = pendingItems(view).filter(wanted);
  const all = [...view.sections.flatMap((s) => s.items), ...view.weekly].filter(wanted);
  const shown = include === "all" ? all : pending;

  const choices: Record<string, string> = {};
  for (const i of shown) {
    const r = routineName(routineOf(i), t);
    const progress =
      i.schedule.kind === "measurable"
        ? ` (${numberText(i.checkIn?.value ?? 0, locale)}/${numberText(i.schedule.target ?? 0, locale)})`
        : "";
    let label = `${i.habit.icon ? `${i.habit.icon} ` : ""}${i.habit.name}${progress}${r ? ` · ${r}` : ""}`;
    // Choose from List shows keys, so they must be unique.
    for (let n = 2; label in choices; n++) label = `${label} (${n})`;
    choices[label] = i.habit.id;
  }

  const speech =
    view.total === 0 && view.weekly.length === 0
      ? t("speech.restDay")
      : t("speech.left", {
          count: pending.length,
          list: listOf(
            pending.map((i) => i.habit.name),
            locale,
          ),
        });
  return {
    date: today,
    score: view.score === null ? null : Math.round(view.score * 100),
    pending_count: pending.length,
    choices,
    items: shown.map((i) => itemJson(i, routineName(routineOf(i), t))),
    speech,
  };
}

/** GET /api/v1/summary. */
export function summaryBody(data: NotifyData, today: IsoDate, { t, locale }: Speaker) {
  const view = dayViewOf(data, today, today);
  const fixedOpen = view.sections.flatMap((s) => s.items).filter(open);
  const score = view.score === null ? null : Math.round(view.score * 100);
  const weekly = view.weekly.map((w) => ({
    name: w.habit.name,
    done: w.weekDone,
    target: w.weekTarget,
  }));
  const parts: string[] = [];
  if (view.total === 0 && weekly.length === 0) parts.push(t("speech.restDay"));
  else {
    if (score !== null) parts.push(t("speech.summary", { score }));
    parts.push(
      fixedOpen.length
        ? t("speech.summaryLeft", {
            list: listOf(
              fixedOpen.map((i) => i.habit.name),
              locale,
            ),
          })
        : t("speech.summaryDone"),
    );
    for (const w of weekly.filter((w) => w.done < w.target)) parts.push(t("speech.weekly", w));
  }
  return {
    date: today,
    score,
    done: view.done,
    total: view.total,
    pending: fixedOpen.map((i) => i.habit.name),
    weekly,
    best_streak: view.bestStreak
      ? { name: view.bestStreak.habit.name, days: view.bestStreak.days }
      : null,
    speech: parts.join(" "),
  };
}

/**
 * The reply to a check-in (POST /api/v1/check-ins): what changed, the streak, a milestone, and
 * what's left. `before` is the data before the change; `row` is the check-in the server stored.
 */
export function checkInBody(
  before: NotifyData,
  row: CheckInRow & { local_date: string },
  today: IsoDate,
  { t, locale }: Speaker,
) {
  const after: NotifyData = {
    ...before,
    checkIns: [
      ...before.checkIns.filter(
        (c) => !(c.habit_id === row.habit_id && c.local_date === row.local_date),
      ),
      row,
    ],
  };
  const view = dayViewOf(after, row.local_date, today);
  const item = [...view.sections.flatMap((s) => s.items), ...view.weekly].find(
    (i) => i.habit.id === row.habit_id,
  );
  const habit = before.habits.find((h) => h.id === row.habit_id);
  const name = habit?.name ?? "";
  const { milestone } =
    row.local_date === today
      ? celebrationFor(
          {
            today,
            weekStart: before.profile.week_start,
            habits: before.habits,
            versions: before.versions,
            pauses: before.pauses,
            checkIns: before.checkIns,
          },
          row,
        )
      : { milestone: null };

  const parts: string[] = [];
  const state = item?.state ?? (row.status === "done" ? "done" : row.status);
  const measurable = item?.schedule.kind === "measurable";
  if (row.status === "skipped") parts.push(t("speech.skipped", { name }));
  else if (measurable && item) {
    parts.push(
      t(state === "done" ? "speech.progressDone" : "speech.progress", {
        name,
        value: numberText(row.value ?? 0, locale),
        target: numberText(item.schedule.target ?? 0, locale),
        unit: habit?.unit ?? "",
      })
        .replace(/ \./, ".")
        .replace(/  /g, " "),
    );
  } else parts.push(t("speech.done", { name }));

  const streak = item?.streak ?? 0;
  if (state === "done") {
    if (milestone) parts.push(t("speech.milestone", { count: milestone }));
    else if (streak > 1) {
      const weekly = item ? !isFixed(item.schedule) : false;
      parts.push(t(weekly ? "speech.streakWeeks" : "speech.streakDays", { count: streak }));
    }
  }

  const left = pendingItems(view);
  const routineId = habit?.routine_id ?? null;
  const routineLeft = routineId ? left.filter((i) => i.habit.routine_id === routineId) : [];
  const perfect =
    row.local_date === today && view.total > 0 && view.done === view.total && left.length === 0;
  if (perfect) parts.push(t("speech.perfect"));
  else if (row.local_date === today) {
    const routine = before.routines.find((r) => r.id === routineId);
    if (routineLeft.length && routine) {
      parts.push(
        t("speech.routineLeft", {
          count: routineLeft.length,
          routine: routineName(routine, t) ?? "",
        }),
      );
    } else if (left.length) parts.push(t("speech.dayLeft", { count: left.length }));
  }

  return {
    check_in: {
      habit_id: row.habit_id,
      date: row.local_date,
      state,
      value: row.value,
      source: row.source,
    },
    habit: { name, streak, milestone },
    day: {
      score: view.score === null ? null : Math.round(view.score * 100),
      pending_count: left.length,
      routine_pending: routineLeft.length,
    },
    speech: parts.join(" "),
  };
}
