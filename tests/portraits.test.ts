/**
 * Who is speaking (Stage 680). Every handler has a portrait, every portrait is a real 256 px image
 * on disk where the page asks for it, and every line in every script is spoken by a handler, the file
 * itself or the bare terminal, so no speaker can reach the screen without a face. Whether the terminal
 * actually shows it, loaded, is read in the browser by probe:campaign.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HANDLERS, type HandlerId } from "../shared/campaign/factions";
import { SCRIPTS } from "../shared/campaign/script";
import { PORTRAIT, portraitFor } from "../client/portraits";

/** a baseline or progressive JPEG's size, read from its start-of-frame marker */
function jpegSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b[0] === 0xff && b[1] === 0xd8, `${path} is not a JPEG`).toBe(true);
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xff) throw new Error(`bad marker at ${o} in ${path}`);
    const m = b[o + 1]!;
    const len = b.readUInt16BE(o + 2);
    if (m === 0xc0 || m === 0xc2) return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
    o += 2 + len;
  }
  throw new Error(`no frame in ${path}`);
}

describe("the speakers' portraits", () => {
  it("every handler has a portrait: a 256 px JPEG, small enough to arrive with the line it belongs to", () => {
    expect(Object.keys(PORTRAIT).sort()).toEqual(Object.keys(HANDLERS).sort());
    for (const id of Object.keys(HANDLERS) as HandlerId[]) {
      const path = `public${PORTRAIT[id]}`;
      expect(jpegSize(path), id).toEqual({ w: 256, h: 256 });
      expect(readFileSync(path).length, `${id} is heavier than a line of dialogue should wait for`).toBeLessThan(40_000);
    }
  });

  it("every node in every script is spoken by someone the terminal can show, or by the file or the terminal itself", () => {
    const speakers = new Set(SCRIPTS.flatMap((s) => s.nodes.map((n) => n.speaker)));
    for (const sp of speakers) {
      if (sp === "you" || sp === "terminal") expect(portraitFor(sp), sp).toBeNull();
      else expect(portraitFor(sp), sp).toBe(PORTRAIT[sp]);
    }
    // and the four fixers and VANTAGE all speak somewhere
    for (const id of Object.keys(HANDLERS)) expect(speakers.has(id as HandlerId), `${id} never speaks`).toBe(true);
  });
});
