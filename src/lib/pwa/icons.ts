import { BRAND_COLORS, brandIconSvg, MARK_GRID } from "./brand";

/**
 * Public URLs of the generated icons (scripts/generate-icons.ts writes them to public/).
 * The manifest uses them, and public/sw.js precaches the same list (sw.test.ts checks it).
 */
export const ICON_PATHS = {
  icon192: "/icons/icon-192.png",
  icon512: "/icons/icon-512.png",
  /** Full-bleed background, mark inside the 80% safe zone (Android adaptive icons). */
  maskable512: "/icons/maskable-512.png",
  /** White mark on transparent: Android shows only the alpha channel in the status bar. */
  badge96: "/icons/badge-96.png",
  shortcutToday: "/icons/shortcut-today-96.png",
  shortcutSettings: "/icons/shortcut-settings-96.png",
} as const;

/**
 * Mark scale per use. App tiles leave a margin; the maskable icon keeps the mark well
 * inside the safe zone; favicons and the badge fill more space to stay legible when tiny.
 */
export const ICON_SCALES = {
  tile: 0.8,
  maskable: 0.72,
  apple: 0.78,
  favicon: 0.92,
  badge: 1.15,
} as const;

/** Sizes packed into src/app/favicon.ico (browser tabs, Windows shortcuts). */
export const FAVICON_ICO_SIZES = [16, 32, 48] as const;

/**
 * Lucide icons (ISC license, https://lucide.dev) on their 24-unit grid, for the manifest
 * shortcuts. Copied as data so the icons don't depend on lucide-react internals.
 */
const SHORTCUT_GLYPHS = {
  today:
    `<path d="M8 2v3"/><path d="M16 2v3"/>` +
    `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m9 15 2 2 4-4"/>`,
  settings:
    `<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>` +
    `<circle cx="12" cy="12" r="3"/>`,
} as const;

/** A shortcut icon: a lucide glyph, white on the brand tile. */
export function shortcutIconSvg(size: number, glyph: keyof typeof SHORTCUT_GLYPHS): string {
  const scale = (MARK_GRID * 0.5) / 24;
  const center = MARK_GRID / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK_GRID} ${MARK_GRID}">` +
    `<rect width="${MARK_GRID}" height="${MARK_GRID}" rx="${MARK_GRID * 0.225}" fill="${BRAND_COLORS.primary}"/>` +
    `<g transform="translate(${center} ${center}) scale(${scale}) translate(-12 -12)" fill="none" ` +
    `stroke="${BRAND_COLORS.onPrimary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${SHORTCUT_GLYPHS[glyph]}</g></svg>`
  );
}

export type PngIconSpec = {
  /** Output path relative to the repo root. */
  file: string;
  size: number;
  svg: string;
  /** Flatten onto the brand color: Apple touch icons must be opaque, or iOS fills black. */
  opaque?: boolean;
};

const publicFile = (url: string) => `public${url}`;

/** Every PNG the icon script renders (FR-PWA-1, docs/spec/03-architecture.md §8). */
export const PNG_ICON_SPECS: readonly PngIconSpec[] = [
  {
    file: publicFile(ICON_PATHS.icon192),
    size: 192,
    svg: brandIconSvg({ size: 192, background: "rounded", scale: ICON_SCALES.tile }),
  },
  {
    file: publicFile(ICON_PATHS.icon512),
    size: 512,
    svg: brandIconSvg({ size: 512, background: "rounded", scale: ICON_SCALES.tile }),
  },
  {
    file: publicFile(ICON_PATHS.maskable512),
    size: 512,
    svg: brandIconSvg({ size: 512, background: "full", scale: ICON_SCALES.maskable }),
    opaque: true,
  },
  {
    file: publicFile(ICON_PATHS.badge96),
    size: 96,
    svg: brandIconSvg({
      size: 96,
      background: "none",
      scale: ICON_SCALES.badge,
      foreground: "#ffffff",
    }),
  },
  { file: publicFile(ICON_PATHS.shortcutToday), size: 96, svg: shortcutIconSvg(96, "today") },
  {
    file: publicFile(ICON_PATHS.shortcutSettings),
    size: 96,
    svg: shortcutIconSvg(96, "settings"),
  },
  {
    // Next.js file convention: <link rel="apple-touch-icon" sizes="180x180">.
    file: "src/app/apple-icon.png",
    size: 180,
    svg: brandIconSvg({ size: 180, background: "full", scale: ICON_SCALES.apple }),
    opaque: true,
  },
  {
    // Next.js file convention: PNG favicon for browsers without SVG favicons.
    file: "src/app/icon.png",
    size: 32,
    svg: brandIconSvg({ size: 32, background: "rounded", scale: ICON_SCALES.favicon }),
  },
];

/** Next.js file convention: the SVG favicon, preferred by current browsers. */
export const FAVICON_SVG = brandIconSvg({
  size: 32,
  background: "rounded",
  scale: ICON_SCALES.favicon,
});

export function faviconIcoSvg(size: number): string {
  return brandIconSvg({ size, background: "rounded", scale: ICON_SCALES.favicon });
}
