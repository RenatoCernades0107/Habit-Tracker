// @vitest-environment jsdom
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createIdbPersister, type Store } from "./persister";

const client = (n: number) =>
  ({ timestamp: n, buster: "2", clientState: { queries: [], mutations: [] } }) as PersistedClient;

function memoryStore() {
  const data = new Map<string, unknown>();
  const store: Store = {
    get: async (k) => data.get(k),
    set: vi.fn(async (k: string, v: unknown) => void data.set(k, v)),
    del: async (k) => void data.delete(k),
  };
  return { data, store };
}

afterEach(() => vi.useRealTimers());

describe("IndexedDB persister", () => {
  it("writes only the latest client once per throttle window", async () => {
    vi.useFakeTimers();
    const { data, store } = memoryStore();
    const p = createIdbPersister(store, "k", 300);
    await p.persistClient(client(1));
    await p.persistClient(client(2));
    expect(store.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(data.get("k")).toEqual(client(2));
  });

  it("writes at once when the page is hidden", async () => {
    vi.useFakeTimers();
    const { data, store } = memoryStore();
    const p = createIdbPersister(store, "k", 10_000);
    await p.persistClient(client(3));
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(data.get("k")).toEqual(client(3));
  });

  it("restores caches saved as JSON strings by the old persister", async () => {
    const { data, store } = memoryStore();
    data.set("k", JSON.stringify(client(4)));
    expect(await createIdbPersister(store, "k").restoreClient()).toEqual(client(4));
  });

  it("falls back to JSON when something can't be cloned", async () => {
    vi.useFakeTimers();
    const { data, store } = memoryStore();
    const set = vi.fn(async (k: string, v: unknown) => {
      if (set.mock.calls.length === 1) throw new DOMException("no", "DataCloneError");
      data.set(k, v);
    });
    store.set = set;
    const p = createIdbPersister(store, "k", 0);
    await p.persistClient(client(5));
    await vi.advanceTimersByTimeAsync(0);
    expect(set).toHaveBeenCalledTimes(2);
    expect(data.get("k")).toEqual(client(5));
  });
});
