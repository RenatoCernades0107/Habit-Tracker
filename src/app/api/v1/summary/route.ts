import { authenticate, reply, updateHint } from "@/server/shortcuts/http";
import { loadUser } from "@/server/shortcuts/load";
import { summaryBody } from "@/server/shortcuts/respond";

/** GET /api/v1/summary (docs/spec/05-api.md §2): "How am I doing?" (FR-SIR-6). */
export async function GET(request: Request) {
  const authed = await authenticate(request, "habits:read");
  if (!authed.ok) return authed.response;
  const loaded = await loadUser(request, authed.auth);
  if (!loaded.ok) return loaded.response;
  const body = summaryBody(loaded.user.data, loaded.user.today, loaded.speaker);
  if (await updateHint(request, authed.auth)) {
    body.speech = `${body.speech} ${loaded.speaker.t("speech.update")}`;
  }
  return reply(body);
}
