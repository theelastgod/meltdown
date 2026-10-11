/**
 * What a file can do on a street it already walked into.
 *
 * One hold, the same one a gate already uses. At the fixer it takes the contract the file has
 * reached, or a carry between two gates, or it starts the public event the district was going to
 * run. In the gate's prompt ring, and outside the booth's mouth, two seconds banks the carried
 * purse as scrip. It does not write chits. Two seconds more still exchanges chits the file
 * already held. The mouth itself still travels, and still enters
 * THE RUN: this hold never stands in it.
 *
 * Dying inside the contest drops what was carried. Walking out drops nothing. A session with one
 * file pays no pot. The pot is fixed and split by placement; a kill mints nothing.
 */
import type { Account } from "../progression/account";
import type { LevelDef } from "../sim/level";
import { SIM_HZ } from "../sim/constants";
import { RUN } from "../sim/run";
import { GATE_HOLD_S, GATE_PROMPT_M, gatePrompt, gateToTravel } from "../net/citygates";
import { LEDGER_HOLD_M, LEDGER_PROMPT_M, ledgerDistance } from "../net/cityledger";
import { CONTEST_POT, exchangeChits, fileChits } from "./chit";
import { contestOf, fixerOf, inContest, type ContestVol, type FixerSpot } from "./contest";

const HEAT_SECONDS = 90;
const FIXER_M = 3.5;
const LEDGER_CAP = 200;

export interface StreetOffer {
  id: string;
  title: string;
}

export type StreetNotice =
  | { type: "lines"; playerId: number; lines: string[] }
  | { type: "contract"; playerId: number; id: string }
  | { type: "event"; playerId: number }
  | { type: "exchange"; playerId: number; units: number; line: string };

interface CarryJob {
  kind: "carry";
  from: number;
  to: number;
  touched: boolean;
  done: boolean;
  startTick: number;
}

interface ContractJob {
  kind: "contract";
  id: string;
  title: string;
  saw: boolean;
}

type Job = CarryJob | ContractJob;

interface Heat {
  until: number;
  entered: Set<number>;
  kills: Map<number, number>;
}

export interface StreetDrop {
  x: number;
  z: number;
  value: number;
  timer: number;
}

export interface StreetStepIn {
  tick: number;
  day: number;
  players: readonly { id: number; x: number; z: number; alive: boolean }[];
  account: (id: number) => Account | null;
  deaths: readonly { playerId: number; killerId: number; x: number; z: number }[];
  offer: (a: Account) => StreetOffer | null;
  eventRunning: boolean;
}

/** Shares of a fixed pot, highest placement first. Ties share a place. The remainder is not minted. */
export function placementShares(ids: readonly number[], kills: ReadonlyMap<number, number>, pot: number): Map<number, number> {
  const out = new Map<number, number>();
  if (ids.length < 2 || pot <= 0) return out;
  const ranked = ids.map((id) => ({ id, k: kills.get(id) ?? 0 })).sort((a, b) => b.k - a.k || a.id - b.id);
  let place = 0;
  let prev = Infinity;
  const weights = ranked.map((r) => {
    if (r.k !== prev) {
      place++;
      prev = r.k;
    }
    return ranked.length - place + 1;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  ranked.forEach((r, i) => out.set(r.id, Math.floor((pot * weights[i]!) / sum)));
  return out;
}

function farGates(level: LevelDef): [number, number] {
  const exits = level.exits ?? [];
  let best: [number, number] = [0, Math.min(1, exits.length - 1)];
  let dist = -1;
  for (let i = 0; i < exits.length; i++) {
    for (let j = i + 1; j < exits.length; j++) {
      const d = Math.hypot(exits[i]!.x - exits[j]!.x, exits[i]!.z - exits[j]!.z);
      if (d > dist) {
        dist = d;
        best = [i, j];
      }
    }
  }
  return best;
}

function nearExit(level: LevelDef, gate: number, x: number, z: number): boolean {
  const e = level.exits?.[gate];
  if (!e) return false;
  return Math.hypot(e.x - x, e.z - z) <= GATE_PROMPT_M;
}

function inBankRing(level: LevelDef, x: number, z: number): boolean {
  const pos = { x, z };
  if (gatePrompt(pos, level, "city") && gateToTravel(pos, level, "city") === null) return true;
  const d = ledgerDistance(pos, level);
  return d !== null && d > LEDGER_HOLD_M && d <= LEDGER_PROMPT_M;
}

function pushLedger(a: Account, line: string): void {
  a.ledger.push(line);
  if (a.ledger.length > LEDGER_CAP) a.ledger.splice(0, a.ledger.length - LEDGER_CAP);
}

export class StreetLife {
  readonly vol: ContestVol | null;
  readonly fixer: FixerSpot | null;
  readonly gates: [number, number];
  private readonly heatSeconds: number;
  private readonly carried = new Map<number, number>();
  private readonly drops: StreetDrop[] = [];
  private readonly jobs = new Map<number, Job>();
  private readonly hold = new Map<number, number>();
  private readonly holdFired = new Set<number>();
  private readonly bankHeld = new Map<number, number>();
  private readonly banked = new Set<number>();
  private readonly exchanged = new Set<number>();
  private heat: Heat | null = null;

  constructor(readonly level: LevelDef, opts: { heatSeconds?: number } = {}) {
    this.vol = contestOf(level);
    this.fixer = fixerOf(level, this.vol);
    this.gates = farGates(level);
    this.heatSeconds = opts.heatSeconds ?? HEAT_SECONDS;
  }

  get contestUp(): boolean {
    return this.vol !== null;
  }

  carriedOf(id: number): number {
    return this.carried.get(id) ?? 0;
  }

  /** Put the contest purse in a file's hands. Banking writes scrip, not chits. */
  give(id: number, n: number): void {
    const add = Math.max(0, Math.floor(n));
    if (add <= 0) return;
    const next = Math.min(RUN.carryCap, (this.carried.get(id) ?? 0) + add);
    this.carried.set(id, next);
  }

  dropList(): readonly StreetDrop[] {
    return this.drops;
  }

  /** What the street is asking this file to walk toward. Null when the district has no fixer and no block. */
  marker(id: number): { line: string; x: number; z: number } | null {
    const purse = this.carriedOf(id);
    const withPurse = (line: string) => (purse > 0 ? `${line} · PURSE ${purse} SCRIP` : line);
    const job = this.jobs.get(id);
    if (job?.kind === "contract") {
      if (!job.saw && this.vol) return { line: withPurse(`CONTRACT · ${job.title} · WALK THE CONTEST BLOCK`), x: this.vol.x, z: this.vol.z };
      if (this.fixer) return { line: withPurse(`CONTRACT · ${job.title} · HOLD AT THE FIXER`), x: this.fixer.x, z: this.fixer.z };
    }
    if (job?.kind === "carry") {
      const gate = job.touched ? job.to : job.from;
      const e = this.level.exits?.[gate];
      if (e) return { line: withPurse(`CARRY · ${job.touched ? "THE FAR GATE" : "THE NEAR GATE"}`), x: e.x, z: e.z };
    }
    if (purse === 0 && this.drops.length) {
      const d = this.drops[0]!;
      return { line: `PURSE ${d.value} SCRIP · ON THE GROUND`, x: d.x, z: d.z };
    }
    if (this.heat && this.heat.entered.size >= 2 && this.vol) {
      return { line: withPurse(`CONTEST · ${this.heat.entered.size} INSIDE · POT ${CONTEST_POT} SCRIP`), x: this.vol.x, z: this.vol.z };
    }
    if (this.fixer) return { line: withPurse(`FIXER ${this.fixer.label} · HOLD STILL`), x: this.fixer.x, z: this.fixer.z };
    if (this.vol) return { line: withPurse(`CONTEST · ${this.vol.label}`), x: this.vol.x, z: this.vol.z };
    return null;
  }

  step(input: StreetStepIn): StreetNotice[] {
    const notices: StreetNotice[] = [];
    const dt = 1 / SIM_HZ;
    for (const d of this.drops) d.timer -= dt;
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i]!.timer <= 0) this.drops.splice(i, 1);

    this.openHeat(input);
    for (const death of input.deaths) {
      if (!inContest(this.level, death.x, death.z, this.vol)) continue;
      const had = this.carried.get(death.playerId) ?? 0;
      this.carried.set(death.playerId, 0);
      if (had > 0) this.drops.push({ x: death.x, z: death.z, value: had, timer: RUN.dropSeconds });
      if (this.heat && death.killerId > 0 && death.killerId !== death.playerId) {
        const killer = input.players.find((p) => p.id === death.killerId);
        if (killer && inContest(this.level, killer.x, killer.z, this.vol)) this.heat.kills.set(death.killerId, (this.heat.kills.get(death.killerId) ?? 0) + 1);
      }
    }
    this.closeHeat(input);

    for (const p of input.players) {
      if (!p.alive) continue;
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i]!;
        if (Math.hypot(p.x - d.x, p.z - d.z) > RUN.pickupRadius) continue;
        const room = RUN.carryCap - (this.carried.get(p.id) ?? 0);
        if (room <= 0) continue;
        const take = Math.min(room, d.value);
        this.carried.set(p.id, (this.carried.get(p.id) ?? 0) + take);
        this.drops.splice(i, 1);
        break;
      }
    }

    for (const p of input.players) {
      if (!p.alive) continue;
      this.stepJob(p, input);
      this.stepBank(p, input, notices);
      this.stepFixer(p, input, notices);
    }
    return notices;
  }

  private openHeat(input: StreetStepIn): void {
    const inside = input.players.filter((p) => p.alive && inContest(this.level, p.x, p.z, this.vol));
    if (!inside.length) return;
    if (!this.heat) this.heat = { until: input.tick + Math.round(this.heatSeconds * SIM_HZ), entered: new Set(), kills: new Map() };
    for (const p of inside) this.heat.entered.add(p.id);
  }

  private closeHeat(input: StreetStepIn): void {
    if (!this.heat || input.tick < this.heat.until) return;
    this.payHeat(input);
    this.heat = null;
  }

  private payHeat(input: StreetStepIn): void {
    if (!this.heat || this.heat.entered.size < 2) return;
    const living = [...this.heat.entered].filter((id) => input.players.some((p) => p.id === id && p.alive));
    const shares = placementShares(living, this.heat.kills, CONTEST_POT);
    for (const [id, n] of shares) if (n > 0) this.give(id, n);
  }

  private stepJob(p: { id: number; x: number; z: number }, _input: StreetStepIn): void {
    const job = this.jobs.get(p.id);
    if (!job) return;
    if (job.kind === "contract") {
      if (inContest(this.level, p.x, p.z, this.vol)) job.saw = true;
      return;
    }
    if (!job.touched && nearExit(this.level, job.from, p.x, p.z)) job.touched = true;
    if (job.touched && nearExit(this.level, job.to, p.x, p.z)) job.done = true;
  }

  private stepBank(p: { id: number; x: number; z: number }, input: StreetStepIn, notices: StreetNotice[]): void {
    if (!inBankRing(this.level, p.x, p.z)) {
      this.bankHeld.delete(p.id);
      this.banked.delete(p.id);
      this.exchanged.delete(p.id);
      return;
    }
    const held = (this.bankHeld.get(p.id) ?? 0) + 1 / SIM_HZ;
    this.bankHeld.set(p.id, held);
    const a = input.account(p.id);
    if (!a) return;
    if (held >= RUN.bankSeconds - 1e-9 && !this.banked.has(p.id)) {
      this.banked.add(p.id);
      const n = this.carried.get(p.id) ?? 0;
      if (n > 0) {
        this.carried.set(p.id, 0);
        a.wallet.scrip += n;
        const line = `SCRIP · BANKED ${n}`;
        pushLedger(a, line);
        notices.push({ type: "lines", playerId: p.id, lines: [line] });
      }
    }
    if (held >= RUN.bankSeconds * 2 - 1e-9 && !this.exchanged.has(p.id)) {
      this.exchanged.add(p.id);
      if (fileChits(a) <= 0) return;
      const ex = exchangeChits(a, input.day);
      notices.push({ type: "exchange", playerId: p.id, units: ex.units, line: ex.line });
    }
  }

  private stepFixer(p: { id: number; x: number; z: number }, input: StreetStepIn, notices: StreetNotice[]): void {
    const f = this.fixer;
    const near = !!f && Math.hypot(p.x - f.x, p.z - f.z) <= FIXER_M;
    if (!near) {
      this.hold.delete(p.id);
      this.holdFired.delete(p.id);
      return;
    }
    const held = (this.hold.get(p.id) ?? 0) + 1 / SIM_HZ;
    this.hold.set(p.id, held);
    if (held < GATE_HOLD_S - 1e-9 || this.holdFired.has(p.id)) return;
    this.holdFired.add(p.id);
    const a = input.account(p.id);
    if (!a) return;
    const job = this.jobs.get(p.id);
    if (job?.kind === "contract" && job.saw) {
      this.jobs.delete(p.id);
      notices.push({ type: "contract", playerId: p.id, id: job.id });
      return;
    }
    if (job?.kind === "carry" && job.done) {
      this.jobs.delete(p.id);
      const before = a.counters["streetCarry"] ?? 0;
      a.counters["streetCarry"] = before + 1;
      const secs = Math.round(((input.tick - job.startTick) / SIM_HZ) * 1000) / 1000;
      const line = before === 0 ? `CARRY BETWEEN THE GATES · ${secs.toFixed(3)}S · STAMPED · 0 CHITS` : `CARRY BETWEEN THE GATES · ${secs.toFixed(3)}S · COUNTED · NO PAY`;
      pushLedger(a, line);
      notices.push({ type: "lines", playerId: p.id, lines: [line] });
      return;
    }
    if (!job) {
      const offer = input.offer(a);
      if (offer) {
        this.jobs.set(p.id, { kind: "contract", id: offer.id, title: offer.title, saw: false });
        const line = `FIXER · ${offer.title} · WALK THE CONTEST BLOCK · 0 CHITS`;
        pushLedger(a, line);
        notices.push({ type: "lines", playerId: p.id, lines: [line] });
      } else {
        const [from, to] = this.gates;
        this.jobs.set(p.id, { kind: "carry", from, to, touched: false, done: false, startTick: input.tick });
        const line = "FIXER · A CARRY BETWEEN THE GATES · 0 CHITS";
        pushLedger(a, line);
        notices.push({ type: "lines", playerId: p.id, lines: [line] });
      }
      return;
    }
    if (!input.eventRunning) notices.push({ type: "event", playerId: p.id });
  }
}
