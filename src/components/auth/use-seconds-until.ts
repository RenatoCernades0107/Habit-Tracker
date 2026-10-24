"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void): () => void {
  // 4 checks a second; the component only re-renders when the second changes.
  const id = window.setInterval(onTick, 250);
  return () => window.clearInterval(id);
}

const currentSecond = () => Math.floor(Date.now() / 1000);
// Never used for rendering in practice (callers are client-only), but must be stable.
const serverSecond = () => Number.POSITIVE_INFINITY;

/** Whole seconds left until `deadline` (epoch ms), ticking once a second; 0 when passed. */
export function useSecondsUntil(deadline: number): number {
  const nowSecond = useSyncExternalStore(subscribe, currentSecond, serverSecond);
  return Math.max(0, Math.ceil(deadline / 1000 - nowSecond));
}
