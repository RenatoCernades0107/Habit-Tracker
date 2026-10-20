import type auth from "@messages/en/auth.json";
import type common from "@messages/en/common.json";
import type habits from "@messages/en/habits.json";
import type nav from "@messages/en/nav.json";
import type push from "@messages/en/push.json";
import type pwa from "@messages/en/pwa.json";
import type settings from "@messages/en/settings.json";
import type stats from "@messages/en/stats.json";
import type today from "@messages/en/today.json";

/** English is the reference catalog; `npm run i18n:check` keeps Spanish in sync. */
export type Messages = {
  common: typeof common;
  nav: typeof nav;
  auth: typeof auth;
  pwa: typeof pwa;
  today: typeof today;
  settings: typeof settings;
  push: typeof push;
  habits: typeof habits;
  stats: typeof stats;
};
