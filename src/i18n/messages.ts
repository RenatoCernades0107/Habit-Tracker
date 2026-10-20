import type { Locale } from "./config";
import type { Messages } from "./types";

/**
 * One JSON file per namespace and language: `messages/<locale>/<namespace>.json`.
 * Keeping namespaces in separate files lets features add strings without conflicts.
 */
export const namespaces = [
  "common",
  "nav",
  "auth",
  "pwa",
  "today",
  "settings",
  "push",
  "habits",
] as const;

export type Namespace = (typeof namespaces)[number];

export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    namespaces.map(
      async (namespace) =>
        [namespace, (await import(`../../messages/${locale}/${namespace}.json`)).default] as const,
    ),
  );
  return Object.fromEntries(entries) as Messages;
}
