/**
 * Client error tracking (docs/spec/03-architecture.md §11): errors go to /api/client-errors, which
 * writes them to the server logs. No user data is sent: the message, the stack, the page path
 * without its query, and the build.
 */
const MAX_PER_PAGE = 10;
let sent = 0;
const seen = new Set<string>();

export function reportError(error: unknown, source: "boundary" | "window" | "promise") {
  if (typeof window === "undefined" || sent >= MAX_PER_PAGE) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.name}:${err.message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  const body = JSON.stringify({
    source,
    name: err.name.slice(0, 100),
    message: err.message.slice(0, 500),
    stack: err.stack?.slice(0, 2000) ?? null,
    digest: (err as { digest?: string }).digest ?? null,
    path: window.location.pathname,
  });
  try {
    if (
      navigator.sendBeacon?.("/api/client-errors", new Blob([body], { type: "application/json" }))
    )
      return;
  } catch {
    // Fall back to fetch.
  }
  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
