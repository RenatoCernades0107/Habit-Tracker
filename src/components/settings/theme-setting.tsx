"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { useHydrated } from "@/components/auth/use-hydrated";
import { createClient } from "@/lib/supabase/client";

import { SegmentedControl } from "./segmented-control";

const THEMES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEMES)[number];

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Keeps a copy of the choice in the profile (FR-ACC-3). The device already switched and
 * remembers it (next-themes), so a failure here is logged and otherwise ignored. Only
 * `theme` is sent: authenticated users may update just the user-editable columns.
 */
async function saveThemeToProfile(userId: string, theme: ThemeChoice): Promise<void> {
  try {
    const { error } = await createClient().from("profiles").update({ theme }).eq("id", userId);
    if (error) console.warn("[settings] theme not saved to the profile:", error.code);
  } catch (error) {
    console.warn("[settings] theme not saved to the profile:", error);
  }
}

/** System / Light / Dark. Applies at once on this device and is saved to the profile. */
export function ThemeSetting({ labelledBy, userId }: { labelledBy: string; userId: string }) {
  const t = useTranslations("settings.theme");
  const { theme, setTheme } = useTheme();
  // next-themes reads the stored theme in the browser only; until hydration nothing is
  // pressed, so the server HTML and the first client render match.
  const hydrated = useHydrated();
  const current = hydrated && isThemeChoice(theme) ? theme : undefined;

  function choose(next: ThemeChoice) {
    if (next === current) return;
    setTheme(next);
    void saveThemeToProfile(userId, next);
  }

  return (
    <SegmentedControl
      labelledBy={labelledBy}
      value={current}
      onChange={choose}
      options={THEMES.map((value) => ({ value, label: t(value), icon: ICONS[value] }))}
    />
  );
}
