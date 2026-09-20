/**
 * A life's motion belongs to that life (Stage 178).
 *
 * `respawnPlayer` listed a subset of the motion state and what it left out was carried across
 * death. `jumpBuffer` is the one the player feels: a jump press the gate refuses — crouched,
 * sliding under a low gap, past coyote time — is held for `MOVE.jumpBuffer` seconds so it fires
 * the moment it becomes legal, and `stepPlayer` returns at `if (!p.alive) return reqs;` *before*
 * the decay, so the buffer cannot run down while dead. Measured on a real world: a jump pressed
 * while crouched, then death, and the respawned file jumped on its first live tick with no key
 * held at any point — `stats.jumps` 0 → 1, rising to y 1.02.
 *
 * This is Stage 167's defect two layers up: one life's state with two definitions, the shorter one
 * in the respawn. The fix is the same shape — `reviveMotion` is the only definition, and both the
 * constructor and the respawn call it.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { Btn } from "../shared/sim/input";
import { MOVE } from "../shared/sim/constants";
import { createPlayer, reviveMotion, respawnPlayer, type PlayerState } from "../shared/sim/player";
import { v3 } from "../shared/math/vec3";

const LOADOUT = { primary: "lease_breaker" as const, secondary: "shock_baton" as const, attested: [], keystone: null };
const SPAWN = { pos: v3(0, 0, 0), yaw: 0 };

/** a world with one player, settled on the ground */
function settled() {
  const w = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
  const p = w.addPlayer(1, "A", 1, LOADOUT);
  const step = (buttons: number) => w.step(new Map([[1, { tick: w.tick, buttons, yaw: 0, pitch: 0 }]]));
  for (let i = 0; i < 30; i++) step(0);
  return { w, p, step };
}

/** kill the player and run until they are back, pressing nothing throughout */
function dieAndReturn(s: ReturnType<typeof settled>, ticks = 40) {
  s.p.health = 0;
  s.p.alive = false;
  s.p.respawnTimer = 0.2;
  for (let i = 0; i < ticks; i++) s.step(0);
}

describe("respawn — the file does nothing it was not asked to do", () => {
  it("a jump refused while crouched does not fire after death", () => {
    const s = settled();
    for (let i = 0; i < 10; i++) s.step(Btn.Crouch);
    s.step(Btn.Crouch | Btn.Jump);
    expect(s.p.stance, "the crouch did not take, so the jump was not refused").toBe("crouch");
    expect(s.p.jumpBuffer, "the refused jump was not buffered, so this test proves nothing").toBeCloseTo(MOVE.jumpBuffer, 5);
    const jumps = s.p.stats.jumps;
    dieAndReturn(s);
    expect(s.p.alive).toBe(true);
    expect(s.p.stats.jumps, "the file jumped after respawning with no key held").toBe(jumps);
    expect(s.p.jumpBuffer).toBe(0);
    expect(s.p.vel.y, "the file left the ground after respawning").toBeCloseTo(0, 3);
  });

  it("the buffer cannot run down while dead, which is why clearing it is the fix", () => {
    // the decay lives past `if (!p.alive) return reqs;`, so a dead file's buffer is frozen, not
    // expiring: waiting longer than MOVE.jumpBuffer does not save you
    const s = settled();
    for (let i = 0; i < 10; i++) s.step(Btn.Crouch);
    s.step(Btn.Crouch | Btn.Jump);
    const held = s.p.jumpBuffer;
    s.p.health = 0;
    s.p.alive = false;
    s.p.respawnTimer = 5; // far longer than the buffer
    for (let i = 0; i < 60; i++) s.step(0);
    expect(s.p.alive, "still dead, as intended").toBe(false);
    expect(s.p.jumpBuffer, "the buffer decayed while dead, so the freeze is not what it was").toBeCloseTo(held, 5);
  });
});

describe("respawn — one definition of a life's motion", () => {
  it("every motion field a fresh file has, a respawned file has too", () => {
    // the structural guard: a field added to reviveMotion and forgotten in one of its callers, or
    // a field added to the constructor and never revived, fails here rather than in a match
    const fresh = createPlayer(1, "A", SPAWN);
    const used = createPlayer(1, "A", SPAWN);
    // put the second file through a life: move, slide, jump, leave the ground, buffer a jump
    const w = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
    const p = w.addPlayer(2, "B", 1, LOADOUT);
    const step = (buttons: number) => w.step(new Map([[2, { tick: w.tick, buttons, yaw: 0.4, pitch: 0 }]]));
    for (let i = 0; i < 30; i++) step(0);
    for (let i = 0; i < 40; i++) step(Btn.Forward | Btn.Sprint);
    step(Btn.Forward | Btn.Sprint | Btn.Crouch);
    for (let i = 0; i < 10; i++) step(Btn.Forward | Btn.Crouch);
    step(Btn.Forward | Btn.Crouch | Btn.Jump);
    respawnPlayer(p, SPAWN);
    reviveMotion(used, SPAWN);
    const MOTION = ["pos", "vel", "yaw", "pitch", "stance", "height", "grounded", "airTime", "jumpBuffer", "slideTime", "slideCooldown", "slideDir", "mantleFrom", "mantleTo", "mantleT"] as const;
    for (const k of MOTION) {
      expect(JSON.stringify(p[k as keyof PlayerState]), `${k} differs between a respawned file and a fresh one`).toBe(JSON.stringify(fresh[k as keyof PlayerState]));
      expect(JSON.stringify(used[k as keyof PlayerState]), `${k} is not written by reviveMotion`).toBe(JSON.stringify(fresh[k as keyof PlayerState]));
    }
  });

  it("and the fields that are not this life's are kept", () => {
    const w = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
    const p = w.addPlayer(3, "C", 2, LOADOUT);
    p.stats.kills = 7;
    p.stats.deaths = 3;
    p.stats.slides = 4;
    respawnPlayer(p, SPAWN);
    expect(p.id).toBe(3);
    expect(p.name).toBe("C");
    expect(p.team).toBe(2);
    expect(p.stats.kills, "a match total was reset by a respawn").toBe(7);
    expect(p.stats.deaths).toBe(3);
    expect(p.stats.slides).toBe(4);
  });

  it("a respawn still stands the file up, at the spawn, at full health", () => {
    const w = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
    const p = w.addPlayer(4, "D", 1, LOADOUT);
    p.health = 1;
    p.stance = "crouch";
    p.pos.x = 40;
    respawnPlayer(p, { pos: v3(3, 1, -2), yaw: 1.5 });
    expect(p.alive).toBe(true);
    expect(p.stance).toBe("stand");
    expect(p.height).toBe(MOVE.standHeight);
    expect([p.pos.x, p.pos.y, p.pos.z]).toEqual([3, 1, -2]);
    expect(p.yaw).toBe(1.5);
    expect(p.health).toBe(p.maxHealth);
  });

  it("a mantle cannot resume across a death: the branch is gated on the stance a respawn clears", () => {
    const w = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
    const p = w.addPlayer(5, "E", 1, LOADOUT);
    p.stance = "mantle";
    p.mantleT = 0.5;
    p.mantleTo.x = 99;
    respawnPlayer(p, SPAWN);
    expect(p.stance).toBe("stand");
    expect(p.mantleT).toBe(0);
    expect(p.mantleTo.x).toBe(0);
  });
});
