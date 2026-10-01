/**
 * The fixers have bodies (Stage 667).
 *
 * Until this stage the Deacon, Marrow, Ida Vessel and August Wern — the four people who hand the
 * player every contract in the arc — existed only as a name and a sigil on the terminal. These tests
 * hold their figures to what makes them read: four different silhouettes, each lit in the colour the
 * art bible allows them, no light on any face, and the right one standing in the office.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ATTEND, attend, attendTarget, buildFixer, DEACON_TOE_SHADE, EMBODIED, FIXER_COLLAR_SHADE, FIXER_SCALE, FIXER_TRIM, HAIR_SHADE, MARROW_FOOT_SHADE, TROUSER_SHADE, VESSEL_BOOT_SHADE, VESSEL_HIP, WERN_SHOE_SHADE, fixerGeometry, vesselWalkerGeometry, type FixerBody } from "../client/render/figures";
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

  it("a bare head is black on the coat, and the coat stays cloth", () => {
    const blackOn = (id: "vessel" | "wern", g: THREE.BufferGeometry) => {
      const color = g.getAttribute("color");
      const pos = g.getAttribute("position");
      expect(color, id).toBeTruthy();
      let black = 0;
      let cloth = 0;
      let hair = 0;
      for (let i = 0; i < color.count; i++) {
        const c = color.getX(i);
        if (c === 0) {
          black++;
          expect(pos.getY(i), id).toBeGreaterThan(1.5);
        } else if (Math.abs(c - HAIR_SHADE) < 1e-5) {
          hair++;
          expect(pos.getY(i), id).toBeGreaterThan(1.6);
        } else if (Math.abs(c - TROUSER_SHADE) < 1e-5 || Math.abs(c - VESSEL_BOOT_SHADE) < 1e-5 || Math.abs(c - WERN_SHOE_SHADE) < 1e-5 || Math.abs(c - FIXER_COLLAR_SHADE) < 1e-5) {
          // the leg is not the coat; its own checks hold the band
        } else {
          cloth++;
          expect(c, id).toBe(1);
        }
      }
      expect(black, id).toBeGreaterThan(30);
      expect(hair, `${id} hair wears the coat`).toBeGreaterThan(8);
      expect(cloth, id).toBeGreaterThan(200);
    };
    blackOn("vessel", fixerGeometry("vessel").body);
    blackOn("wern", fixerGeometry("wern").body);
    blackOn("vessel", vesselWalkerGeometry().body);
    const crown = (id: string, g: THREE.BufferGeometry) => {
      const color = g.getAttribute("color");
      const pos = g.getAttribute("position");
      let hair = 0;
      let cloth = 0;
      for (let i = 0; i < color.count; i++) {
        if (pos.getY(i) <= 1.78) continue;
        if (Math.abs(color.getX(i) - HAIR_SHADE) < 1e-5) hair++;
        else if (color.getX(i) === 1) cloth++;
      }
      expect(hair, `${id} hair wears the coat`).toBeGreaterThan(8);
      expect(cloth, `${id} crown went dark with the hair`).toBe(0);
    };
    crown("vessel", fixerGeometry("vessel").body);
    crown("wern", fixerGeometry("wern").body);
    crown("vessel-walk", vesselWalkerGeometry().body);
    const deaconGeo = fixerGeometry("deacon").body;
    const deacon = deaconGeo.getAttribute("color");
    const deaconPos = deaconGeo.getAttribute("position");
    expect(deacon).toBeTruthy();
    for (let i = 0; i < deacon.count; i++) {
      const c = deacon.getX(i);
      if (Math.abs(c - DEACON_TOE_SHADE) < 1e-5) expect(deaconPos.getY(i)).toBeLessThan(0.08);
      else expect(c).toBe(1);
    }
    const figures = readFileSync(new URL("../client/render/figures.ts", import.meta.url), "utf8");
    const escort = readFileSync(new URL("../client/render/escort.ts", import.meta.url), "utf8");
    expect(figures).toMatch(/new THREE\.MeshStandardMaterial\(\{ color: 0x06070b, roughness: 0\.95, vertexColors: true \}\)/);
    expect(escort).toMatch(/new THREE\.MeshStandardMaterial\(\{ color: 0x06070b, roughness: 0\.95, vertexColors: true \}\)/);
  });

  it("Ida's trousers are darker than the coat", () => {
    const tally = (g: THREE.BufferGeometry, hip: number) => {
      const color = g.getAttribute("color");
      const pos = g.getAttribute("position");
      let trouser = 0;
      let boot = 0;
      for (let i = 0; i < color.count; i++) {
        const c = color.getX(i);
        const y = pos.getY(i);
        if (Math.abs(c - TROUSER_SHADE) < 1e-5) {
          trouser++;
          expect(y).toBeLessThan(hip + 0.02);
          expect(y).toBeGreaterThan(hip - 0.55);
        } else if (y < hip - 0.45 && Math.abs(c - TROUSER_SHADE) > 1e-5) boot++;
      }
      return { trouser, boot };
    };
    const stand = tally(fixerGeometry("vessel").body, VESSEL_HIP.y);
    const walk = tally(vesselWalkerGeometry().leg, 0);
    expect(stand.trouser, "the trousers wear the coat").toBeGreaterThan(20);
    expect(walk.trouser, "the walk wears the coat").toBeGreaterThan(16);
    expect(stand.boot, "the boot went dark with the trouser").toBeGreaterThan(8);
    expect(walk.boot, "the walking boot went dark with the trouser").toBeGreaterThan(8);
    const wern = fixerGeometry("wern").body.getAttribute("color");
    for (let i = 0; i < wern.count; i++) expect(Math.abs(wern.getX(i) - TROUSER_SHADE)).toBeGreaterThan(1e-5);
  });

  it("Ida's boots are darker than the trousers", () => {
    const tally = (g: THREE.BufferGeometry, hip: number) => {
      const color = g.getAttribute("color");
      const pos = g.getAttribute("position");
      let boot = 0;
      let trouser = 0;
      for (let i = 0; i < color.count; i++) {
        const c = color.getX(i);
        const y = pos.getY(i);
        if (Math.abs(c - VESSEL_BOOT_SHADE) < 1e-5) {
          boot++;
          expect(y).toBeLessThan(hip - 0.4);
        } else if (Math.abs(c - TROUSER_SHADE) < 1e-5) trouser++;
      }
      return { boot, trouser };
    };
    const stand = tally(fixerGeometry("vessel").body, VESSEL_HIP.y);
    const walk = tally(vesselWalkerGeometry().leg, 0);
    expect(stand.boot, "the boots wear the coat").toBeGreaterThan(12);
    expect(walk.boot, "the walking boots wear the coat").toBeGreaterThan(12);
    expect(stand.trouser, "the trouser went dark with the boot").toBeGreaterThan(20);
    expect(walk.trouser, "the walking trouser went dark with the boot").toBeGreaterThan(16);
  });

  it("Wern's shoes are darker than the coat", () => {
    const g = fixerGeometry("wern").body;
    const color = g.getAttribute("color");
    const pos = g.getAttribute("position");
    let shoes = 0;
    let cloth = 0;
    for (let i = 0; i < color.count; i++) {
      const c = color.getX(i);
      const y = pos.getY(i);
      if (Math.abs(c - WERN_SHOE_SHADE) < 1e-5) {
        shoes++;
        expect(y).toBeLessThan(0.08);
      } else if (c === 1 && y > 0.2) cloth++;
    }
    expect(shoes, "the shoes wear the coat").toBeGreaterThan(20);
    expect(cloth, "the coat went dark with the shoes").toBeGreaterThan(20);
    const ida = fixerGeometry("vessel").body.getAttribute("color");
    let leak = 0;
    for (let i = 0; i < ida.count; i++) if (Math.abs(ida.getX(i) - WERN_SHOE_SHADE) < 1e-5) leak++;
    expect(leak, "Ida grew Wern's shoes").toBe(0);
  });

  it("the Deacon's toes are darker than the robe", () => {
    const g = fixerGeometry("deacon").body;
    const color = g.getAttribute("color");
    const pos = g.getAttribute("position");
    let toes = 0;
    let robe = 0;
    for (let i = 0; i < color.count; i++) {
      const c = color.getX(i);
      const y = pos.getY(i);
      if (Math.abs(c - DEACON_TOE_SHADE) < 1e-5) {
        toes++;
        expect(y).toBeLessThan(0.08);
      } else if (c === 1 && y > 0.2) robe++;
    }
    expect(toes, "the toes wear the robe").toBeGreaterThan(20);
    expect(robe, "the robe went dark with the toes").toBeGreaterThan(20);
  });

  it("Marrow's feet are darker than the cloak", () => {
    const g = fixerGeometry("marrow").body;
    const color = g.getAttribute("color");
    const pos = g.getAttribute("position");
    let feet = 0;
    let cloth = 0;
    for (let i = 0; i < color.count; i++) {
      const c = color.getX(i);
      const y = pos.getY(i);
      if (Math.abs(c - MARROW_FOOT_SHADE) < 1e-5) {
        feet++;
        expect(y).toBeLessThan(0.2);
      } else if (c === 1 && y > 0.4) cloth++;
    }
    expect(feet, "the feet wear the cloak").toBeGreaterThan(20);
    expect(cloth, "the cloak went dark with the feet").toBeGreaterThan(20);
  });

  it("a bare head's collar is darker than the coat", () => {
    const tally = (g: THREE.BufferGeometry) => {
      const color = g.getAttribute("color");
      const pos = g.getAttribute("position");
      let collar = 0;
      let hair = 0;
      let cloth = 0;
      for (let i = 0; i < color.count; i++) {
        const c = color.getX(i);
        const y = pos.getY(i);
        if (Math.abs(c - FIXER_COLLAR_SHADE) < 1e-5) {
          collar++;
          expect(y).toBeGreaterThan(1.4);
          expect(y).toBeLessThan(1.7);
        } else if (Math.abs(c - HAIR_SHADE) < 1e-5) hair++;
        else if (c === 1 && y < 1.4) cloth++;
      }
      return { collar, hair, cloth };
    };
    for (const [id, g] of [["vessel", fixerGeometry("vessel").body], ["wern", fixerGeometry("wern").body], ["walk", vesselWalkerGeometry().body]] as const) {
      const n = tally(g);
      expect(n.collar, `${id} collar wears the coat`).toBeGreaterThan(12);
      expect(n.hair, `${id} hair went dark with the collar`).toBeGreaterThan(8);
      expect(n.cloth, `${id} coat went dark with the collar`).toBeGreaterThan(20);
    }
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

describe("a fixer waiting for you (Stage 672)", () => {
  const facing = (f: THREE.Group, px: number, pz: number) => {
    // a figure's front is its -z: the cosine between that and the way to the player
    const fx = -Math.sin(f.rotation.y), fz = -Math.cos(f.rotation.y);
    const dx = px - f.position.x, dz = pz - f.position.z;
    return (fx * dx + fz * dz) / Math.hypot(dx, dz);
  };

  it("turns toward a player who comes near, no faster than it should and no further, and back when they go", () => {
    const f = buildFixer("deacon");
    f.position.set(0, 0, 0);
    f.rotation.y = 0; // facing -z
    const side = { x: 3, z: 0 }; // well to its right, inside ATTEND.near
    const before = facing(f, side.x, side.z);
    attend(f, 0.1, side.x, side.z, 0);
    expect(Math.abs(f.rotation.y), "it snapped round").toBeLessThanOrEqual(ATTEND.rate * 0.1 + 1e-9);
    for (let k = 0; k < 180; k++) attend(f, 1 / 60, side.x, side.z, k / 60);
    expect(facing(f, side.x, side.z)).toBeGreaterThan(before + 0.5);
    expect(Math.abs(f.rotation.y)).toBeCloseTo(ATTEND.turn, 6);
    // the player walks off: the figure turns back to the room it was set facing
    for (let k = 0; k < 180; k++) attend(f, 1 / 60, 40, 40, k / 60);
    expect(f.rotation.y).toBeCloseTo(0, 6);
  });

  it("ignores a player out of reach, and breathes without leaving the floor", () => {
    const f = buildFixer("marrow");
    f.rotation.y = 1;
    const ys = new Set<number>();
    for (let k = 0; k < 300; k++) {
      attend(f, 1 / 60, 30, 30, k / 60);
      ys.add(Math.round(f.scale.y * 1e4));
      expect(f.scale.x).toBe(FIXER_SCALE.marrow);
    }
    expect(f.rotation.y).toBe(1);
    expect(ys.size, "it does not breathe").toBeGreaterThan(10);
    const lo = Math.min(...ys) / 1e4, hi = Math.max(...ys) / 1e4;
    expect(hi / lo - 1).toBeLessThan(0.03);
    // the feet are the pivot: scale about the origin keeps the lowest point on the floor
    expect(f.position.y).toBe(0);
  });

  it("the turn target is capped and wraps the short way round", () => {
    // behind and a little to the right (+x, which a -z facer turns to by negative yaw): the right way, capped
    expect(attendTarget({ x: 0, z: 0 }, 0, 0.2, 3)).toBeCloseTo(-ATTEND.turn, 9);
    expect(attendTarget({ x: 0, z: 0 }, 0, -0.2, 3)).toBeCloseTo(ATTEND.turn, 9);
    expect(attendTarget({ x: 0, z: 0 }, Math.PI - 0.1, 0, -2)).toBeCloseTo(-ATTEND.turn, 9); // needs -(pi - 0.1): the short way, capped
    expect(attendTarget({ x: 0, z: 0 }, -Math.PI + 0.1, 0, -2)).toBeCloseTo(ATTEND.turn, 9);
    expect(Math.abs(attendTarget({ x: 0, z: 0 }, 3.0, 0.5, 3))).toBeLessThanOrEqual(ATTEND.turn);
    expect(attendTarget({ x: 0, z: 0 }, 0, 0, -20)).toBe(0);
  });
});
