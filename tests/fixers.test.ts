/**
 * The fixers have bodies (Stage 667).
 *
 * Until this stage the Deacon, Marrow, Ida Vessel and August Wern — the four people who hand the
 * player every contract in the arc — existed only as a name and a sigil on the terminal. These tests
 * hold their figures to what makes them read: four different silhouettes, each lit in the colour the
 * art bible allows them, no light on any face, and the right one standing in the office.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildFixer, EMBODIED, FIXER_SCALE, FIXER_TRIM, fixerGeometry, type FixerBody } from "../client/render/figures";
import { PALETTE } from "../client/render/city";
import { officeVisitor } from "../shared/campaign/save";
import { emptyCampaign } from "../shared/campaign/save";
import { MAIN_ARC } from "../shared/campaign/missions";
import { deadletterOffice } from "../shared/sim/hub";
import { whiteOffice } from "../shared/sim/white";
import { VISITOR_AT } from "../client/render/hub";
import { WERN_AT } from "../client/render/renderer";

const bbox = (id: FixerBody) => {
  const g = fixerGeometry(id).body;
  g.computeBoundingBox();
  const b = g.boundingBox!.clone();
  const s = FIXER_SCALE[id];
  return { h: b.max.y * s, w: (b.max.x - b.min.x) * s, d: (b.max.z - b.min.z) * s };
};

describe("the fixers, in the flesh", () => {
  it("VANTAGE is the model's voice and has no body; the four people do", () => {
    expect([...EMBODIED].sort()).toEqual(["deacon", "marrow", "vessel", "wern"]);
    for (const id of EMBODIED) {
      const f = buildFixer(id);
      expect(f.name).toBe(`fixer:${id}`);
      expect(fixerGeometry(id).body.getAttribute("position").count, `${id} has no body`).toBeGreaterThan(200);
      expect(fixerGeometry(id).trim.getAttribute("position").count, `${id} has no light`).toBeGreaterThan(20);
    }
  });

  it("four silhouettes, not one figure four times: every pair differs in height, width or depth", () => {
    const b = Object.fromEntries(EMBODIED.map((id) => [id, bbox(id)])) as Record<FixerBody, ReturnType<typeof bbox>>;
    for (let i = 0; i < EMBODIED.length; i++) {
      for (let j = i + 1; j < EMBODIED.length; j++) {
        const a = b[EMBODIED[i]!], c = b[EMBODIED[j]!];
        const differ = Math.abs(a.h - c.h) / a.h > 0.03 || Math.abs(a.w - c.w) / a.w > 0.03 || Math.abs(a.d - c.d) / a.d > 0.03;
        expect(differ, `${EMBODIED[i]} and ${EMBODIED[j]} have the same outline`).toBe(true);
      }
    }
    // Marrow is the one bent small; Wern and the Deacon stand tallest
    expect(b.marrow.h).toBeLessThan(Math.min(b.deacon.h, b.vessel.h, b.wern.h));
    expect(Math.min(b.wern.h, b.deacon.h)).toBeGreaterThan(b.vessel.h);
  });

  it("each is lit in the colour the art bible allows: amber is VANTAGE's, blood-red is Wern's alone", () => {
    expect(FIXER_TRIM.deacon).toBe(PALETTE.cyan);
    expect(FIXER_TRIM.marrow).toBe(PALETTE.magenta);
    // Ida Vessel's terminal colour is amber, but amber in the world means VANTAGE is watching
    expect(FIXER_TRIM.vessel).not.toBe(PALETTE.amber);
    expect(FIXER_TRIM.wern).toBe(PALETTE.red);
    for (const id of EMBODIED) if (id !== "wern") expect(FIXER_TRIM[id], `${id} wears the Kernel's red`).not.toBe(PALETTE.red);
    // and the material in the scene is that colour, not merely the table
    for (const id of EMBODIED) {
      const trim = buildFixer(id).children.find((c) => (c as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex() !== 0) as THREE.Mesh;
      expect((trim.material as THREE.MeshBasicMaterial).color.getHex()).toBe(FIXER_TRIM[id]);
    }
  });

  it("no light on any face: nothing lit stands in front of a head, hooded or bare", () => {
    // the face zone of each, in the figure's own frame (front is -z): centred on the head, a hand's width across
    const face: Record<FixerBody, { y0: number; y1: number }> = { deacon: { y0: 1.58, y1: 1.74 }, marrow: { y0: 1.5, y1: 1.68 }, vessel: { y0: 1.62, y1: 1.76 }, wern: { y0: 1.66, y1: 1.8 } };
    for (const id of EMBODIED) {
      const pos = fixerGeometry(id).trim.getAttribute("position");
      let lit = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (Math.abs(x) < 0.06 && y > face[id].y0 && y < face[id].y1 && z < -0.05) lit++;
      }
      expect(lit, `${id} has light on the face`).toBe(0);
    }
  });

  it("a hooded fixer's hood shows black inside it; a bare head carries no void", () => {
    expect(fixerGeometry("deacon").void.getAttribute("position").count).toBeGreaterThan(50);
    expect(fixerGeometry("marrow").void.getAttribute("position").count).toBeGreaterThan(50);
    expect(fixerGeometry("vessel").void.getAttribute("position").count).toBe(0);
    expect(fixerGeometry("wern").void.getAttribute("position").count).toBe(0);
  });
});

describe("who is waiting in the Deadletter Office", () => {
  it("the fixer of the next contract, in person — walking the whole arc", () => {
    const c = emptyCampaign();
    const seen: (string | null)[] = [];
    for (const m of MAIN_ARC) {
      seen.push(officeVisitor(c));
      // the visitor is exactly the next mission's fixer, unless that is Wern (who never comes) or VANTAGE
      expect(officeVisitor(c)).toBe(m.fixer === "wern" || m.fixer === "vantage" ? null : m.fixer);
      c.missionsDone.push(m.id);
    }
    expect(officeVisitor(c), "nobody waits once the arc is done").toBeNull();
    // the arc brings three different people to the office, and leaves it empty for the last call
    expect(new Set(seen.filter(Boolean))).toEqual(new Set(["deacon", "marrow", "vessel"]));
    expect(seen[seen.length - 1]).toBeNull();
  });
});

describe("where they stand", () => {
  // a person is a 0.35 m circle from the floor to the head; nothing solid, renovated or dressed may pass through them
  const clear = (level: { boxes: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; tag?: string }[]; decor?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[] }, extra: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[], x: number, z: number) => {
    const r = 0.35;
    const hits = [...level.boxes, ...(level.decor ?? []), ...extra].filter((b) => b.min.y < 1.8 && b.max.y > 0.05 && x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z);
    // and indoors: walls on all four sides
    const walled = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => level.boxes.some((b) => b.max.y > 2 && (dx ? (dx > 0 ? b.min.x > x : b.max.x < x) && z > b.min.z && z < b.max.z : (dz! > 0 ? b.min.z > z : b.max.z < z) && x > b.min.x && x < b.max.x)));
    return { hits, walled };
  };

  it("the visitor stands in the Deadletter Office, clear of every wall, desk and renovation, facing the room", () => {
    const office = deadletterOffice();
    const { hits, walled } = clear(office, office.hub.renovation.map((r) => r.box), VISITOR_AT.x, VISITOR_AT.z);
    expect(hits, `the visitor stands inside ${hits.map((b) => (b as { tag?: string }).tag ?? "a box").join(", ")}`).toEqual([]);
    expect(walled).toBe(true);
    // facing into the room, toward where the file comes in, not the wall behind
    expect(Math.hypot(VISITOR_AT.faceX - VISITOR_AT.x, VISITOR_AT.faceZ - VISITOR_AT.z)).toBeGreaterThan(3);
  });

  it("Wern waits in the white office, clear of the desk, where the arc's last walk ends", () => {
    const white = whiteOffice();
    const { hits, walled } = clear(white, [], WERN_AT.x, WERN_AT.z);
    expect(hits, `Wern stands inside ${hits.map((b) => (b as { tag?: string }).tag ?? "a box").join(", ")}`).toEqual([]);
    expect(walled).toBe(true);
  });
});
