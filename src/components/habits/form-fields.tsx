import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A labelled control with an optional hint and error, wired with aria attributes. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // The control is described by the hint and error below it, on top of any description it has.
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  let control = children;
  if (describedBy.length && isValidElement(children)) {
    const child = children as ReactElement<{ "aria-describedby"?: string }>;
    const own = child.props["aria-describedby"];
    control = cloneElement(child, {
      "aria-describedby": [own, ...describedBy].filter(Boolean).join(" "),
    });
  }
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring md:text-sm dark:bg-input/30";

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
