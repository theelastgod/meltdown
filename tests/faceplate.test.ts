/**
 * A second portrait fades over the first (Stage 717).
 *
 * The same face holds. Opening on a plate zooms. Closing is not a cut. Treating a change of
 * face as a fresh zoom fails the cross check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { platePass } from "../client/hud/faceplate";

const DEACON = "/portraits/deacon.jpg";
const MARROW = "/portraits/marrow.jpg";

describe("the portrait plate", () => {
  it("holds the same face, and fades a different one over it", () => {
    expect(platePass(null, null)).toBe("off");
    expect(platePass(DEACON, null)).toBe("off");
    expect(platePass(null, DEACON)).toBe("zoom");
    expect(platePass(DEACON, DEACON)).toBe("hold");
    expect(platePass(DEACON, MARROW)).toBe("cross");
    expect(platePass(MARROW, DEACON)).toBe("cross");
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/platePass\(on \? this\.plateShown : null, on \? plate : null\)/);
    expect(hud).toMatch(/img class="a"/);
    expect(hud).toMatch(/img class="b"/);
    expect(hud).toMatch(/pass === "hold"/);
    expect(hud).toMatch(/pass === "cross"/);
    expect(hud).toMatch(/pass === "zoom"/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/@keyframes facein/);
    expect(css).toMatch(/opacity: 0/);
    expect(css).toMatch(/to \{ opacity: 1; \}/);
  });
});
