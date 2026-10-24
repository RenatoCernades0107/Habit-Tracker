import type { Platform } from "@/lib/pwa/platform";

export type SetupItemId = "install" | "notifications" | "siri" | "health" | "calendar";

/** `href` is where the step is done; null while the feature isn't built yet. */
export type SetupItem = { id: SetupItemId; href: `/settings#${string}` | null };

/** What this device has done, as detected in the browser. Null until known. */
export type SetupStatus = { installed: boolean | null; notifications: boolean | null };

export type SetupItemState = "done" | "todo" | "soon";

/**
 * The setup checklist (FR-TOD-7): Install · Notifications · Siri · Health · Calendar.
 * Siri and Apple Health only exist on iPhone.
 */
export function setupItemsFor(platform: Platform): SetupItem[] {
  return [
    { id: "install", href: "/settings#install" },
    { id: "notifications", href: "/settings#notifications" },
    ...(platform === "ios"
      ? ([
          { id: "siri", href: "/settings#shortcuts" },
          { id: "health", href: "/settings#health" },
        ] satisfies SetupItem[])
      : []),
    { id: "calendar", href: "/settings#calendar" },
  ];
}

/** Unknown counts as not done, so the first render (server and hydration) shows the action. */
export function setupItemState(item: SetupItem, status: SetupStatus): SetupItemState {
  if (item.href === null) return "soon";
  const done =
    item.id === "install"
      ? status.installed
      : item.id === "notifications"
        ? status.notifications
        : false;
  return done === true ? "done" : "todo";
}

/** Set when the user hides the checklist on this device; read by the Today page. */
export const SETUP_HIDDEN_COOKIE = "RESTART_SETUP_HIDDEN";
