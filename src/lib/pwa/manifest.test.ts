import { existsSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { BRAND_COLORS } from "@/lib/pwa/brand";

import manifest from "@/app/manifest";

// FR-PWA-1, docs/spec/03-architecture.md §8.
describe("web app manifest", () => {
  const data = manifest();

  it("describes an installable standalone app that starts on Today", () => {
    expect(data).toMatchObject({
      id: "/",
      name: "Restart",
      short_name: "Restart",
      start_url: "/today",
      scope: "/",
      display: "standalone",
      background_color: BRAND_COLORS.background,
      theme_color: BRAND_COLORS.background,
    });
    expect(data.description).toBeTruthy();
    expect(data.categories?.length).toBeGreaterThan(0);
  });

  it("has 192 and 512 icons plus a maskable one", () => {
    const icons = data.icons ?? [];
    expect(icons.filter((i) => i.purpose === "any").map((i) => i.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    expect(icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  });

  it("offers Today and Settings shortcuts inside the app's scope", () => {
    expect(data.shortcuts?.map((s) => s.url)).toEqual(["/today", "/settings"]);
  });

  it("points only at icons that exist, with the declared size", async () => {
    const icons = [...(data.icons ?? []), ...(data.shortcuts ?? []).flatMap((s) => s.icons ?? [])];
    for (const icon of icons) {
      const file = join(process.cwd(), "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const { width, height, format } = await sharp(file).metadata();
      expect(format).toBe("png");
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });
});
