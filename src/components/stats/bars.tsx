"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type Bar = {
  key: string;
  /** 0…max, or null for no data. */
  value: number | null;
  /** Short axis label; shown for every `labelEvery`-th bar. */
  label: string;
  /** Tooltip text. */
  tooltip: string;
};

/**
 * Vertical bars from a zero baseline: thin, rounded at the data end, with a recessive grid
 * (dataviz mark specs). An optional dashed reference line marks a target.
 */
export function Bars({
  bars,
  max = 1,
  target,
  gridLabels,
  labelEvery = 1,
  className,
}: {
  bars: readonly Bar[];
  max?: number;
  target?: number | null;
  /** Labels for the 0, ½ and full grid lines. */
  gridLabels: [string, string, string];
  labelEvery?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const scale = (v: number) => `${Math.min(1, Math.max(0, v / max)) * 100}%`;

  return (
    <div className={cn("grid grid-cols-[auto_1fr] gap-x-2", className)} aria-hidden="true">
      <div className="relative h-32 w-8 text-right text-[10px] text-muted-foreground">
        {gridLabels.map((text, i) => (
          <span
            key={i}
            className="absolute right-0 leading-none tabular-nums"
            style={{ bottom: `${i * 50}%`, transform: "translateY(50%)" }}
          >
            {text}
          </span>
        ))}
      </div>
      <div className="relative h-32" onPointerLeave={() => setHover(null)}>
        {[0, 50, 100].map((p) => (
          <div
            key={p}
            className={cn(
              "absolute inset-x-0 border-t",
              p === 0 ? "border-border" : "border-border/50",
            )}
            style={{ bottom: `${p}%` }}
          />
        ))}
        {target != null && target > 0 ? (
          <div
            className="absolute inset-x-0 border-t-2 border-dashed border-foreground/50"
            style={{ bottom: scale(target) }}
          />
        ) : null}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {bars.map((bar, i) => (
            <div
              key={bar.key}
              className="relative flex h-full min-w-0 flex-1 items-end justify-center"
              onPointerEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            >
              {bar.value !== null && bar.value > 0 ? (
                <div
                  className={cn(
                    "w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity",
                    hover !== null && hover !== i && "opacity-60",
                  )}
                  style={{ height: scale(bar.value) }}
                />
              ) : null}
              {hover === i ? (
                <div
                  role="status"
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md",
                    i < bars.length / 2 ? "left-0" : "right-0",
                  )}
                >
                  {bar.tooltip}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div />
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {bars.map((bar, i) => (
          <span key={bar.key} className="min-w-0 flex-1 truncate text-center">
            {i % labelEvery === 0 ? bar.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A horizontal meter for a rate, e.g. one weekday or one routine (FR-STA-3, FR-STA-5). */
export function RateBar({ value }: { value: number | null }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted" aria-hidden="true">
      {value ? (
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(1, value) * 100}%` }}
        />
      ) : null}
    </div>
  );
}
