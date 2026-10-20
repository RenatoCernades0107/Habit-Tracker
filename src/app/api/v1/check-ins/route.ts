import { randomUUID } from "node:crypto";

import { z } from "zod";

import { addDays } from "@/domain/dates";
import type { CheckInRow } from "@/domain/types";
import { parseJsonBody } from "@/server/push/http";
import {
  authenticate,
  reply,
  shortcutsError,
  type ShortcutsErrorCode,
} from "@/server/shortcuts/http";
import { listOf } from "@/server/shortcuts/i18n";
import { loadUser } from "@/server/shortcuts/load";
import { decideMatch, type Candidate } from "@/server/shortcuts/match";
import { checkInBody, dayViewOf } from "@/server/shortcuts/respond";

const bodySchema = z
  .object({
    habit_id: z.uuid().optional(),
    query: z.string().trim().min(1).max(100).optional(),
    action: z.enum(["log", "complete", "increment", "set_value", "skip"]).default("log"),
    amount: z.number().positive().max(100000).optional(),
    value: z.number().min(0).max(100000).optional(),
    reason: z.enum(["sick", "travel", "rest", "other"]).optional(),
    date: z.enum(["today", "yesterday"]).default("today"),
    op_id: z.uuid().optional(),
  })
  .refine((b) => b.habit_id || b.query, { path: ["habit_id"] })
  .refine((b) => b.action !== "set_value" || b.value !== undefined, { path: ["value"] });

/** Errors apply_check_in_op raises by message (R-CHK, R-SKIP). */
const RULE_ERRORS = new Set<ShortcutsErrorCode>([
  "outside_edit_window",
  "not_allowed_for_habit",
  "skip_limit_reached",
  "validation_error",
]);

/**
 * POST /api/v1/check-ins (docs/spec/05-api.md §2, FR-SIR-2…4): logs a habit by ID or by its
 * spoken name, and answers with a sentence for Siri. Source `siri`; Realtime updates open apps.
 */
export async function POST(request: Request) {
  const authed = await authenticate(request, "checkins:write");
  if (!authed.ok) return authed.response;
  const loaded = await loadUser(request, authed.auth);
  if (!loaded.ok) return loaded.response;
  const { user, speaker } = loaded;
  const { admin, userId } = authed.auth;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return shortcutsError("validation_error", speaker.locale);
  const body = parsed.data;

  // Which habit (FR-SIR-3).
  let habitId = body.habit_id;
  if (habitId) {
    const habit = user.data.habits.find((h) => h.id === habitId && h.deleted_at === null);
    if (!habit) return shortcutsError("habit_id_not_found", speaker.locale);
  } else {
    const query = body.query ?? "";
    const { data, error } = await admin.rpc("srv_match_habit", {
      p_user_id: userId,
      p_query: query,
    });
    if (error) return shortcutsError("internal", speaker.locale);
    const decision = decideMatch((data ?? []) as Candidate[]);
    if (decision.type === "none")
      return shortcutsError("habit_not_found", speaker.locale, { query });
    if (decision.type === "ambiguous") {
      const choices = Object.fromEntries(decision.choices.map((c) => [c.name, c.habit_id]));
      return shortcutsError(
        "ambiguous_habit",
        speaker.locale,
        {
          list: listOf(
            decision.choices.map((c) => c.name),
            speaker.locale,
          ),
        },
        { choices },
      );
    }
    habitId = decision.habitId;
  }

  const date = body.date === "yesterday" ? addDays(user.today, -1) : user.today;
  const view = dayViewOf(user.data, date, user.today);
  const item = [...view.sections.flatMap((s) => s.items), ...view.weekly].find(
    (i) => i.habit.id === habitId,
  );
  const measurable = item?.schedule.kind === "measurable";

  // "Log" on something already done changes nothing.
  if (body.action === "log" && item?.state === "done") {
    return reply({
      check_in: {
        habit_id: habitId,
        date,
        state: "done",
        value: item.checkIn?.value ?? null,
        source: item.checkIn?.source,
      },
      habit: { name: item.habit.name, streak: item.streak, milestone: null },
      speech: speaker.t("speech.alreadyDone", { name: item.habit.name }),
    });
  }

  const op = body.action === "log" ? (measurable ? "increment" : "complete") : body.action;
  const payload =
    op === "increment" && body.amount
      ? { amount: body.amount }
      : op === "set_value"
        ? { value: body.value }
        : op === "skip"
          ? { reason: body.reason ?? "other" }
          : {};

  const { data: row, error } = await admin.rpc("srv_apply_check_in_op", {
    p_user_id: userId,
    p_op_id: body.op_id ?? randomUUID(),
    p_habit_id: habitId!,
    p_local_date: date,
    p_op: op,
    p_payload: payload,
    p_source: "siri",
  });
  if (error) {
    const code = error.message as ShortcutsErrorCode;
    if (error.message === "habit_not_found")
      return shortcutsError("habit_id_not_found", speaker.locale);
    return shortcutsError(RULE_ERRORS.has(code) ? code : "internal", speaker.locale);
  }
  return reply(
    checkInBody(
      user.data,
      row as unknown as CheckInRow & { local_date: string },
      user.today,
      speaker,
    ),
  );
}
