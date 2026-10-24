/**
 * iCloud links of the published shortcuts, one per language (docs/spec/06-integrations.md §1.2).
 * Null until the owner builds them from shortcuts/ and shares them; Settings then shows the recipes.
 */
export const SHORTCUT_LINKS: Record<"es" | "en", string | null> = {
  es: null,
  en: null,
};

export const SHORTCUTS_REPO_PATH = "shortcuts/README.md";
