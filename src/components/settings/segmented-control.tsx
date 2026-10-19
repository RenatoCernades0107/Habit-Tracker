import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Language of the label, e.g. "es" for "Español" in the English UI. */
  lang?: string;
};

/**
 * A row of toggle buttons where one is pressed (`aria-pressed`), labelled by a heading.
 * Plain buttons keep it simple: each is a tab stop, Space and Enter choose.
 * `value` may be undefined while the current choice isn't known yet (before hydration):
 * nothing is pressed, and the layout is the same.
 */
export function SegmentedControl<T extends string>({
  labelledBy,
  options,
  value,
  onChange,
  busy = false,
  className,
}: {
  labelledBy: string;
  options: readonly SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-1 rounded-lg border bg-muted p-1",
        className,
      )}
    >
      {options.map(({ value: optionValue, label, icon: Icon, lang }) => (
        <button
          key={optionValue}
          type="button"
          lang={lang}
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
          className={cn(
            "inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-2 text-center text-sm leading-tight font-medium text-muted-foreground transition-colors outline-none",
            "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input/50",
          )}
        >
          {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
          <span className="min-w-0 break-words">{label}</span>
        </button>
      ))}
    </div>
  );
}
