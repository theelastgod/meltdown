/**
 * Threat widens VANTAGE detection (Stage 184).
 *
 * ThreatProfile.detectMult was computed for every rating and read by nothing. spawnThreat
 * placed extra patrols; the radius the wasps actually use came only from the file's build
 * sheet. THREAT_LINES[6] says DETECTION DOUBLED. Measured: a wasp 22 m from a Blank chased
 * on the same tick at Threat 0 and Threat 10.
 */
import { describe, expect, it } from "vitest";
import { World } from "../shared/sim/world";
import { levelById } from "../shared/sim/level";
import { spawnThreat } from "../shared/campaign/runtime";
import { threatProfile } from "../shared/campaign/threat";
import { canSee, WASP } from "../shared/sim/ai";
import { v3 } from "../shared/math/vec3";
import { SIM_HZ } from "../shared/sim/constants";

function blankWorld() {
  const L = levelById("lease_row");
  const w = new World(L, { ai: true, seed: 3, wakePhase: "off", dummyRespawn: false });
  w.wasps.length = 0;
  w.mechs.length = 0;
  const p = w.addPlayer(1, "BLANK", 1);
  const spawn = L.spawns[0]!.pos;
  p.pos.x = spawn.x;
  p.pos.y = 0;
  p.pos.z = spawn.z;
  return { L, w, p, spawn };
}

/** one stationary wasp `dist` metres from the player, line of sight open */
function waspAt(dist: number, detectMult: number) {
  const { L, w, p, spawn } = blankWorld();
  w.threatDetectMult = detectMult;
  const pos = v3(spawn.x + dist, 4, spawn.z);
  expect(canSee(pos, v3(p.pos.x, p.pos.y + p.height * 0.55, p.pos.z), L.boxes, []), "the 22 m test needs LOS").toBe(true);
  const wasp = w.spawnWasp([pos, pos]);
  wasp.pos.x = pos.x;
  wasp.pos.y = pos.y;
  wasp.pos.z = pos.z;
  return { w, p, wasp };
}

function chaseTick(dist: number, detectMult: number, ticks = SIM_HZ * 2) {
  const { w, wasp } = waspAt(dist, detectMult);
  for (let i = 0; i < ticks; i++) {
    w.step(new Map());
    if (wasp.state === "chase") return i;
  }
  return -1;
}

describe("Threat detectMult reaches the wasps", () => {
  it("spawnThreat writes the profile onto the world the AI reads", () => {
    const { w } = blankWorld();
    expect(w.threatDetectMult).toBe(1);
    spawnThreat(w, threatProfile(0));
    expect(w.threatDetectMult).toBe(1);
    spawnThreat(w, threatProfile(6));
    expect(w.threatDetectMult).toBeCloseTo(1.36);
    spawnThreat(w, threatProfile(10));
    expect(w.threatDetectMult).toBeCloseTo(1.6);
  });

  it("a wasp 22 m out does not chase at Threat 0 and does at Threat 10", () => {
    // WASP.detect is 18 m. Threat 0 → 18 m. Threat 10 → 18 × 1.6 = 28.8 m.
    expect(WASP.detect).toBe(18);
    expect(chaseTick(22, threatProfile(0).detectMult), "Threat 0 chased at 22 m").toBe(-1);
    expect(chaseTick(22, threatProfile(10).detectMult), "Threat 10 did not chase at 22 m").toBeGreaterThanOrEqual(0);
  });
});
