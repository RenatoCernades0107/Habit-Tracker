"use client";

import {
  ChevronDown,
  CircleCheck,
  Download,
  EllipsisVertical,
  Info,
  MonitorDown,
  Share,
  SquarePlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { installPrompt } from "@/lib/pwa/install-prompt";
import {
  detectPlatform,
  iosSupportsWebPush,
  isStandalone,
  parseIosVersion,
  subscribeToDisplayMode,
  type Platform,
} from "@/lib/pwa/platform";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

const noSubscription = () => () => {};

/** False on the server and during hydration, so the first client render matches it. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

type Translate = ReturnType<typeof useTranslations<"pwa.install">>;

const inlineIcon = "inline size-4 align-[-0.125em]";

function richTags(icon?: ReactNode) {
  return {
    b: (chunks: ReactNode) => <strong className="font-semibold">{chunks}</strong>,
    icon: () => icon ?? null,
  };
}

/**
 * How to install Restart on this device (FR-PWA-1, docs/spec/03-architecture.md §8):
 * iPhone and iPad get the Share → Add to Home Screen steps (Safari has no install prompt);
 * Chromium shows its own install dialog when it offers one, and menu steps otherwise.
 * `compact` is one line with a button that expands the steps (for Today's setup list).
 * Renders after mount only: the platform is known in the browser, not on the server.
 */
export function InstallGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("pwa.install");
  const isClient = useIsClient();
  const standalone = useSyncExternalStore(subscribeToDisplayMode, isStandalone, () => false);
  const promptStatus = useSyncExternalStore(
    installPrompt.subscribe,
    installPrompt.getSnapshot,
    installPrompt.getServerSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const stepsId = useId();

  if (!isClient) return null;

  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const installed = standalone || promptStatus === "installed";

  async function install() {
    if (installing) return;
    setInstalling(true);
    const outcome = await installPrompt.promptInstall();
    setInstalling(false);
    if (outcome === "accepted") setAnnouncement(t("justInstalled"));
  }

  const installButton =
    promptStatus === "available" && platform !== "ios" ? (
      <Button
        type="button"
        onClick={install}
        aria-disabled={installing || undefined}
        className="aria-disabled:opacity-70"
      >
        <Download aria-hidden="true" />
        {installing ? t("installing") : t("button")}
      </Button>
    ) : null;

  const steps = installButton ? null : <InstallSteps platform={platform} t={t} />;

  let content: ReactNode;
  if (installed) {
    content = (
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div className="grid gap-0.5">
          <p className="font-medium">{standalone ? t("installed") : t("justInstalled")}</p>
          {!compact && <p className="text-sm text-muted-foreground">{t("installedHint")}</p>}
        </div>
      </div>
    );
  } else if (compact) {
    content = (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BrandMark className="size-5" />
          </span>
          <p className="min-w-0 flex-1 basis-48 text-sm">{t("compact")}</p>
          {installButton ?? (
            <Button
              type="button"
              variant="outline"
              aria-expanded={expanded}
              aria-controls={stepsId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t("hideSteps") : t("showSteps")}
              <ChevronDown
                className={cn("transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          )}
        </div>
        {steps && (
          <div id={stepsId} hidden={!expanded}>
            {steps}
          </div>
        )}
      </div>
    );
  } else {
    content = (
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BrandMark className="size-6" />
          </span>
          <p className="self-center text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {installButton && <div>{installButton}</div>}
        {steps}
      </div>
    );
  }

  return (
    <div data-slot="install-guide">
      {content}
      {/* Stays mounted across states, so screen readers announce the install result. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function InstallSteps({ platform, t }: { platform: Platform; t: Translate }) {
  if (platform === "ios") {
    const pushSupported = iosSupportsWebPush(parseIosVersion(navigator.userAgent));
    return (
      <div className="grid gap-4">
        <Steps
          label={t("stepsLabel")}
          items={[
            t.rich("ios.step1", richTags(<Share className={inlineIcon} aria-hidden="true" />)),
            t.rich("ios.step2", richTags(<SquarePlus className={inlineIcon} aria-hidden="true" />)),
            t.rich("ios.step3", richTags()),
          ]}
        />
        <Note warning={!pushSupported}>
          {pushSupported ? t("ios.notifications") : t("ios.oldIos")}
        </Note>
        <p className="text-sm text-muted-foreground">{t("ios.otherBrowser")}</p>
      </div>
    );
  }

  if (platform === "android") {
    return (
      <Steps
        label={t("stepsLabel")}
        items={[
          t.rich(
            "android.step1",
            richTags(<EllipsisVertical className={inlineIcon} aria-hidden="true" />),
          ),
          t.rich("android.step2", richTags()),
          t.rich("android.step3", richTags()),
        ]}
      />
    );
  }

  // Desktop: one way per browser, not a sequence.
  return (
    <ul aria-label={t("stepsLabel")} className="grid gap-3 text-sm" role="list">
      <li className="leading-relaxed">
        {t.rich(
          "desktop.chromium",
          richTags(<MonitorDown className={inlineIcon} aria-hidden="true" />),
        )}
      </li>
      <li className="leading-relaxed">{t.rich("desktop.safari", richTags())}</li>
      <li className="leading-relaxed text-muted-foreground">{t("desktop.other")}</li>
    </ul>
  );
}

function Steps({ label, items }: { label: string; items: ReactNode[] }) {
  return (
    // role="list" keeps list semantics in Safari despite list-style: none.
    <ol aria-label={label} className="grid gap-3" role="list">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-3 text-sm">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          >
            {index + 1}
          </span>
          <p className="pt-0.5 leading-relaxed">{item}</p>
        </li>
      ))}
    </ol>
  );
}

function Note({ warning, children }: { warning: boolean; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        warning ? "border-warning/50 bg-warning/10" : "bg-muted/50 text-muted-foreground",
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
