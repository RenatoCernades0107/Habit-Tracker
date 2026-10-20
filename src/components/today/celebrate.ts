"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import type { Snapshot } from "@/data/snapshot";
import type { CheckIn } from "@/domain/check-in-ops";
import { isFixed, scheduleOn } from "@/domain/schedule";
import { celebrationFor } from "@/domain/stats";

const COLORS = ["var(--primary)", "var(--success)", "var(--warning)", "var(--heat-2)"];

function reducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A short burst of confetti from the top of the screen. Skipped with reduced motion (FR-STK-6). */
function burst() {
  if (reducedMotion() || typeof document === "undefined") return;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.className = "pointer-events-none fixed inset-0 z-[60] overflow-hidden";
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${(i * 37) % 100}%`;
    piece.style.background = COLORS[i % COLORS.length]!;
    piece.style.animationDelay = `${(i % 8) * 40}ms`;
    piece.style.setProperty("--drift", `${((i * 53) % 120) - 60}px`);
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1800);
}

/**
 * Celebrates a check-in before it's saved (FR-STK-4, FR-STK-5): a streak milestone, or a perfect
 * day. `next` is the row as it will be after the change.
 */
export function useCelebrate() {
  const t = useTranslations("stats.celebrate");
  return useCallback(
    (data: Snapshot, today: string, next: CheckIn) => {
      if (next.deleted_at !== null || next.status !== "done") return;
      const habit = data.habits.find((h) => h.id === next.habit_id);
      if (!habit) return;
      const { milestone, perfectDay } = celebrationFor(
        {
          today,
          weekStart: data.profile?.week_start ?? 1,
          habits: data.habits,
          versions: data.versions,
          pauses: data.pauses,
          checkIns: data.checkIns,
        },
        next,
      );
      const weekly = !isFixed(scheduleOn(habit, data.versions, today));
      if (milestone) {
        toast.success(
          t(weekly ? "milestoneWeeks" : "milestone", { days: milestone, name: habit.name }),
        );
      }
      if (perfectDay && next.local_date === today) toast.success(t("perfectDay"));
      if (milestone || (perfectDay && next.local_date === today)) burst();
    },
    [t],
  );
}
