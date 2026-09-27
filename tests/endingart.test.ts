/**
 * The endings have pictures (Stage 681): every ending has a plate, and every plate is a real
 * 1280x720 JPEG where the card asks for it, light enough to arrive with the arc's last card. Whether
 * the card shows it, loaded, for the ending the file actually earned, is read by probe:campaign.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ENDINGS } from "../shared/campaign/testimony";
import { ENDING_ART } from "../client/endings";

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

describe("the endings' plates", () => {
  it("every ending has its own plate, and no two share one", () => {
    expect(Object.keys(ENDING_ART).sort()).toEqual(ENDINGS.map((e) => e.id).sort());
    expect(new Set(Object.values(ENDING_ART)).size).toBe(ENDINGS.length);
  });

  it("each plate is a 1280x720 JPEG under 200 KB", () => {
    for (const e of ENDINGS) {
      const path = `public${ENDING_ART[e.id]}`;
      expect(jpegSize(path), e.id).toEqual({ w: 1280, h: 720 });
      expect(readFileSync(path).length, e.id).toBeLessThan(200_000);
    }
  });
});
