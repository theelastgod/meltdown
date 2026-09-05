/**
 * THE WAKE — the signature mode. Hex city nodes sit on VANTAGE's model
 * (violet). Blanks standing on a node pull it off the model (green). Two
 * cells compete for nodes; the KERNEL re-leases the weakest holds on a
 * pulse; holding every node for FULL_WAKE_HOLD seconds ends the round.
 * Deterministic, server-authoritative, shared with the offline sandbox.
 */
import { SIM_DT } from "./constants";
import { type Vec3, v3, clone } from "../math/vec3";

export const WAKE = {
  nodeRadius: 4,
  /** seconds for one Blank to take a node from full hold to flipped and back to full */
  baseFlipSeconds: 8,
  extraPlayerBonus: 0.5,
  spreadBonus: 0.35,
  settleRate: 0.06,
  roundSeconds: 360,
  warmupSeconds: 20,
  resultsSeconds: 15,
  kernelPulseSeconds: 75,
  kernelPulseDrain: 0.5,
  fullWakeHold: 15,
  pointsPerNodeSecond: 1,
  pointsPerKill: 10,
  phageBoostSeconds: 4,
  phageBoostMult: 2,
} as const;

export type Phase = "warmup" | "wake" | "results";

export interface NodeDef {
  id: number;
  label: string;
  pos: Vec3;
  links: number[];
}

export interface WakeNode {
  id: number;
  label: string;
  pos: Vec3;
  links: number[];
  /** 0 = VANTAGE (leased), 1 | 2 = cell */
  owner: number;
  /** 0..1 strength of the current owner's hold */
  hold: number;
  /** team currently pulling (0 none), for presentation */
  puller: number;
  contested: boolean;
  /** remaining phage boost seconds */
  boost: number;
  flips: number;
}

export interface WakeState {
  phase: Phase;
  timeLeft: number;
  score: [number, number, number];
  nodes: WakeNode[];
  kernelTimer: number;
  fullWakeTimer: number;
  fullWakeTeam: number;
  winner: number;
  round: number;
  pulses: number;
}

export interface WakeOccupant {
  team: number;
  pos: Vec3;
  /** faction perk / node multiplier (1 = none) */
  flipMult: number;
  alive: boolean;
}

export type WakeEvent =
  | { type: "nodeFlip"; node: number; team: number; from: number }
  | { type: "nodeContest"; node: number }
  | { type: "kernelPulse"; node: number; released: boolean }
  | { type: "phase"; phase: Phase; winner: number }
  | { type: "fullWake"; team: number };

export function createWake(defs: readonly NodeDef[], startPhase: Phase = "wake"): WakeState {
  return {
    phase: startPhase,
    timeLeft: startPhase === "warmup" ? WAKE.warmupSeconds : WAKE.roundSeconds,
    score: [0, 0, 0],
    nodes: defs.map((d) => ({ id: d.id, label: d.label, pos: clone(d.pos), links: d.links.slice(), owner: 0, hold: 1, puller: 0, contested: false, boost: 0, flips: 0 })),
    kernelTimer: WAKE.kernelPulseSeconds,
    fullWakeTimer: 0,
    fullWakeTeam: 0,
    winner: 0,
    round: 1,
    pulses: 0,
  };
}

export function resetRound(w: WakeState, phase: Phase): void {
  w.phase = phase;
  w.timeLeft = phase === "warmup" ? WAKE.warmupSeconds : phase === "wake" ? WAKE.roundSeconds : WAKE.resultsSeconds;
  if (phase === "wake") {
    w.score = [0, 0, 0];
    for (const n of w.nodes) {
      n.owner = 0;
      n.hold = 1;
      n.puller = 0;
      n.contested = false;
      n.boost = 0;
    }
    w.kernelTimer = WAKE.kernelPulseSeconds;
    w.fullWakeTimer = 0;
    w.fullWakeTeam = 0;
    w.winner = 0;
  }
}

/** Phage burst: nodes within radius flip faster for a few seconds. */
export function boostNodes(w: WakeState, center: Vec3, radius: number): number {
  let n = 0;
  for (const node of w.nodes) {
    const dx = node.pos.x - center.x;
    const dz = node.pos.z - center.z;
    if (dx * dx + dz * dz <= (radius + WAKE.nodeRadius) ** 2) {
      node.boost = WAKE.phageBoostSeconds;
      n++;
    }
  }
  return n;
}

export function addKillPoints(w: WakeState, team: number): void {
  if (w.phase !== "wake" || team < 1 || team > 2) return;
  w.score[team] = (w.score[team] ?? 0) + WAKE.pointsPerKill;
}

/**
 * Advance the mode one tick. `occupants` are live players with their team.
 * `activePlayers` per team decide when the warm-up may end.
 */
export function stepWake(w: WakeState, occupants: readonly WakeOccupant[], playersPerTeam: [number, number, number], events: WakeEvent[], solo: boolean): void {
  const dt = SIM_DT;
  if (w.phase === "warmup") {
    w.timeLeft -= dt;
    const ready = solo || (playersPerTeam[1] > 0 && playersPerTeam[2] > 0);
    if (w.timeLeft <= 0 && ready) {
      resetRound(w, "wake");
      events.push({ type: "phase", phase: "wake", winner: 0 });
    } else if (w.timeLeft <= 0) w.timeLeft = 5; // hold until both cells have a Blank
    return;
  }
  if (w.phase === "results") {
    w.timeLeft -= dt;
    if (w.timeLeft <= 0) {
      w.round++;
      resetRound(w, "warmup");
      events.push({ type: "phase", phase: "warmup", winner: 0 });
    }
    return;
  }
  // ---- wake round ----
  w.timeLeft -= dt;
  for (const n of w.nodes) {
    n.boost = Math.max(0, n.boost - dt);
    // who is standing on it
    let c1 = 0;
    let c2 = 0;
    let m1 = 1;
    let m2 = 1;
    for (const o of occupants) {
      if (!o.alive || (o.team !== 1 && o.team !== 2)) continue;
      const dx = o.pos.x - n.pos.x;
      const dz = o.pos.z - n.pos.z;
      if (dx * dx + dz * dz > WAKE.nodeRadius * WAKE.nodeRadius) continue;
      if (o.team === 1) {
        c1++;
        m1 = Math.max(m1, o.flipMult);
      } else {
        c2++;
        m2 = Math.max(m2, o.flipMult);
      }
    }
    const wasContested = n.contested;
    n.contested = c1 > 0 && c2 > 0;
    if (n.contested) {
      n.puller = 0;
      if (!wasContested) events.push({ type: "nodeContest", node: n.id });
      continue;
    }
    const team = c1 > 0 ? 1 : c2 > 0 ? 2 : 0;
    if (team === 0) {
      n.puller = 0;
      n.hold = Math.min(1, n.hold + WAKE.settleRate * dt);
      continue;
    }
    n.puller = team;
    const count = team === 1 ? c1 : c2;
    const mult = team === 1 ? m1 : m2;
    let adjacent = 0;
    for (const l of n.links) {
      const other = w.nodes.find((x) => x.id === l);
      if (other && other.owner === team) adjacent++;
    }
    const rate = ((2 / WAKE.baseFlipSeconds) * (1 + WAKE.extraPlayerBonus * (count - 1)) * (1 + WAKE.spreadBonus * adjacent) * mult * (n.boost > 0 ? WAKE.phageBoostMult : 1)) * dt;
    if (n.owner === team) {
      n.hold = Math.min(1, n.hold + rate);
    } else {
      n.hold -= rate;
      if (n.hold <= 0) {
        const from = n.owner;
        n.owner = team;
        n.hold = Math.min(1, -n.hold);
        n.flips++;
        events.push({ type: "nodeFlip", node: n.id, team, from });
      }
    }
  }
  // score
  const heldNow: [number, number, number] = [0, 0, 0];
  for (const n of w.nodes) heldNow[n.owner as 0 | 1 | 2]++;
  w.score[1] += heldNow[1] * WAKE.pointsPerNodeSecond * dt;
  w.score[2] += heldNow[2] * WAKE.pointsPerNodeSecond * dt;
  // full wake
  const total = w.nodes.length;
  const fullTeam = heldNow[1] === total ? 1 : heldNow[2] === total ? 2 : 0;
  if (fullTeam && fullTeam === w.fullWakeTeam) w.fullWakeTimer += dt;
  else {
    w.fullWakeTeam = fullTeam;
    w.fullWakeTimer = fullTeam ? dt : 0;
  }
  if (fullTeam && w.fullWakeTimer >= WAKE.fullWakeHold) {
    w.winner = fullTeam;
    events.push({ type: "fullWake", team: fullTeam });
    w.phase = "results";
    w.timeLeft = WAKE.resultsSeconds;
    events.push({ type: "phase", phase: "results", winner: fullTeam });
    return;
  }
  // KERNEL pulse: VANTAGE brakes the wake, draining the weakest held node
  w.kernelTimer -= dt;
  if (w.kernelTimer <= 0) {
    w.kernelTimer = WAKE.kernelPulseSeconds;
    w.pulses++;
    let weakest: WakeNode | null = null;
    for (const n of w.nodes) if (n.owner !== 0 && (!weakest || n.hold < weakest.hold)) weakest = n;
    if (weakest) {
      weakest.hold -= WAKE.kernelPulseDrain;
      let released = false;
      if (weakest.hold <= 0) {
        weakest.owner = 0;
        weakest.hold = 1;
        released = true;
      }
      events.push({ type: "kernelPulse", node: weakest.id, released });
    }
  }
  if (w.timeLeft <= 0) {
    w.winner = w.score[1] > w.score[2] ? 1 : w.score[2] > w.score[1] ? 2 : 0;
    w.phase = "results";
    w.timeLeft = WAKE.resultsSeconds;
    events.push({ type: "phase", phase: "results", winner: w.winner });
  }
}

/** Five nodes over the drainage yard, linked as the district graph. */
export function drainageYardNodes(): NodeDef[] {
  return [
    { id: 1, label: "A", pos: v3(0, 1.2, -5), links: [2, 3, 4] },
    { id: 2, label: "B", pos: v3(18, 0, 0), links: [1, 4, 5] },
    { id: 3, label: "C", pos: v3(-14, 0, -2), links: [1, 4] },
    { id: 4, label: "D", pos: v3(0, 0, 17), links: [1, 2, 3] },
    { id: 5, label: "E", pos: v3(20, 0, -12), links: [2] },
  ];
}
