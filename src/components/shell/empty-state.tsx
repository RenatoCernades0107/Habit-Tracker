import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  /** A lucide icon in a soft circle, or pass `illustration` for something larger. */
  icon?: LucideIcon;
  illustration?: React.ReactNode;
  /** One clear action (docs/spec/07-ux.md §2: "Empty states with one clear action"). */
  action?: React.ReactNode;
  /** 1 when the empty state is the whole page (not found, errors), otherwise 2. */
  headingLevel?: 1 | 2;
  className?: string;
};

/** Centered icon, title, short text and an optional action. Works in both themes. */
export function EmptyState({
  title,
  description,
  icon: Icon,
  illustration,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center sm:py-12",
        className,
      )}
    >
      {illustration ??
        (Icon ? (
          <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-8" />
          </span>
        ) : null)}
      <div className="grid max-w-sm gap-2">
        <Heading
          className={cn(
            "font-semibold tracking-tight text-balance",
            headingLevel === 1 ? "text-2xl" : "text-lg",
          )}
        >
          {title}
        </Heading>
        <p className="text-pretty text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-3 pt-2">{action}</div> : null}
    </div>
  );
}
