"use client";

import { BellRing, Check, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CheckInOp, CheckInPayload } from "@/domain/check-in-ops";
import type { DayItem } from "@/domain/day-view";
import { isFixed } from "@/domain/schedule";

const REASONS = ["sick", "travel", "rest", "other"] as const;

type Props = {
  item: DayItem | null;
  skipsLeft: number;
  onClose: () => void;
  onOp: (op: CheckInOp, payload?: CheckInPayload) => void;
  /** "Remind me later" (FR-NTF-8); only for today's pending habits. */
  onSnooze?: (minutes: 15 | 30 | 60) => void;
};

/** Everything beyond one tap: exact value, skip with a reason, note, clear (FR-CHK-1…3). */
export function CheckInSheet({ item, skipsLeft, onClose, onOp, onSnooze }: Props) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item ? (
        <SheetBody
          key={item.habit.id}
          item={item}
          skipsLeft={skipsLeft}
          onOp={onOp}
          onSnooze={onSnooze}
        />
      ) : null}
    </Dialog>
  );
}

function SheetBody({
  item,
  skipsLeft,
  onOp,
  onSnooze,
}: Omit<Props, "item" | "onClose"> & { item: DayItem }) {
  const t = useTranslations("today");
  const { habit, schedule, checkIn, state } = item;
  const measurable = schedule.kind === "measurable";
  const [value, setValue] = useState(
    String(checkIn?.status === "skipped" ? "" : (checkIn?.value ?? "")),
  );
  const [note, setNote] = useState(checkIn?.note ?? "");
  const canSkip = isFixed(schedule) && state !== "skipped";

  return (
    <DialogContent closeLabel={t("sheet.close")}>
      <DialogHeader>
        <DialogTitle>
          {habit.icon ? <span aria-hidden="true">{habit.icon} </span> : null}
          {habit.name}
        </DialogTitle>
        {habit.cue ? (
          <DialogDescription>{habit.cue}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{t(`state.${state}`)}</DialogDescription>
        )}
      </DialogHeader>

      {measurable ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value.replace(",", "."));
            if (Number.isFinite(n) && n >= 0) onOp("set_value", { value: n });
          }}
        >
          <Label htmlFor="sheet-value">
            {t("sheet.value")} {habit.unit ? `(${habit.unit})` : null}
          </Label>
          <div className="flex gap-2">
            <Input
              id="sheet-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
            />
            <Button type="submit">{t("sheet.setValue")}</Button>
          </div>
        </form>
      ) : null}

      {state !== "done" ? (
        <Button onClick={() => onOp("complete")}>
          <Check aria-hidden="true" />
          {t("sheet.complete")}
        </Button>
      ) : null}

      {onSnooze && (state === "pending" || state === "partial") ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("sheet.snooze")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {([15, 30, 60] as const).map((minutes) => (
              <Button key={minutes} variant="outline" onClick={() => onSnooze(minutes)}>
                <BellRing aria-hidden="true" />
                {t("sheet.snoozeIn", { minutes })}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {canSkip ? (
        <fieldset className="grid gap-2" disabled={skipsLeft === 0}>
          <legend className="mb-1 text-sm font-medium">{t("sheet.skipReason")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((reason) => (
              <Button key={reason} variant="outline" onClick={() => onOp("skip", { reason })}>
                {t(`reasons.${reason}`)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("sheet.skipsLeft", { count: skipsLeft })}
          </p>
        </fieldset>
      ) : null}

      {checkIn ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onOp("set_note", { note });
          }}
        >
          <Label htmlFor="sheet-note">{t("sheet.note")}</Label>
          <textarea
            id="sheet-note"
            value={note}
            maxLength={500}
            rows={2}
            placeholder={t("sheet.notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring md:text-sm dark:bg-input/30"
          />
          <Button type="submit" variant="secondary">
            {t("sheet.saveNote")}
          </Button>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {checkIn ? (
          <Button variant="ghost" onClick={() => onOp("clear")}>
            <Trash2 aria-hidden="true" />
            {t("sheet.clear")}
          </Button>
        ) : null}
        <Button variant="ghost" asChild>
          <Link href={`/habits/${habit.id}/edit`}>
            <Pencil aria-hidden="true" />
            {t("sheet.edit")}
          </Link>
        </Button>
      </div>
    </DialogContent>
  );
}
