"use client";

import { AlertTriangle, Check, CircleSlash, Flame, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { useTimeFormat } from "@/components/habits/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DayItem } from "@/domain/day-view";
import { cn } from "@/lib/utils";

type Props = {
  item: DayItem;
  /** Shown instead of the streak for flexible habits: "2 of 4 this week". */
  weekLabel?: string;
  onTap: () => void;
  onMore: () => void;
};

const STATE_ICON = {
  done: Check,
  skipped: CircleSlash,
} as const;

/** One habit on Today (docs/spec/07-ux.md §4.1). Tap = done / +step; "…" = more. */
export function CheckInRow({ item, weekLabel, onTap, onMore }: Props) {
  const t = useTranslations("today");
  const tShortcuts = useTranslations("shortcuts");
  const time = useTimeFormat();
  const { habit, state, schedule, checkIn } = item;
  const measurable = schedule.kind === "measurable";
  const done = state === "done";
  // FR-HLT-4: the synced row carries health_verified; the domain type doesn't name it.
  const verified =
    done && !!checkIn && "health_verified" in checkIn && checkIn.health_verified === true;
  const tapLabel =
    measurable && !done
      ? t("row.add", { step: habit.increment_step, name: habit.name })
      : done
        ? t("row.clear", { name: habit.name })
        : t("row.complete", { name: habit.name });

  const StateIcon = done
    ? STATE_ICON.done
    : state === "skipped"
      ? STATE_ICON.skipped
      : measurable
        ? Plus
        : null;

  return (
    <li className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onTap}
        aria-label={tapLabel}
        aria-pressed={!measurable ? done : undefined}
        className={cn(
          "relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          done && "border-success bg-success text-success-foreground",
          state === "skipped" && "border-dashed border-muted-foreground/50 text-muted-foreground",
          state === "partial" && "border-warning text-foreground",
          (state === "pending" || state === "missed") &&
            "border-border hover:border-primary hover:text-primary",
        )}
      >
        {measurable && state !== "done" && state !== "skipped" ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-warning/30"
            style={{ clipPath: `inset(${100 - item.progress * 100}% 0 0 0)` }}
          />
        ) : null}
        {StateIcon ? <StateIcon aria-hidden="true" className="relative size-5" /> : null}
        {habit.icon && !StateIcon ? (
          <span aria-hidden="true" className="text-lg">
            {habit.icon}
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", done && "text-muted-foreground")}>
          {habit.icon && StateIcon ? (
            <span aria-hidden="true" className="mr-1.5">
              {habit.icon}
            </span>
          ) : null}
          {habit.name}
          <span className="sr-only">, {t(`state.${state}`)}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {item.time ? <span>{time(item.time)}</span> : null}
          {measurable ? (
            <span className="tabular-nums">
              {t("progress", {
                value: checkIn?.status === "skipped" ? 0 : (checkIn?.value ?? 0),
                target: schedule.target ?? 0,
                unit: habit.unit ?? "",
              })}
            </span>
          ) : null}
          {state === "skipped" && checkIn?.skip_reason ? (
            <span>{t("skippedBecause", { reason: t(`reasons.${checkIn.skip_reason}`) })}</span>
          ) : null}
          {weekLabel ? <span>{weekLabel}</span> : null}
          {!weekLabel && item.streak > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <Flame aria-hidden="true" className="size-3 text-warning" />
              {t("streak", { days: item.streak })}
            </span>
          ) : null}
          {verified ? (
            <Badge variant="secondary" className="gap-1">
              <span aria-hidden="true">🩺</span>
              {tShortcuts("health.verified")}
            </Badge>
          ) : null}
          {item.attention && !done ? (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle aria-hidden="true" />
              {t(weekLabel ? "attention.weekly" : "attention.fixed")}
            </Badge>
          ) : null}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onMore}
        aria-label={t("row.more", { name: habit.name })}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>
    </li>
  );
}
