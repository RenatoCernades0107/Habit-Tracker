import type { ComponentProps } from "react";

import { MARK_ARROW_ROUNDING, MARK_GRID, MARK_PATHS, MARK_STROKE } from "@/lib/pwa/brand";
import { cn } from "@/lib/utils";

/**
 * The Restart mark (restart arrow around a check) drawn in `currentColor`, the same
 * geometry as the app icons. Decorative by default; pass `aria-label` (and drop
 * `aria-hidden`) where it is the only content.
 */
export function BrandMark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-6 shrink-0", className)}
      {...props}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={MARK_PATHS.ring} strokeWidth={MARK_STROKE} />
        <path d={MARK_PATHS.arrow} fill="currentColor" strokeWidth={MARK_ARROW_ROUNDING} />
        <path d={MARK_PATHS.check} strokeWidth={MARK_STROKE} />
      </g>
    </svg>
  );
}
