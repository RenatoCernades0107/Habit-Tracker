import { authenticate, reply, shortcutsError } from "@/server/shortcuts/http";
import { loadUser } from "@/server/shortcuts/load";

/** POST /api/v1/check-ins/undo (FR-SIR-5): undoes today's last check-in, from any source. */
export async function POST(request: Request) {
  const authed = await authenticate(request, "checkins:write");
  if (!authed.ok) return authed.response;
  const loaded = await loadUser(request, authed.auth);
  if (!loaded.ok) return loaded.response;
  const { t, locale } = loaded.speaker;

  const { data, error } = await authed.auth.admin.rpc("srv_undo_last_op", {
    p_user_id: authed.auth.userId,
  });
  if (error) {
    return shortcutsError(
      error.message === "nothing_to_undo" ? "nothing_to_undo" : "internal",
      locale,
    );
  }
  const undone = data as { habit_id: string; op: string };
  const name = loaded.user.data.habits.find((h) => h.id === undone.habit_id)?.name ?? "";
  return reply({ undone: { habit: name, op: undone.op }, speech: t("speech.undone", { name }) });
}
