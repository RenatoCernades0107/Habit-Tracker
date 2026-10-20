import { authenticate, reply, updateHint } from "@/server/shortcuts/http";
import { loadUser } from "@/server/shortcuts/load";
import { todayBody } from "@/server/shortcuts/respond";

/** GET /api/v1/today (docs/spec/05-api.md §2): today's habits for "Choose from List". */
export async function GET(request: Request) {
  const authed = await authenticate(request, "habits:read");
  if (!authed.ok) return authed.response;
  const loaded = await loadUser(request, authed.auth);
  if (!loaded.ok) return loaded.response;
  const params = new URL(request.url).searchParams;
  const body = todayBody(
    loaded.user.data,
    loaded.user.today,
    {
      include: params.get("include") === "all" ? "all" : "pending",
      routine: params.get("routine"),
    },
    loaded.speaker,
  );
  if (await updateHint(request, authed.auth)) {
    body.speech = `${body.speech} ${loaded.speaker.t("speech.update")}`;
  }
  return reply(body);
}
