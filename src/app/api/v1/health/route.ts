import { z } from "zod";

import { addDays } from "@/domain/dates";
import { parseJsonBody } from "@/server/push/http";
import { authenticate, reply, shortcutsError, updateHint } from "@/server/shortcuts/http";
import { listOf } from "@/server/shortcuts/i18n";
import { loadUser } from "@/server/shortcuts/load";

const METRICS = [
  "steps",
  "exercise_minutes",
  "active_energy_kcal",
  "distance_km",
  "mindful_minutes",
  "workouts",
  "sleep_hours",
] as const;

const bodySchema = z.object({
  metrics: z
    .array(
      z.object({
        metric: z.enum(METRICS),
        date: z.iso.date(),
        value: z.number().min(0).max(10_000_000),
      }),
    )
    .max(50),
});

/**
 * POST /api/v1/health (docs/spec/05-api.md §2, FR-HLT-3…5): daily totals from the "Sync Health"
 * shortcut. The rules (R-HLT-3) run in the database, in one transaction.
 */
export async function POST(request: Request) {
  const authed = await authenticate(request, "health:write");
  if (!authed.ok) return authed.response;
  const loaded = await loadUser(request, authed.auth);
  if (!loaded.ok) return loaded.response;
  const { user, speaker } = loaded;
  const { t, locale } = speaker;

  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return shortcutsError("validation_error", locale);

  // Dates within the last 7 days, by the user's calendar (API §2).
  const oldest = addDays(user.today, -7);
  const newest = addDays(user.today, 1);
  const metrics = parsed.data.metrics.filter((m) => m.date >= oldest && m.date <= newest);
  const outOfRange = parsed.data.metrics.length - metrics.length;

  const { data, error } = await authed.auth.admin.rpc("srv_apply_health_metrics", {
    p_user_id: authed.auth.userId,
    p_metrics: metrics,
  });
  if (error) return shortcutsError("internal", locale);
  const result = data as {
    accepted: number;
    ignored: number;
    completed: { habit: string; date: string }[];
  };

  const yesterday = addDays(user.today, -1);
  const names = result.completed.map((c) =>
    c.date === user.today
      ? c.habit
      : c.date === yesterday
        ? t("speech.healthYesterday", { name: c.habit })
        : c.habit,
  );
  let speech = t("speech.healthSynced");
  if (names.length) speech += ` ${t("speech.healthCompleted", { list: listOf(names, locale) })}`;
  if (await updateHint(request, authed.auth)) speech += ` ${t("speech.update")}`;

  return reply({
    accepted: result.accepted,
    ignored: result.ignored + outOfRange,
    completed: result.completed.map((c) => ({ habit: c.habit, date: c.date })),
    speech,
  });
}
