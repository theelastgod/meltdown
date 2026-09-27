/**
 * The $CAPITAL mark (Stage 679): the files the UI points at exist, are the sizes they say, sit on a
 * transparent ground (a black square on a dark terminal panel is a sticker, not a mark), and the
 * page names the small one so the service worker precaches it for offline play. Whether each panel
 * actually shows it loaded is read in the browser: probe:ship (menu), probe:run (the strip),
 * probe:counter (the Counter-Ledger).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { CAPITAL_MARK } from "../client/brand";

/** decode an 8-bit RGBA, non-interlaced PNG (what a canvas writes): width, height, and a pixel reader */
function png(path: string) {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  let off = 8;
  let w = 0, h = 0, type = -1, depth = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.subarray(off + 4, off + 8).toString();
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8]!;
      type = data[9]!;
    } else if (kind === "IDAT") idat.push(data);
    off += 12 + len;
  }
  expect(type, `${path} is not RGBA`).toBe(6);
  expect(depth).toBe(8);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const a = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= 4 ? out[y * stride + x - 4]! : 0;
      const up = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const ul = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4]! : 0;
      const p = left + up - ul;
      const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
      const pred = f === 0 ? 0 : f === 1 ? left : f === 2 ? up : f === 3 ? (left + up) >> 1 : pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      out[y * stride + x] = (a + pred) & 255;
    }
  }
  return { w, h, at: (x: number, y: number) => [...out.subarray(y * stride + x * 4, y * stride + x * 4 + 4)] as [number, number, number, number] };
}

describe("the $CAPITAL mark", () => {
  for (const [name, path, size] of [["small", CAPITAL_MARK.small, 64], ["large", CAPITAL_MARK.large, 256]] as const) {
    it(`the ${name} mark is a ${size} px ¥ in gold on a transparent ground`, () => {
      const p = png(`public${path}`);
      expect([p.w, p.h]).toEqual([size, size]);
      // the corners are ground, keyed out
      for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]] as [number, number][]) expect(p.at(x, y)[3], `corner ${x},${y}`).toBe(0);
      // and the glyph is there: most opaque pixels are the Estate's gold (red and green high, blue low)
      let opaque = 0, gold = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const [r, g, b, a] = p.at(x, y);
        if (a < 200) continue;
        opaque++;
        if (r > 180 && g > 150 && b < 110) gold++;
      }
      expect(opaque / (size * size), "the mark is empty").toBeGreaterThan(0.08);
      expect(gold / opaque, "the mark is not gold").toBeGreaterThan(0.5);
    });
  }

  it("the page names the small mark, so the service worker precaches it", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(`href="${CAPITAL_MARK.small}"`);
    // the worker precaches what the shell's src/href attributes name under /icons/
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toMatch(/assets\|icons/);
  });
});
