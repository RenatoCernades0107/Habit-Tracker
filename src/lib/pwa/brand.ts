/**
 * The Restart brand mark: a circular "restart" arrow around a check mark.
 * Single source for the app icons (scripts/generate-icons.ts), the manifest colors and
 * the inline <BrandMark /> component. Geometry lives on a 512 × 512 grid.
 */

/**
 * Hex versions of the theme tokens in src/app/globals.css (oklch). The manifest and the
 * PNG renderer need sRGB hex; color.test.ts fails if these drift from the CSS.
 */
export const BRAND_COLORS = {
  /** --primary, light theme: oklch(0.5 0.1 168). White text on it passes AA. */
  primary: "#057558",
  /** --primary, dark theme: oklch(0.74 0.12 168). */
  primaryDark: "#4fc39c",
  /** --background, light theme: oklch(0.99 0.003 165). */
  background: "#fafcfb",
  /** --background, dark theme: oklch(0.16 0.01 165). */
  backgroundDark: "#090f0c",
  onPrimary: "#ffffff",
} as const;

const GRID = 512;
const CENTER = GRID / 2;

/** Stroke width shared by the ring and the check, so they read as one mark. */
export const MARK_STROKE = 46;

const RING_RADIUS = 148;
/** The ring runs clockwise from the top-right round to the top-left, leaving a gap at the top. */
const RING_START_DEG = -48;
const RING_END_DEG = 222;
/** Stroke that rounds the arrowhead's corners. */
export const MARK_ARROW_ROUNDING = 14;

const round = (value: number) => Math.round(value * 10) / 10;

type Point = readonly [number, number];

function pointOnRing(degrees: number): Point {
  const rad = (degrees * Math.PI) / 180;
  return [CENTER + RING_RADIUS * Math.cos(rad), CENTER + RING_RADIUS * Math.sin(rad)];
}

function ringPath(): string {
  const [x1, y1] = pointOnRing(RING_START_DEG);
  const [x2, y2] = pointOnRing(RING_END_DEG);
  const largeArc = RING_END_DEG - RING_START_DEG > 180 ? 1 : 0;
  return `M${round(x1)} ${round(y1)}A${RING_RADIUS} ${RING_RADIUS} 0 ${largeArc} 1 ${round(x2)} ${round(y2)}`;
}

/** Arrowhead at the end of the ring (tip, outer corner, inner corner), along the clockwise tangent. */
function arrowPoints(): [Point, Point, Point] {
  const rad = (RING_END_DEG * Math.PI) / 180;
  const [ex, ey] = pointOnRing(RING_END_DEG);
  const [tx, ty] = [-Math.sin(rad), Math.cos(rad)];
  const [nx, ny] = [Math.cos(rad), Math.sin(rad)];
  const forward = MARK_STROKE * 0.95;
  const back = MARK_STROKE * 0.2;
  const halfWidth = MARK_STROKE * 1.02;
  const baseX = ex - tx * back;
  const baseY = ey - ty * back;
  return [
    [ex + tx * forward, ey + ty * forward],
    [baseX + nx * halfWidth, baseY + ny * halfWidth],
    [baseX - nx * halfWidth, baseY - ny * halfWidth],
  ];
}

function arrowPath(): string {
  const [tip, outer, inner] = arrowPoints().map(([x, y]) => `${round(x)} ${round(y)}`);
  return `M${tip}L${outer}L${inner}Z`;
}

export const MARK_PATHS = {
  ring: ringPath(),
  arrow: arrowPath(),
  check: "M186 266L234 314L328 212",
} as const;

/** The mark's SVG elements in one color, on the 512 grid. */
export function markElements(color: string): string {
  const stroke = `stroke="${color}" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  return [
    `<path d="${MARK_PATHS.ring}" ${stroke}/>`,
    // A thin stroke with round joins softens the arrowhead's corners.
    `<path d="${MARK_PATHS.arrow}" fill="${color}" stroke="${color}" stroke-width="${MARK_ARROW_ROUNDING}" stroke-linejoin="round"/>`,
    `<path d="${MARK_PATHS.check}" ${stroke}/>`,
  ].join("");
}

export type IconBackground = "rounded" | "full" | "none";

export type BrandIconOptions = {
  /** Output size in pixels (the SVG is square). */
  size: number;
  /** rounded: app-icon tile; full: full-bleed (maskable, Apple); none: transparent. */
  background: IconBackground;
  /** Scale of the mark around the center; 1 means the 512-grid geometry as is. */
  scale: number;
  foreground?: string;
  backgroundColor?: string;
};

/** A complete SVG document for an icon. Pure, so it can be tested and rendered by sharp. */
export function brandIconSvg({
  size,
  background,
  scale,
  foreground = BRAND_COLORS.onPrimary,
  backgroundColor = BRAND_COLORS.primary,
}: BrandIconOptions): string {
  const tile =
    background === "rounded"
      ? `<rect width="${GRID}" height="${GRID}" rx="${round(GRID * 0.225)}" fill="${backgroundColor}"/>`
      : background === "full"
        ? `<rect width="${GRID}" height="${GRID}" fill="${backgroundColor}"/>`
        : "";
  const transform = `translate(${CENTER} ${CENTER}) scale(${scale}) translate(${-CENTER} ${-CENTER})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}">` +
    `${tile}<g transform="${transform}">${markElements(foreground)}</g></svg>`
  );
}

/**
 * Farthest point of the mark from the center, in grid units. Used to check that the
 * maskable icon keeps the mark inside the safe zone.
 */
export function markExtent(): number {
  const ring = RING_RADIUS + MARK_STROKE / 2;
  const arrow = Math.max(
    ...arrowPoints().map(([x, y]) => Math.hypot(x - CENTER, y - CENTER) + MARK_ARROW_ROUNDING / 2),
  );
  return Math.max(ring, arrow);
}

export const MARK_GRID = GRID;
