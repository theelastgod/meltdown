/**
 * The airship's hanging panel does not share a fade.
 * Lease Row keeps the opaque plate the skyline shipped with.
 * Colour stays skyMark. The hull stays shipCloth.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STREET_FADE, panelFade } from "../client/render/life";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district fades its own airship panel", () => {
  it("keeps the street plate and gives the other nineteen their own", () => {
    expect(STREET_FADE).toBe(1);
    expect(panelFade(undefined)).toBe(STREET_FADE);
    expect(panelFade("lease_row")).toBe(STREET_FADE);
    expect(panelFade("drainage_yard")).toBe(STREET_FADE);
    expect(panelFade("deadletter_office")).toBe(STREET_FADE);
    expect(panelFade("white_office")).toBe(STREET_FADE);
    const fades = CITY_DISTRICTS.map((id) => panelFade(id));
    expect(new Set(fades).size).toBe(CITY_DISTRICTS.length);
    expect(panelFade("night_market")).toBeLessThan(STREET_FADE);
    expect(panelFade("deadletter_docks")).toBeLessThan(panelFade("relay_heights"));
  });

  it("the sky paints that fade on the panel it already hangs", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    expect(life).toContain("const fade = panelFade(name);");
    expect(life).toContain("color: mark.panel, opacity: fade, transparent: fade < 1, depthWrite: fade === 1");
    expect(life).toContain('bindPlate(panelMat, "tex_billboard_mg")');
  });
});
