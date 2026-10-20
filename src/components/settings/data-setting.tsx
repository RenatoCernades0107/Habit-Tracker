"use client";

import { Download, Loader2, Trash2 } from "lucide-react";
import { del } from "idb-keyval";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserId } from "@/data/provider";
import { clearPageCaches } from "@/lib/pwa/sw-client";

/** Export (FR-DAT-1) and account deletion (FR-ACC-5, FR-DAT-2). */
export function DataSetting() {
  const t = useTranslations("stats.data");
  const userId = useUserId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const word = t("deleteWord");

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: word }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Nothing of this account may stay on the device.
      await Promise.allSettled([clearPageCaches(), del(`restart:${userId}`)]);
      // A full page load, so nothing of this account stays in memory either.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild variant="outline">
          <a href="/api/export?format=json" download>
            <Download aria-hidden="true" />
            {t("exportJson")}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href="/api/export?format=csv" download>
            <Download aria-hidden="true" />
            {t("exportCsv")}
          </a>
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          setTyped("");
          setFailed(false);
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="justify-self-start text-destructive hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
            {t("delete")}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim().toUpperCase() === word && !busy) void remove();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="delete-confirm">{t("deleteConfirmLabel", { word })}</Label>
              <Input
                id="delete-confirm"
                autoComplete="off"
                autoCapitalize="characters"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
            {failed ? (
              <p role="alert" className="text-sm text-destructive">
                {t("deleteFailed")}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                {t("close")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={typed.trim().toUpperCase() !== word || busy}
              >
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {t("deleteConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
