"use client";

import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { useSyncStatus } from "@/data/hooks";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Synced / changes waiting / offline (FR-PWA-2). Announced politely to screen readers. */
export function SyncIndicator({ className }: { className?: string }) {
  const t = useTranslations("today.sync");
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const { pending } = useSyncStatus();

  const [Icon, text] = !online
    ? [CloudOff, t("offline")]
    : pending > 0
      ? [RefreshCw, t("pending", { count: pending })]
      : [Cloud, t("synced")];

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", online && pending > 0 && "animate-spin")}
      />
      {text}
    </p>
  );
}
