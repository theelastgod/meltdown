/**
 * The match-time progression tracker: one per connected file. It reads the
 * simulation's events for that player (kills with their context, melee
 * chains, flips, deaths), feeds weapon mastery XP and challenge counters,
 * and un-redacts attestation stamps the moment the server has verified the
 * thing. Nothing here touches the simulation.
 */
import type { Account } from "../shared/progression/account";
import { addXp, bump, XP, type ChallengeCounter } from "../shared/progression/mastery";
import { STAMPS, type StampCounter } from "../shared/progression/stamps";
import { WEAPONS, type WeaponId } from "../shared/weapons/manifest";
import { itemById } from "../shared/manifest/items";
import type { SimEvent } from "../shared/sim/world";
import type { PlayerState } from "../shared/sim/player";
import { SIM_HZ } from "../shared/sim/constants";

export interface ProgressNote {
  stamps: string[];
  ranks: string[];
  challenges: string[];
}

const isWeapon = (w: string): w is WeaponId => w in WEAPONS;

export class ProgressionTracker {
  /** round-scoped counters */
  private round = { kills: 0, deaths: 0, flips: 0, killsBy: {} as Partial<Record<WeaponId, number>>, killTicks: [] as number[], fullWake: false };
  private lastFlips = 0;
  private lastSlid = 0;
  private lastBoostedFlipTick = -1;

  constructor(readonly account: Account | null) {}

  /** Social counters (Debts cleared, …): lifetime, on the file; monikers read them. */
  social(key: string, n = 1): void {
    this.count(key, n);
  }

  /** Lifetime counter (persisted on the file). */
  private count(key: StampCounter | string, n = 1): number {
    if (!this.account) return 0;
    const v = (this.account.counters[key] ?? 0) + n;
    this.account.counters[key] = v;
    return v;
  }
  private set(key: StampCounter | string, v: number): void {
    if (!this.account) return;
    if ((this.account.counters[key] ?? 0) < v) this.account.counters[key] = v;
  }

  /** Stamps whose counters are now met and were not yet in the file. */
  private checkStamps(note: ProgressNote): void {
    const a = this.account;
    if (!a) return;
    for (const s of STAMPS) {
      if (a.stamps.includes(s.id)) continue;
      if ((a.counters[s.counter] ?? 0) >= s.need) {
        a.stamps.push(s.id);
        a.ledger.push(`STAMP · ${s.line}`);
        note.stamps.push(s.id);
      }
    }
  }

  private mastery(weapon: WeaponId, note: ProgressNote, xp: number, counters: ChallengeCounter[]): void {
    const a = this.account;
    if (!a) return;
    const m = a.mastery[weapon];
    const gained = addXp(weapon, m, xp);
    for (const c of counters) for (const done of bump(weapon, m, c)) note.challenges.push(done);
    const after = m.rank;
    if (gained > 0 || after > (a.counters[`rank:${weapon}`] ?? 1)) {
      this.set(`rank:${weapon}`, after);
      if (after > (a.counters[`rankSeen:${weapon}`] ?? 1)) {
        note.ranks.push(`${weapon}:r${after}`);
        this.set(`rankSeen:${weapon}`, after);
      }
    }
  }

  /** Feed one tick's events for this player (plus the player's live stats for flip/slide deltas). */
  onEvents(events: readonly SimEvent[], p: PlayerState, playerId: number, tick: number, wasps: readonly { alive: boolean; pos: { x: number; y: number; z: number } }[] = []): ProgressNote | null {
    const note: ProgressNote = { stamps: [], ranks: [], challenges: [] };
    for (const ev of events) {
      if (ev.type === "kill" && ev.playerId === playerId) {
        const w = isWeapon(ev.weapon) ? ev.weapon : null;
        const c = ev.ctx;
        if (ev.victimKind === "player") {
          this.round.kills++;
          this.count("kills");
          this.set("matchKillsAny", this.round.kills);
          // double kill: two files within 4 s
          this.round.killTicks.push(tick);
          const recent = this.round.killTicks.filter((t) => tick - t <= SIM_HZ * 4);
          const counters: ChallengeCounter[] = [];
          if (recent.length >= 2 && recent.length % 2 === 0) counters.push("doubleKills");
          if (c.zone === "head") counters.push("headshotKills");
          if (c.shooterStance === "slide") counters.push("slideKills");
          if (c.shooterAir) counters.push("airKills");
          if (c.shooterSlideJump) this.count("slideJumpKills");
          if (c.shooterStance === "crouch") this.count("crouchKills");
          if (c.shooterStance === "stand" && !c.shooterAir) this.count("sprintKills");
          if (c.distance >= 25) counters.push("longKills");
          if (c.distance > 0 && c.distance <= 4) counters.push("pointBlankKills");
          if (c.through) counters.push("wallKills");
          if (c.victimEmp) this.count("empKills");
          if (c.how === "explosion") {
            if (c.projKind === "frag") this.count("fragKills");
            if (c.projKind === "sticky") {
              counters.push("stickyKills");
              this.count("stickyKills");
              this.count("proximityKills");
            }
          }
          if (w) {
            if (w === "repo_hammer" && c.alt) counters.push("slugKills");
            if (w === "stack_smg" && p.weapon.altActive) counters.push("braceKills");
            if (w === "lease_breaker" && p.weapon.altActive) counters.push("adsKills");
            if (w === "longwave") counters.push(c.alt ? "quickshotKills" : "fullChargeKills");
            if (w === "shock_baton" && c.alt) counters.push("lungeKills");
            this.round.killsBy[w] = (this.round.killsBy[w] ?? 0) + 1;
            this.count(`kills:${w}`);
            this.set(`matchKills:${w}`, this.round.killsBy[w]!);
            if (c.zone === "head") this.count(`headshotKills:${w}`);
            if (c.distance >= WEAPONS[w].range.ideal * 1.5) this.count(`longKills:${w}`);
            if (c.shooterStance === "slide") this.count(`slideKills:${w}`);
            if (c.shooterAir) this.count(`airKills:${w}`);
            this.mastery(w, note, XP.kill + (c.zone === "head" ? XP.headshotKill : 0), counters);
          }
        } else if (ev.victimKind === "wasp" || ev.victimKind === "mech") {
          this.count(ev.victimKind === "wasp" ? "waspKills" : "mechKills");
          if (w) this.mastery(w, note, XP.vantageKill, []);
        }
      }
      if (ev.type === "shot" && ev.playerId === playerId && ev.hit.kind === "player" && isWeapon(ev.weapon)) this.mastery(ev.weapon, note, XP.hit, []);
      if (ev.type === "melee" && ev.playerId === playerId && ev.hits.length >= 2 && isWeapon(ev.weapon)) this.mastery(ev.weapon, note, 0, ["chainStuns"]);
      if (ev.type === "death" && ev.playerId === playerId) this.round.deaths++;
      if (ev.type === "emp" && ev.playerId === playerId) {
        // an EMP double: two or more wasps inside one pop
        let n = 0;
        for (const w of wasps) if (w.alive && Math.hypot(w.pos.x - ev.pos.x, w.pos.y - ev.pos.y, w.pos.z - ev.pos.z) <= ev.radius + 1) n++;
        if (n >= 2) this.count("empDoubles");
      }
      if (ev.type === "fullWake") this.round.fullWake = true;
      if (ev.type === "nodeFlip" && ev.boosted) this.lastBoostedFlipTick = tick;
    }
    // flips credited by the wake (stats), boosted if a boosted flip happened this tick
    if (p.stats.flips > this.lastFlips) {
      const n = p.stats.flips - this.lastFlips;
      this.lastFlips = p.stats.flips;
      this.round.flips += n;
      this.count("flips", n);
      this.set("matchFlips", this.round.flips);
      if (this.lastBoostedFlipTick === tick) {
        this.count("boostFlips", n);
        if (this.account) for (const done of bump("phage", this.account.mastery.phage, "boostFlips", n)) note.challenges.push(done);
      }
    }
    if (p.stats.slides > this.lastSlid) {
      // a slide is ~6 m of ground; the stamp counts metres slid
      this.count("slidMetres", (p.stats.slides - this.lastSlid) * 6);
      this.lastSlid = p.stats.slides;
    }
    this.checkStamps(note);
    return note.stamps.length || note.ranks.length || note.challenges.length ? note : null;
  }

  /** Round settled: match-level firsts and file-level milestones. */
  onRoundEnd(p: PlayerState, won: boolean, roundSeconds: number, topScorer: boolean, level: string): ProgressNote {
    const note: ProgressNote = { stamps: [], ranks: [], challenges: [] };
    const a = this.account;
    if (!a) return note;
    this.count("matches");
    if (won) this.count("wins");
    if (won && this.round.fullWake) this.count("fullWakeWins");
    if (this.round.deaths === 0 && roundSeconds >= 60) this.count("noDeathRounds");
    if (topScorer && this.round.kills > 0) this.count("topScores");
    this.count("supportPoints", Math.round(p.stats.support));
    this.count("nodeSeconds", Math.round(p.stats.nodeSeconds));
    this.count("contestSeconds", Math.round(p.stats.support)); // contest seconds feed support 1:1
    this.set(`district:${level}`, 1);
    this.set("districts", Object.keys(a.counters).filter((k) => k.startsWith("district:")).length);
    this.fileMilestones(note);
    this.round = { kills: 0, deaths: 0, flips: 0, killsBy: {}, killTicks: [], fullWake: false };
    return note;
  }

  /** Depth, ownership, attestation, sockets: the file's own firsts. Cheap; called at join and settlement. */
  fileMilestones(note: ProgressNote): ProgressNote {
    const a = this.account;
    if (!a) return note;
    this.set("depth", a.depth);
    this.set("nodesOwned", a.owned.filter((id) => itemById(id)?.kind === "node").length);
    this.set("attested", a.loadout.attested.length);
    this.set("keystones", a.loadout.keystone ? 1 : 0);
    this.set("chips", Object.values(a.loadout.chips ?? {}).reduce((n, s) => n + Object.values(s ?? {}).filter(Boolean).length, 0));
    this.set("firmwares", Object.values(a.loadout.firmware ?? {}).filter(Boolean).length);
    this.set("crafts", a.crafts);
    this.set("ring2", a.owned.some((id) => (itemById(id)?.ring ?? 0) >= 2) ? 1 : 0);
    this.set("ring3", a.owned.some((id) => (itemById(id)?.ring ?? 0) >= 3) ? 1 : 0);
    this.checkStamps(note);
    return note;
  }

  onRejoin(note: ProgressNote): void {
    this.count("rejoins");
    this.checkStamps(note);
  }
}
