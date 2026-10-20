import "server-only";

import { loadNotifyData, type UserNotifyData } from "@/server/notifications/data";

import { langOverride, shortcutsError, type ShortcutsAuth } from "./http";
import { shortcutsT } from "./i18n";
import type { Speaker } from "./respond";

/** The user's data (as the app sees it) and how to talk to them. */
export async function loadUser(
  request: Request,
  auth: ShortcutsAuth,
): Promise<
  { ok: true; user: UserNotifyData; speaker: Speaker } | { ok: false; response: Response }
> {
  const users = await loadNotifyData(auth.admin, [auth.userId], new Date()).catch(() => null);
  const user = users?.get(auth.userId);
  const locale = langOverride(request) ?? user?.locale ?? "en";
  if (!user) return { ok: false, response: await shortcutsError("internal", locale) };
  return { ok: true, user, speaker: { t: await shortcutsT(locale), locale } };
}
