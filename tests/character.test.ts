/**
 * The characters are designed, not placeholders (Stage 665).
 *
 * The player was a ten-sided tube, a closed cone for a hood and box limbs; a citizen was a 0.6 m
 * capsule with a cone on it. These tests hold the new designs to the things that make them read:
 * the hood has an opening with nothing lit inside it, its real peak sits under the point the crouch
 * check measures, no strip-light sits inside the cloth, and the crowd is people, not pills.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BONE, BOOT_SHADE, BUCKLE_SHADE, buildRig, cloakGeometry, COAT_SCALE, coatSurfaceRadius, GLOVE_SHADE, REST_BONES, rigReport, STRAP_SHADE, trimGeometry } from "../client/render/rig";
import { citizenBodyGeometry, citizenHoodGeometry, citizenSwing, CITIZEN_LIMBS, CITIZEN_STRIDE, Crowd } from "../client/render/life";

describe("the player's body", () => {
  it("the hood's real peak sits under the point rigReport measures, so the crouch check sees the geometry", () => {
    // rigReport reads a fixed point, head + (0, 0.3, 0.1): a taller hood would pass the crouch check
    // unseen. Tie the point to the vertices.
    const g = cloakGeometry(null);
    const pos = g.getAttribute("position"), idx = g.getAttribute("skinIndex"), w = g.getAttribute("skinWeight");
    let peak = -1;
    for (let i = 0; i < pos.count; i++) if (idx.getX(i) === BONE.head && w.getX(i) > 0.99) peak = Math.max(peak, pos.getY(i));
    const rig = buildRig(null);
    const measured = rigReport(rig).hoodApex;
    expect(peak, "no vertex is on the head bone at all").toBeGreaterThan(REST_BONES.head.world[1]);
    expect(peak).toBeLessThanOrEqual(measured + 1e-6);
  });

  it("the hood has a face opening, and what the opening shows is baked to black", () => {
    const g = cloakGeometry(null);
    const pos = g.getAttribute("position"), shade = g.getAttribute("shade"), idx = g.getAttribute("skinIndex");
    let voids = 0, voidOnHead = 0, frontFace = 0;
    for (let i = 0; i < pos.count; i++) {
      if (shade.getX(i) === 0) {
        voids++;
        if (idx.getX(i) === BONE.head) voidOnHead++;
      }
      // a lit head vertex directly in front of the face, between the chin and the brow: there must be
      // none. The cowl's top ring reaches 1.56 m at the chin, which is not the face; the box starts
      // above it (a first draft started at 1.55 and counted the chin).
      if (idx.getX(i) === BONE.head && shade.getX(i) > 0 && Math.abs(pos.getX(i)) < 0.05 && pos.getY(i) > 1.575 && pos.getY(i) < 1.68 && pos.getZ(i) < -0.12) frontFace++;
    }
    expect(voids, "nothing is baked to the void").toBeGreaterThan(50);
    expect(voidOnHead).toBe(voids);
    expect(frontFace, "the hood is closed over the face").toBe(0);
    const color = g.getAttribute("color");
    expect(color, "the ghost has no colour to black the opening").toBeTruthy();
    let black = 0;
    for (let i = 0; i < pos.count; i++) {
      if (shade.getX(i) === 0) {
        expect(color.getX(i)).toBe(0);
        black++;
      }
    }
    expect(black).toBe(voids);
    const hub = readFileSync(new URL("../client/render/hub.ts", import.meta.url), "utf8");
    expect(hub).toMatch(/ghostMat = new THREE\.MeshBasicMaterial\(\{ color: PALETTE\.cyan, transparent: true, opacity: 0\.35, blending: THREE\.AdditiveBlending, depthWrite: false, vertexColors: true \}\)/);
  });

  it("the boots are darker than the cloak they stand under", () => {
    const g = cloakGeometry(null);
    const pos = g.getAttribute("position");
    const shade = g.getAttribute("shade");
    const idx = g.getAttribute("skinIndex");
    let boots = 0;
    let cloth = 0;
    for (let i = 0; i < pos.count; i++) {
      const s = shade.getX(i);
      if (Math.abs(s - BOOT_SHADE) < 1e-5) {
        boots++;
        expect(pos.getY(i)).toBeLessThan(0.35);
        expect(idx.getX(i) === BONE.legL || idx.getX(i) === BONE.legR).toBe(true);
      } else if (s === 1 && pos.getY(i) > 1) cloth++;
    }
    expect(boots, "the boots wear the cloak").toBeGreaterThan(20);
    expect(cloth, "the coat went dark with the boots").toBeGreaterThan(20);
  });

  it("the gloves are darker than the sleeves they hang from", () => {
    const g = cloakGeometry(null);
    const shade = g.getAttribute("shade");
    const idx = g.getAttribute("skinIndex");
    let gloves = 0;
    let sleeves = 0;
    for (let i = 0; i < shade.count; i++) {
      const s = shade.getX(i);
      const arm = idx.getX(i) === BONE.foreL || idx.getX(i) === BONE.foreR;
      if (Math.abs(s - GLOVE_SHADE) < 1e-5) {
        gloves++;
        expect(arm, "a glove vertex left the forearm").toBe(true);
      } else if (s === 1 && arm) sleeves++;
    }
    expect(gloves, "the gloves wear the cloak").toBeGreaterThan(8);
    expect(sleeves, "the sleeves went dark with the gloves").toBeGreaterThan(8);
  });

  it("the buckle is darker than the belt it closes", () => {
    const g = cloakGeometry(null);
    const pos = g.getAttribute("position");
    const shade = g.getAttribute("shade");
    let buckle = 0;
    let belt = 0;
    for (let i = 0; i < pos.count; i++) {
      const s = shade.getX(i);
      const y = pos.getY(i);
      if (Math.abs(s - BUCKLE_SHADE) < 1e-5) {
        buckle++;
        expect(y).toBeGreaterThan(0.9);
        expect(y).toBeLessThan(1.08);
        expect(pos.getZ(i)).toBeLessThan(-0.1);
      } else if (s === 1 && y > 0.96 && y < 1.04) belt++;
    }
    expect(buckle, "the buckle wears the cloak").toBeGreaterThan(8);
    expect(belt, "the belt went dark with the buckle").toBeGreaterThan(8);
  });

  it("the chest strap is darker than the cloth it crosses", () => {
    const g = cloakGeometry(null);
    const shade = g.getAttribute("shade");
    const idx = g.getAttribute("skinIndex");
    let strap = 0;
    let chest = 0;
    for (let i = 0; i < shade.count; i++) {
      const s = shade.getX(i);
      const onChest = idx.getX(i) === BONE.chest;
      if (Math.abs(s - STRAP_SHADE) < 1e-5) {
        strap++;
        expect(onChest, "a strap vertex left the chest").toBe(true);
      } else if (s === 1 && onChest) chest++;
    }
    expect(strap, "the strap wears the cloak").toBeGreaterThan(8);
    expect(chest, "the chest went dark with the strap").toBeGreaterThan(8);
  });

  it("no strip-light sits inside the coat's cloth", () => {
    // the first turntable of this design showed the back spine glowing through the coat's front
    // opening: vertical bars on a flaring coat had their lower halves inside it. Every trim vertex on
    // the coat must be on or outside the surface the coat's own lathe makes.
    const t = trimGeometry();
    const pos = t.getAttribute("position");
    let checked = 0, inside = 0, worst = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (y < 0.5 || y > 0.985) continue;
      const nx = x / COAT_SCALE.sx, nz = z / COAT_SCALE.sz;
      const rho = Math.hypot(nx, nz);
      if (rho < 0.12) continue;
      checked++;
      const surface = coatSurfaceRadius(Math.atan2(nx, nz), y);
      if (rho < surface - 0.002) {
        inside++;
        worst = Math.max(worst, surface - rho);
      }
    }
    expect(checked, "no trim was found on the coat, so this proved nothing").toBeGreaterThan(40);
    expect(inside, `${inside} trim vertices inside the cloth, worst ${(worst * 1000).toFixed(1)} mm`).toBe(0);
  });
});

describe("a leased citizen", () => {
  const box = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    return g.boundingBox!;
  };
  it("is a person's size and shape, not a 0.6 m pill: shoulders wider than deep, a hood on top, feet on the ground", () => {
    const b = box(citizenBodyGeometry());
    // the coat ends at the hem; the shins and shoes below it are limbs (Stage 666), and they reach the floor
    const feet = Math.min(...CITIZEN_LIMBS.map((l) => l.centre[1] - l.size[1] / 2));
    expect(feet).toBeCloseTo(0, 3);
    expect(b.min.y).toBeGreaterThan(0.25);
    expect(b.max.y).toBeGreaterThan(1.35);
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    expect(w).toBeGreaterThan(d);
    expect(w).toBeLessThan(0.6);
    const h = box(citizenHoodGeometry());
    expect(h.min.y).toBeGreaterThan(1.3);
    expect(h.max.y).toBeLessThan(1.8);
  });

  it("its hood opens to the front it walks toward (+z), with a dark plate where a face would be", () => {
    const g = citizenHoodGeometry();
    const pos = g.getAttribute("position");
    // the shell reaches far back (-z) and not far forward: the opening is at the front
    let back = 0, front = 0;
    for (let i = 0; i < pos.count; i++) {
      back = Math.min(back, pos.getZ(i));
      front = Math.max(front, pos.getZ(i));
    }
    expect(-back).toBeGreaterThan(front);
    // the plate is black; the shell is not. One mesh, so this is a vertex colour, not a draw.
    const color = g.getAttribute("color");
    expect(color, "the face has no colour of its own").toBeTruthy();
    let black = 0;
    let cloth = 0;
    for (let i = 0; i < color.count; i++) {
      const c = color.getX(i);
      if (c === 0) {
        black++;
        expect(pos.getY(i)).toBeGreaterThan(1.35);
      } else cloth++;
    }
    expect(black).toBeGreaterThan(8);
    expect(cloth).toBeGreaterThan(black);
  });

  it("the crowd and the wake cell actually use that black, or the cloak lights the face", () => {
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    const escort = readFileSync(new URL("../client/render/escort.ts", import.meta.url), "utf8");
    expect(life).toMatch(/hoodMat = new THREE\.MeshStandardMaterial\(\{ color: 0x090a0f, roughness: 1, vertexColors: true \}\)/);
    expect(escort).toMatch(/hoodMat = new THREE\.MeshStandardMaterial\(\{ color: 0x090a0f, roughness: 1, vertexColors: true \}\)/);
  });

  it("a shoe is darker than the coat it hangs under", () => {
    const crowd = new Crowd([{ x0: -4, z0: 0, x1: 4, z1: 0 }], 4, 3);
    const shoe = new THREE.Color();
    const arm = new THREE.Color();
    const shoeK = CITIZEN_LIMBS.findIndex((l) => l.kind === "shoe");
    const armK = CITIZEN_LIMBS.findIndex((l) => l.kind === "arm");
    crowd.limbs.getColorAt(shoeK, shoe);
    crowd.limbs.getColorAt(armK, arm);
    expect(shoe.r, "the shoe wears the coat").toBeLessThan(0.15);
    expect(arm.r, "the sleeve went dark with the shoe").toBeGreaterThan(0.9);
    const life = readFileSync(new URL("../client/render/life.ts", import.meta.url), "utf8");
    const escort = readFileSync(new URL("../client/render/escort.ts", import.meta.url), "utf8");
    expect(life).toMatch(/paintCitizenLimbs\(this\.limbs, count\)/);
    expect(escort).toMatch(/paintCitizenLimbs\(this\.cellLimbs, n\)/);
  });

  it("a shin is darker than the coat and lighter than the shoe", () => {
    const crowd = new Crowd([{ x0: -4, z0: 0, x1: 4, z1: 0 }], 4, 3);
    const shin = new THREE.Color();
    const shoe = new THREE.Color();
    const arm = new THREE.Color();
    crowd.limbs.getColorAt(CITIZEN_LIMBS.findIndex((l) => l.kind === "shin"), shin);
    crowd.limbs.getColorAt(CITIZEN_LIMBS.findIndex((l) => l.kind === "shoe"), shoe);
    crowd.limbs.getColorAt(CITIZEN_LIMBS.findIndex((l) => l.kind === "arm"), arm);
    expect(shin.r, "the shin wears the coat").toBeLessThan(0.4);
    expect(shin.r, "the shin was painted as a shoe").toBeGreaterThan(shoe.r + 0.05);
    expect(arm.r, "the sleeve went dark with the shin").toBeGreaterThan(0.9);
  });

  it("costs what a crowd can afford: under 360 triangles a citizen with its lamp and umbrella", () => {
    const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    // coat + hood + one box per limb + lamp + umbrella
    const total = tris(citizenBodyGeometry()) + tris(citizenHoodGeometry()) + 12 * CITIZEN_LIMBS.length + 12 + 16;
    // 220 citizens in the busiest district, drawn once (Stage 696): 220 x 360 = 79k, inside what lease_row has spare
    expect(total).toBeLessThan(360);
  });
});

describe("a leased citizen walks (Stage 666)", () => {
  it("the stride is on the bob's clock: the feet pass each other where the body is highest, and idle means still", () => {
    const speed = 1.1, phase = 0.7;
    // the bob peaks where |sin(6 speed t + phase)| = 1; the swing is zero there
    const tPeak = (Math.PI / 2 - phase) / (6 * speed);
    expect(Math.abs(citizenSwing(tPeak, speed, phase, false))).toBeLessThan(1e-9);
    expect(Math.abs(citizenSwing(tPeak + Math.PI / 2 / (6 * speed), speed, phase, false))).toBeCloseTo(CITIZEN_STRIDE, 9);
    expect(citizenSwing(1.234, speed, phase, true)).toBe(0);
  });

  it("in a real crowd, a walker's feet trade places over half a stride and an idle citizen's do not move", () => {
    // read the posed instances the crowd actually draws, not the formula: a crowd that never wrote its
    // limb matrices, or wrote both legs the same, fails here
    const crowd = new Crowd([{ x0: -20, z0: -10, x1: 20, z1: 10 }], 60, 5);
    const n = CITIZEN_LIMBS.length;
    const shoeR = CITIZEN_LIMBS.findIndex((l) => l.kind === "shoe" && l.side === 1);
    const shoeL = CITIZEN_LIMBS.findIndex((l) => l.kind === "shoe" && l.side === -1);
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    const ahead = (i: number, k: number) => {
      crowd.limbs.getMatrixAt(i * n + k, m);
      v.setFromMatrixPosition(m);
      const p = crowd.pedInfo(i);
      return (v.x - p.x) * Math.sin(p.yaw) + (v.z - p.z) * Math.cos(p.yaw);
    };
    let walker = -1, idle = -1;
    for (let i = 0; i < crowd.count; i++) {
      if (crowd.pedInfo(i).idle) idle = idle < 0 ? i : idle;
      else walker = walker < 0 ? i : walker;
    }
    expect(walker, "no walking citizen in the sample").toBeGreaterThanOrEqual(0);
    expect(idle, "no idle citizen in the sample").toBeGreaterThanOrEqual(0);
    const w = crowd.pedInfo(walker);
    // step to where this walker's swing is at its full reach, then half a stride on
    const quarter = Math.PI / 2 / (6 * w.speed);
    crowd.update((0 - w.bob) / (6 * w.speed) + 10 * Math.PI / (6 * w.speed));
    const splitA = ahead(walker, shoeR) - ahead(walker, shoeL);
    const idleA = ahead(idle, shoeR) - ahead(idle, shoeL);
    crowd.update(2 * quarter);
    const splitB = ahead(walker, shoeR) - ahead(walker, shoeL);
    const idleB = ahead(idle, shoeR) - ahead(idle, shoeL);
    expect(Math.abs(splitA), "the walker's feet are not apart at full stride").toBeGreaterThan(0.1);
    expect(Math.sign(splitB)).toBe(-Math.sign(splitA));
    expect(Math.abs(idleA)).toBeLessThan(1e-6);
    expect(Math.abs(idleB)).toBeLessThan(1e-6);
  });
});
