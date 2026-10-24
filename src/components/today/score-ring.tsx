import { cn } from "@/lib/utils";

/** The daily score as a ring (FR-TOD-1). `value` is 0…1, or null on a rest day. */
export function ScoreRing({
  value,
  label,
  className,
}: {
  value: number | null;
  /** Text inside the ring, e.g. "56%". */
  label: string;
  className?: string;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = value === null ? 0 : Math.max(0, Math.min(1, value)) * circumference;

  return (
    // Sized in em so the ring grows with the text inside it.
    <div className={cn("relative size-[4.5em] shrink-0 text-sm", className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={cn(
            "transition-[stroke-dasharray] duration-300 ease-out",
            value === 1 ? "stroke-success" : "stroke-primary",
          )}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums">
        {label}
      </span>
    </div>
  );
}
