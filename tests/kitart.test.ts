/**
 * The campaign's kit has pictures (Stage 685): every Kernel Protocol and every campaign weapon, and
 * nothing else, has its own image on disk where the desk asks for it; a protocol's row leads with its
 * emblem, and a weapon's card carries its render, dimmed until the file owns it. Whether the live
 * desk shows them, loaded, is read by probe:campaign.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PROTOCOLS } from "../shared/campaign/protocols";
import { CAMPAIGN_WEAPONS } from "../shared/weapons/manifest";
import { PROTOCOL_ART, WEAPON_ART, protocolIcon, weaponCard } from "../client/kitart";

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

describe("the kit's pictures", () => {
  it("every protocol, and nothing else, has its own emblem: a 128 px square JPEG under 16 KB", () => {
    expect(Object.keys(PROTOCOL_ART).sort()).toEqual(PROTOCOLS.map((p) => p.id).sort());
    expect(new Set(Object.values(PROTOCOL_ART)).size).toBe(PROTOCOLS.length);
    for (const p of PROTOCOLS) {
      const path = `public${PROTOCOL_ART[p.id]}`;
      expect(jpegSize(path), p.id).toEqual({ w: 128, h: 128 });
      expect(readFileSync(path).length, p.id).toBeLessThan(16_000);
    }
  });

  it("every campaign weapon, and nothing else, has its render: a 320x180 JPEG under 30 KB", () => {
    expect(Object.keys(WEAPON_ART).sort()).toEqual([...CAMPAIGN_WEAPONS].sort());
    for (const w of CAMPAIGN_WEAPONS) {
      const path = `public${WEAPON_ART[w]}`;
      expect(jpegSize(path), w).toEqual({ w: 320, h: 180 });
      expect(readFileSync(path).length, w).toBeLessThan(30_000);
    }
  });

  it("a protocol's row leads with its own emblem and no other's", () => {
    for (const p of PROTOCOLS) {
      const html = protocolIcon(p.id);
      expect(html).toContain(`src="${PROTOCOL_ART[p.id]}"`);
      for (const o of PROTOCOLS) if (o.id !== p.id) expect(html).not.toContain(PROTOCOL_ART[o.id]);
    }
    expect(protocolIcon("no_such_protocol")).toBe("");
  });

  it("a weapon's card carries its own render and name, dimmed until owned", () => {
    for (const w of CAMPAIGN_WEAPONS) {
      const owned = weaponCard(w, "NAME", true);
      const not = weaponCard(w, "NAME", false);
      expect(owned).toContain(`src="${WEAPON_ART[w]}"`);
      for (const o of CAMPAIGN_WEAPONS) if (o !== w) expect(owned).not.toContain(WEAPON_ART[o]!);
      expect(owned).toMatch(/class="cw"/);
      expect(owned).toContain("▣ NAME");
      expect(not).toMatch(/class="cw off"/);
      expect(not).toContain("▢ NAME");
    }
  });
});
