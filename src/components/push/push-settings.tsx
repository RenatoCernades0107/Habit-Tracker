"use client";

import {
  Bell,
  BellOff,
  BellRing,
  CircleAlert,
  CircleCheck,
  Clock,
  LoaderCircle,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { InstallGuide } from "@/components/pwa/install-guide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicEnv } from "@/lib/env";
import {
  currentSubscription,
  deleteSubscription,
  parseVapidPublicKey,
  PushApiError,
  saveSubscription,
  sendTestNotification,
  supportsPush,
  usesApplicationServerKey,
  waitForServiceWorker,
} from "@/lib/push/client";
import { syncPushSubscription, thisDevice } from "@/lib/push/sync";
import {
  detectPlatform,
  iosSupportsWebPush,
  isStandalone,
  parseIosVersion,
  subscribeToDisplayMode,
  type Platform,
} from "@/lib/pwa/platform";
import { isServiceWorkerEnabled } from "@/lib/pwa/sw-client";
import { cn } from "@/lib/utils";

/** What this device can do right now. Decided in the browser; "checking" until then. */
type Phase =
  | "checking"
  | "ios-install"
  | "ios-too-old"
  | "unsupported"
  | "missing-key"
  | "denied"
  | "off"
  | "on";

type Busy = "enable" | "disable" | "test-now" | "test-scheduled" | null;

type Notice = { tone: "info" | "success" | "error"; text: string };

type Translate = ReturnType<typeof useTranslations<"push.settings">>;

/** `navigator.serviceWorker.ready` hangs when no worker is registered; don't wait forever. */
const SERVICE_WORKER_TIMEOUT_MS = 8000;

function readVapidKey(): Uint8Array<ArrayBuffer> | null {
  try {
    return parseVapidPublicKey(getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  } catch {
    return null;
  }
}

async function detectPhase(vapidKey: Uint8Array | null): Promise<Phase> {
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  if (platform === "ios") {
    if (!iosSupportsWebPush(parseIosVersion(navigator.userAgent))) return "ios-too-old";
    // FR-NTF-12: iOS only offers push to the Home Screen app, so install comes first.
    if (!isStandalone()) return "ios-install";
  }
  if (!supportsPush()) return "unsupported";
  if (!vapidKey) return "missing-key";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";

  const subscription = await currentSubscription().catch(() => null);
  return subscription && usesApplicationServerKey(subscription, vapidKey) ? "on" : "off";
}

/**
 * Notifications on this device (FR-NTF-1, FR-NTF-12, docs/spec/06-integrations.md §4.2):
 * status, "Enable" (asks for permission after a tap), test sends straight away or through the
 * scheduler (spike S2), and "Turn off on this device". On iPhone outside the installed app
 * it shows the install guide instead, because iOS only allows push there.
 */
export function PushSettings() {
  const t = useTranslations("push.settings");
  const format = useFormatter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const vapidKey = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const focusAfterChange = useRef<"on" | "off" | null>(null);
  const onHeading = useRef<HTMLParagraphElement>(null);
  const enableButton = useRef<HTMLButtonElement>(null);

  const refresh = useEffectEvent(async (sync: boolean) => {
    // An action in progress decides the phase itself.
    if (busy) return;
    const next = await detectPhase(vapidKey.current);
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setPhase(next);
    // Keep the server's copy current every time Settings opens (§4.2 step 3).
    if (sync && next === "on" && vapidKey.current) {
      syncPushSubscription(vapidKey.current).catch((error: unknown) => {
        console.warn("[push] could not sync this device:", describeError(error));
      });
    }
  });

  useEffect(() => {
    vapidKey.current = readVapidKey();
    // refresh() only sets state after awaiting the browser's push state, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(true);

    // Permission may change in the system settings, and iOS may hand over to the app.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    const stopWatching = subscribeToDisplayMode(() => void refresh(false));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stopWatching();
    };
  }, []);

  // After enabling or turning off, the button that was pressed is gone: move focus to
  // what replaced it so keyboard and screen reader users aren't dropped at the page top.
  useEffect(() => {
    const target = focusAfterChange.current;
    if (!target || target !== phase) return;
    focusAfterChange.current = null;
    (target === "on" ? onHeading.current : enableButton.current)?.focus();
  }, [phase]);

  async function enable() {
    if (busy) return;
    const key = vapidKey.current;
    if (!key) return setPhase("missing-key");
    setBusy("enable");
    setNotice({ tone: "info", text: t("enabling") });

    try {
      // Must be the first await after the tap: Safari only asks inside a user gesture.
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "denied") {
        setNotice(null);
        setPhase("denied");
        return;
      }
      if (permission !== "granted") {
        setNotice({ tone: "error", text: t("errors.permissionDismissed") });
        return;
      }

      let registration: ServiceWorkerRegistration;
      try {
        // Without a registered worker (development by default) `ready` never settles.
        if (!isServiceWorkerEnabled() && !(await navigator.serviceWorker.getRegistration())) {
          throw new Error("No service worker in development");
        }
        registration = await waitForServiceWorker(SERVICE_WORKER_TIMEOUT_MS);
      } catch {
        setNotice({
          tone: "error",
          text:
            process.env.NODE_ENV === "production"
              ? t("errors.noServiceWorker")
              : t("errors.noServiceWorkerDev"),
        });
        return;
      }

      let subscription: PushSubscription | null;
      try {
        subscription = await registration.pushManager.getSubscription();
        if (subscription && !usesApplicationServerKey(subscription, key)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      } catch (error) {
        console.warn("[push] subscribe failed:", describeError(error));
        setNotice({ tone: "error", text: t("errors.subscribeFailed") });
        return;
      }

      try {
        await saveSubscription(subscription, thisDevice());
      } catch (error) {
        // The browser keeps the subscription; enabling again (or the next visit) re-sends it.
        setNotice({ tone: "error", text: apiErrorText(error, t, "errors.saveFailed") });
        return;
      }

      focusAfterChange.current = "on";
      setPhase("on");
      setNotice({ tone: "success", text: t("enabled") });
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy("disable");
    setNotice({ tone: "info", text: t("disabling") });
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        // Stop pushes on this device first; the server copy is cleaned up best effort
        // (a leftover endpoint answers 410 on the next send and is deleted then).
        await subscription.unsubscribe();
        await deleteSubscription(endpoint).catch((error: unknown) => {
          console.warn("[push] could not delete the subscription:", describeError(error));
        });
      }
      focusAfterChange.current = "off";
      setPhase("off");
      setNotice({ tone: "success", text: t("disabled") });
    } catch (error) {
      console.warn("[push] unsubscribe failed:", describeError(error));
      setNotice({ tone: "error", text: t("errors.disableFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(mode: "now" | "scheduled") {
    if (busy) return;
    setBusy(mode === "now" ? "test-now" : "test-scheduled");
    setNotice(null);
    try {
      const result = await sendTestNotification(mode);
      if (result.mode === "scheduled") {
        const time = result.scheduledFor
          ? format.dateTime(new Date(result.scheduledFor), {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })
          : "";
        toast.success(t("testScheduledFor", { time }));
        return;
      }
      const total = result.sent + result.failed;
      if (total === 0) toast(t("testNoDevices"));
      else if (result.failed === 0) toast.success(t("testSent", { sent: result.sent }));
      else if (result.sent === 0) toast.error(t("testNotDelivered"));
      else toast.success(t("testPartial", { sent: result.sent, total }));
    } catch (error) {
      toast.error(
        error instanceof PushApiError && error.status === 429
          ? t("rateLimited")
          : apiErrorText(error, t, "errors.testFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-slot="push-settings" className="grid gap-4">
      <StatusRow phase={phase} t={t} />

      {phase === "checking" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
          <LoaderCircle
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t("checking")}
        </p>
      )}

      {phase === "ios-install" && (
        <div className="grid gap-4">
          <Callout icon={<Bell aria-hidden="true" />} title={t("ios.title")}>
            {t("ios.body")}
          </Callout>
          <InstallGuide compact />
        </div>
      )}

      {phase === "ios-too-old" && (
        <Callout icon={<TriangleAlert aria-hidden="true" />} tone="warning">
          {t("iosTooOld")}
        </Callout>
      )}

      {phase === "unsupported" && (
        <Callout icon={<BellOff aria-hidden="true" />}>{t("unsupported")}</Callout>
      )}

      {phase === "missing-key" && (
        <Callout icon={<TriangleAlert aria-hidden="true" />} tone="warning">
          <span className="break-words">{t("missingKey")}</span>
        </Callout>
      )}

      {phase === "denied" && (
        <Callout icon={<BellOff aria-hidden="true" />} tone="warning" title={t("denied.title")}>
          {t(`denied.${platform}`)}
        </Callout>
      )}

      {phase === "off" && (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
          <div>
            <Button
              ref={enableButton}
              type="button"
              onClick={enable}
              aria-disabled={busy !== null || undefined}
              className="w-full aria-disabled:opacity-70 sm:w-auto"
            >
              {busy === "enable" ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <BellRing aria-hidden="true" />
              )}
              {busy === "enable" ? t("enabling") : t("enable")}
            </Button>
          </div>
        </div>
      )}

      {phase === "on" && (
        <div className="grid gap-4">
          <p ref={onHeading} tabIndex={-1} className="text-sm font-medium outline-none">
            {t("enabled")}
          </p>
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t("testIntro")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="secondary"
                onClick={() => sendTest("now")}
                aria-disabled={busy !== null || undefined}
                className="aria-disabled:opacity-70"
              >
                {busy === "test-now" ? (
                  <LoaderCircle
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Send aria-hidden="true" />
                )}
                {busy === "test-now" ? t("sending") : t("testNow")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => sendTest("scheduled")}
                aria-disabled={busy !== null || undefined}
                aria-describedby="push-scheduled-hint"
                className="aria-disabled:opacity-70"
              >
                {busy === "test-scheduled" ? (
                  <LoaderCircle
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Clock aria-hidden="true" />
                )}
                {busy === "test-scheduled" ? t("sending") : t("testScheduled")}
              </Button>
            </div>
            <p id="push-scheduled-hint" className="text-sm text-muted-foreground">
              {t("testScheduledHint")}
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={disable}
              aria-disabled={busy !== null || undefined}
              className="w-full aria-disabled:opacity-70 sm:w-auto"
            >
              {busy === "disable" ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <BellOff aria-hidden="true" />
              )}
              {busy === "disable" ? t("disabling") : t("disable")}
            </Button>
          </div>
        </div>
      )}

      {/* Always mounted and never display:none, so screen readers announce each change
          (WCAG 4.1.3). Empty, it's visually hidden and takes no grid gap. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          notice ? "flex items-start gap-2 text-sm" : "sr-only",
          notice?.tone === "error" && "text-destructive",
          notice?.tone === "success" && "text-success",
          notice?.tone === "info" && "text-muted-foreground",
        )}
      >
        {notice && (
          <>
            {notice.tone === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : notice.tone === "success" ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : null}
            <span>{notice.text}</span>
          </>
        )}
      </p>
    </div>
  );
}

function StatusRow({ phase, t }: { phase: Phase; t: Translate }) {
  if (phase === "checking") return null;
  const status =
    phase === "on"
      ? { variant: "success" as const, icon: <Bell aria-hidden="true" />, label: t("status.on") }
      : phase === "denied"
        ? {
            variant: "destructive" as const,
            icon: <BellOff aria-hidden="true" />,
            label: t("status.blocked"),
          }
        : phase === "off" || phase === "ios-install"
          ? {
              variant: "secondary" as const,
              icon: <BellOff aria-hidden="true" />,
              label: t("status.off"),
            }
          : {
              variant: "outline" as const,
              icon: <BellOff aria-hidden="true" />,
              label: t("status.unavailable"),
            };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{t("statusLabel")}</span>
      <Badge variant={status.variant}>
        {status.icon}
        {status.label}
      </Badge>
    </div>
  );
}

function Callout({
  icon,
  title,
  tone = "neutral",
  children,
}: {
  icon: ReactNode;
  title?: string;
  tone?: "neutral" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "warning" ? "border-warning/50 bg-warning/10" : "bg-muted/50",
      )}
    >
      {icon}
      <div className="grid min-w-0 gap-1">
        {title && <p className="font-medium">{title}</p>}
        <p className="leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function apiErrorText(
  error: unknown,
  t: Translate,
  fallback: "errors.saveFailed" | "errors.testFailed",
): string {
  if (error instanceof PushApiError && error.status === 401) return t("errors.signedOut");
  return t(fallback);
}

/** For logs: an error's name and code, never its message (it may hold an endpoint). */
function describeError(error: unknown): string {
  if (error instanceof PushApiError) return `${error.status} ${error.code}`;
  return error instanceof Error ? error.name : typeof error;
}
