/**
 * The gigs have pictures (Stage 684): every gig, and nothing else, has its own thumbnail, a real
 * 320x180 JPEG where the desk asks for it, and a desk row leads with it. Whether the live desk shows
 * them, loaded, is read by probe:campaign.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GIGS, MAIN_ARC } from "../shared/campaign/missions";
import { GIG_ART, gigThumb } from "../client/gigart";

function jpegSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b[0] === 0xff && b[1] === 0xd8, `${path} is not a JPEG`).toBe(true);
  let o = 2;
  while (o < b.length) {
    const m = b[o + 1]!;
    const len = b.readUInt16BE(o + 2);
    if (m === 0xc0 || m === 0xc2) return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
    o += 2 + len;
  }
  throw new Error(`no frame in ${path}`);
}

describe("the gigs' pictures", () => {
  it("every gig, and nothing else, has its own thumbnail: a 320x180 JPEG light enough for a list of rows", () => {
    expect(Object.keys(GIG_ART).sort()).toEqual(GIGS.map((g) => g.id).sort());
    expect(new Set(Object.values(GIG_ART)).size).toBe(GIGS.length);
    for (const g of GIGS) {
      const path = `public${GIG_ART[g.id]}`;
      expect(jpegSize(path), g.id).toEqual({ w: 320, h: 180 });
      expect(readFileSync(path).length, g.id).toBeLessThan(30_000);
    }
  });

  it("a gig's row leads with its own picture; a mission's row has none", () => {
    for (const g of GIGS) {
      const html = gigThumb(g.id);
      expect(html).toContain(`src="${GIG_ART[g.id]}"`);
      for (const o of GIGS) if (o.id !== g.id) expect(html).not.toContain(GIG_ART[o.id]);
    }
    for (const m of MAIN_ARC) expect(gigThumb(m.id)).toBe("");
  });
});
