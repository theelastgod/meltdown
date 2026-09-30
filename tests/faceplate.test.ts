/**
 * A second portrait fades over the first (Stage 717).
 *
 * The same face holds. Opening on a plate zooms. Closing is not a cut. Treating a change of
 * face as a fresh zoom fails the cross check.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertOnCut, ALERT_HOME, LETTER_VH, platePass, plateTop, thumbBeside } from "../client/hud/faceplate";

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

  it("starts the plate under the bar on a phone", () => {
    expect(plateTop(false)).toBe(12);
    expect(plateTop(true)).toBe(LETTER_VH + 1);
    expect(plateTop(true)).toBeGreaterThan(LETTER_VH);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/plateTop\(this\.root\.classList\.contains\("touch"\)\)/);
    const css = readFileSync(new URL("../client/hud/hud.css", import.meta.url), "utf8");
    expect(css).toMatch(/#hud\.touch \.faceplate \{ top: 12vh/);
  });

  it("does not show the thumbnail when the big plate is that face", () => {
    expect(thumbBeside(DEACON, DEACON)).toBeNull();
    expect(thumbBeside(DEACON, MARROW)).toBeNull();
    expect(thumbBeside(null, DEACON)).toBe(DEACON);
    expect(thumbBeside(null, null)).toBeNull();
    const camp = readFileSync(new URL("../client/campaign.ts", import.meta.url), "utf8");
    expect(camp.split("thumbBeside(plate, portraitFor").length - 1).toBe(2);
  });

  it("parks the alert in the bar during a line, and leaves it under the compass after", () => {
    expect(alertOnCut(true)).toEqual({ top: 8, z: "6" });
    expect(alertOnCut(false)).toEqual({ top: ALERT_HOME, z: "" });
    expect(alertOnCut(true).top).toBeLessThan(ALERT_HOME);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/const seat = alertOnCut\(on\)/);
    expect(hud).toMatch(/banner\.style\.zIndex = seat\.z/);
  });
});
