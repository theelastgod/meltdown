/**
 * A panel drawn over another panel has to hide it (Stage 161). Measured on a drawn HUD at 960×540,
 * the district chooser's box is 386×189 and overlaps the contracts panel by 72 954 px² — all of it —
 * at `rgba(3, 5, 9, 0.72)`. The endgame probe's own frame shows the district rows with
 * `[ENTER] SIGN` legible straight through them.
 */
import { describe, expect, it } from "vitest";
import { cssAlpha, hidesPanels } from "../client/hud/panel";

describe("a colour's alpha as the browser reports it", () => {
  it("reads what the panels are actually painted", () => {
    expect(cssAlpha("rgba(3, 5, 9, 0.72)")).toBe(0.72); // --pan, what the chooser had
    expect(cssAlpha("rgb(3, 5, 9)")).toBe(1); // --solid, what it has now
    expect(cssAlpha("rgba(2,3,6,0.9)")).toBe(0.9); // the full-screen card
  });

  it("counts anything it cannot read as see-through, which is the failing side", () => {
    for (const bad of ["", "transparent", "none", "var(--pan)", "rgb(3,5)", "rgba(3,5,9,huh)"]) {
      expect(cssAlpha(bad)).toBe(0);
    }
  });

  it("reads the space-and-slash form and a percentage alpha", () => {
    expect(cssAlpha("rgb(3 5 9 / 0.72)")).toBe(0.72);
    expect(cssAlpha("rgba(3, 5, 9, 50%)")).toBe(0.5);
  });

  it("never reports an alpha outside the range a colour can have", () => {
    expect(cssAlpha("rgba(3,5,9,4)")).toBe(1);
    expect(cssAlpha("rgba(3,5,9,-2)")).toBe(0);
  });
});

describe("whether a panel hides what it covers", () => {
  it("lets a panel over nothing be as translucent as the look wants", () => {
    // this is the HUD's whole style: the city shows through the chrome
    expect(hidesPanels(0.72, 0)).toBe(true);
    expect(hidesPanels(0, 0)).toBe(true);
  });

  it("fails a translucent panel drawn over another panel", () => {
    expect(hidesPanels(0.72, 72954)).toBe(false);
    expect(hidesPanels(0.99, 1)).toBe(false);
  });

  it("passes an opaque one", () => {
    expect(hidesPanels(1, 72954)).toBe(true);
  });
});
