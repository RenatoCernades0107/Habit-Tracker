/**
 * Remembers that a code was sent, so "Check your email" survives a reload. On iPhone the
 * installed app is often reloaded after the user switches to Mail to read the code; without
 * this they'd have to start over and ask for a new code (FR-ACC-1).
 *
 * Kept in localStorage on this device only, for a short time, and cleared once the code is
 * checked. Works as an external store for `useSyncExternalStore`.
 */

const STORAGE_KEY = "restart:pending-sign-in";

/** How long a sent code keeps the form on step 2: the code's lifetime (otp_expiry = 600). */
export const PENDING_SIGN_IN_TTL_MS = 10 * 60 * 1000;

/** Minimum wait before "Resend code" works again. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type PendingSignIn = { email: string; sentAt: number };

/** Parses a stored value. Shape only; freshness is checked by `isFresh`. */
export function parsePendingSignIn(raw: string | null): PendingSignIn | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { email, sentAt } = value as Record<string, unknown>;
    if (typeof email !== "string" || email === "" || email.length > 254) return null;
    if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return null;
    return { email, sentAt };
  } catch {
    return null;
  }
}

export function isFresh(pending: PendingSignIn, now: number): boolean {
  const age = now - pending.sentAt;
  return age >= -60_000 && age < PENDING_SIGN_IN_TTL_MS; // small allowance for clock changes
}

// Fallback when storage is blocked (private mode, disabled site data).
let memory: string | null = null;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memory;
  }
}

function write(raw: string | null): void {
  memory = raw;
  try {
    if (raw === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Storage unavailable: the in-memory copy still covers this page's lifetime.
  }
  for (const listener of listeners) listener();
}

export const pendingSignInStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },

  /** The stored string while it's fresh, else null. Strings keep the snapshot stable. */
  getSnapshot(): string | null {
    const raw = read();
    const pending = parsePendingSignIn(raw);
    return pending && isFresh(pending, Date.now()) ? raw : null;
  },

  /** Nothing is pending during server rendering; the client catches up after hydration. */
  getServerSnapshot(): null {
    return null;
  },

  save(pending: PendingSignIn): void {
    write(JSON.stringify(pending));
  },

  clear(): void {
    write(null);
  },
};
