import { describe, expect, it } from "vitest";

import { applyOpLocally, type CheckIn } from "@/domain/check-in-ops";
import type { Schedule } from "@/domain/schedule";
import type { Tables } from "@/lib/supabase/database.types";

import { overlay } from "./overlay";
import {
  cursorWithOverlap,
  EMPTY_SNAPSHOT,
  mergeRows,
  nextCursor,
  rowKey,
  type Snapshot,
} from "./snapshot";

const NOW = "2026-10-20T15:00:00.000Z";
const boolean: Schedule = {
  type: "daily",
  daysOfWeek: null,
  timesPerWeek: null,
  kind: "boolean",
  target: null,
};
const water: Schedule = {
  type: "daily",
  daysOfWeek: null,
  timesPerWeek: null,
  kind: "measurable",
  target: 8,
};

function op(over: Partial<Parameters<typeof applyOpLocally>[0]>) {
  return applyOpLocally({
    op: "complete",
    payload: {},
    current: undefined,
    schedule: boolean,
    incrementStep: 1,
    userId: "u",
    habitId: "h",
    date: "2026-10-20",
    source: "app",
    now: NOW,
    ...over,
  });
}

describe("applyOpLocally (mirrors apply_check_in_op)", () => {
  it("completes boolean and measurable habits", () => {
    expect(op({})).toMatchObject({ status: "done", value: null, deleted_at: null });
    expect(op({ schedule: water })).toMatchObject({ status: "done", value: 8 });
  });

  it("increments toward the target, then done", () => {
    const one = op({ op: "increment", schedule: water });
    expect(one).toMatchObject({ status: "partial", value: 1 });
    expect(
      op({ op: "increment", schedule: water, current: one, payload: { amount: 7 } }),
    ).toMatchObject({
      status: "done",
      value: 8,
    });
  });

  it("clears with a value of 0 and on clear", () => {
    expect(op({ op: "set_value", schedule: water, payload: { value: 0 } }).deleted_at).toBe(NOW);
    expect(op({ op: "clear", current: op({}) }).deleted_at).toBe(NOW);
  });

  it("skips with a reason", () => {
    expect(op({ op: "skip", payload: { reason: "sick" } })).toMatchObject({
      status: "skipped",
      skip_reason: "sick",
    });
  });
});

describe("snapshot merging", () => {
  type Row = { id: string; updated_at: string; v: number };
  it("keeps the newer row", () => {
    const a: Row[] = [{ id: "1", updated_at: "2026-10-20T10:00:00Z", v: 1 }];
    expect(
      mergeRows(a, [{ id: "1", updated_at: "2026-10-20T09:00:00Z", v: 0 }], (r) => r.id)[0]?.v,
    ).toBe(1);
    expect(
      mergeRows(a, [{ id: "1", updated_at: "2026-10-20T11:00:00Z", v: 2 }], (r) => r.id)[0]?.v,
    ).toBe(2);
    expect(
      mergeRows(a, [{ id: "2", updated_at: "2026-10-20T11:00:00Z", v: 3 }], (r) => r.id),
    ).toHaveLength(2);
  });

  it("tracks cursors with an overlap", () => {
    expect(nextCursor(undefined, [{ updated_at: "b" }, { updated_at: "a" }])).toBe("b");
    expect(cursorWithOverlap("2026-10-20T10:02:00.000Z")).toBe("2026-10-20T10:00:00.000Z");
    expect(cursorWithOverlap(undefined)).toBeUndefined();
  });
});

describe("overlay of pending changes", () => {
  const habit = {
    id: "h",
    kind: "measurable",
    target_value: 8,
    increment_step: 1,
    schedule_type: "daily",
    days_of_week: null,
    times_per_week: null,
  } as unknown as Tables<"habits">;
  const base: Snapshot = { ...EMPTY_SNAPSHOT, habits: [habit] };

  it("replays check-ins in order and undo restores the earlier row", () => {
    const first = {
      kind: "checkin" as const,
      opId: "1",
      habitId: "h",
      date: "2026-10-20",
      op: "increment" as const,
      payload: {},
      source: "app" as const,
      prev: undefined,
    };
    const second = { ...first, opId: "2", payload: { amount: 2 } };
    const after = overlay(base, [first, second], NOW);
    expect(after.checkIns.find((c) => rowKey.check_ins(c) === "h|2026-10-20")?.value).toBe(3);

    const shown = overlay(base, [first], NOW).checkIns[0] as CheckIn;
    const undone = overlay(
      base,
      [
        first,
        second,
        { kind: "undo", opId: "2", habitId: "h", date: "2026-10-20", restore: shown },
      ],
      NOW,
    );
    expect(undone.checkIns[0]?.value).toBe(1);
  });

  it("applies upserts without touching the server snapshot", () => {
    const renamed = { ...habit, name: "Water" };
    const next = overlay(base, [{ kind: "upsert", table: "habits", row: renamed }], NOW);
    expect(next.habits[0]?.name).toBe("Water");
    expect(base.habits[0]?.name).toBeUndefined();
  });
});
