import type { Tables } from "@/lib/supabase/database.types";

// The domain works on database rows (as synced to the device), picking only what it needs.

export type HabitRow = Pick<
  Tables<"habits">,
  | "id"
  | "name"
  | "icon"
  | "color"
  | "cue"
  | "kind"
  | "target_value"
  | "unit"
  | "increment_step"
  | "schedule_type"
  | "days_of_week"
  | "times_per_week"
  | "time_of_day"
  | "routine_id"
  | "category_id"
  | "sort_order"
  | "start_date"
  | "archived_on"
  | "deleted_at"
>;

export type HabitVersionRow = Pick<
  Tables<"habit_versions">,
  | "habit_id"
  | "valid_from"
  | "schedule_type"
  | "days_of_week"
  | "times_per_week"
  | "kind"
  | "target_value"
>;

export type PauseRow = Pick<
  Tables<"pauses">,
  "id" | "habit_id" | "start_date" | "end_date" | "deleted_at"
>;

export type CheckInRow = Pick<
  Tables<"check_ins">,
  "habit_id" | "local_date" | "status" | "value" | "skip_reason" | "note" | "source" | "deleted_at"
>;

export type RoutineRow = Pick<
  Tables<"routines">,
  "id" | "system_key" | "name" | "icon" | "start_time" | "sort_order" | "deleted_at"
>;
