"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { isStandalone } from "@/lib/pwa/platform";

import type { SetupStatus } from "./setup-items";

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeToDisplayMode(onChange: () => void): () => void {
  const query = window.matchMedia?.(STANDALONE_QUERY);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/** True when notifications are allowed and this browser holds a push subscription. */
export async function hasPushSubscription(): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    return subscription != null;
  } catch {
    return false;
  }
}

/**
 * Which setup steps this device has done (FR-TOD-7). Detection runs only in the browser,
 * after hydration: the server and the first client render both see "unknown", so there is
 * no hydration mismatch. It runs again when the app comes back to the foreground, e.g.
 * after enabling notifications in Settings or installing the app.
 */
export function useSetupStatus(): SetupStatus {
  const installed = useSyncExternalStore<boolean | null>(
    subscribeToDisplayMode,
    isStandalone,
    () => null,
  );
  const [notifications, setNotifications] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const check = () => {
      void hasPushSubscription().then((subscribed) => {
        if (active) setNotifications(subscribed);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { installed, notifications };
}
