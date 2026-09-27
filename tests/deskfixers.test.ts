/**
 * Each fixer's face over their gigs on the contracts desk (Stage 683). The header the desk builds
 * carries the fixer's own terminal portrait, and a fixer the file has had re-leased keeps their face,
 * greyed out, beside the note. Whether the live desk shows them, loaded, is read by probe:campaign.
 */
import { describe, expect, it } from "vitest";
import { handlersAlive } from "../shared/campaign/testimony";
import { fixerHeader, PORTRAIT } from "../client/portraits";

const FIXERS = ["deacon", "marrow", "vessel"] as const;

describe("the desk's fixers have faces", () => {
  it("each header carries that fixer's own portrait, and not greyed while they are alive", () => {
    for (const h of FIXERS) {
      const html = fixerHeader(h, true);
      expect(html).toContain(`src="${PORTRAIT[h]}"`);
      for (const other of FIXERS) if (other !== h) expect(html).not.toContain(PORTRAIT[other]);
      expect(html).not.toMatch(/class="fp gone"/);
      expect(html).not.toContain("RE-LEASED");
    }
  });

  it("a fixer the file had re-leased keeps their face, greyed, beside the note: Ida after she is exposed", () => {
    const alive = handlersAlive({ "m4:vessel": "expose" });
    expect(alive.vessel).toBe(false);
    const html = fixerHeader("vessel", alive.vessel);
    expect(html).toContain(`src="${PORTRAIT.vessel}"`);
    expect(html).toMatch(/class="fp gone"/);
    expect(html).toContain("RE-LEASED");
  });
});
