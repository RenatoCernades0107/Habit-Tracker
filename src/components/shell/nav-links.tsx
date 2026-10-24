"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { isActivePath, NAV_ITEMS } from "./nav-items";

/**
 * The main navigation links. The only client part of the shell: it needs the current path
 * to set `aria-current="page"`. "tabs" is the phone's bottom bar, "sidebar" the desktop list.
 */
export function NavLinks({ variant }: { variant: "tabs" | "sidebar" }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tabs = variant === "tabs";

  return (
    <ul className={tabs ? "grid grid-cols-4" : "grid gap-1"}>
      {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
        const current = isActivePath(pathname, href);
        return (
          <li key={key}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "group flex outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                tabs
                  ? // 56 px tall, a quarter of the width: well above the 44 px minimum.
                    "min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs leading-tight font-medium text-muted-foreground aria-[current=page]:text-foreground"
                  : "min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center",
                  tabs &&
                    "h-8 w-14 rounded-full transition-colors group-aria-[current=page]:bg-primary/15",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 group-aria-[current=page]:text-primary",
                    tabs ? "size-6" : "size-5",
                  )}
                />
              </span>
              {/* Long words ("Estadísticas") may break at 200 % text size instead of overflowing. */}
              <span
                className={tabs ? "max-w-full text-center break-words hyphens-auto" : undefined}
              >
                {t(key)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
