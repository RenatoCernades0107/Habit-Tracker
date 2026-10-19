"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";

// Imported for its side effect: it starts listening for the browser's install prompt
// (beforeinstallprompt) as soon as the app's JavaScript runs, before any page needs it.
import "@/lib/pwa/install-prompt";
import {
  activateUpdate,
  clearAppBadge,
  createUpdateCheck,
  isServiceWorkerEnabled,
  onUpdateWaiting,
  onWorkerNavigate,
  registerServiceWorker,
  supportsServiceWorker,
  syncOfflinePageLanguage,
  watchDocumentLanguage,
} from "@/lib/pwa/sw-client";

const UPDATE_TOAST_ID = "sw-update";

/**
 * Registers the service worker (public/sw.js) and offers "Update available" when a new
 * version is waiting (FR-PWA-3). Mounted once, in the root layout. Renders nothing.
 */
export function ServiceWorkerRegister() {
  const t = useTranslations("pwa.update");
  const router = useRouter();

  const showUpdateToast = useEffectEvent((worker: ServiceWorker) => {
    toast(t("available"), {
      id: UPDATE_TOAST_ID,
      description: t("description"),
      // Stays until the user acts: reloading mid-task must be their choice.
      duration: Number.POSITIVE_INFINITY,
      action: { label: t("action"), onClick: () => activateUpdate(worker) },
    });
  });

  const navigate = useEffectEvent((path: string) => router.push(path));

  // Opening the app clears its badge (Phase 0; Phase 3 sets real counts).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") clearAppBadge();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!isServiceWorkerEnabled() || !supportsServiceWorker()) return;

    let cancelled = false;
    const cleanups: (() => void)[] = [onWorkerNavigate(navigate)];

    const start = async () => {
      const registration = await registerServiceWorker();
      if (!registration || cancelled) return;

      cleanups.push(onUpdateWaiting(registration, showUpdateToast));

      const checkForUpdate = createUpdateCheck(registration);
      const onVisible = () => {
        if (document.visibilityState === "visible") checkForUpdate();
      };
      document.addEventListener("visibilitychange", onVisible);
      cleanups.push(() => document.removeEventListener("visibilitychange", onVisible));

      cleanups.push(
        watchDocumentLanguage((lang) => {
          syncOfflinePageLanguage(lang).catch(() => {});
        }),
      );
    };

    // After the page has loaded, so registering never competes with the first render.
    if (document.readyState === "complete") {
      void start();
    } else {
      const onLoad = () => void start();
      window.addEventListener("load", onLoad, { once: true });
      cleanups.push(() => window.removeEventListener("load", onLoad));
    }

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}
