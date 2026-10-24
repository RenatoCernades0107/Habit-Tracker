"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Reloads the page the user wanted. The service worker serves /offline in place of that
 * page, so the address bar still shows it and a reload tries it again. Also reloads by
 * itself when the browser reports the connection is back.
 */
export function OfflineRetryButton() {
  const t = useTranslations("pwa.offline");
  const [retrying, setRetrying] = useState(false);

  function retry() {
    setRetrying(true);
    window.location.reload();
  }

  useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <Button
      id="offline-retry"
      type="button"
      size="lg"
      onClick={retry}
      aria-disabled={retrying || undefined}
      className="aria-disabled:opacity-70"
    >
      <RotateCw className={cn(retrying && "animate-spin")} aria-hidden="true" />
      {retrying ? t("retrying") : t("retry")}
    </Button>
  );
}
