import { describe, expect, it, vi } from "vitest";

import type { NotifyData, NotifyHabit, NotifyProfile, NotifyRoutine } from "@/domain/notifications";
import type { CheckInRow } from "@/domain/types";

import { shortcutsT } from "./i18n";
import { decideMatch } from "./match";
import { checkInBody, summaryBody, todayBody } from "./respond";

vi.mock("server-only", () => ({}));

const TODAY = "2026-10-20";
const profile: NotifyProfile = {
  timezone: "America/Lima",
  day_start_hour: 4,
  week_start: 1,
  reminder_lead_min: 5,
  daily_report_enabled: true,
  daily_report_time: "22:00:00",
  weekly_review_enabled: true,
  weekly_review_dow: 7,
  weekly_review_time: "19:00:00",
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_until: null,
};
const morning: NotifyRoutine = {
  id: "r1",
  system_key: "morning",
  name: null,
  icon: null,
  start_time: "07:00:00",
  sort_order: 0,
  deleted_at: null,
  digest_enabled: true,
};
let seq = 0;
const habit = (o: Partial<NotifyHabit>): NotifyHabit => ({
  id: `h${++seq}`,
  name: "Habit",
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
  time_of_day: null,
  routine_id: null,
  category_id: null,
  sort_order: 0,
  start_date: "2026-10-01",
  archived_on: null,
  deleted_at: null,
  reminder_enabled: true,
  reminder_lead_min: null,
  ...o,
});
const row = (h: NotifyHabit, date: string, o: Partial<CheckInRow> = {}): CheckInRow => ({
  habit_id: h.id,
  local_date: date,
  status: "done",
  value: null,
  skip_reason: null,
  note: null,
  source: "siri",
  deleted_at: null,
  ...o,
});

const meditar = habit({ name: "Meditar", icon: "🧘", routine_id: "r1" });
const leer = habit({ name: "Leer", routine_id: "r1" });
const agua = habit({ name: "Agua", kind: "measurable", target_value: 8, unit: "vasos" });
const data = (checkIns: CheckInRow[] = []): NotifyData => ({
  profile,
  habits: [meditar, leer, agua],
  versions: [],
  pauses: [],
  routines: [morning],
  checkIns,
});
const es = async () => ({ t: await shortcutsT("es"), locale: "es" });
const en = async () => ({ t: await shortcutsT("en"), locale: "en" });

describe("voice matching (API §5)", () => {
  const c = (name: string, score: number) => ({ habit_id: name, name, score });
  it("takes an exact match, a lone candidate, or a clear winner; otherwise asks", () => {
    expect(decideMatch([c("Meditar", 1), c("Medir", 0.6)])).toEqual({
      type: "match",
      habitId: "Meditar",
    });
    expect(decideMatch([c("Leer", 0.4)])).toEqual({ type: "match", habitId: "Leer" });
    expect(decideMatch([c("Leer", 0.7), c("Lavar", 0.5)])).toEqual({
      type: "match",
      habitId: "Leer",
    });
    expect(decideMatch([c("Leer", 0.6), c("Lerer", 0.5)])).toMatchObject({ type: "ambiguous" });
    expect(decideMatch([])).toEqual({ type: "none" });
  });
});

describe("GET /today", () => {
  it("lists pending habits as choices, with a sentence", async () => {
    const body = todayBody(
      data([row(agua, TODAY, { status: "partial", value: 6 })]),
      TODAY,
      { include: "pending", routine: null },
      await es(),
    );
    // Same order as Today: by routine, then name.
    expect(Object.entries(body.choices)).toEqual([
      ["Leer · Mañana", leer.id],
      ["🧘 Meditar · Mañana", meditar.id],
      ["Agua (6/8)", agua.id],
    ]);
    expect(body.pending_count).toBe(3);
    expect(body.speech).toBe("Te quedan 3 hábitos: Leer, Meditar y Agua.");
  });

  it("filters by routine; all done says so", async () => {
    const body = todayBody(data(), TODAY, { include: "pending", routine: "morning" }, await en());
    expect(Object.values(body.choices)).toEqual([leer.id, meditar.id]);
    const done = todayBody(
      data([row(meditar, TODAY), row(leer, TODAY), row(agua, TODAY, { value: 8 })]),
      TODAY,
      { include: "pending", routine: null },
      await en(),
    );
    expect(done.speech).toBe("All done for today! 🎉");
  });
});

describe("POST /check-ins replies (FR-SIR-2, FR-SIR-4)", () => {
  it("streak and what's left in the routine", async () => {
    const before = data([row(meditar, "2026-10-18"), row(meditar, "2026-10-19")]);
    const body = checkInBody(before, row(meditar, TODAY), TODAY, await es());
    expect(body.speech).toBe("Listo, Meditar ✅. 🔥 ¡3 seguidos! Queda 1 hábito en Mañana.");
    expect(body.habit).toMatchObject({ streak: 3, milestone: 3 });
  });

  it("measurable progress", async () => {
    const body = checkInBody(
      data(),
      row(agua, TODAY, { status: "partial", value: 5 }),
      TODAY,
      await en(),
    );
    expect(body.speech).toBe("Agua: 5 of 8 vasos. 3 habits left today.");
  });

  it("the last habit of the day is a perfect day", async () => {
    const before = data([row(meditar, TODAY), row(agua, TODAY, { value: 8 })]);
    const body = checkInBody(before, row(leer, TODAY), TODAY, await es());
    expect(body.speech).toBe("Listo, Leer ✅. ¡Día perfecto! 🎉 Completaste todo.");
  });
});

describe("GET /summary (FR-SIR-6)", () => {
  it("score, what's left and weekly habits", async () => {
    const gym = habit({ name: "Gimnasio", schedule_type: "times_per_week", times_per_week: 4 });
    const d = {
      ...data([row(meditar, TODAY), row(gym, "2026-10-19")]),
      habits: [meditar, leer, agua, gym],
    };
    const body = summaryBody(d, TODAY, await es());
    expect(body.speech).toBe("Vas 33%. Te faltan Leer y Agua. Gimnasio: 1 de 4 esta semana.");
    expect(body).toMatchObject({ done: 1, total: 3, pending: ["Leer", "Agua"] });
  });
});
