/**
 * Content-Security-Policy (docs/spec/03-architecture.md §10): scripts only with this request's
 * nonce (and what they load, 'strict-dynamic'), connections to the app and Supabase (REST and
 * Realtime), forms to the app, Supabase and Google sign-in, and no framing. Inline style
 * attributes are allowed: charts and progress bars set widths and colors with them.
 */
export function contentSecurityPolicy(
  nonce: string,
  { supabaseUrl, dev }: { supabaseUrl: string; dev: boolean },
): string {
  const supabase = new URL(supabaseUrl);
  const ws = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase.origin} ${ws}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${supabase.origin} https://accounts.google.com`,
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** A fresh nonce for one request. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
