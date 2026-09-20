/**
 * The drone's gun is a gun (Stage 166). `detectMult` says how well a file hides from VANTAGE, and
 * it belongs to noticing a file and to holding one already noticed — not to how far the wasp can
 * shoot. `WASP.fireRange` used to be compared against the detectability-scaled distance, so it was
 * 25 m only against a file whose detectability happened to be exactly 1.
 */
import { describe, expect, it } from "vitest";
import { createMech, createWasp, MECH, stepMech, stepWasp, WASP, type AiRequest, type Mech, type SightTarget, type Wasp } from "../shared/sim/ai";
import { v3 } from "../shared/math/vec3";

/** one tick of a wasp at the origin against a single target `metres` away on +z */
function tick(metres: number, detectMult: number, state: "patrol" | "chase"): { fired: boolean; held: boolean; chasing: boolean } {
  const w = createWasp(1, [v3(0, 4, 0), v3(0, 4, 1)]);
  w.pos = v3(0, 4, 0);
  w.fireCooldown = 0;
  w.state = state;
  const t: SightTarget = { id: 2, eye: v3(0, 5.6, metres), chest: v3(0, 4, metres), alive: true, detectMult };
  const out: AiRequest[] = [];
  stepWasp(w, [t], [], [], 0, out);
  return { fired: out.some((r) => r.kind === "waspShot"), held: w.targetId === 2, chasing: w.state === "chase" };
}

// a file the drones model easily, one they model poorly, and one in between. 1.35 and 0.72 are
// BAD DEBT and STATIC SKIN as the manifest reconciles them; 1.0 is a file with nothing attested.
const LOUD = 1.35;
const PLAIN = 1;
const QUIET = 0.9;

describe("the wasp's gun reaches the same distance whatever the file is wearing", () => {
  it("fires inside the range and not outside it, for a file the drones model easily", () => {
    // the loud file is held well past the gun — 29 x 1.35 = 39 m — so the only thing that can stop
    // the shot at 25.1 m is the range itself. Scaled, 25.1 / 1.35 = 18.6 m, and it would fire.
    expect(tick(25.1, LOUD, "chase").held).toBe(true);
    expect(tick(24.9, LOUD, "chase").fired).toBe(true);
    expect(tick(25.1, LOUD, "chase").fired).toBe(false);
    expect(tick(33.7, LOUD, "chase").fired).toBe(false); // what BAD DEBT used to buy the drone
  });

  it("fires to the same distance for a file the drones model poorly", () => {
    // scaled, 24.9 / 0.9 = 27.7 m, and it would hold its fire
    expect(tick(24.9, QUIET, "chase").fired).toBe(true);
    expect(tick(25.1, QUIET, "chase").fired).toBe(false);
  });

  it("fires to the same distance for a file with nothing attested", () => {
    expect(tick(24.9, PLAIN, "chase").fired).toBe(true);
    expect(tick(25.1, PLAIN, "chase").fired).toBe(false);
  });
});

describe("detectability still decides what it should", () => {
  it("moves the distance a patrolling wasp notices a file at", () => {
    // WASP.detect is 18 m against a plain file, further against a loud one, shorter against a quiet
    expect(tick(17.9, PLAIN, "patrol").chasing).toBe(true);
    expect(tick(18.1, PLAIN, "patrol").chasing).toBe(false);
    expect(tick(23, LOUD, "patrol").chasing).toBe(true); // 23 / 1.35 = 17.0
    expect(tick(23, QUIET, "patrol").chasing).toBe(false); // 23 / 0.9 = 25.6
  });

  it("moves the distance a chasing wasp holds a file to", () => {
    // the reacquire window is WASP.fireRange + 4 = 29 m scaled
    expect(tick(28.9, PLAIN, "chase").held).toBe(true);
    expect(tick(29.1, PLAIN, "chase").held).toBe(false);
    expect(tick(38, LOUD, "chase").held).toBe(true); // 38 / 1.35 = 28.1
    expect(tick(27, QUIET, "chase").held).toBe(false); // 27 / 0.9 = 30.0
  });

  it("holds a quiet file only as far as it can model it, so the gun is not the binding rule there", () => {
    // 0.5 holds to 14.5 m, well inside the 25 m gun: a file that cannot be modelled cannot be shot
    expect(tick(14.4, 0.5, "chase").fired).toBe(true);
    expect(tick(14.6, 0.5, "chase").held).toBe(false);
    expect(tick(14.6, 0.5, "chase").fired).toBe(false);
  });
});

describe("the range the rest of the game is told about", () => {
  it("is the one the wasp actually uses", () => {
    expect(WASP.fireRange).toBe(25);
    expect(tick(WASP.fireRange - 0.1, LOUD, "chase").fired).toBe(true);
    expect(tick(WASP.fireRange + 0.1, LOUD, "chase").fired).toBe(false);
  });
});

/**
 * What a drone carries through its own death (Stage 167). One life's state had two definitions —
 * the constructor's and a shorter list inside the respawn branch — and the difference was carried
 * across death.
 */
import { GRENADES } from "../shared/weapons/manifest";

const PATROL = () => [v3(0, 4, 0), v3(20, 4, 0), v3(20, 4, 20)];
const MECH_PATH = () => [v3(0, 0, 0), v3(20, 0, 0)];

/** step a dead drone until it comes back, and stop on that very tick */
function reviveWaspNow(w: Wasp): number {
  for (let i = 0; i < WASP.respawn * 60 + 120; i++) {
    stepWasp(w, [], [], [], i, []);
    if (w.alive) return i;
  }
  throw new Error("the wasp never came back");
}
function reviveMechNow(m: Mech): number {
  for (let i = 0; i < MECH.respawn * 60 + 120; i++) {
    stepMech(m, [], [], [], []);
    if (m.alive) return i;
  }
  throw new Error("the mech never came back");
}

/** one life's state: everything but which drone this is */
function waspLife(w: Wasp): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // `shots` is the index into this drone's aim-jitter sequence, a property of the drone rather than
  // of one life, so it is identity here along with the id and the patrol route
  const identity = new Set(["id", "waypoints", "shots"]);
  for (const k of Object.keys(w)) if (!identity.has(k)) out[k] = (w as unknown as Record<string, unknown>)[k];
  return out;
}
function mechLife(m: Mech): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const identity = new Set(["id", "path"]);
  for (const k of Object.keys(m)) if (!identity.has(k)) out[k] = (m as unknown as Record<string, unknown>)[k];
  return out;
}

describe("a drone comes back whole", () => {
  it("does not carry an EMP through its own death", () => {
    const w = createWasp(1, PATROL());
    w.disabledTimer = GRENADES.emp.duration; // EMP'd, and shot down while it sags
    for (let i = 0; i < 30; i++) stepWasp(w, [], [], [], i, []);
    expect(w.disabledTimer).toBeGreaterThan(2); // 2.5 s of it still to run
    expect(w.pos.y).toBeLessThan(4); // sagging
    w.alive = false;
    w.respawnTimer = WASP.respawn;
    reviveWaspNow(w);
    expect(w.disabledTimer).toBe(0);
    expect(w.pos.y).toBe(4); // back on its patrol, not falling out of the sky
    expect(w.state).toBe("patrol");
  });

  it("gives every life the grace before its first shot, not only the first life", () => {
    const fresh = createWasp(2, PATROL());
    expect(fresh.fireCooldown).toBe(1);
    const t: SightTarget = { id: 9, eye: v3(0, 5.6, 6), chest: v3(0, 4, 6), alive: true, detectMult: 1 };
    let first = -1;
    for (let i = 0; i < 600 && first < 0; i++) {
      const out: AiRequest[] = [];
      stepWasp(fresh, [t], [], [], i, out);
      if (out.some((r) => r.kind === "waspShot")) first = i;
    }
    expect(first).toBeGreaterThan(50); // the grace really is about a second
    fresh.alive = false;
    fresh.respawnTimer = WASP.respawn;
    reviveWaspNow(fresh);
    expect(fresh.fireCooldown).toBe(1);
  });

  it("does not carry an EMP through the mech's death either", () => {
    const m = createMech(1, MECH_PATH(), 0);
    m.disabledTimer = GRENADES.emp.duration;
    for (let i = 0; i < 30; i++) stepMech(m, [], [], [], []);
    expect(m.disabledTimer).toBeGreaterThan(2);
    m.alive = false;
    m.respawnTimer = MECH.respawn;
    reviveMechNow(m);
    expect(m.disabledTimer).toBe(0);
  });

  it("comes back in exactly the state it was built in, field for field", () => {
    // the structural guard: one life's state has ONE definition, so a field added to the
    // constructor and forgotten in the revive is caught here rather than in a player's match
    const lived = createWasp(3, PATROL());
    const target: SightTarget = { id: 9, eye: v3(0, 5.6, 6), chest: v3(0, 4, 6), alive: true, detectMult: 1 };
    for (let i = 0; i < 200; i++) stepWasp(lived, [target], [], [], i, []); // chase, fire, move
    lived.disabledTimer = 2.5;
    lived.jammedBy = 7;
    lived.jamTimer = 4;
    lived.lostTimer = 2;
    for (let i = 0; i < 10; i++) stepWasp(lived, [], [], [], i, []);
    lived.alive = false;
    lived.respawnTimer = WASP.respawn;
    reviveWaspNow(lived);
    expect(waspLife(lived)).toEqual(waspLife(createWasp(3, PATROL())));
  });

  it("brings the mech back in the state it was built in too", () => {
    const lived = createMech(2, MECH_PATH(), 0);
    for (let i = 0; i < 400; i++) stepMech(lived, [], [], [], []); // walk the path, sweep the light
    lived.disabledTimer = 2.5;
    lived.targetId = 4;
    lived.lockTimer = 0.5;
    lived.alive = false;
    lived.respawnTimer = MECH.respawn;
    reviveMechNow(lived);
    expect(mechLife(lived)).toEqual(mechLife(createMech(2, MECH_PATH(), 0)));
  });
});
