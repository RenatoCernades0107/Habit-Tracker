import { describe, expect, it, vi } from "vitest";

import type { AdminClient } from "@/server/push/subscriptions";
import { FakeSupabase } from "@/server/push/testing/fake-supabase";

import { planDueUsers } from "./planner";

vi.mock("server-only", () => ({}));

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-20T10:00:00Z"); // 05:00 in Lima

const profile = {
  id: USER,
  locale: "en",
  timezone: "America/Lima",
  day_start_hour: 4,
  week_start: 1,
  reminder_lead_min: 5,
  daily_report_enabled: true,
  daily_report_time: "22:00:00",
  weekly_review_enabled: false,
  weekly_review_dow: 7,
  weekly_review_time: "19:00:00",
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_until: null,
};
const habit = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: USER,
  name: "Meditate",
  icon: null,
  color: null,
  cue: null,
  kind: "boolean",
  target_value: null,
  unit: null,
  increment_step: 1,
  schedule_type: "daily",
  days_of_week: null,
  times_per_week: null,
  time_of_day: "07:00:00",
  routine_id: null,
  category_id: null,
  sort_order: 0,
  start_date: "2026-10-01",
  archived_on: null,
  deleted_at: null,
  reminder_enabled: true,
  reminder_lead_min: null,
};

describe("planDueUsers", () => {
  it("replaces the plan of claimed users with today and tomorrow", async () => {
    const plans: Record<string, unknown>[] = [];
    const db = new FakeSupabase()
      .onRpc("srv_claim_profiles_to_plan", () => [{ user_id: USER, today: "2026-10-20" }])
      .onRpc("srv_replace_plan", (args) => {
        plans.push(args);
        return 4;
      });
    db.seed("profiles", [profile]);
    db.seed("habits", [habit]);

    expect(await planDueUsers(db as unknown as AdminClient, NOW)).toBe(1);
    expect(plans[0]).toMatchObject({
      p_user_id: USER,
      p_from: "2026-10-20",
      p_through: "2026-10-21",
    });
    const keys = (plans[0]?.p_rows as { dedupe_key: string }[]).map((r) => r.dedupe_key);
    expect(keys).toEqual([
      `habit_reminder:${habit.id}:2026-10-20`,
      `daily_report:${USER}:2026-10-20`,
      `habit_reminder:${habit.id}:2026-10-21`,
      `daily_report:${USER}:2026-10-21`,
    ]);
  });

  it("does nothing when no plan is out of date", async () => {
    const db = new FakeSupabase().onRpc("srv_claim_profiles_to_plan", () => []);
    expect(await planDueUsers(db as unknown as AdminClient, NOW)).toBe(0);
    expect(db.rpcCalls).toHaveLength(1);
  });
});

describe("dedupe keys", () => {
  it("never collide between users", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const plans: Record<string, unknown>[] = [];
    const db = new FakeSupabase()
      .onRpc("srv_claim_profiles_to_plan", () => [
        { user_id: USER, today: "2026-10-20" },
        { user_id: OTHER, today: "2026-10-20" },
      ])
      .onRpc("srv_replace_plan", (args) => {
        plans.push(args);
        return 0;
      });
    db.seed("profiles", [profile, { ...profile, id: OTHER }]);

    await planDueUsers(db as unknown as AdminClient, NOW);
    const keys = plans.flatMap((p) =>
      (p.p_rows as { dedupe_key: string }[]).map((r) => r.dedupe_key),
    );
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
  });
});
