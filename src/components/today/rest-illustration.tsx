import { cn } from "@/lib/utils";

/**
 * A sunrise: the calm "nothing scheduled" picture for Today (FR-TOD-6, docs/spec/07-ux.md
 * §4.1). Drawn with theme tokens, so it adapts to light and dark. Decorative.
 */
export function RestIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
      className={cn("h-28 w-auto", className)}
      fill="none"
      strokeLinecap="round"
    >
      <circle cx="80" cy="62" r="54" className="fill-primary/10" />
      <path d="M52 78a28 28 0 0 1 56 0Z" className="fill-warning" />
      <g strokeWidth="4" className="stroke-warning">
        <path d="M80 42v-8" />
        <path d="M98 46.8l4-6.9" />
        <path d="M62 46.8l-4-6.9" />
        <path d="M111.2 60l6.9-4" />
        <path d="M48.8 60l-6.9-4" />
      </g>
      <path d="M28 78h104" strokeWidth="4" className="stroke-primary" />
      <path d="M44 91h72" strokeWidth="4" className="stroke-primary/40" />
      <path d="M60 103h40" strokeWidth="4" className="stroke-primary/25" />
    </svg>
  );
}
