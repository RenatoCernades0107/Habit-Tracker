/**
 * Renders every app icon from the brand mark in src/lib/pwa/brand.ts (FR-PWA-1).
 * Run after changing the mark: `npm run icons` (or `npx tsx scripts/generate-icons.ts`).
 * The outputs are committed; nothing runs at build time.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import sharp from "sharp";

import { BRAND_COLORS } from "../src/lib/pwa/brand";
import { encodeIco } from "../src/lib/pwa/ico";
import {
  FAVICON_ICO_SIZES,
  FAVICON_SVG,
  faviconIcoSvg,
  PNG_ICON_SPECS,
} from "../src/lib/pwa/icons";

const ROOT = process.cwd();

async function renderPng(svg: string, size: number, opaque = false): Promise<Buffer> {
  // Rasterizes at about 4x and scales down: smoother edges on the small icons.
  let image = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
  if (opaque) image = image.flatten({ background: BRAND_COLORS.primary });
  return image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function write(file: string, data: Uint8Array | string): Promise<void> {
  const path = join(ROOT, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(`✓ ${file}`);
}

async function main(): Promise<void> {
  for (const { file, size, svg, opaque } of PNG_ICON_SPECS) {
    await write(file, await renderPng(svg, size, opaque));
  }

  await write("src/app/icon.svg", `${FAVICON_SVG}\n`);

  const icoImages = await Promise.all(
    FAVICON_ICO_SIZES.map(async (size) => ({
      size,
      png: await renderPng(faviconIcoSvg(size), size),
    })),
  );
  await write("src/app/favicon.ico", encodeIco(icoImages));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
