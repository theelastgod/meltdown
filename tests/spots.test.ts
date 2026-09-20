/**
 * Every place a contract sends you is a place you can get to (Stage 175).
 *
 * An objective names a spot either as a level node — the district generator puts those on open
 * ground — or as a literal pair of coordinates typed into the mission table. Two of BLIND THE
 * MODEL's six lattice nodes were literals, `{x:0,z:-30}` and `{x:0,z:30}`, and both landed inside
 * a 4.2 m building on LEASE ROW. A lattice node is a 1.8 m dummy, so both were sealed in concrete:
 * `castRay` clips at the first solid box before it tests any dummy capsule, `applyExplosion`
 * refuses a target it cannot see, and campaign worlds do not respawn dummies, so the pair never
 * cycled out. PUT OUT THE SIX LATTICE NODES could reach four of them, forever.
 *
 * The one branch that escaped it was the m3 "PUBLISH" variant, which asks for four and names four
 * nodes. Every other route through the arc reached mission five and stopped there.
 */
import { describe, expect, it } from "vitest";
import { lintCampaign, lintSpotsAreInTheOpen } from "../shared/campaign/lint";
import { MISSIONS, type Objective, type Spot } from "../shared/campaign/missions";
import { resolveSpot } from "../shared/campaign/runtime";
import { levelById } from "../shared/sim/level";
import { canSee } from "../shared/sim/ai";
import { DUMMY_HEIGHT } from "../shared/sim/world";
import { v3 } from "../shared/math/vec3";

const spotsOf = (o: Objective): Spot[] =>
  o.kind === "destroy" ? o.spots : o.kind === "escort" ? o.path : o.kind === "reach" || o.kind === "hold" ? [o.at] : o.kind === "survive" && o.at ? [o.at] : [];

/** the solid boxes a standing body would be inside at (x, z) */
function swallowedBy(levelId: string, x: number, z: number) {
  return levelById(levelId).boxes.filter((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > 0.1 && b.min.y < DUMMY_HEIGHT);
}

/** how many of a ring of eye positions can see a body standing at (x, z) */
function sightlines(levelId: string, x: number, z: number): { seen: number; tried: number } {
  const lvl = levelById(levelId);
  const chest = v3(x, DUMMY_HEIGHT * 0.55, z);
  let seen = 0, tried = 0;
  for (const r of [2, 6, 12, 25]) {
    for (let a = 0; a < 360; a += 5) {
      const ex = x + r * Math.cos((a * Math.PI) / 180), ez = z + r * Math.sin((a * Math.PI) / 180);
      if (Math.abs(ex) > (lvl.bounds ?? 60) || Math.abs(ez) > (lvl.bounds ?? 60)) continue;
      tried++;
      if (canSee(v3(ex, 1.6, ez), chest, lvl.boxes, [])) seen++;
    }
  }
  return { seen, tried };
}

describe("mission spots — nothing is asked for inside a wall", () => {
  it("no objective anywhere in the campaign names a spot inside solid geometry", () => {
    expect(lintSpotsAreInTheOpen().map((v) => `${v.where}: ${v.detail}`)).toEqual([]);
  });

  it("and the campaign lint as a whole is clean, so this rule is actually wired in", () => {
    expect(lintCampaign().filter((v) => v.severity === "error").map((v) => `${v.where}: ${v.detail}`)).toEqual([]);
  });

  it("every literal spot in every mission and variant stands in the open", () => {
    for (const m of MISSIONS) {
      const runs: [string, readonly Objective[]][] = [[m.id, m.objectives], ...(m.variants ?? []).map((v, i) => [`${m.id} variant ${i + 1}`, v.objectives ?? []] as [string, readonly Objective[]])];
      for (const [where, objs] of runs) {
        for (const o of objs) {
          for (const s of spotsOf(o)) {
            if ("node" in s) continue;
            const inside = swallowedBy(m.level, s.x, s.z);
            expect(inside.map((b) => `x ${b.min.x}..${b.max.x} z ${b.min.z}..${b.max.z}`), `${where}: "${o.kind}" spot (${s.x}, ${s.z}) on ${m.level}`).toEqual([]);
          }
        }
      }
    }
  });
});

describe("mission spots — the six lattice nodes of BLIND THE MODEL", () => {
  const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
  const destroy = m5.objectives.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;

  it("asks for six, and all six can be shot at", () => {
    expect(destroy.spots).toHaveLength(6);
    for (const s of destroy.spots) {
      const p = resolveSpot(levelById(m5.level), s);
      const { seen, tried } = sightlines(m5.level, p.x, p.z);
      expect(seen, `spot (${p.x}, ${p.z}) was visible from ${seen} of ${tried} eye positions`).toBeGreaterThan(0);
    }
  });

  it("the two that were buried have room around them now, as much as a generated node", () => {
    // node B is the generator's own work; the two literals are held to the same standard
    const lvl = levelById(m5.level);
    const solid = lvl.boxes.filter((b) => b.max.y > 0.1 && b.min.y < DUMMY_HEIGHT);
    const clearance = (x: number, z: number) =>
      Math.min(...solid.map((b) => Math.hypot(Math.max(b.min.x - x, 0, x - b.max.x), Math.max(b.min.z - z, 0, z - b.max.z))));
    const node = lvl.nodes.find((n) => n.label === "B")!;
    const generated = clearance(node.pos.x, node.pos.z);
    for (const s of destroy.spots) {
      if ("node" in s) continue;
      expect(clearance(s.x, s.z), `spot (${s.x}, ${s.z}) clearance vs generated node ${generated.toFixed(1)} m`).toBeGreaterThanOrEqual(generated);
    }
  });

  it("the six are spread across the district rather than stacked on each other", () => {
    const pts = destroy.spots.map((s) => resolveSpot(levelById(m5.level), s));
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z), `spots ${i} and ${j}`).toBeGreaterThan(10);
      }
    }
  });

  it("the m3 PUBLISH variant still asks for the four nodes, untouched", () => {
    const v = m5.variants![0]!;
    const d = v.objectives!.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;
    expect(d.spots).toEqual([{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }]);
  });
});

describe("mission spots — the rule fires", () => {
  it("a spot dropped inside a building is an error, naming the mission and the coordinates", () => {
    const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
    const d = m5.objectives.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;
    const keep = [...d.spots];
    d.spots.push({ x: 0, z: 30 }); // the coordinate this stage removed
    try {
      const problems = lintSpotsAreInTheOpen();
      expect(problems).toHaveLength(1);
      expect(problems[0]!.rule).toBe("spot-is-in-the-open");
      expect(problems[0]!.where).toBe("m5_blind_the_model");
      expect(problems[0]!.detail).toContain("(0, 30)");
      expect(problems[0]!.severity).toBe("error");
    } finally {
      d.spots.length = 0;
      d.spots.push(...keep);
    }
  });

  it("and it fires through lintCampaign, not only when called directly", () => {
    // Without this, the rule could be unwired from the campaign lint and every other test here
    // would stay green: they call it by name. What runs in CI is `lintCampaign`.
    const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
    const d = m5.objectives.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;
    const keep = [...d.spots];
    d.spots.push({ x: 0, z: 30 });
    try {
      const problems = lintCampaign().filter((v) => v.rule === "spot-is-in-the-open");
      expect(problems, "the rule is not reachable through lintCampaign").toHaveLength(1);
      expect(problems[0]!.severity).toBe("error");
    } finally {
      d.spots.length = 0;
      d.spots.push(...keep);
    }
  });

  it("a spot naming a node the level does not have is an error too", () => {
    const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
    const d = m5.objectives.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;
    const keep = [...d.spots];
    d.spots.push({ node: "Z" });
    try {
      const problems = lintSpotsAreInTheOpen();
      expect(problems).toHaveLength(1);
      expect(problems[0]!.rule).toBe("spot-names-a-node");
    } finally {
      d.spots.length = 0;
      d.spots.push(...keep);
    }
  });

  it("it checks variants too, not only the base objectives", () => {
    const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
    const d = m5.variants![0]!.objectives!.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;
    const keep = [...d.spots];
    d.spots.push({ x: 0, z: -30 });
    try {
      const problems = lintSpotsAreInTheOpen();
      expect(problems).toHaveLength(1);
      expect(problems[0]!.where).toBe("m5_blind_the_model variant 1");
    } finally {
      d.spots.length = 0;
      d.spots.push(...keep);
    }
  });

  it("it checks the kinds that put you somewhere, not only destroy", () => {
    const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
    const keep = [...m5.objectives];
    m5.objectives.push({ kind: "reach", at: { x: 0, z: 30 }, radius: 3, text: "STAND IN A WALL" });
    try {
      expect(lintSpotsAreInTheOpen()).toHaveLength(1);
    } finally {
      m5.objectives.length = 0;
      m5.objectives.push(...keep);
    }
  });
});
