/**
 * The campaign on the client: contracts launched from the Deadletter
 * Office, missions stepped offline (or mirrored from the co-op room), CRT
 * dialogue with testimony, Threat presence in explorable districts,
 * Kernel Protocols worn (blood-red), endings. Everything it needs from the
 * file goes through the ledger host's /file/:id/campaign endpoint when one
 * is linked, and a local save otherwise.
 */
import { cityPageUrl, inCity } from "@shared/net/city";
import type { Game } from "./game";
import { closeHint } from "./hud/keyhint";
import { HANDLERS, FACTIONS, type FactionId, type HandlerId } from "@shared/campaign/factions";
import { ENDINGS, endingCoda, endingTitle, endingsFor, gateOpen, handlersAlive, resolveEnding, testimonyLine, type Testimony } from "@shared/campaign/testimony";
import { threatProfile, threatRating, type ThreatProfile } from "@shared/campaign/threat";
import { PROTOCOLS, protocolMods, MAX_PROTOCOLS } from "@shared/campaign/protocols";
import { linesAt, recallIndex, scriptById, type ScriptNode } from "@shared/campaign/script";
import { GIGS, MAIN_ARC, missionById, type MissionDef } from "@shared/campaign/missions";
import { campaignOf, canLaunch, completeContract, gigsOnOffer, nextMission, pickFaction, wearProtocols, type CampaignSave } from "@shared/campaign/save";
import { createMission, drainMissionEvents, missionView, resolveDialogue, resolveSpot, spawnThreat, stepMission, type MissionState } from "@shared/campaign/runtime";
import { sandboxAccount, type Account } from "@shared/progression/account";
import type { SimEvent } from "@shared/sim/world";
import type { CityEventMsg, CityRunMsg, MissionMsg } from "@shared/net/protocol";
import { eventBanner, eventCard, eventMarker, eventObjective } from "./cityevent";
import { nearestStart, runCard, runClock, runObjective, splitBanner, startPrompt, type RunCourse, type RunView } from "./cityrun";
import type { RadarSpot } from "./hud/radar";
import { HUB_LEVEL_ID } from "@shared/sim/hub";
import { levelDisplayName } from "@shared/sim/level";
import { crewCodeFromSocket, crewPageUrl, newCrewCode, normaliseCrewCode, type CrewInfo } from "@shared/net/crew";
import { HOSTS } from "./config";
import { weaponName } from "./hud/kill";
import { CAMPAIGN_WEAPONS } from "@shared/weapons/manifest";
import { fixerHeader, portraitFor } from "./portraits";
import { ENDING_ART } from "./endings";
import { deskBanner } from "./missionart";
import { gigThumb } from "./gigart";
import { protocolIcon, weaponCard } from "./kitart";
import { loadingFor, travelTo } from "./loading";
import { gatePrompt, gateSigns, gateToTravel, gateTravelUrl, holdProgress, stepGateHold, type GateHold } from "@shared/net/citygates";
import { inLedgerMouth, LEDGER_HOLD_GATE, ledgerHudLine, nearLedgerDesk } from "@shared/net/cityledger";
import { runPageUrl } from "./runpage";
import { radarGates } from "./hud/radar";
import { SIM_DT } from "@shared/sim/constants";
import { eyeHeight } from "@shared/sim/player";
import { dialogueShot } from "./render/faceshot";
import { terminalPush } from "./hud/terminal";

export type CampaignMode = "none" | "mission" | "explore" | "coop" | "city";

/** The hold/survive objective clock: CRT, not `12s / 20s`. */
export function holdClock(progress: number, need: number): string {
  return `${Math.floor(progress)}S / ${need}S`;
}

/**
 * A city gate's HUD line (Stage 697): where it leads, then how to cross — or, once the file is in
 * its mouth, how far through crossing it is.
 */
export function gateLine(district: string, progress: number, inMouth: boolean): string {
  const n = 6;
  const done = Math.max(0, Math.min(n, Math.floor(progress * n)));
  return `→ ${levelDisplayName(district)} · ${inMouth ? `CROSSING ${"▮".repeat(done)}${"▯".repeat(n - done)}` : "WALK INTO THE GATE"}`;
}

/** One wasp is WASP, not WASPS. */
export function waspsWord(n: number): string {
  return `${n} WASP${n === 1 ? "" : "S"}`;
}

/** One mech is MECH, not MECHS. */
export function mechsWord(n: number): string {
  return `${n} MECH${n === 1 ? "" : "S"}`;
}

interface Playing {
  script: string;
  node: ScriptNode;
  testimony: Testimony;
  onDone: (t: Testimony) => void;
}

export class Campaign {
  mode: CampaignMode = "none";
  mission: MissionState | null = null;
  /** the co-op room's view of the mission (mirrored) */
  remote: MissionMsg | null = null;
  threat: ThreatProfile = threatProfile(0);
  save: CampaignSave;
  /** a local account stands in when no ledger host is linked */
  private local: Account;
  playing: Playing | null = null;
  contractsOpen = false;
  completion: { id: string; ok: boolean; reason?: string } | null = null;
  ending: string | null = null;
  readonly log: string[] = [];
  private started = false;
  private missionId: string | null;
  private explore: boolean;
  private host = false;
  /** the crew this page is in (Stage 49): the invite code its co-op room is named after, or null */
  readonly crew: string | null;
  /** the last crew this desk started or joined: what the page would travel to (the probe reads it under `?nonav=1`) */
  crewTarget: { code: string; url: string } | null = null;
  /** the host's terminal as this guest sees it (Stage 52): script, node, the choices on the host's screen, the pick that led here */
  mirror: { script: string; node: string; choices: string[]; picked: string | null } | null = null;
  /** every choice the host was seen to take, in order */
  readonly mirrorLog: string[] = [];
  private lastPick: string | null = null;
  /** the city's public event as the room last told it (Stage 699) */
  cityEvent: CityEventMsg | null = null;
  /** the last event whose start was announced, and the last whose end card was shown */
  private cityEventAnnounced = 0;
  private cityEventClosed = 0;
  /** the map's spots the public event asks for (Stage 699), kept so a street run's can sit beside them */
  private eventSpots: RadarSpot[] = [];
  /**
   * Street runs as the room last told them (Stage 703): the district's courses, its board, this file's
   * bests, this client's run and when its clock was last set (performance.now()), and the feed.
   */
  cityRuns: { courses: RunCourse[]; board: NonNullable<CityRunMsg["board"]>; best: NonNullable<CityRunMsg["best"]>; run: RunView | null; runAt: number; feed: string[] } = { courses: [], board: [], best: [], run: null, runAt: 0, feed: [] };
  /** the objective line as last drawn by the runs, so a tick that changes nothing writes nothing */
  private runLine = "";

  constructor(private game: Game) {
    const q = new URLSearchParams(location.search);
    this.missionId = q.get("mission");
    this.crew = crewCodeFromSocket(q.get("net"));
    this.explore = q.get("explore") === "1";
    this.local = sandboxAccount(game.file.account);
    try {
      const raw = localStorage.getItem(`meltdown.campaign.${game.file.account}`);
      if (raw) this.local.campaign = JSON.parse(raw);
    } catch {
      /* fresh */
    }
    this.save = campaignOf(this.local);
    document.addEventListener("keydown", (e) => this.onKey(e));
    // Stage 138: the phone has no Enter and no 1–4; a tap on the terminal reads on or chooses
    this.game.hud.onTerminalTap((i) => void this.advance(i));
  }

  get uiOpen(): boolean {
    return this.playing !== null || this.contractsOpen;
  }

  /**
   * The campaign as it stands, without touching `save`: the loaded file when a host is linked, else the
   * local stand-in. The hub reads this for who is waiting in the office (Stage 667); `save` is only
   * brought up to date when a contract is acted on, so reading it here would show the stand-in's
   * visitor to a file whose ledger says otherwise.
   */
  current(): CampaignSave {
    const f = this.game.file;
    return f.loaded && f.accountRecord ? campaignOf(f.accountRecord) : campaignOf(this.local);
  }

  /** The account the contracts are judged against: the loaded file when a host is linked, else the local stand-in. */
  private account(): Account {
    const f = this.game.file;
    if (f.loaded && f.accountRecord) {
      this.save = campaignOf(f.accountRecord);
      return f.accountRecord;
    }
    this.save = campaignOf(this.local);
    return this.local;
  }

  private persistLocal(): void {
    try {
      localStorage.setItem(`meltdown.campaign.${this.game.file.account}`, JSON.stringify(this.save));
    } catch {
      /* private mode */
    }
  }

  /** Called once the file is known (immediately, or after the ledger host answered). */
  start(): void {
    if (this.started) return;
    this.started = true;
    const a = this.account();
    this.threat = threatProfile(threatRating({ depth: a.depth, counters: a.counters, campaign: this.save }));
    // the city (Stage 692): the district's shared open world, known from the page itself — the link to
    // its room may not be up yet when this runs; the desk opens anywhere, and a contract comes back here
    if (inCity(new URLSearchParams(location.search))) {
      this.mode = "city";
      // the gates are doors here, and the map says where each one goes (Stage 704)
      this.game.hud.setRadarGates(radarGates(gateSigns(this.game.world.level, this.mode)));
      this.cityObjective();
      this.note(`THE CITY · ${levelDisplayName(this.game.levelId)} · EVERYONE ONLINE WALKS THESE STREETS · [J] CONTRACTS`);
      // the room may have told us about its public event before the file came back
      if (this.cityEvent) this.onCityEventMsg(this.cityEvent);
      return;
    }
    if (this.game.online) {
      this.mode = new URLSearchParams(location.search).get("mode") === "campaign" ? "coop" : "none";
      return;
    }
    if (this.missionId) this.startMission(this.missionId);
    else if (this.explore) {
      this.mode = "explore";
      const t = spawnThreat(this.game.world, this.threat);
      this.note(`THREAT ${this.threat.rating} · ${this.threat.line} · +${waspsWord(t.wasps)} +${mechsWord(t.mechs)}`);
      this.game.hud.setObjective(`◈ ${this.game.world.level.displayName ?? this.game.levelId} · EXPLORING`, this.threat.line, null);
    }
    this.applyProtocols();
  }

  /** Worn Kernel Protocols corrupt the local player's sheet — campaign modes only. */
  private applyProtocols(): void {
    if (this.mode === "none" || this.game.online) return;
    const worn = this.save.worn;
    const mods = protocolMods(worn);
    this.game.world.setLoadout(this.game.player, this.game.file.localLoadout(), mods);
    this.game.renderer.campaignFx.setFilament(worn.length > 0);
    if (worn.length) this.note(`PROTOCOLS WORN · ${worn.map((id) => PROTOCOLS.find((p) => p.id === id)?.name ?? id).join(" · ")}`);
  }

  private startMission(id: string): void {
    const a = this.account();
    const def = missionById(id);
    if (!def) return this.note(`UNKNOWN CONTRACT ${id}`);
    if (def.level !== this.game.levelId) return this.note(`${def.title} PLAYS IN ${levelDisplayName(def.level)}`);
    const launch = canLaunch(a, this.save, id);
    if (!launch.ok) this.note(`CONTRACT NOT ON OFFER · ${launch.reason} — RUNNING IT ANYWAY OFF THE RECORD`);
    this.mission = createMission(id, this.game.world, this.save.testimony, this.save.faction, this.threat.rating);
    if (!this.mission) return;
    this.mode = "mission";
    this.game.hud.setObjective(`◈ ${def.title}`, def.brief, null);
    this.note(`CONTRACT · ${def.title} · THREAT ${this.threat.rating} · ${waspsWord(this.mission.spawned.wasps)} ${mechsWord(this.mission.spawned.mechs)}`);
    this.game.audio.pa();
    this.syncFx();
  }

  private note(line: string): void {
    this.log.push(line);
    if (this.log.length > 40) this.log.shift();
    this.game.hud.push(line, "am");
  }

  /** the city gate this file is standing in and for how long (Stage 697) */
  gateHold: GateHold | null = null;
  /** where a gate sent this page: the probe reads it under `?nonav=1`, where nothing loads */
  gateTarget: { gate: number; district: string; arriveGate: number; url: string } | null = null;
  /** standing at the metro booth, so Tab opens the market (a sink, never a payout) */
  atLedgerDesk = false;
  /** where the booth sent this page */
  runTarget: string | null = null;

  /**
   * The city's gates, once a sim tick (Stage 697): name the gate ahead, count the time stood in its
   * mouth, and walk through it once the hold is full. A dead file, or one with a panel open, crosses
   * nothing. The metro booth, when no gate is ahead, is its own one-second hold into THE RUN.
   */
  private cityGates(): void {
    const g = this.game;
    if (this.gateTarget || this.runTarget) return; // already on the way
    const p = g.player;
    const level = g.world.level;
    const live = p.alive && !this.uiOpen;
    const at = live ? gateToTravel(p.pos, level, this.mode) : null;
    const desk = live && at === null && nearLedgerDesk(p.pos, level);
    const mouth = desk && inLedgerMouth(p.pos, level);
    this.atLedgerDesk = desk;
    const step = stepGateHold(this.gateHold, at ?? (mouth ? LEDGER_HOLD_GATE : null), SIM_DT);
    this.gateHold = step.hold;
    const near = live ? gatePrompt(p.pos, level, this.mode) : null;
    if (near) g.hud.setGate(gateLine(near.to.district, holdProgress(this.gateHold), at !== null));
    else if (desk) g.hud.setGate(ledgerHudLine(holdProgress(this.gateHold), mouth, g.hud.touch));
    else g.hud.setGate(null);
    if (step.go && at !== null) this.walkThrough(at);
    else if (step.go && mouth) this.enterRun();
  }

  /** Through the metro booth: THE RUN of this district. The city pays nothing for the walk. */
  enterRun(): boolean {
    const url = runPageUrl(location.href, this.game.levelId);
    if (!url || this.runTarget) return false;
    this.runTarget = url;
    this.game.hud.setGate(null);
    this.note(`THE RUN · ${levelDisplayName(this.game.levelId)}`);
    this.travel(url);
    return true;
  }

  /** Through a gate: the neighbour's city, arriving at the gate that leads back here. */
  walkThrough(gate: number): boolean {
    const t = gateTravelUrl(location.href, gate);
    if (!t) return false;
    this.gateTarget = { gate, district: t.to.district, arriveGate: t.to.gate, url: t.url };
    this.game.hud.setGate(null);
    this.note(`THE CITY · THROUGH THE GATE TO ${levelDisplayName(t.to.district)}`);
    this.travel(t.url);
    return true;
  }

  /** One sim tick (offline modes): step the mission and present what happened. */
  tick(events: readonly SimEvent[]): void {
    if (this.mode === "city") {
      this.cityRunHud();
      return this.cityGates();
    }
    if (this.mode !== "mission" || !this.mission) return;
    stepMission(this.mission, this.game.world, events);
    for (const ev of drainMissionEvents(this.mission)) this.onMissionEvent(ev);
    this.syncFx();
  }

  private onMissionEvent(ev: ReturnType<typeof drainMissionEvents>[number]): void {
    const hud = this.game.hud;
    switch (ev.type) {
      case "objective":
        hud.alert(`◆ ${ev.text}`, false, 4);
        this.note(`OBJECTIVE ${ev.index + 1} · ${ev.text}`);
        this.game.audio.objective();
        break;
      case "wave":
        hud.alert(`◆ VANTAGE RESPONDS — ${waspsWord(ev.count)}`, true, 3);
        this.game.audio.siren(0.5);
        break;
      case "escort":
        hud.alert(`◆ ${ev.text}`, ev.text.includes("WAITING"), 2.5);
        break;
      case "dialogue":
        this.playScript(ev.script, (t) => {
          if (this.mode === "coop" && this.game.net) this.game.net.sendChoice(ev.script, t);
          else if (this.mission) resolveDialogue(this.mission, t);
        });
        break;
      case "complete":
        void this.complete(ev.id);
        break;
      case "failed":
        hud.setRadarSpots([]);
        hud.card("CONTRACT FAILED", [ev.reason, "THE FILE RE-LEASES. THE CONTRACT STAYS OPEN.", "[J] CONTRACTS · [R] RUN IT AGAIN"], "mg", 0);
        this.note(`CONTRACT FAILED · ${ev.reason}`);
        this.game.audio.debtOwed();
        break;
    }
  }

  private syncFx(): void {
    const fx = this.game.renderer.campaignFx;
    const st = this.mission;
    if (!st) return;
    const v = missionView(st);
    const o = st.objectives[st.index];
    const level = this.game.world.level;
    let marker: { x: number; y: number; z: number } | null = null;
    if (o && (o.kind === "reach" || ((o.kind === "survive" || o.kind === "hold") && o.at))) {
      const p = resolveSpot(level, o.kind === "reach" ? o.at : o.at!);
      marker = { x: p.x, y: p.y, z: p.z };
    }
    fx.setMarker(marker);
    fx.setEscort(v.escort);
    const targets = o?.kind === "destroy" ? st.targets.map((id) => this.game.world.dummies.find((d) => d.id === id)).filter((d) => d && d.alive).map((d) => ({ x: d!.pos.x, y: d!.pos.y, z: d!.pos.z })) : [];
    fx.setTargets(targets);
    // and the map gets the same three things (Stage 92): the contract has been a marker in the world
    // since Stage 10 and nothing in the corner of the screen, so a goal behind you was a goal you
    // had to find by turning on the spot
    this.game.hud.setRadarSpots([
      ...(marker ? [{ kind: "goal" as const, x: marker.x, z: marker.z }] : []),
      ...(v.escort ? [{ kind: "escort" as const, x: v.escort.x, z: v.escort.z }] : []),
      ...targets.map((t) => ({ kind: "target" as const, x: t.x, z: t.z })),
    ]);
    const prog = o ? (o.kind === "kill" || o.kind === "destroy" ? `${v.progress}/${v.need}` : o.kind === "survive" || o.kind === "hold" ? holdClock(v.progress, v.need) : o.kind === "escort" ? `${Math.round(v.progress * 100)}%` : null) : null;
    // …and how far it is, when the contract has a place it wants you (Stage 92): a distance is the
    // difference between "go to the substation" and knowing whether to sprint or to take the long
    // way round
    const goal = marker ?? (v.escort ? { x: v.escort.x, y: 0, z: v.escort.z } : null);
    const away = goal ? Math.hypot(goal.x - this.game.player.pos.x, goal.z - this.game.player.pos.z) : null;
    this.game.hud.setObjective(`◈ ${st.def.title}`, v.objective || (st.status === "complete" ? "CONTRACT CLOSED" : st.status === "failed" ? "CONTRACT FAILED" : ""), prog ?? (away !== null ? `${Math.round(away)} M` : null));
  }

  // ---- dialogue ----

  playScript(scriptId: string, onDone: (t: Testimony) => void): void {
    const s = scriptById(scriptId);
    if (!s) return onDone({});
    const node = s.nodes.find((n) => n.id === s.start)!;
    this.playing = { script: scriptId, node, testimony: {}, onDone };
    this.showNode();
    this.game.audio.printTick();
  }

  private showNode(): void {
    const p = this.playing!;
    const n = p.node;
    const speaker = n.speaker === "you" ? { name: "YOU", sigil: "▸", color: "gr" } : n.speaker === "terminal" ? { name: "TERMINAL", sigil: "▮", color: "cy" } : { name: HANDLERS[n.speaker as HandlerId].name, sigil: HANDLERS[n.speaker as HandlerId].sigil, color: HANDLERS[n.speaker as HandlerId].color };
    const all = { ...this.save.testimony, ...p.testimony };
    const choices = (n.choices ?? []).filter((c) => gateOpen(c.gate, all, this.save.faction)).map((c) => c.text);
    // what the file has to say back about what this player already did (Stage 661)
    const recall = recallIndex(n, all, this.save.faction);
    this.game.hud.terminal(speaker.name, speaker.sigil, speaker.color, linesAt(n, recall), choices.length ? choices : null, portraitFor(n.speaker));
    this.armCutscene(n.speaker);
    // the crew reads the same screen (Stage 52): the host sends where it is; the room mirrors it to everyone
    if (this.mode === "coop" && this.host && this.game.net) this.game.net.sendTerminal({ script: p.script, node: n.id, choices, picked: this.lastPick, recall });
    this.lastPick = null;
  }

  /** a guest's view of the host's terminal (Stage 52): the same lines and choices, no keys */
  private onMirror(ev: { script: string; node: string; choices: string[]; picked: string | null; recall: number }): void {
    if (ev.picked) this.mirrorLog.push(ev.picked);
    if (!ev.node) {
      this.mirror = null;
      this.game.renderer.setFace(null);
      this.game.hud.terminalClose();
      return;
    }
    const s = scriptById(ev.script);
    const n = s?.nodes.find((x) => x.id === ev.node);
    if (!n) return;
    const speaker = n.speaker === "you" ? { name: "THE HOST", sigil: "▸", color: "gr" } : n.speaker === "terminal" ? { name: "TERMINAL", sigil: "▮", color: "cy" } : { name: HANDLERS[n.speaker as HandlerId].name, sigil: HANDLERS[n.speaker as HandlerId].sigil, color: HANDLERS[n.speaker as HandlerId].color };
    this.mirror = { script: ev.script, node: ev.node, choices: ev.choices.slice(), picked: ev.picked };
    // the host's recall, not the guest's own testimony: the crew reads one screen (Stage 52 / 661)
    this.game.hud.terminal(speaker.name, speaker.sigil, speaker.color, linesAt(n, ev.recall), ev.choices.length ? ev.choices : null, portraitFor(n.speaker));
    this.armCutscene(n.speaker);
    this.game.hud.terminalFooter(ev.choices.length ? "THE HOST IS CHOOSING" : "THE HOST READS ON");
    if (ev.picked) this.game.hud.alert(`◆ THE HOST CHOSE · ${ev.picked}`, false, 2.5);
  }

  /**
   * The line is a cutscene. A body in the room gets the camera. Anyone else with a portrait gets
   * the plate pushed in. The bars come down either way.
   */
  private armCutscene(speaker: string): void {
    const p = this.game.player;
    const wern = this.game.renderer.wern;
    const shot = dialogueShot({
      speaker,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, eye: eyeHeight(p) },
      visitor: this.game.renderer.hub?.visitorPose() ?? null,
      wern: wern ? { x: wern.position.x, z: wern.position.z, yaw: wern.rotation.y } : null,
    });
    this.game.renderer.setFace(shot);
    this.game.hud.cutscene(true, shot ? null : portraitFor(speaker), terminalPush(speaker, shot !== null));
  }

  /** Enter / Space: continue a node without choices; 1–4: pick a choice. */
  advance(choice = -1): boolean {
    const p = this.playing;
    if (!p) return false;
    if (!this.game.hud.terminalReady) {
      this.game.hud.terminalSkip();
      return true;
    }
    const s = scriptById(p.script)!;
    const all = { ...this.save.testimony, ...p.testimony };
    const open = (p.node.choices ?? []).filter((c) => gateOpen(c.gate, all, this.save.faction));
    let nextId: string | null | undefined;
    if (open.length) {
      const c = open[choice];
      if (!c) return false;
      for (const [k, v] of Object.entries(c.set ?? {})) p.testimony[k] = v;
      nextId = c.next;
      this.lastPick = c.text;
      this.game.audio.sign();
    } else {
      nextId = p.node.next ?? null;
      this.game.audio.printTick();
    }
    if (nextId) {
      p.node = s.nodes.find((n) => n.id === nextId) ?? p.node;
      this.showNode();
    } else {
      this.playing = null;
      this.game.renderer.setFace(null);
      this.game.hud.terminalClose();
      if (this.mode === "coop" && this.host && this.game.net) this.game.net.sendTerminal({ script: p.script, node: "", choices: [], picked: this.lastPick, recall: -1 });
      this.lastPick = null;
      p.onDone(p.testimony);
    }
    return true;
  }

  private onKey(e: KeyboardEvent): void {
    if (this.playing) {
      if (e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter") {
        e.preventDefault();
        this.advance();
      }
      const m = e.code.match(/^Digit([1-4])$/);
      if (m) {
        e.preventDefault();
        this.advance(Number(m[1]) - 1);
      }
      return;
    }
    // J, not C: C is crouch, and the desk used to open every time the player ducked (Stage 692)
    if (e.code === "KeyJ") this.toggleContracts();
    if (e.code === "KeyR" && this.mission?.status === "failed") travelTo(location.href, loadingFor(location.href), { replace: true });
    if (e.code === "KeyB" && this.mission && this.mission.status !== "running") {
      const url = this.backToCity();
      if (url) this.travel(url);
    }
  }

  /** where a contract taken in the city goes back to when it is over (Stage 692), or null when it was not taken there */
  backToCity(): string | null {
    const back = new URLSearchParams(location.search).get("back");
    const hosts = this.crewHosts();
    if (!back || !hosts) return null;
    return cityPageUrl(location.href, { wsBase: hosts.ws, level: back, shop: new URLSearchParams(location.search).get("shop") });
  }

  // ---- completion ----

  private async complete(id: string): Promise<void> {
    // the contract is closed: take it off the map, or the goal of a finished mission hangs there
    // through the results card and into whatever comes next (Stage 92)
    this.game.hud.setRadarSpots([]);
    const t = this.mission?.testimony ?? {};
    const f = this.game.file;
    let ok = false;
    let reason: string | undefined;
    if (f.shop) {
      const r = await f.postCampaign({ op: "complete", id, testimony: t });
      ok = r.ok;
      reason = r.reason;
      if (r.account) f.applyAccount(r.account);
    } else {
      const r = completeContract(this.local, id, t);
      ok = r.ok;
      reason = r.reason;
      this.persistLocal();
    }
    this.completion = { id, ok, reason };
    const def = missionById(id)!;
    const rw = def.reward;
    const lines = [ok ? "SETTLED ON YOUR FILE" : `NOT SETTLED · ${reason ?? ""}`, rw.scrip ? `+${rw.scrip} SCRIP` : "", rw.xp ? `+${rw.xp} XP` : "", rw.protocol ? `KERNEL PROTOCOL · ${PROTOCOLS.find((p) => p.id === rw.protocol)?.name ?? rw.protocol}` : "", rw.weapon ? `WEAPON UNLOCKED · ${weaponName(rw.weapon)}` : "", this.backToCity() ? "[J] CONTRACTS · [B] BACK TO THE CITY" : "[J] CONTRACTS"].filter(Boolean);
    this.note(`CONTRACT CLOSED · ${def.title}${ok ? "" : " · " + (reason ?? "")}`);
    this.game.audio.sign();
    if (id === "m7_white_office") {
      const e = resolveEnding(t, this.save.faction);
      this.ending = e.id;
      // the coda after the ending's own lines: the choices no ending gate reads, answered rather
      // than dropped (Stage 656)
      const coda = endingCoda(t);
      this.game.hud.card(e.title, [...e.lines, ...(coda.length ? ["", ...coda] : []), "", "MELTDOWN", "[J] CONTRACTS"], "ye", 0, ENDING_ART[e.id]);
      this.game.audio.rite(3);
    } else this.game.hud.card(`CONTRACT CLOSED · ${def.title}`, lines, "am", 0);
    this.game.renderer.post.kick(1);
  }

  // ---- co-op mirror ----

  onMissionMsg(m: MissionMsg): void {
    this.remote = m;
    this.mode = "coop";
    const me = this.game.player.id;
    this.host = m.hostId === me;
    const v = m.view as ReturnType<typeof missionView>;
    const prog = v.kind === "kill" || v.kind === "destroy" ? `${v.progress}/${v.need}` : v.kind === "survive" || v.kind === "hold" ? holdClock(v.progress, v.need) : null;
    this.game.hud.setObjective(`◈ ${v.title}${this.crew ? ` · CREW ${this.crew}` : ""}${this.host ? " · HOST" : ""}`, v.objective || (v.status === "complete" ? "CONTRACT CLOSED" : v.status === "failed" ? "CONTRACT FAILED" : ""), prog);
    const fx = this.game.renderer.campaignFx;
    fx.setEscort(v.escort);
    for (const ev of m.events as ReturnType<typeof drainMissionEvents>) {
      if (ev.type === "dialogue") {
        if (this.host) this.onMissionEvent(ev);
        else this.game.hud.alert("◆ THE HOST IS AT THE TERMINAL", true, 3);
      } else if (ev.type === "terminal") {
        if (!this.host) this.onMirror(ev);
      } else if (ev.type === "complete") {
        const s = m.settled?.find((x) => x.id === ev.id);
        this.completion = { id: ev.id, ok: s?.ok ?? false, reason: s?.reason };
        const def = missionById(ev.id);
        this.game.hud.card(`CONTRACT CLOSED · ${def?.title ?? ev.id}`, [s?.ok ? "SETTLED ON EVERY FILE" : `NOT SETTLED · ${s?.reason ?? ""}`, "[J] CONTRACTS"], "am", 0);
        this.game.audio.sign();
      } else this.onMissionEvent(ev);
    }
  }

  // ---- the city's public events (Stage 699) ----

  private cityObjective(): void {
    this.game.hud.setObjective(`◈ THE CITY · ${levelDisplayName(this.game.levelId)}`, "[J] CONTRACTS · NO ONE HERE CAN HURT YOU BUT VANTAGE", null);
  }

  /**
   * The room's word on its public event: a banner when one starts, the objective line, the beam and
   * the map while it runs (the cell walked in its own body), a card when it ends. Everything drawn is
   * something the HUD and the contract markers already draw.
   */
  onCityEventMsg(m: CityEventMsg): void {
    this.cityEvent = m;
    if (this.mode !== "city") return;
    const ev = m.event;
    const hud = this.game.hud;
    const fx = this.game.renderer.campaignFx;
    // a street run in progress has the objective line and the beam (Stage 703); the event keeps its spots on the map
    const running = this.runActive();
    if (!ev || ev.status !== "running") {
      if (!running) fx.setMarker(null);
      fx.setEscort(null);
      fx.setTargets([]);
      this.eventSpots = [];
      this.cityRadar();
      if (!running) this.cityObjective();
      const card = eventCard(m);
      if (ev && card && ev.id !== this.cityEventClosed) {
        this.cityEventClosed = ev.id;
        hud.card(card.title, card.lines, card.color, 7);
        this.note(`${card.title} · ${card.lines.slice(1).join(" · ")}`);
        if (ev.status === "complete") this.game.audio.sign();
        else this.game.audio.debtOwed();
      }
      return;
    }
    if (ev.id !== this.cityEventAnnounced) {
      this.cityEventAnnounced = ev.id;
      hud.alert(eventBanner(ev), true, 5);
      this.note(`PUBLIC EVENT · ${ev.title} · ${ev.text}`);
      this.game.audio.pa();
    }
    const me = this.game.player;
    const marker = eventMarker(ev);
    if (!running) {
      const o = eventObjective(ev, me ? { x: me.pos.x, z: me.pos.z } : null);
      hud.setObjective(o.title, o.text, o.progress);
      this.runLine = "";
      fx.setMarker(ev.kind === "escort" ? null : marker);
    }
    fx.setEscort(ev.escort ? { x: ev.escort.x, z: ev.escort.z, heading: ev.escort.heading, waiting: ev.escort.waiting, who: "cell" } : null);
    this.eventSpots = [{ kind: "goal" as const, x: marker.x, z: marker.z }, ...(ev.escort ? [{ kind: "escort" as const, x: ev.escort.x, z: ev.escort.z }] : []), ...ev.targets.map((t) => ({ kind: "target" as const, x: t.x, z: t.z }))];
    this.cityRadar();
  }

  // ---- street runs (Stage 703) ----

  private runActive(): boolean {
    const r = this.cityRuns.run;
    return !!r && (r.state === "armed" || r.state === "running");
  }

  private runCourse(id: string): RunCourse | null {
    return this.cityRuns.courses.find((c) => c.id === id) ?? null;
  }

  private bestTime(id: string): number | null {
    return this.cityRuns.best.find((b) => b.course === id)?.time ?? null;
  }

  /** the run's clock as this client shows it: the room's word, run on from when it arrived */
  runElapsed(now = performance.now()): number {
    const r = this.cityRuns.run;
    if (!r || r.state !== "running") return r?.time ?? 0;
    return r.elapsed + Math.max(0, now - this.cityRuns.runAt) / 1000;
  }

  /** The map: a run's next checkpoint and the one after; otherwise the event's spots and every course's start. */
  private cityRadar(): void {
    const r = this.cityRuns.run;
    const c = r && this.runActive() ? this.runCourse(r.course) : null;
    if (r && c) {
      const next = c.checkpoints[Math.min(r.next, c.checkpoints.length - 1)]!;
      const then = c.checkpoints[r.next + 1];
      this.game.hud.setRadarSpots([{ kind: "goal", x: next.x, z: next.z }, ...(then ? [{ kind: "escort" as const, x: then.x, z: then.z }] : [])]);
      return;
    }
    this.game.hud.setRadarSpots([...this.eventSpots, ...this.cityRuns.courses.map((k) => ({ kind: "escort" as const, x: k.start.x, z: k.start.z }))]);
  }

  /**
   * The room's word on street runs: the courses at the door, the board, a run's arming, start, splits
   * and end (to its runner), and anyone's finish (to everyone else, as a line).
   */
  onCityRunMsg(m: CityRunMsg): void {
    const st = this.cityRuns;
    if (m.courses) st.courses = m.courses;
    if (m.board) st.board = m.board;
    if (m.best) st.best = m.best;
    if (m.feed) {
      st.feed.push(m.feed);
      if (st.feed.length > 8) st.feed.shift();
    }
    const prev = st.run;
    if (m.run !== undefined) {
      st.run = m.run;
      st.runAt = performance.now();
    }
    if (this.mode !== "city") return;
    const hud = this.game.hud;
    if (m.feed) this.note(`STREET RUN · ${m.feed}`);
    const r = m.run;
    const c = r ? this.runCourse(r.course) : null;
    if (r && c) {
      if (r.state === "armed") {
        hud.alert(`◆ STREET RUN · ${c.name} · ARMED`, false, 3);
        this.game.audio.objective();
      } else if (r.state === "running" && r.splits.length === 0 && prev?.state === "armed") {
        hud.alert(`◆ GO · ${c.name}`, false, 1.5);
      } else if (r.state === "running" && r.splits.length > (prev?.splits.length ?? 0)) {
        hud.alert(splitBanner(c, r), false, 2);
        this.game.audio.objective();
      } else if (r.state === "finished" || r.state === "void") {
        const card = runCard(c, r, this.bestTime(c.id));
        if (card) {
          hud.card(card.title, card.lines, card.color, 7);
          this.note(`${card.title} · ${card.lines.join(" · ")}`);
        }
        if (r.state === "finished" && r.pb) this.game.audio.sign();
        else if (r.state === "void") this.game.audio.debtOwed();
        this.runLine = "";
        // the event (if one runs) takes the objective line and the beam back
        if (this.cityEvent) this.onCityEventMsg(this.cityEvent);
        else this.cityObjective();
      }
    }
    this.cityRunHud();
  }

  /**
   * Once a tick in the city: the run's objective line with its clock, and the beam on the next
   * checkpoint; with no run on, the start ring nearby (unless a public event has the line).
   */
  private cityRunHud(): void {
    const st = this.cityRuns;
    const g = this.game;
    const me = g.player;
    const fx = g.renderer.campaignFx;
    const at = me ? { x: me.pos.x, z: me.pos.z } : null;
    let line: { title: string; text: string; progress: string } | null = null;
    const r = st.run;
    const c = r && this.runActive() ? this.runCourse(r.course) : null;
    if (r && c) {
      line = runObjective(c, r, this.runElapsed(), at);
      const next = r.state === "armed" ? c.start : c.checkpoints[Math.min(r.next, c.checkpoints.length - 1)]!;
      fx.setMarker({ x: next.x, y: next.y, z: next.z });
    } else if (at && st.courses.length && this.cityEvent?.event?.status !== "running") {
      const near = nearestStart(st.courses, at);
      if (near && near.distance <= 40) {
        const rec = st.board.find((b) => b.course === near.course.id)?.top[0] ?? null;
        line = startPrompt(near.course, this.bestTime(near.course.id), rec, near.distance);
        fx.setMarker({ x: near.course.start.x, y: near.course.start.y, z: near.course.start.z });
      } else if (this.runLine) {
        // walked away from the ring: the city's own line again
        this.runLine = "";
        fx.setMarker(null);
        this.cityObjective();
      }
    }
    this.cityRadar();
    if (!line) return;
    const key = `${line.title}|${line.text}|${line.progress}`;
    if (key === this.runLine) return;
    this.runLine = key;
    g.hud.setObjective(line.title, line.text, line.progress);
  }

  // ---- contracts panel (the Deadletter Office desk, reachable anywhere) ----

  toggleContracts(on = !this.contractsOpen): void {
    this.contractsOpen = on;
    if (on) {
      if (!this.save.faction && !this.playing) {
        this.playScript("creation", (t) => {
          const f = t["faction"] as FactionId | undefined;
          if (f) void this.chooseFaction(f);
          this.renderContracts();
        });
      }
      this.renderContracts();
    }
    this.game.hud.contracts(on, on ? this.contractsHtml() : "");
    if (on) document.exitPointerLock?.();
  }

  async chooseFaction(f: FactionId): Promise<boolean> {
    if (this.game.file.shop) {
      const r = await this.game.file.postCampaign({ op: "faction", faction: f });
      if (r.account) this.game.file.applyAccount(r.account);
      this.save = campaignOf(this.account());
      this.renderContracts();
      return r.ok;
    }
    const ok = pickFaction(this.local, f);
    this.persistLocal();
    this.renderContracts();
    return ok;
  }

  async wear(ids: string[]): Promise<string[]> {
    if (this.game.file.shop) {
      const r = await this.game.file.postCampaign({ op: "wear", protocols: ids });
      if (r.account) this.game.file.applyAccount(r.account);
      this.save = campaignOf(this.account());
    } else {
      wearProtocols(this.local, ids);
      this.persistLocal();
    }
    this.applyProtocols();
    this.renderContracts();
    return this.save.worn;
  }

  /** Launch a contract: travel to its district with the mission on the URL (offline solo). */
  launch(id: string): { ok: boolean; reason?: string } {
    const a = this.account();
    const r = canLaunch(a, this.save, id);
    if (!r.ok) return r;
    const def = missionById(id)!;
    const u = new URL(location.href);
    // a contract taken in the city (Stage 692) remembers which city to come back to
    if (this.mode === "city") u.searchParams.set("back", this.game.levelId);
    u.searchParams.set("level", def.level);
    u.searchParams.set("mission", id);
    u.searchParams.delete("explore");
    u.searchParams.delete("net");
    u.searchParams.delete("city");
    this.game.renderer.post.kick(1);
    travelTo(u.toString(), loadingFor(u.toString()), { replace: true, delay: 120 });
    return { ok: true };
  }

  /**
   * The campaign host a crew lives on (Stage 49). In production it is the campaign Worker; in
   * development the page's `?shop=` host serves everything, so a crew is looked up and joined there.
   */
  private crewHosts(): { http: string; ws: string } | null {
    const shop = new URLSearchParams(location.search).get("shop") ?? this.game.file.shop;
    if (HOSTS.build !== "dev") return { http: HOSTS.campaign, ws: HOSTS.campaignWs };
    if (!shop) return null;
    return { http: shop, ws: shop.replace(/^http/, "ws") };
  }

  /** A crew's trip: the loading card names the district and the crew (under `?nonav=1` it shows and nothing loads). */
  private travel(url: string): void {
    this.game.renderer.post.kick(1);
    travelTo(url, loadingFor(url), { replace: true, delay: 120, nonav: new URLSearchParams(location.search).get("nonav") === "1" });
  }

  /** RUN WITH A CREW (Stage 49): the same launch gate as solo, then a code, the co-op room it names, and travel. */
  launchCrew(id: string): { ok: boolean; reason?: string; code?: string; url?: string } {
    const r = canLaunch(this.account(), this.save, id);
    if (!r.ok) return r;
    const hosts = this.crewHosts();
    if (!hosts) return { ok: false, reason: "no campaign host: a crew needs the ledger" };
    const def = missionById(id)!;
    const code = newCrewCode();
    const url = crewPageUrl(location.href, { wsBase: hosts.ws, code, mission: id, level: def.level, shop: new URLSearchParams(location.search).get("shop") });
    this.crewTarget = { code, url };
    this.travel(url);
    return { ok: true, code, url };
  }

  /** JOIN A CREW (Stage 49): a code the alphabet could have made is looked up on the host; a good one is travelled to. */
  async joinCrew(raw: string): Promise<{ ok: boolean; reason?: string; code?: string; url?: string; info?: CrewInfo }> {
    const code = normaliseCrewCode(raw);
    if (!code) return { ok: false, reason: "that is not a crew code" };
    const hosts = this.crewHosts();
    if (!hosts) return { ok: false, reason: "no campaign host: a crew needs the ledger" };
    let info: CrewInfo;
    try {
      info = (await (await fetch(`${hosts.http}/crew/${code}`)).json()) as CrewInfo;
    } catch {
      return { ok: false, reason: "the campaign host did not answer", code };
    }
    if (!info.ok) return { ok: false, reason: info.reason, code, info };
    if (info.status === "complete" || info.status === "failed") return { ok: false, reason: `that crew's contract is ${info.status}`, code, info };
    const url = crewPageUrl(location.href, { wsBase: hosts.ws, code, mission: info.mission, level: info.level, shop: new URLSearchParams(location.search).get("shop") });
    this.crewTarget = { code, url };
    this.travel(url);
    return { ok: true, code, url, info };
  }

  private renderContracts(): void {
    if (this.contractsOpen) this.game.hud.contracts(true, this.contractsHtml());
  }

  contractsHtml(): string {
    const a = this.account();
    const c = this.save;
    const threat = threatProfile(threatRating({ depth: a.depth, counters: a.counters, campaign: c }));
    const faction = FACTIONS.find((f) => f.id === c.faction);
    const next = nextMission(c);
    const offers = gigsOnOffer(a, c);
    const alive = handlersAlive(c.testimony);
    const row = (m: MissionDef, on: boolean, why = "") => `<div class="ct ${on ? "on" : "off"}" data-launch="${on ? m.id : ""}">${gigThumb(m.id)}<div class="nm">${m.kind === "mission" ? `◈ ${String(m.order).padStart(2, "0")} · ` : "▸ "}${m.title} <span class="lv">${levelDisplayName(m.level)}</span></div><div class="br">${m.brief}</div><div class="rw">${[m.reward.scrip ? `+${m.reward.scrip}¢` : "", m.reward.xp ? `+${m.reward.xp} XP` : "", m.reward.protocol ? `PROTOCOL ${PROTOCOLS.find((p) => p.id === m.reward.protocol)?.name ?? m.reward.protocol}` : "", m.reward.weapon ? `WEAPON ${weaponName(m.reward.weapon)}` : "", m.requires?.threat ? `THREAT ≥ ${m.requires.threat}` : ""].filter(Boolean).join(" · ")}${why ? ` · <i>${why}</i>` : ""}${on ? ` · <span class="cy" data-crew="${m.id}">[RUN WITH A CREW]</span>` : ""}</div></div>`;
    const fixers = (["deacon", "marrow", "vessel"] as const).map((h) => {
      const H = HANDLERS[h];
      const mine = offers.filter((g) => g.fixer === h);
      const done = GIGS.filter((g) => g.fixer === h && c.gigsDone.includes(g.id)).length;
      return `<div class="fx ${H.color}">${fixerHeader(h, alive[h])}${alive[h] ? mine.map((g) => row(g, true)).join("") || `<div class="dim">NO CONTRACTS ON OFFER${done ? ` · ${done} CLOSED` : ""}</div>` : '<div class="dim">NO ONE ANSWERS</div>'}</div>`;
    }).join("");
    // the arc leads with its picture (Stage 682): the next mission's key art, or the ending the file earned
    const banner = deskBanner(next?.id ?? null, c.ending ?? null, ENDING_ART);
    const arc = (banner ? `<img class="mb" src="${banner}" alt="">` : "") + (next ? row(next, true) : `<div class="dim">THE ARC IS COMPLETE · ENDING: ${endingTitle(c.ending)}</div>`);
    const protos = PROTOCOLS.map((p) => {
      const owned = c.protocols.includes(p.id);
      const worn = c.worn.includes(p.id);
      return `<label class="pr ${owned ? "" : "off"} ${worn ? "worn" : ""}">${protocolIcon(p.id)}<input type="checkbox" data-wear="${p.id}" ${worn ? "checked" : ""} ${owned ? "" : "disabled"}> <b>${p.name}</b> <span class="dim">${p.line}</span></label>`;
    }).join("");
    const endings = endingsFor(c.testimony, c.faction).map((e) => e.title).join(" · ");
    return `<div class="hd">▲ CONTRACTS · ${faction ? `${faction.name}` : "NO HOUSE"} <span class="x" data-act="close">${closeHint("J", this.game.hud.touch)}</span></div>
      <div class="ln">THREAT <b>${threat.rating}</b> · ${threat.line}${threat.named ? " · THE PA CALLS YOUR NAME" : ""}</div>
      <div class="ln dim">TESTIMONY ${Object.entries(c.testimony).filter(([k]) => k !== "faction").map(([k, v]) => testimonyLine(k, v)).join(" · ") || "— NOTHING ON THE RECORD —"} · ENDINGS OPEN: ${endings}</div>
      <div class="cols"><div><div class="sh">THE ARC · ${c.missionsDone.length}/${MAIN_ARC.length}</div>${arc}<div class="sh">FIXERS · GIGS ${c.gigsDone.length}/${GIGS.length}</div>${fixers}</div>
      <div><div class="sh">KERNEL PROTOCOLS · ${c.worn.length}/${MAX_PROTOCOLS} WORN <span class="red">· CAMPAIGN ONLY · STRIPPED AT PVP JOIN</span></div>${protos}
      <div class="sh">CAMPAIGN WEAPONS</div><div class="ln cws">${CAMPAIGN_WEAPONS.map((w) => weaponCard(w, weaponName(w), c.weapons.includes(w as "directive" | "clockeater"))).join("")}</div>
      <div class="sh">CREW</div><div class="ln">${this.crew ? `IN CREW <b class="ye">${this.crew}</b> · ${this.host ? "YOU HOLD THE TERMINALS" : "THE HOST HOLDS THE TERMINALS"} · TELL A FRIEND THE CODE` : `<input data-crewcode="1" maxlength="8" placeholder="INVITE CODE" style="text-transform:uppercase"> <span class="cy" data-act="joinCrew">[JOIN A CREW]</span> <span class="dim">OR RUN WITH A CREW ON A CONTRACT ABOVE AND READ THE CODE OUT</span>`}</div>
      <div class="sh">EXPLORE</div><div class="ln dim">TRAVEL TO A DISTRICT FROM THE MAP WITH THE THREAT LIVE: <span class="cy" data-explore="1">[EXPLORE THIS DISTRICT]</span></div></div></div>`;
  }

  /** Clicks inside the contracts panel (the HUD forwards them). */
  onPanelAction(el: HTMLElement): void {
    if (el.dataset.act === "close") this.toggleContracts(false);
    else if (el.dataset.launch) {
      const r = this.launch(el.dataset.launch);
      if (!r.ok) this.game.hud.alert(`◆ ${r.reason?.toUpperCase()}`, true, 3);
    } else if (el.dataset.crew) {
      const r = this.launchCrew(el.dataset.crew);
      if (!r.ok) this.game.hud.alert(`◆ ${r.reason?.toUpperCase()}`, true, 3);
    } else if (el.dataset.act === "joinCrew") {
      const input = document.querySelector<HTMLInputElement>("#hud .contracts input[data-crewcode]");
      void this.joinCrew(input?.value ?? "").then((r) => {
        if (!r.ok) this.game.hud.alert(`◆ ${r.reason?.toUpperCase()}`, true, 3);
      });
    } else if (el.dataset.wear !== undefined) {
      const boxes = [...document.querySelectorAll<HTMLInputElement>("#hud .contracts input[data-wear]")];
      void this.wear(boxes.filter((b) => b.checked).map((b) => b.dataset.wear!));
    } else if (el.dataset.explore) {
      const u = new URL(location.href);
      if (this.game.levelId === HUB_LEVEL_ID) u.searchParams.set("level", "lease_row");
      u.searchParams.set("explore", "1");
      u.searchParams.delete("mission");
      travelTo(u.toString(), loadingFor(u.toString()), { replace: true });
    }
  }

  /** Probe-readable state. */
  view() {
    const a = this.account();
    return {
      mode: this.mode,
      faction: this.save.faction,
      testimony: { ...this.save.testimony },
      missionsDone: this.save.missionsDone.slice(),
      gigsDone: this.save.gigsDone.slice(),
      protocols: this.save.protocols.slice(),
      worn: this.save.worn.slice(),
      weapons: this.save.weapons.slice(),
      threat: this.threat.rating,
      threatLine: this.threat.line,
      mission: this.mission ? missionView(this.mission) : this.remote ? (this.remote.view as ReturnType<typeof missionView>) : null,
      dialogue: this.playing ? { script: this.playing.script, node: this.playing.node.id, speaker: this.playing.node.speaker, choices: (this.playing.node.choices ?? []).filter((c) => gateOpen(c.gate, { ...this.save.testimony, ...this.playing!.testimony }, this.save.faction)).map((c) => c.text), ready: this.game.hud.terminalReady } : null,
      contractsOpen: this.contractsOpen,
      offers: gigsOnOffer(a, this.save).map((g) => g.id),
      next: nextMission(this.save)?.id ?? null,
      completion: this.completion,
      ending: this.ending,
      endingsOpen: endingsFor(this.save.testimony, this.save.faction).map((e) => e.id),
      filament: this.game.renderer.campaignFx.filamentVisible,
      host: this.host,
      crew: this.crew,
      crewTarget: this.crewTarget,
      /** where a contract taken in the city goes back to (Stage 692) */
      backToCity: this.backToCity(),
      /** the city's gates (Stage 697): the line the HUD shows, the hold, and where a gate sent this page */
      gate: { line: this.game.hud.gateText, hold: this.gateHold ? { ...this.gateHold } : null, target: this.gateTarget },
      /** the city's public event as this client knows it (Stage 699) */
      cityEvent: this.cityEvent,
      /** street runs as this client knows them (Stage 703): the courses, the board, this file's bests, its run and its clock */
      cityRuns: { ...this.cityRuns, clock: runClock(this.runElapsed()), objective: this.runLine },
      terminalMirror: this.mirror,
      mirrorLog: this.mirrorLog.slice(),
      log: this.log.slice(-8),
    };
  }
}
