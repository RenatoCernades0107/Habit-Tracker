/**
 * Packs PNG images into a .ico file (PNG-compressed entries, supported by every current
 * browser and Windows Vista+). Build-time helper for scripts/generate-icons.ts: sharp
 * can't write ICO, and adding a dependency for 30 lines isn't worth it.
 */
export type IcoImage = { size: number; png: Uint8Array };

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

export function encodeIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error("encodeIco needs at least one image");

  const total =
    HEADER_BYTES + ENTRY_BYTES * images.length + images.reduce((sum, i) => sum + i.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  // ICONDIR: reserved, type (1 = icon), image count.
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = HEADER_BYTES + ENTRY_BYTES * images.length;
  images.forEach(({ size, png }, index) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) {
      throw new Error(`ICO images must be 1–256 px, got ${size}`);
    }
    const entry = HEADER_BYTES + ENTRY_BYTES * index;
    // ICONDIRENTRY: width and height (0 means 256), palette size, reserved, planes, bpp.
    view.setUint8(entry, size === 256 ? 0 : size);
    view.setUint8(entry + 1, size === 256 ? 0 : size);
    view.setUint8(entry + 2, 0);
    view.setUint8(entry + 3, 0);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });

  return out;
}
