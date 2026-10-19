import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BrandMark } from "@/components/pwa/brand-mark";
import { OfflineRetryButton } from "@/components/pwa/offline-retry-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pwa.offline");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Shown by the service worker for pages that aren't cached while offline (FR-PWA-2).
 * Precached when the worker installs, so it needs no session and no data: everything it
 * shows comes from the message catalog.
 */
export default async function OfflinePage() {
  const t = await getTranslations("pwa.offline");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 pt-safe pr-safe pb-safe pl-safe">
      <div className="grid w-full max-w-sm justify-items-center gap-6 text-center">
        <div className="relative">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <BrandMark className="size-9" />
          </span>
          <span className="absolute -right-2 -bottom-2 flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs">
            <WifiOff className="size-4" aria-hidden="true" />
          </span>
        </div>
        <div className="grid gap-2">
          <h1 id="offline-title" className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <OfflineRetryButton />
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
    </main>
  );
}
