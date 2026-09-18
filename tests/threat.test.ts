/**
 * The charge at your feet (Stage 93): which live charges are worth a warning, how urgent, and which
 * way to look. The blast numbers are not typed in here — they come from the simulation's own
 * `createProjectile`, which is the point of the rule.
 */
import { describe, expect, it } from "vitest";
import { blastOf, threatMarks, THREAT_MAX, THREAT_REACH, type LiveProjectile } from "../client/hud/threat";
import { GRENADES } from "../shared/weapons/manifest";
import { wrapAngle } from "../shared/math/vec3";

const me = { x: 10, y: 0, z: -4, yaw: 0 };
const at = (over: Partial<LiveProjectile> = {}): LiveProjectile => ({ id: 1, kind: "frag", x: me.x, y: 0, z: me.z, ...over });
const FRAG = GRENADES.frag.radius;

describe("what a charge does when it goes off", () => {
  it("reads the blast out of the simulation, not out of this test", () => {
    expect(blastOf("frag").radius).toBe(GRENADES.frag.radius);
    expect(blastOf("frag").damage).toBe(GRENADES.frag.damage);
    expect(blastOf("phage").radius).toBeGreaterThan(0);
    expect(blastOf("phage").damage).toBeGreaterThan(0);
  });

  it("gives an unknown kind no blast at all rather than a guessed one", () => {
    expect(blastOf("not_a_thing")).toEqual({ radius: 0, damage: 0 });
  });
});

describe("which charges are worth a warning", () => {
  it("warns about a frag at your feet, and says you are standing in it", () => {
    const m = threatMarks([at()], me)[0]!;
    expect(m.inside).toBe(true);
    expect(m.urgency).toBe(1);
    expect(m.distance).toBe(0);
  });

  it("does not cry for smoke or an EMP: they carry no damage", () => {
    expect(threatMarks([at({ kind: "smoke" }), at({ kind: "emp" })], me)).toEqual([]);
  });

  it("lets go past the reach and holds just inside it", () => {
    // a centimetre either side rather than the exact metre: `10 + 10.8 - 10` is 10.799999999999999,
    // and which side of the boundary that lands on is not a claim this rule should be making
    const reach = FRAG * THREAT_REACH;
    expect(threatMarks([at({ x: me.x + reach - 0.01 })], me)).toHaveLength(1);
    expect(threatMarks([at({ x: me.x + reach + 0.01 })], me)).toHaveLength(0);
  });

  it("falls from 1 at the blast's edge to 0 at the reach, and never below", () => {
    const edge = threatMarks([at({ x: me.x + FRAG })], me)[0]!;
    expect(edge.urgency).toBeCloseTo(1, 6);
    expect(edge.inside).toBe(true);
    const half = threatMarks([at({ x: me.x + FRAG + (FRAG * (THREAT_REACH - 1)) / 2 })], me)[0]!;
    expect(half.urgency).toBeCloseTo(0.5, 6);
    expect(half.inside).toBe(false);
  });

  it("counts the height: one on the roof above you is further away than one at your feet", () => {
    const feet = threatMarks([at({ x: me.x + 3 })], me)[0]!;
    const roof = threatMarks([at({ x: me.x + 3, y: 6 })], me)[0]!;
    expect(roof.distance).toBeGreaterThan(feet.distance);
    expect(roof.urgency).toBeLessThan(feet.urgency);
  });

  it("points at it: the bearing is the one the damage wedges use", () => {
    // yaw 0 looks toward -z, so a charge to the east is off to the right
    const east = threatMarks([at({ x: me.x + 3 })], me)[0]!;
    expect(Math.sin(east.bearing)).toBeGreaterThan(0.9);
    const behind = threatMarks([at({ z: me.z + 3 })], me)[0]!;
    expect(Math.abs(wrapAngle(behind.bearing - Math.PI))).toBeLessThan(1e-6);
    // and it turns with the file rather than with the world
    const turned = threatMarks([at({ x: me.x + 3 })], { ...me, yaw: -Math.PI / 2 })[0]!;
    expect(Math.abs(turned.bearing)).toBeLessThan(1e-6);
  });

  it("puts the worst first and shows no more than a screenful", () => {
    const many = [at({ id: 1, x: me.x + 8 }), at({ id: 2, x: me.x + 1 }), at({ id: 3, x: me.x + 4 }), at({ id: 4, x: me.x + 6 }), at({ id: 5, x: me.x + 2 })];
    const marks = threatMarks(many, me);
    expect(marks).toHaveLength(THREAT_MAX);
    expect(marks[0]!.id).toBe(2);
    for (let i = 1; i < marks.length; i++) expect(marks[i]!.urgency).toBeLessThanOrEqual(marks[i - 1]!.urgency);
  });
});
