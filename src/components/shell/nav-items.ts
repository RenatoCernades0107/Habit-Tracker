import { CalendarCheck, ChartColumn, ListChecks, Settings, type LucideIcon } from "lucide-react";

export type NavKey = "today" | "habits" | "stats" | "settings";

export type NavItem = { key: NavKey; href: `/${NavKey}`; icon: LucideIcon };

/** The four main screens, in tab order (docs/spec/07-ux.md §3). */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "today", href: "/today", icon: CalendarCheck },
  { key: "habits", href: "/habits", icon: ListChecks },
  { key: "stats", href: "/stats", icon: ChartColumn },
  { key: "settings", href: "/settings", icon: Settings },
];

/** A tab stays current on its nested screens too (e.g. /habits/new marks Habits). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
