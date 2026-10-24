"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, RefreshCw, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

export function useCalendarConnection() {
  return useQuery({
    queryKey: ["calendar-connection"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("calendar_connections")
        .select("google_email, status")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

/** Settings → Google Calendar (FR-CAL-1, FR-CAL-7, docs/spec/06-integrations.md §3.4). */
export function CalendarSetting({ configured }: { configured: boolean }) {
  const t = useTranslations("settings.calendar");
  const params = useSearchParams();
  const conn = useCalendarConnection();
  const [confirm, setConfirm] = useState(false);
  const [deleteCalendar, setDeleteCalendar] = useState(false);
  const [busy, setBusy] = useState(false);

  // The OAuth callback comes back with ?calendar=connected|error|denied.
  const result = params.get("calendar");
  useEffect(() => {
    if (result === "connected") toast.success(t("connectedToast"));
    else if (result === "error") toast.error(t("errorToast"));
    else if (result === "denied") toast(t("deniedToast"));
  }, [result, t]);

  if (!configured) return <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>;

  const connectLink = (label: string) => (
    <Button asChild>
      {/* A full navigation: the server redirects to Google. */}
      <a href="/api/calendar/google/connect">
        <CalendarDays aria-hidden="true" />
        {label}
      </a>
    </Button>
  );

  if (!conn.data) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <div>{connectLink(t("connect"))}</div>
        <p className="text-xs text-muted-foreground">{t("unverified")}</p>
      </div>
    );
  }

  const resync = async () => {
    const res = await fetch("/api/calendar/google/resync", { method: "POST" });
    if (res.ok) toast(t("resyncQueued"));
    else toast.error(t("failed"));
  };
  const disconnect = async () => {
    setBusy(true);
    const res = await fetch("/api/calendar/google/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delete_calendar: deleteCalendar }),
    });
    setBusy(false);
    setConfirm(false);
    if (res.ok) {
      toast(t("disconnected"));
      void conn.refetch();
    } else toast.error(t("failed"));
  };

  return (
    <div className="grid gap-3">
      <p role="status" className="text-sm">
        {conn.data.google_email
          ? t("connectedAs", { email: conn.data.google_email })
          : t("connectedAnon")}
      </p>
      {conn.data.status === "needs_reauth" ? (
        <div className="grid gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <p>{t("needsReauth")}</p>
          <div>{connectLink(t("reconnect"))}</div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void resync()}>
          <RefreshCw aria-hidden="true" />
          {t("resync")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(true)}>
          <Unplug aria-hidden="true" />
          {t("disconnect")}
        </Button>
      </div>
      <Dialog open={confirm} onOpenChange={(open) => !busy && setConfirm(open)}>
        <DialogContent closeLabel={t("cancel")}>
          <DialogHeader>
            <DialogTitle>{t("disconnectTitle")}</DialogTitle>
            <DialogDescription>{t("disconnectDescription")}</DialogDescription>
          </DialogHeader>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={deleteCalendar}
              onChange={(e) => setDeleteCalendar(e.target.checked)}
            />
            {t("deleteCalendar")}
          </label>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void disconnect()}>
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** FR-CAL-7: "Reconnect" when Google access has expired. Shown on Today. */
export function CalendarReauthBanner() {
  const t = useTranslations("settings.calendar");
  const conn = useCalendarConnection();
  if (conn.data?.status !== "needs_reauth") return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
    >
      <span>{t("banner")}</span>
      <Button asChild size="sm" variant="outline">
        <a href="/api/calendar/google/connect">{t("bannerAction")}</a>
      </Button>
    </div>
  );
}
