import { cn } from "@/lib/utils";

/** The page's single h1, with an optional small line above it. */
export function PageHeader({
  title,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("grid gap-1", className)}>
      {eyebrow ? <p className="text-sm font-medium text-primary">{eyebrow}</p> : null}
      {/* first-letter: Spanish dates start lowercase ("lunes, 19 de octubre"). */}
      <h1 className="text-2xl font-semibold tracking-tight text-balance first-letter:uppercase sm:text-3xl">
        {title}
      </h1>
    </header>
  );
}
