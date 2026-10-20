"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { useData, useSave } from "@/data/hooks";
import { inRange } from "@/domain/dates";
import { dateOfHabitDay } from "@/domain/day";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { useGroupNames, useScheduleSummary } from "./labels";

type Habit = Tables<"habits">;
type Filter = "active" | "paused" | "archived";

/** /habits (docs/spec/07-ux.md §4.3). */
export function HabitList() {
  const t = useTranslations("habits");
  const format = useFormatter();
  const names = useGroupNames();
  const summary = useScheduleSummary();
  const { data, today, isLoading } = useData();
  const save = useSave();
  const [filter, setFilter] = useState<Filter>("active");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return null;

  const habits = data.habits.filter((h) => h.deleted_at === null);
  if (habits.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={t("list.empty.title")}
        description={t("list.empty.description")}
        action={
          <Button asChild size="lg">
            <Link href="/habits/new">
              <Plus aria-hidden="true" />
              {t("list.empty.action")}
            </Link>
          </Button>
        }
      />
    );
  }

  const pauseOf = (h: Habit) =>
    data.pauses.find(
      (p) =>
        p.deleted_at === null &&
        (p.habit_id === h.id || p.habit_id === null) &&
        inRange(today, p.start_date, p.end_date),
    );
  const statusOf = (h: Habit): Filter =>
    h.archived_on !== null ? "archived" : pauseOf(h) ? "paused" : "active";
  const shown = habits.filter((h) => statusOf(h) === filter);
  const routines = data.routines
    .filter((r) => r.deleted_at === null)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const groups = [
    ...routines.map((r) => ({
      key: r.id,
      title: names.routine(r),
      items: shown.filter((h) => h.routine_id === r.id),
    })),
    {
      key: "anytime",
      title: t("anytime"),
      items: shown.filter((h) => !h.routine_id || !routines.some((r) => r.id === h.routine_id)),
    },
  ]
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);

  const onDragEnd = (items: Habit[]) => (event: DragEndEvent) => {
    const from = items.findIndex((h) => h.id === event.active.id);
    const to = items.findIndex((h) => h.id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    arrayMove(items, from, to).forEach((h, index) => {
      if (h.sort_order !== index) save({ table: "habits", row: { ...h, sort_order: index } });
    });
  };

  const note = (h: Habit) => {
    const fmt = (d: string) =>
      format.dateTime(dateOfHabitDay(d), { month: "short", day: "numeric", timeZone: "UTC" });
    if (h.archived_on) return t("list.archivedOn", { date: fmt(h.archived_on) });
    const pause = pauseOf(h);
    if (pause)
      return pause.end_date
        ? t("list.pausedUntil", { date: fmt(pause.end_date) })
        : t("list.pausedOpen");
    return null;
  };

  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label={t("list.filters.label")} className="flex gap-2">
        {(["active", "paused", "archived"] as const).map((f) => (
          <Button
            key={f}
            role="radio"
            aria-checked={filter === f}
            size="sm"
            variant={filter === f ? "secondary" : "ghost"}
            onClick={() => setFilter(f)}
          >
            {t(`list.filters.${f}`)}
          </Button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">{t("list.noneInFilter")}</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="rounded-xl border bg-card px-2 py-2">
          <h2 className="px-2 py-2 text-sm font-semibold">{group.title}</h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd(group.items)}
          >
            <SortableContext
              items={group.items.map((h) => h.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y">
                {group.items.map((h) => (
                  <SortableHabit
                    key={h.id}
                    habit={h}
                    subtitle={note(h) ?? summary(h, data.profile?.week_start ?? 1)}
                    category={
                      h.category_id
                        ? names.category(data.categories.find((c) => c.id === h.category_id))
                        : null
                    }
                    sortable={filter === "active"}
                    reorderLabel={t("list.reorder", { name: h.name })}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </section>
      ))}
    </div>
  );
}

function SortableHabit({
  habit,
  subtitle,
  category,
  sortable,
  reorderLabel,
}: {
  habit: Habit;
  subtitle: string;
  category: string | null;
  sortable: boolean;
  reorderLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: habit.id,
    disabled: !sortable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 bg-card",
        isDragging && "relative z-10 rounded-lg shadow-lg",
      )}
    >
      {sortable ? (
        <button
          type="button"
          aria-label={reorderLabel}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      <Link
        href={`/habits/${habit.id}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="w-6 text-center text-xl">
          {habit.icon}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{habit.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {subtitle}
            {category ? ` · ${category}` : ""}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}
