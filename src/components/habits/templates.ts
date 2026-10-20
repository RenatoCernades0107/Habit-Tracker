import type { Tables } from "@/lib/supabase/database.types";

export type TemplateKey =
  "water" | "walk" | "meditate" | "read" | "workout" | "journal" | "sleep" | "stretch";

type TemplateFields = Partial<
  Pick<
    Tables<"habits">,
    | "icon"
    | "kind"
    | "target_value"
    | "increment_step"
    | "schedule_type"
    | "times_per_week"
    | "duration_min"
  >
> & {
  routine?: "morning" | "evening";
  category: "health" | "fitness" | "mind" | "learning" | "productivity" | "home";
  /** The unit is translated (messages habits.templates.<key>.unit). */
  hasUnit?: boolean;
};

/** FR-HAB-2: pre-filled habits. Names and units come from the current language. */
export const TEMPLATES: Record<TemplateKey, TemplateFields> = {
  water: {
    icon: "💧",
    kind: "measurable",
    target_value: 8,
    increment_step: 1,
    category: "health",
    hasUnit: true,
  },
  walk: {
    icon: "🚶",
    kind: "measurable",
    target_value: 5000,
    increment_step: 1000,
    category: "fitness",
    hasUnit: true,
  },
  meditate: {
    icon: "🧘",
    kind: "measurable",
    target_value: 10,
    increment_step: 5,
    routine: "morning",
    category: "mind",
    hasUnit: true,
    duration_min: 10,
  },
  read: {
    icon: "📖",
    kind: "measurable",
    target_value: 20,
    increment_step: 5,
    routine: "evening",
    category: "learning",
    hasUnit: true,
  },
  workout: { icon: "🏋️", schedule_type: "times_per_week", times_per_week: 4, category: "fitness" },
  journal: { icon: "✍️", routine: "evening", category: "mind" },
  sleep: { icon: "😴", routine: "evening", category: "health" },
  stretch: { icon: "🤸", routine: "morning", category: "fitness", duration_min: 5 },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
