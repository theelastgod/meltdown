/**
 * The arc's missions have key art (Stage 682): every mission in the arc has a banner, a real
 * 960 px-wide JPEG where the desk asks for it, and the desk leads with the next mission's, or with
 * the ending's plate once the arc is done. Whether the desk shows it, loaded, is read by probe:campaign.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAIN_ARC } from "../shared/campaign/missions";
import { ENDINGS } from "../shared/campaign/testimony";
import { deskBanner, MISSION_ART } from "../client/missionart";
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

describe("the arc's key art", () => {
  it("every mission in the arc, and nothing else, has its own banner: a 960 px-wide JPEG under 150 KB", () => {
    expect(Object.keys(MISSION_ART).sort()).toEqual(MAIN_ARC.map((m) => m.id).sort());
    expect(new Set(Object.values(MISSION_ART)).size).toBe(MAIN_ARC.length);
    for (const m of MAIN_ARC) {
      const path = `public${MISSION_ART[m.id]}`;
      const size = jpegSize(path);
      expect(size.w, m.id).toBe(960);
      expect(size.w / size.h, `${m.id} is not a wide banner`).toBeGreaterThan(2.2);
      expect(readFileSync(path).length, m.id).toBeLessThan(150_000);
    }
  });

  it("the desk leads with the next mission's banner, and with the earned ending's plate once the arc is done", () => {
    for (const m of MAIN_ARC) expect(deskBanner(m.id, null, ENDING_ART)).toBe(MISSION_ART[m.id]);
    for (const e of ENDINGS) expect(deskBanner(null, e.id, ENDING_ART)).toBe(ENDING_ART[e.id]);
    expect(deskBanner(null, null, ENDING_ART)).toBeNull();
  });
});
