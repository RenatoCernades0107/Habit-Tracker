import type { MetadataRoute } from "next";

import pwa from "@messages/en/pwa.json";
import { BRAND_COLORS } from "@/lib/pwa/brand";
import { ICON_PATHS } from "@/lib/pwa/icons";

const APP_NAME = "Restart";

/**
 * Web app manifest, served at /manifest.webmanifest (FR-PWA-1, docs/spec/03-architecture.md §8).
 * Static on purpose: browsers fetch it without the user's session or language, so it uses
 * the English fallback (the installed app's name is the same in every language).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity: start_url can change later without creating a "new" app.
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: pwa.manifest.description,
    lang: "en",
    dir: "ltr",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    // The light theme's --background, so the splash screen and title bar match the app.
    background_color: BRAND_COLORS.background,
    theme_color: BRAND_COLORS.background,
    categories: ["productivity", "lifestyle", "health"],
    icons: [
      { src: ICON_PATHS.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICON_PATHS.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ICON_PATHS.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press / right-click menu of the installed app (Android, desktop).
    shortcuts: [
      {
        name: pwa.manifest.today,
        url: "/today",
        icons: [{ src: ICON_PATHS.shortcutToday, sizes: "96x96", type: "image/png" }],
      },
      {
        name: pwa.manifest.settings,
        url: "/settings",
        icons: [{ src: ICON_PATHS.shortcutSettings, sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
