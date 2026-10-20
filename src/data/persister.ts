import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

export type Store = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

/**
 * Saves the query cache to IndexedDB as a structured clone, not a JSON string: a year of
 * check-ins is megabytes, and stringifying it on every change blocked the main thread.
 * Saves are throttled, and a pending save is written at once when the app is hidden or
 * closed, so a change made just before leaving isn't lost (FR-CHK-7).
 */
export function createIdbPersister(store: Store, key: string, throttleMs = 300): Persister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async (client: PersistedClient) => {
    try {
      await store.set(key, client);
    } catch (error) {
      // Something in the cache can't be cloned (e.g. a function in an error): store what JSON keeps.
      if ((error as { name?: unknown } | null)?.name === "DataCloneError") {
        await store.set(key, JSON.parse(JSON.stringify(client)) as PersistedClient);
      } else {
        throw error;
      }
    }
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const client = pending;
    pending = null;
    if (client) void write(client).catch(() => {});
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    persistClient: (client) => {
      pending = client;
      timer ??= setTimeout(flush, throttleMs);
    },
    restoreClient: async () => {
      const value = await store.get(key);
      // Caches saved before this persister were JSON strings.
      if (typeof value === "string") return JSON.parse(value) as PersistedClient;
      return (value as PersistedClient | undefined) ?? undefined;
    },
    removeClient: async () => {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await store.del(key);
    },
  };
}
