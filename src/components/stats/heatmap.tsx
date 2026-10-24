"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState } from "react";

import { useDayFormat } from "@/components/habits/labels";
import { addDays, diffDays, isoWeekday, weekStartOf, type IsoDate } from "@/domain/dates";
import { cn } from "@/lib/utils";

export type HeatDay = { date: IsoDate; score: number | null };

const CELL = 12;
const GAP = 2;
const STEP = CELL + GAP;
const LEFT = 28;
const TOP = 16;

/** Five steps of one hue (sequential): 0 = nothing done … 4 = all done. */
export function heatLevel(score: number | null): 0 | 1 | 2 | 3 | 4 | null {
  if (score === null) return null;
  if (score >= 1) return 4;
  if (score >= 2 / 3) return 3;
  if (score >= 1 / 3) return 2;
  if (score > 0) return 1;
  return 0;
}

const LEVEL_FILL = ["fill-heat-0", "fill-heat-1", "fill-heat-2", "fill-heat-3", "fill-heat-4"];
const LEVEL_BG = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"];

/**
 * A calendar heatmap: one column per week, one row per weekday (FR-STA-1, FR-STA-2).
 * Days with nothing due are outlined, not filled. Hover or tap a day for its value.
 */
export function Heatmap({
  days,
  weekStart,
  formatValue,
}: {
  days: readonly HeatDay[];
  weekStart: number;
  /** Tooltip text for a day with a value. */
  formatValue: (day: HeatDay) => string;
}) {
  const t = useTranslations("stats");
  const label = useDayFormat();
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ day: HeatDay; x: number; y: number } | null>(null);

  // Show the most recent weeks first on narrow screens.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);

  const first = days[0];
  if (!first) return null;
  const origin = weekStartOf(first.date, weekStart);
  const last = days[days.length - 1]!;
  const columns = Math.floor(diffDays(last.date, origin) / 7) + 1;
  const width = LEFT + columns * STEP;
  const height = TOP + 7 * STEP;
  const row = (d: IsoDate) => (isoWeekday(d) - weekStart + 7) % 7;
  const col = (d: IsoDate) => Math.floor(diffDays(d, origin) / 7);

  const months: { x: number; text: string }[] = [];
  for (let c = 0; c < columns; c++) {
    const start = addDays(origin, c * 7);
    const prev = addDays(start, -7);
    if (
      c === 0 ? columns > 4 && Number(start.slice(8)) <= 7 : start.slice(5, 7) !== prev.slice(5, 7)
    ) {
      months.push({ x: LEFT + c * STEP, text: label(start, { month: "short" }) });
    }
  }

  return (
    <div className="grid gap-2">
      <div
        ref={scroller}
        className="relative overflow-x-auto"
        onPointerLeave={() => setHover(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className="block"
        >
          {months.map((m) => (
            <text key={m.x} x={m.x} y={10} className="fill-muted-foreground text-[10px]">
              {m.text}
            </text>
          ))}
          {[0, 2, 4, 6].map((r) => (
            <text
              key={r}
              x={0}
              y={TOP + r * STEP + CELL - 2}
              className="fill-muted-foreground text-[10px]"
            >
              {label(addDays(origin, r), { weekday: "narrow" })}
            </text>
          ))}
          {days.map((day) => {
            const level = heatLevel(day.score);
            const x = LEFT + col(day.date) * STEP;
            const y = TOP + row(day.date) * STEP;
            return (
              <rect
                key={day.date}
                x={x + 0.5}
                y={y + 0.5}
                width={CELL - 1}
                height={CELL - 1}
                rx={2}
                className={cn(
                  level === null
                    ? "fill-transparent stroke-border"
                    : cn(LEVEL_FILL[level], "stroke-transparent"),
                  hover?.day.date === day.date && "stroke-foreground",
                )}
                strokeWidth={1}
                onPointerEnter={() => setHover({ day, x, y })}
                onClick={() => setHover({ day, x, y })}
              />
            );
          })}
        </svg>
        {hover ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
            style={{
              left: Math.min(Math.max(hover.x - 40, 0), width - 120),
              top: hover.y + CELL + 6,
            }}
          >
            {hover.day.score === null
              ? t("heatmap.cellRest", { date: label(hover.day.date, { dateStyle: "medium" }) })
              : t("heatmap.cell", {
                  date: label(hover.day.date, { dateStyle: "medium" }),
                  score: formatValue(hover.day),
                })}
          </div>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        <span className="flex items-center gap-1">
          {t("heatmap.less")}
          {LEVEL_BG.map((bg) => (
            <span key={bg} className={cn("size-3 rounded-[2px]", bg)} />
          ))}
          {t("heatmap.more")}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-[2px] border" />
          {t("heatmap.rest")}
        </span>
      </div>
    </div>
  );
}
