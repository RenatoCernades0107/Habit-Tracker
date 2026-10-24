"use client";

import { Archive, ArchiveRestore, Pause, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useData, useSave } from "@/data/hooks";
import { addDays, inRange } from "@/domain/dates";
import type { Tables } from "@/lib/supabase/database.types";

import { Field } from "./form-fields";

/** Pause, archive and delete (FR-HAB-5, FR-HAB-6). */
export function HabitManage({ habit }: { habit: Tables<"habits"> }) {
  const t = useTranslations("habits.actions");
  const tSheet = useTranslations("today.sheet");
  const router = useRouter();
  const { data, today } = useData();
  const save = useSave();
  const [until, setUntil] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const now = () => new Date().toISOString();

  const activePause = data.pauses.find(
    (p) =>
      p.habit_id === habit.id && p.deleted_at === null && inRange(today, p.start_date, p.end_date),
  );

  const pause = () => {
    save({
      table: "pauses",
      row: {
        id: crypto.randomUUID(),
        user_id: habit.user_id,
        habit_id: habit.id,
        start_date: today,
        end_date: until && until >= today ? until : null,
        reason: null,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      },
    });
    toast.success(t("paused"));
  };

  const resume = () => {
    if (!activePause) return;
    // A pause that began before today keeps its past days (R-SKIP-3); one from today goes away.
    const row =
      activePause.start_date < today
        ? { ...activePause, end_date: addDays(today, -1) }
        : { ...activePause, deleted_at: now() };
    save({ table: "pauses", row });
    toast.success(t("resumed"));
  };

  const setArchived = (archived: boolean) => {
    save({ table: "habits", row: { ...habit, archived_on: archived ? today : null } });
    toast.success(t(archived ? "archived" : "unarchived"));
    if (archived) router.push("/habits");
  };

  const remove = () => {
    save({ table: "habits", row: { ...habit, deleted_at: now() } });
    toast.success(t("deleted"));
    router.push("/habits");
  };

  return (
    <section
      aria-labelledby="manage-title"
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id="manage-title" className="text-sm font-semibold">
        {t("title")}
      </h2>

      {habit.archived_on === null ? (
        activePause ? (
          <Button variant="outline" onClick={resume} className="justify-self-start">
            <Play aria-hidden="true" />
            {t("resume")}
          </Button>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t("pauseHint")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field id="pause-until" label={t("pauseUntil")}>
                <Input
                  id="pause-until"
                  type="date"
                  min={today}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </Field>
              <Button variant="outline" onClick={pause}>
                <Pause aria-hidden="true" />
                {t("pauseConfirm")}
              </Button>
            </div>
          </div>
        )
      ) : null}

      <div className="grid gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t("archiveHint")}</p>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => setArchived(habit.archived_on === null)}
        >
          {habit.archived_on === null ? (
            <Archive aria-hidden="true" />
          ) : (
            <ArchiveRestore aria-hidden="true" />
          )}
          {habit.archived_on === null ? t("archive") : t("unarchive")}
        </Button>
      </div>

      <div className="grid gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t("deleteHint")}</p>
        <Button
          variant="destructive"
          className="justify-self-start"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden="true" />
          {t("delete")}
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent closeLabel={tSheet("close")}>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle", { name: habit.name })}</DialogTitle>
            <DialogDescription>{t("deleteConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tSheet("close")}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={remove}>
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
