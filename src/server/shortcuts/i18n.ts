import "server-only";

import { createTranslator } from "next-intl";

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type { Messages } from "@/i18n/types";

function make(locale: Locale, messages: Messages) {
  return createTranslator({ locale, messages, namespace: "shortcuts" });
}
export type ShortcutsT = ReturnType<typeof make>;

const cache = new Map<Locale, Promise<ShortcutsT>>();

/** The `shortcuts` messages in a language, loaded once per process (no request context). */
export function shortcutsT(locale: string): Promise<ShortcutsT> {
  const l = isLocale(locale) ? locale : defaultLocale;
  let t = cache.get(l);
  if (!t) {
    t = loadMessages(l).then((m) => make(l, m));
    t.catch(() => cache.delete(l));
    cache.set(l, t);
  }
  return t;
}

/** "Meditate, Read and Water" / "Meditar, Leer y Agua". */
export function listOf(names: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}
