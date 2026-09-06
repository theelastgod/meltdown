/**
 * The campaign on the client: contracts launched from the Deadletter
 * Office, missions stepped offline (or mirrored from the co-op room), CRT
 * dialogue with testimony, Threat presence in explorable districts,
 * Kernel Protocols worn (blood-red), endings. Everything it needs from the
 * file goes through the ledger host's /file/:id/campaign endpoint when one
 * is linked, and a local save otherwise.
 */
import type { Game } from "./game";
import { HANDLERS, FACTIONS, type FactionId, type HandlerId } from "@shared/campaign/factions";
import { ENDINGS, endingsFor, gateOpen, type Testimony } from "@shared/campaign/testimony";
import { threatProfile, threatRating, type ThreatProfile } from "@shared/campaign/threat";
import { PROTOCOLS, protocolMods, MAX_PROTOCOLS } from "@shared/campaign/protocols";
import { scriptById, type ScriptNode } from "@shared/campaign/script";
import { GIGS, MAIN_ARC, missionById, type MissionDef } from "@shared/campaign/missions";
import { campaignOf, canLaunch, completeContract, gigsOnOffer, nextMission, pickFaction, wearProtocols, type CampaignSave } from "@shared/campaign/save";
import { createMission, drainMissionEvents, missionView, resolveDialogue, resolveSpot, spawnThreat, stepMission, type MissionState } from "@shared/campaign/runtime";
import { sandboxAccount, type Account } from "@shared/progression/account";
import type { SimEvent } from "@shared/sim/world";
import type { MissionMsg } from "@shared/net/protocol";
import { HUB_LEVEL_ID } from "@shared/sim/hub";

export type CampaignMode = "none" | "mission" | "explore" | "coop";

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

  constructor(private game: Game) {
    const q = new URLSearchParams(location.search);
    this.missionId = q.get("mission");
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
  }

  get uiOpen(): boolean {
    return this.playing !== null || this.contractsOpen;
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
    if (this.game.online) {
      this.mode = new URLSearchParams(location.search).get("mode") === "campaign" ? "coop" : "none";
      return;
    }
    if (this.missionId) this.startMission(this.missionId);
    else if (this.explore) {
      this.mode = "explore";
      const t = spawnThreat(this.game.world, this.threat);
      this.note(`THREAT ${this.threat.rating} · ${this.threat.line} · +${t.wasps} WASPS +${t.mechs} MECHS`);
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
    if (def.level !== this.game.levelId) return this.note(`${def.title} PLAYS IN ${def.level.toUpperCase()}`);
    const launch = canLaunch(a, this.save, id);
    if (!launch.ok) this.note(`CONTRACT NOT ON OFFER · ${launch.reason} — RUNNING IT ANYWAY OFF THE RECORD`);
    this.mission = createMission(id, this.game.world, this.save.testimony, this.save.faction, this.threat.rating);
    if (!this.mission) return;
    this.mode = "mission";
    this.game.hud.setObjective(`◈ ${def.title}`, def.brief, null);
    this.note(`CONTRACT · ${def.title} · THREAT ${this.threat.rating} · ${this.mission.spawned.wasps} WASPS ${this.mission.spawned.mechs} MECHS`);
    this.game.audio.pa();
    this.syncFx();
  }

  private note(line: string): void {
    this.log.push(line);
    if (this.log.length > 40) this.log.shift();
    this.game.hud.push(line, "am");
  }

  /** One sim tick (offline modes): step the mission and present what happened. */
  tick(events: readonly SimEvent[]): void {
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
        this.game.audio.contest();
        break;
      case "wave":
        hud.alert(`◆ VANTAGE RESPONDS — ${ev.count} WASPS`, true, 3);
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
        hud.card("CONTRACT FAILED", [ev.reason, "THE FILE RE-LEASES. THE CONTRACT STAYS OPEN.", "[C] CONTRACTS · [R] RUN IT AGAIN"], "mg", 0);
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
    fx.setEscort(v.escort ? { x: v.escort.x, z: v.escort.z } : null, v.escort?.waiting ?? false);
    fx.setTargets(o?.kind === "destroy" ? st.targets.map((id) => this.game.world.dummies.find((d) => d.id === id)).filter((d) => d && d.alive).map((d) => ({ x: d!.pos.x, y: d!.pos.y, z: d!.pos.z })) : []);
    const prog = o ? (o.kind === "kill" || o.kind === "destroy" ? `${v.progress}/${v.need}` : o.kind === "survive" || o.kind === "hold" ? `${Math.floor(v.progress)}s / ${v.need}s` : o.kind === "escort" ? `${Math.round(v.progress * 100)}%` : null) : null;
    this.game.hud.setObjective(`◈ ${st.def.title}`, v.objective || (st.status === "complete" ? "CONTRACT CLOSED" : st.status === "failed" ? "CONTRACT FAILED" : ""), prog);
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
    this.game.hud.terminal(speaker.name, speaker.sigil, speaker.color, n.lines, choices.length ? choices : null);
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
      this.game.hud.terminalClose();
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
    if (e.code === "KeyC") this.toggleContracts();
    if (e.code === "KeyR" && this.mission?.status === "failed") location.reload();
  }

  // ---- completion ----

  private async complete(id: string): Promise<void> {
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
    const lines = [ok ? "SETTLED ON YOUR FILE" : `NOT SETTLED · ${reason ?? ""}`, rw.scrip ? `+${rw.scrip} SCRIP` : "", rw.xp ? `+${rw.xp} XP` : "", rw.protocol ? `KERNEL PROTOCOL · ${PROTOCOLS.find((p) => p.id === rw.protocol)?.name ?? rw.protocol}` : "", rw.weapon ? `WEAPON UNLOCKED · ${rw.weapon.toUpperCase()}` : "", "[C] CONTRACTS"].filter(Boolean);
    this.note(`CONTRACT CLOSED · ${def.title}${ok ? "" : " · " + (reason ?? "")}`);
    this.game.audio.sign();
    if (id === "m7_white_office") {
      const endingId = t["m7:ending"] ?? "wipe";
      const e = ENDINGS.find((x) => x.id === endingId) ?? ENDINGS[0]!;
      this.ending = e.id;
      this.game.hud.card(e.title, [...e.lines, "", "MELTDOWN", "[C] CONTRACTS"], "ye", 0);
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
    const prog = v.kind === "kill" || v.kind === "destroy" ? `${v.progress}/${v.need}` : v.kind === "survive" || v.kind === "hold" ? `${Math.floor(v.progress)}s / ${v.need}s` : null;
    this.game.hud.setObjective(`◈ ${v.title}${this.host ? " · HOST" : ""}`, v.objective || (v.status === "complete" ? "CONTRACT CLOSED" : v.status === "failed" ? "CONTRACT FAILED" : ""), prog);
    const fx = this.game.renderer.campaignFx;
    fx.setEscort(v.escort ? { x: v.escort.x, z: v.escort.z } : null, v.escort?.waiting ?? false);
    for (const ev of m.events as ReturnType<typeof drainMissionEvents>) {
      if (ev.type === "dialogue") {
        if (this.host) this.onMissionEvent(ev);
        else this.game.hud.alert("◆ THE HOST IS AT THE TERMINAL", true, 3);
      } else if (ev.type === "complete") {
        const s = m.settled?.find((x) => x.id === ev.id);
        this.completion = { id: ev.id, ok: s?.ok ?? false, reason: s?.reason };
        const def = missionById(ev.id);
        this.game.hud.card(`CONTRACT CLOSED · ${def?.title ?? ev.id}`, [s?.ok ? "SETTLED ON EVERY FILE" : `NOT SETTLED · ${s?.reason ?? ""}`, "[C] CONTRACTS"], "am", 0);
        this.game.audio.sign();
      } else this.onMissionEvent(ev);
    }
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
    u.searchParams.set("level", def.level);
    u.searchParams.set("mission", id);
    u.searchParams.delete("explore");
    u.searchParams.delete("net");
    this.game.renderer.post.kick(1);
    setTimeout(() => location.replace(u.toString()), 120);
    return { ok: true };
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
    const alive = { vessel: c.testimony["m4:vessel"] !== "expose", marrow: c.testimony["m2:informant"] !== "turn", deacon: true };
    const row = (m: MissionDef, on: boolean, why = "") => `<div class="ct ${on ? "on" : "off"}" data-launch="${on ? m.id : ""}"><div class="nm">${m.kind === "mission" ? `◈ ${String(m.order).padStart(2, "0")} · ` : "▸ "}${m.title} <span class="lv">${m.level.replace(/_/g, " ").toUpperCase()}</span></div><div class="br">${m.brief}</div><div class="rw">${[m.reward.scrip ? `+${m.reward.scrip}¢` : "", m.reward.xp ? `+${m.reward.xp} XP` : "", m.reward.protocol ? `PROTOCOL` : "", m.reward.weapon ? `WEAPON ${m.reward.weapon.toUpperCase()}` : "", m.requires?.threat ? `THREAT ≥ ${m.requires.threat}` : ""].filter(Boolean).join(" · ")}${why ? ` · <i>${why}</i>` : ""}</div></div>`;
    const fixers = (["deacon", "marrow", "vessel"] as const).map((h) => {
      const H = HANDLERS[h];
      const mine = offers.filter((g) => g.fixer === h);
      const done = GIGS.filter((g) => g.fixer === h && c.gigsDone.includes(g.id)).length;
      return `<div class="fx ${H.color}"><div class="fh">${H.sigil} ${H.name} <span class="dim">${H.title}</span> ${alive[h] ? "" : '<span class="mg">· RE-LEASED</span>'}</div>${alive[h] ? mine.map((g) => row(g, true)).join("") || `<div class="dim">no contracts on offer${done ? ` · ${done} closed` : ""}</div>` : '<div class="dim">no one answers</div>'}</div>`;
    }).join("");
    const arc = next ? row(next, true) : `<div class="dim">THE ARC IS COMPLETE · ENDING: ${(c.ending ?? "").toUpperCase().replace(/_/g, " ")}</div>`;
    const protos = PROTOCOLS.map((p) => {
      const owned = c.protocols.includes(p.id);
      const worn = c.worn.includes(p.id);
      return `<label class="pr ${owned ? "" : "off"} ${worn ? "worn" : ""}"><input type="checkbox" data-wear="${p.id}" ${worn ? "checked" : ""} ${owned ? "" : "disabled"}> <b>${p.name}</b> <span class="dim">${p.line}</span></label>`;
    }).join("");
    const endings = endingsFor(c.testimony, c.faction).map((e) => e.title).join(" · ");
    return `<div class="hd">▲ CONTRACTS · ${faction ? `${faction.name}` : "NO HOUSE"} <span class="x" data-act="close">[C] CLOSE</span></div>
      <div class="ln">THREAT <b>${threat.rating}</b> · ${threat.line}${threat.named ? " · THE PA CALLS YOUR NAME" : ""}</div>
      <div class="ln dim">TESTIMONY ${Object.entries(c.testimony).filter(([k]) => k !== "faction").map(([k, v]) => `${k.replace(/^m\\d:/, "")}=${v}`).join(" · ") || "— nothing on the record —"} · ENDINGS OPEN: ${endings}</div>
      <div class="cols"><div><div class="sh">THE ARC · ${c.missionsDone.length}/${MAIN_ARC.length}</div>${arc}<div class="sh">FIXERS · GIGS ${c.gigsDone.length}/${GIGS.length}</div>${fixers}</div>
      <div><div class="sh">KERNEL PROTOCOLS · ${c.worn.length}/${MAX_PROTOCOLS} WORN <span class="red">· CAMPAIGN ONLY · STRIPPED AT PVP JOIN</span></div>${protos}
      <div class="sh">CAMPAIGN WEAPONS</div><div class="ln">${["directive", "clockeater"].map((w) => `${c.weapons.includes(w as "directive") ? "▣" : "▢"} ${w.toUpperCase()}`).join(" · ")}</div>
      <div class="sh">EXPLORE</div><div class="ln dim">travel to a district from the MAP with the Threat live: <span class="cy" data-explore="1">[EXPLORE THIS DISTRICT]</span></div></div></div>`;
  }

  /** Clicks inside the contracts panel (the HUD forwards them). */
  onPanelAction(el: HTMLElement): void {
    if (el.dataset.act === "close") this.toggleContracts(false);
    else if (el.dataset.launch) {
      const r = this.launch(el.dataset.launch);
      if (!r.ok) this.game.hud.alert(`◆ ${r.reason?.toUpperCase()}`, true, 3);
    } else if (el.dataset.wear !== undefined) {
      const boxes = [...document.querySelectorAll<HTMLInputElement>("#hud .contracts input[data-wear]")];
      void this.wear(boxes.filter((b) => b.checked).map((b) => b.dataset.wear!));
    } else if (el.dataset.explore) {
      const u = new URL(location.href);
      if (this.game.levelId === HUB_LEVEL_ID) u.searchParams.set("level", "lease_row");
      u.searchParams.set("explore", "1");
      u.searchParams.delete("mission");
      location.replace(u.toString());
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
      log: this.log.slice(-8),
    };
  }
}
