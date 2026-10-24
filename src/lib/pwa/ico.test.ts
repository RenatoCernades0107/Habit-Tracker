import { describe, expect, it } from "vitest";

import { encodeIco } from "./ico";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function fakePng(length: number): Uint8Array {
  const bytes = new Uint8Array(length).fill(7);
  bytes.set(PNG_SIGNATURE, 0);
  return bytes;
}

describe("encodeIco", () => {
  it("writes a header, one directory entry per image and the image data", () => {
    const images = [
      { size: 16, png: fakePng(10) },
      { size: 32, png: fakePng(20) },
      { size: 256, png: fakePng(5) },
    ];
    const ico = encodeIco(images);
    const view = new DataView(ico.buffer);

    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(3);
    expect(ico.length).toBe(6 + 16 * 3 + 35);

    images.forEach(({ size, png }, i) => {
      const entry = 6 + 16 * i;
      expect(view.getUint8(entry)).toBe(size === 256 ? 0 : size);
      expect(view.getUint8(entry + 1)).toBe(size === 256 ? 0 : size);
      expect(view.getUint16(entry + 4, true)).toBe(1);
      expect(view.getUint16(entry + 6, true)).toBe(32);
      expect(view.getUint32(entry + 8, true)).toBe(png.length);
      const offset = view.getUint32(entry + 12, true);
      expect([...ico.slice(offset, offset + 4)]).toEqual(PNG_SIGNATURE);
    });
  });

  it("rejects empty input and impossible sizes", () => {
    expect(() => encodeIco([])).toThrow();
    expect(() => encodeIco([{ size: 512, png: fakePng(4) }])).toThrow();
    expect(() => encodeIco([{ size: 0, png: fakePng(4) }])).toThrow();
  });
});
