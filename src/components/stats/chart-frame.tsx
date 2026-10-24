"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A chart card: title, a text summary, and a table view of the same numbers
 * (docs/spec/07-ux.md §4.6: "Every chart has a text summary and a table view").
 */
export function ChartFrame({
  title,
  summary,
  columns,
  rows,
  children,
  className,
}: {
  title: string;
  summary?: ReactNode;
  columns: [string, string];
  rows: readonly (readonly [string, string])[];
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("stats");
  const headingId = useId();
  const [table, setTable] = useState(false);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("grid min-w-0 gap-3 rounded-xl border bg-card p-4", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 id={headingId} className="text-sm font-semibold">
            {title}
          </h2>
          {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
        </div>
        {rows.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mt-1 -mr-2 text-xs"
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
          >
            {t("heatmap.table")}
          </Button>
        ) : null}
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {columns[0]}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {columns[1]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(([label, value], i) => (
                <tr key={i}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {label}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** A card with a heading that names it as a region, for lists next to the charts. */
export function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("grid content-start gap-2 rounded-xl border bg-card p-4", className)}
    >
      <div>
        <h2 id={headingId} className="text-sm font-semibold">
          {title}
        </h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
