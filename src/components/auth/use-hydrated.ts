"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during server rendering and hydration, true once React runs in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
