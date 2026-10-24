"use client";

import { MutationCache, QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { useTranslations } from "next-intl";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

import type { PendingChange } from "./overlay";
import { createIdbPersister } from "./persister";
import { changeErrorCode, isNetworkError, sendChange, type ChangeResult } from "./send";
import { mergeRows, rowKey, type Snapshot, type SyncedTable } from "./snapshot";
import { applyRealtimeRow } from "./sync";

export const CHANGE_KEY = ["change"] as const;

const UserIdContext = createContext<string | null>(null);

/** The signed-in user's id, inside the signed-in app. */
export function useUserId(): string {
  const id = use(UserIdContext);
  if (!id) throw new Error("useUserId must be used inside DataProvider");
  return id;
}
export const snapshotKey = (userId: string) => ["snapshot", userId] as const;

/** Bump when the cached shape changes; old caches are then discarded. */
const CACHE_VERSION = "2";

function mergeResult(snapshot: Snapshot, result: ChangeResult): Snapshot {
  switch (result.table) {
    case "check_ins":
      return {
        ...snapshot,
        checkIns: mergeRows(snapshot.checkIns, [result.row], rowKey.check_ins),
      };
    case "habits":
      return { ...snapshot, habits: mergeRows(snapshot.habits, [result.row], rowKey.habits) };
    case "routines":
      return { ...snapshot, routines: mergeRows(snapshot.routines, [result.row], rowKey.routines) };
    case "categories":
      return {
        ...snapshot,
        categories: mergeRows(snapshot.categories, [result.row], rowKey.categories),
      };
    case "pauses":
      return { ...snapshot, pauses: mergeRows(snapshot.pauses, [result.row], rowKey.pauses) };
    case "daily_entries":
      return {
        ...snapshot,
        dailyEntries: mergeRows(snapshot.dailyEntries, [result.row], rowKey.daily_entries),
      };
    case "weekly_reviews":
      return {
        ...snapshot,
        weeklyReviews: mergeRows(snapshot.weeklyReviews, [result.row], rowKey.weekly_reviews),
      };
  }
}

function makeClient(userId: string, onRejected: (code: string) => void) {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, staleTime: 30_000, networkMode: "offlineFirst" },
    },
    mutationCache: new MutationCache({
      onError: (error) => {
        if (!isNetworkError(error)) onRejected(changeErrorCode(error));
      },
    }),
  });

  // Defaults (not per-call options) so changes restored after a reload can still be sent.
  client.setMutationDefaults(CHANGE_KEY, {
    mutationFn: (change: PendingChange) => sendChange(createClient(), change),
    // One queue: changes reach the server in the order they were made (R-CHK-7 makes repeats safe).
    scope: { id: "changes" },
    retry: (count, error) => isNetworkError(error) && count < 5,
    onSuccess: (result: ChangeResult) => {
      client.setQueryData<Snapshot>(snapshotKey(userId), (s) => (s ? mergeResult(s, result) : s));
    },
  });
  return client;
}

/** Local-first data for the signed-in app (docs/spec/03-architecture.md §3). */
export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const t = useTranslations("habits.errors");
  const [{ client, persister }] = useState(() => ({
    client: makeClient(userId, (code) => {
      const known = [
        "skip_limit_reached",
        "outside_edit_window",
        "not_allowed_for_habit",
        "habit_not_found",
      ];
      toast.error(t(known.includes(code) ? (code as "skip_limit_reached") : "generic"));
    }),
    persister: createIdbPersister({ get, set, del }, `restart:${userId}`),
  }));

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 30 * 24 * 3_600_000,
        buster: CACHE_VERSION,
        dehydrateOptions: { shouldDehydrateMutation: () => true },
      }}
      onSuccess={() => {
        // Changes made offline, possibly before a reload, are sent now (FR-CHK-7). Not awaited:
        // the provider stays "restoring" until onSuccess settles, and the screen must render
        // from the cache (pending changes replayed on top) without waiting for the network.
        void client
          .resumePausedMutations()
          .then(() => client.invalidateQueries({ queryKey: snapshotKey(userId) }));
      }}
    >
      <UserIdContext value={userId}>
        <RealtimeSync userId={userId} />
        {children}
      </UserIdContext>
    </PersistQueryClientProvider>
  );
}

const TABLES: SyncedTable[] = [
  "routines",
  "categories",
  "habits",
  "habit_versions",
  "pauses",
  "check_ins",
  "daily_entries",
  "weekly_reviews",
];

/** Live changes from other devices, Siri or Health (FR-TOD-5). */
function RealtimeSync({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel = supabase.channel(`user-${userId}`);
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            void queryClient.invalidateQueries({ queryKey: snapshotKey(userId) });
            return;
          }
          queryClient.setQueryData<Snapshot>(snapshotKey(userId), (s) =>
            s ? applyRealtimeRow(s, table, payload.new) : s,
          );
        },
      );
    }
    // Join with the user's token, not the anonymous key: RLS decides which rows Realtime may
    // send, and the session is read from the cookie asynchronously.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        // After a reconnect, catch up on anything missed while disconnected.
        if (status === "SUBSCRIBED")
          void queryClient.invalidateQueries({ queryKey: snapshotKey(userId) });
      });
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
  return null;
}
