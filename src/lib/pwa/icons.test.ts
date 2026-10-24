import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { brandIconSvg, MARK_GRID, markExtent } from "./brand";
import { FAVICON_SVG, ICON_PATHS, ICON_SCALES, PNG_ICON_SPECS } from "./icons";

const root = process.cwd();
const half = MARK_GRID / 2;

describe("brand mark geometry", () => {
  it("keeps the maskable mark inside the 80% safe zone (a circle of radius 40%)", () => {
    expect(markExtent() * ICON_SCALES.maskable).toBeLessThanOrEqual(MARK_GRID * 0.4);
  });

  it("never clips the mark on any icon", () => {
    for (const scale of Object.values(ICON_SCALES)) {
      expect(markExtent() * scale).toBeLessThan(half);
    }
  });

  it("builds a square SVG with the requested size and background", () => {
    const rounded = brandIconSvg({ size: 192, background: "rounded", scale: 1 });
    expect(rounded).toMatch(/^<svg [^>]*width="192" height="192" viewBox="0 0 512 512"/);
    expect(rounded).toContain('rx="');

    const full = brandIconSvg({ size: 512, background: "full", scale: 1 });
    expect(full).toContain('<rect width="512" height="512" fill=');
    expect(full).not.toContain('rx="');

    const none = brandIconSvg({ size: 96, background: "none", scale: 1, foreground: "#fff" });
    expect(none).not.toContain("<rect");
    expect(none).toContain('stroke="#fff"');
  });
});

describe("generated icons (run `npm run icons` after changing the mark)", () => {
  it.each(PNG_ICON_SPECS.map((spec) => [spec.file, spec] as const))(
    "%s exists with the right size",
    async (file, spec) => {
      const path = join(root, file);
      expect(existsSync(path)).toBe(true);
      const meta = await sharp(path).metadata();
      expect(meta.format).toBe("png");
      expect([meta.width, meta.height]).toEqual([spec.size, spec.size]);
      if (spec.opaque) expect(meta.hasAlpha).toBe(false);
    },
  );

  it("renders the notification badge as a white mark on transparent", async () => {
    const { data, info } = await sharp(join(root, "public", ICON_PATHS.badge96))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    let opaquePixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] ?? 0;
      if (alpha === 0) continue;
      opaquePixels++;
      // Fully visible pixels are white; edge pixels only vary in alpha.
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
    }
    expect(opaquePixels).toBeGreaterThan(info.width * info.height * 0.1);
    // Corners are empty: no background tile.
    expect(data[3]).toBe(0);
  });

  it("keeps src/app/icon.svg in sync with the brand mark", () => {
    expect(readFileSync(join(root, "src/app/icon.svg"), "utf8").trim()).toBe(FAVICON_SVG);
  });

  it("writes a favicon.ico", () => {
    const ico = readFileSync(join(root, "src/app/favicon.ico"));
    // ICONDIR: reserved 0, type 1 (icon).
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
  });
});
