"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, ListChecks, Plus } from "lucide-react";
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

  const move = (items: Habit[], from: number, to: number) => {
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    arrayMove(items, from, to).forEach((h, index) => {
      if (h.sort_order !== index) save({ table: "habits", row: { ...h, sort_order: index } });
    });
  };
  const onDragEnd = (items: Habit[]) => (event: DragEndEvent) =>
    move(
      items,
      items.findIndex((h) => h.id === event.active.id),
      items.findIndex((h) => h.id === event.over?.id),
    );

  // dnd-kit's screen reader messages, in the user's language.
  const announcements = (items: Habit[]): Announcements => {
    const name = (id: UniqueIdentifier) => items.find((h) => h.id === id)?.name ?? "";
    const at = (id: UniqueIdentifier | undefined) => ({
      position: items.findIndex((h) => h.id === id) + 1,
      total: items.length,
    });
    return {
      onDragStart: ({ active }) => t("list.drag.picked", { name: name(active.id) }),
      onDragOver: ({ active, over }) =>
        over ? t("list.drag.over", { name: name(active.id), ...at(over.id) }) : undefined,
      onDragEnd: ({ active, over }) =>
        over ? t("list.drag.dropped", { name: name(active.id), ...at(over.id) }) : undefined,
      onDragCancel: ({ active }) => t("list.drag.cancelled", { name: name(active.id) }),
    };
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
      <div role="group" aria-label={t("list.filters.label")} className="flex gap-2">
        {(["active", "paused", "archived"] as const).map((f) => (
          <Button
            key={f}
            aria-pressed={filter === f}
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
            accessibility={{
              announcements: announcements(group.items),
              screenReaderInstructions: { draggable: t("list.drag.instructions") },
            }}
          >
            <SortableContext
              items={group.items.map((h) => h.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y">
                {group.items.map((h, index) => (
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
                    // Dragging isn't the only way to reorder (WCAG 2.5.7).
                    onMoveUp={index > 0 ? () => move(group.items, index, index - 1) : undefined}
                    onMoveDown={
                      index < group.items.length - 1
                        ? () => move(group.items, index, index + 1)
                        : undefined
                    }
                    moveUpLabel={t("list.moveUp", { name: h.name })}
                    moveDownLabel={t("list.moveDown", { name: h.name })}
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
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
}: {
  habit: Habit;
  subtitle: string;
  category: string | null;
  sortable: boolean;
  reorderLabel: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moveUpLabel: string;
  moveDownLabel: string;
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
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      <Link
        href={`/habits/${habit.id}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="w-6 text-center text-xl">
          {habit.icon}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="font-medium break-words">{habit.name}</span>
          <span className="text-xs break-words text-muted-foreground">
            {subtitle}
            {category ? ` · ${category}` : ""}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
      </Link>
      {sortable ? (
        <div className="grid shrink-0">
          {(
            [
              [onMoveUp, moveUpLabel, ChevronUp],
              [onMoveDown, moveDownLabel, ChevronDown],
            ] as const
          ).map(([onClick, label, Icon]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              disabled={!onClick}
              onClick={onClick}
              className="flex h-7 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:invisible"
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
