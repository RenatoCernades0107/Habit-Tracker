"use client";

import { useIsRestoring, useMutation, useMutationState, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { CheckIn, CheckInOp, CheckInPayload } from "@/domain/check-in-ops";
import { habitDay } from "@/domain/day";
import { createClient } from "@/lib/supabase/client";

import { overlay, type PendingChange, type UpsertVariables } from "./overlay";
import { CHANGE_KEY, snapshotKey, useUserId } from "./provider";
import { EMPTY_SNAPSHOT, rowKey, type Snapshot } from "./snapshot";
import { syncSnapshot } from "./sync";

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Today's habit day for this profile (R-DAY-3). */
export function todayFor(profile: Snapshot["profile"], now: Date = new Date()): string {
  return habitDay(now, profile?.timezone ?? deviceTimeZone(), profile?.day_start_hour ?? 4);
}

function usePendingChanges(): PendingChange[] {
  return useMutationState({
    filters: { mutationKey: CHANGE_KEY, status: "pending" },
    select: (m) => m.state.variables as PendingChange,
  });
}

/**
 * The user's data as the screen should show it: the synced snapshot with unconfirmed changes
 * replayed on top. Renders from the device cache first; never waits for the network.
 */
export function useData() {
  const userId = useUserId();
  const isRestoring = useIsRestoring();
  const query = useQuery({
    queryKey: snapshotKey(userId),
    queryFn: ({ client }) => {
      const previous = client.getQueryData<Snapshot>(snapshotKey(userId)) ?? EMPTY_SNAPSHOT;
      return syncSnapshot(createClient(), previous, todayFor(previous.profile));
    },
    refetchOnWindowFocus: true,
  });
  const pending = usePendingChanges();
  const data = useMemo(
    () => overlay(query.data ?? EMPTY_SNAPSHOT, pending, new Date().toISOString()),
    [query.data, pending],
  );
  return {
    data,
    today: todayFor(data.profile),
    /** True only before anything is known (first visit on this device). */
    isLoading: isRestoring || (query.data === undefined && query.isPending),
    error: query.data === undefined ? query.error : null,
  };
}

/** Changes not yet confirmed by the server (the sync indicator, FR-PWA-2). */
export function useSyncStatus() {
  const pending = useMutationState({
    filters: { mutationKey: CHANGE_KEY, status: "pending" },
    select: (m) => m.state.isPaused,
  });
  return { pending: pending.length, paused: pending.some(Boolean) };
}

export function useChange() {
  const mutation = useMutation<unknown, Error, PendingChange>({ mutationKey: CHANGE_KEY });
  return mutation.mutate;
}

/** Check-in operations with an Undo handle (FR-CHK-1…4). */
export function useCheckIns(data: Snapshot) {
  const change = useChange();

  const apply = useCallback(
    (
      habitId: string,
      date: string,
      op: CheckInOp,
      payload: CheckInPayload = {},
      source: "app" | "routine_mode" = "app",
    ) => {
      const prev: CheckIn | undefined = data.checkIns.find(
        (c) => rowKey.check_ins(c) === `${habitId}|${date}`,
      );
      const opId = crypto.randomUUID();
      change({ kind: "checkin", opId, habitId, date, op, payload, source, prev });
      return () => change({ kind: "undo", opId, habitId, date, restore: prev });
    },
    [change, data.checkIns],
  );
  return apply;
}

export function useSave() {
  const change = useChange();
  return useCallback(
    (v: Omit<UpsertVariables, "kind">) => change({ kind: "upsert", ...v } as UpsertVariables),
    [change],
  );
}
