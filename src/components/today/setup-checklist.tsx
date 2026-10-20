"use client";

import { ChevronRight, Circle, CircleCheck, CircleDashed, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MAIN_ID } from "@/components/shell/constants";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { Platform } from "@/lib/pwa/platform";
import { cn } from "@/lib/utils";

import {
  SETUP_HIDDEN_COOKIE,
  setupItemsFor,
  setupItemState,
  type SetupItem,
  type SetupItemState,
} from "./setup-items";
import { useSetupStatus } from "./use-setup-status";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

function rememberHidden(hidden: boolean) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SETUP_HIDDEN_COOKIE}=1; path=/; max-age=${hidden ? ONE_YEAR_S : 0}; samesite=lax${secure}`;
}

/**
 * Today's setup checklist (FR-TOD-7), shown until the user hides it. Hiding is remembered
 * per device in a cookie, so the server leaves it out next time (no flash), and can be
 * undone from the toast ("Undo, don't confirm", docs/spec/07-ux.md §1).
 *
 * `platform` comes from the server (user agent), so the list of items is final on the
 * first render. Only each item's state is filled in after hydration, without moving rows.
 */
export function SetupChecklist({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const t = useTranslations("today.setup");
  const status = useSetupStatus();
  const [hidden, setHidden] = useState(false);
  const titleId = useId();

  if (hidden) return null;

  function hide() {
    rememberHidden(true);
    setHidden(true);
    // The focused button is gone; continue from the top of the page content.
    document.getElementById(MAIN_ID)?.focus();
    toast(t("hidden"), {
      action: {
        label: t("undo"),
        onClick: () => {
          rememberHidden(false);
          setHidden(false);
        },
      },
    });
  }

  return (
    <section id="setup-checklist" aria-labelledby={titleId} className={className}>
      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <h2 id={titleId} className="leading-none font-semibold">
            {t("title")}
          </h2>
          <CardDescription>{t("description")}</CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={hide}
              aria-label={t("hide")}
              className="-mt-2.5 -mr-2.5 text-muted-foreground"
            >
              <X aria-hidden="true" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-2">
          {/* Busy until this device's state is known (it starts as "unknown" on purpose). */}
          <ul
            className="grid gap-1"
            aria-busy={status.installed === null || status.notifications === null || undefined}
          >
            {setupItemsFor(platform).map((item) => (
              <SetupRow
                key={item.id}
                item={item}
                state={setupItemState(item, status)}
                platform={platform}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

const STATE_ICONS = {
  done: { icon: CircleCheck, className: "text-success" },
  todo: { icon: Circle, className: "text-muted-foreground" },
  soon: { icon: CircleDashed, className: "text-muted-foreground/70" },
} as const;

function SetupRow({
  item,
  state,
  platform,
}: {
  item: SetupItem;
  state: SetupItemState;
  platform: Platform;
}) {
  const t = useTranslations("today.setup");
  const tCommon = useTranslations("common");
  const id = useId();
  const { icon: StateIcon, className: iconClassName } = STATE_ICONS[state];

  const description =
    item.id === "install" && platform === "desktop"
      ? t("items.install.descriptionDesktop")
      : t(`items.${item.id}.description`);

  // Same box for every state, so a state change after hydration never moves the rows.
  const rowClassName = "flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5";
  const content = (
    <>
      <StateIcon aria-hidden="true" className={cn("size-6 shrink-0", iconClassName)} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span
          id={`${id}-title`}
          className={cn("font-medium", state === "done" && "text-muted-foreground")}
        >
          {t(`items.${item.id}.title`)}
        </span>
        <span id={`${id}-description`} className="text-sm text-pretty text-muted-foreground">
          {description}
        </span>
      </span>
      {state === "soon" ? (
        <Badge variant="secondary" className="shrink-0">
          {tCommon("comingSoon")}
        </Badge>
      ) : (
        // Color and icon shape are not the only signal (docs/spec/07-ux.md §7).
        <span id={`${id}-state`} className="sr-only">
          {t(state === "done" ? "status.done" : "status.todo")}
        </span>
      )}
      {state === "todo" ? (
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );

  return (
    <li>
      {state === "todo" && item.href ? (
        <Link
          href={item.href}
          aria-labelledby={`${id}-title ${id}-state`}
          aria-describedby={`${id}-description`}
          className={cn(
            rowClassName,
            "transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
          )}
        >
          {content}
        </Link>
      ) : (
        <div className={rowClassName}>{content}</div>
      )}
    </li>
  );
}
