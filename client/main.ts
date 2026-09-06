import { Menu, menuWanted, type MenuView } from "./menu";
import { clampSettings, saveSettings, type Settings } from "./settings";
import { crawlWanted, OpeningCrawl, type CrawlView } from "./crawl";
import { parseTag } from "@shared/identity/identity";
import type { counterView } from "@shared/economy/counter";
import { Game, type NetConfig } from "./game";
import type { NetClient } from "./net/netclient";
import type { BotStep } from "./bot";
import { SIM_HZ } from "@shared/sim/constants";
import type { SimEvent } from "@shared/sim/world";
import type { FileView } from "./file";
import type { SocialMsg } from "@shared/net/protocol";
import { modsFor, weaponDefOf } from "@shared/sim/player";

/** Headless/state hook used by probes and CI. Everything here is read-only or deterministic. */
export interface GameHook {
  ready: true;
  simHz: number;
  game: Game;
  advance: (ticks: number) => void;
  setRealtime: (on: boolean) => void;
  setBot: (plan: BotStep[] | null) => void;
  botStatus: () => Game["botStatus"];
  state: () => {
    tick: number;
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    yaw: number;
    pitch: number;
    stance: string;
    grounded: boolean;
    health: number;
    ammo: number;
    slot: number;
    stats: typeof Game.prototype.player.stats;
    dummies: { id: number; alive: boolean; health: number; pos: { x: number; y: number; z: number } }[];
    loop: typeof Game.prototype.stats;
    audio: Record<string, number>;
    render: { post: boolean; district: string; frames: number; internalScale: number; levelCalls: number; calls: number; triangles: number };
    level: string;
    wake: { phase: string; timeLeft: number; score: number[]; pulses: number; nodes: { id: number; label: string; owner: number; hold: number; contested: boolean; puller: number; boost: number; flips: number }[] } | null;
    team: number;
    hash: string;
    /** Build sheet the sim is running for the local player (loadout applied). */
    mods: Record<string, number>;
    maxShield: number;
    maxHealth: number;
    /** the weapon definition the sim runs for the held slot (firmware applied) */
    weaponDef: { id: string; rpm: number; magSize: number; damage: number; burst: { count: number; rpm: number } | null };
    /** City life (render-only): crowd size and a sample of positions, the tram's coordinate along its line, PA lines spoken. */
    /** identity & rituals (Stage 8): the file's identity, HUD ritual state, social messages received, the Debt target */
    identity: FileView["identity"];
    rituals: { receipt: { open: boolean; lines: string[]; printed: number; stamped: boolean; signed: number }; dossierOpen: boolean; dossierEntries: number; debtText: string; riteOpen: boolean; riteTitle: string };
    social: SocialMsg[];
    debtTargetId: number;
    /** the Deadletter Office: renovation pieces built, trophies on the wall, the range ghost */
    hub: { renovations: number; trophies: number; ghost: { recording: boolean; playing: boolean; best: number | null; runs: number; last: number; pose: { x: number; z: number } | null }; fileLoaded: boolean } | null;
    life: { crowd: number; sample: { x: number; z: number }[]; tram: number | null; tramNear: boolean; tramDist: number; pa: string[]; steam: boolean; ads: number; adRedraws: number; ship: { x: number; y: number; z: number }; blinkers: number; flicker: boolean };
  };
  /** Ghostfile view: account, Depth/XP/Scrip, loadout legality, ledger. */
  file: () => FileView;
  /** Replace the raw loadout the client will send at the next link (offline: applies now). */
  setLoadout: (raw: Record<string, unknown>) => void;
  toggleFile: (on?: boolean) => void;
  toggleGraph: (on?: boolean) => void;
  /** Buy (or refund) a Ledger Graph node through the ledger shop of the linked host. */
  buy: (nodeId: string, refund?: boolean) => Promise<{ ok: boolean; reason?: string }>;
  /** Sign the post-match receipt (Enter). */
  sign: () => boolean;
  /** Endgame (Stage 11): the board as the file sees it; claim / rewrite / cosmetics; the Audit room; presets. */
  endgame: () => Game["file"]["endgame"] & { wakelight: number; rewrites: number; theme: string | null; cosmetics: string[]; presets: { name: string }[]; aliases: string[]; audits: { week: number; best: number; played: number } | null; mode: string; gravity: number };
  loadEndgame: () => Promise<boolean>;
  claim: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  rewrite: () => Promise<{ ok: boolean; reason?: string }>;
  cosmetic: (body: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>;
  loadPreset: (slot: number) => boolean;
  joinAudit: () => void;
  /** The counter-ledger (Stage 11b): the panel's view, the wallet link, a market buy, wear, the name, reconcile; the skins others wear as the snapshot carries them. */
  counter: () => { view: ReturnType<typeof counterView> | null; wallet: string | null; last: string; info: unknown; tint: string | null; remotes: { id: number; name: string; tag: string; skin: number }[] };
  link: () => Promise<{ ok: boolean; reason?: string }>;
  buySkin: (listing: number) => Promise<{ ok: boolean; reason?: string }>;
  wearSkin: (token: number) => Promise<{ ok: boolean; reason?: string }>;
  registerName: (name: string) => Promise<{ ok: boolean; reason?: string }>;
  reconcile: () => Promise<{ ok: boolean; reason?: string }>;
  /** The opening crawl (Stage 12): its live state, a skip, and the title's click. */
  crawl: () => CrawlView | null;
  crawlSkip: () => boolean;
  crawlFinish: () => void;
  crawlPause: (on: boolean) => void;
  crawlSeek: (t: number) => void;
  /** The menu flow (Stage 13): its view, a key, a choice, the pause menu; settings; the audio cues fired. */
  menu: () => MenuView | null;
  menuKey: (code: string) => void;
  menuChoose: (id: string) => string | null;
  pause: () => void;
  menuPause: (on: boolean) => void;
  settings: () => Settings & { applied: { sensitivity: number; fov: number; crt: { grain: number; scanline: number; vignette: number; aberration: number }; volumes: { master: number; sfx: number; bed: number } } };
  setSetting: (key: keyof Settings, value: number | boolean) => Settings;
  audioCues: () => Record<string, number>;
  /** the probe's damage: drops the local file's health (the low-health pulse) */
  hurt: (dmg: number) => number;
  /** THE RUN (Stage 14): the view as the client has it; the payout to the wallet */
  run: () => Game["runView"];
  payout: () => Promise<{ ok: boolean; reason?: string }>;
  sellSkin: (token: number, price: number) => Promise<{ ok: boolean; reason?: string }>;
  /** Campaign (Stage 10): state, dialogue advance/choose, contracts desk, launch, faction, protocols. */
  campaign: () => ReturnType<Game["campaign"]["view"]>;
  dialogueAdvance: (choice?: number) => boolean;
  contracts: (on?: boolean) => void;
  launch: (id: string) => { ok: boolean; reason?: string };
  pickFaction: (f: "estate" | "clockeaters" | "cells") => Promise<boolean>;
  wear: (ids: string[]) => Promise<string[]>;
  playScript: (id: string) => void;
  /** Equip a moniker (worn online only if earned). */
  setMoniker: (id: string | null) => void;
  events: () => SimEvent[];
  clearEvents: () => void;
  resumeAudio: () => void;
  setDrawing: (on: boolean) => void;
  connect: (cfg: NetConfig) => void;
  reconnect: () => void;
  disconnect: () => void;
  net: () => {
    online: boolean;
    status: string;
    /** true once the first exact local state arrived (team, spawn, weapon state are authoritative). */
    synced: boolean;
    playerId: number;
    token: string;
    rttMs: number;
    joinMs: number;
    pending: number;
    stats: NetClient["stats"];
    game: Game["netStats"];
    remotes: ReturnType<NetClient["remoteViews"]>;
    kickReason: string;
  } | null;
}

declare global {
  interface Window {
    __game: GameHook;
  }
}

const canvas = document.getElementById("view") as HTMLCanvasElement;
const hudRoot = document.getElementById("hud") as HTMLElement;
const game = new Game(canvas, hudRoot);

window.__game = {
  ready: true,
  simHz: SIM_HZ,
  game,
  advance: (n) => game.advance(n),
  setRealtime: (on) => {
    game.realtime = on;
  },
  setBot: (plan) => game.setBot(plan),
  botStatus: () => game.botStatus,
  state: () => ({
    tick: game.world.tick,
    pos: { ...game.player.pos },
    vel: { ...game.player.vel },
    yaw: game.player.yaw,
    pitch: game.player.pitch,
    stance: game.player.stance,
    grounded: game.player.grounded,
    health: game.player.health,
    ammo: game.player.weapon.ammo[game.player.weapon.slot] ?? 0,
    slot: game.player.weapon.slot,
    stats: { ...game.player.stats },
    dummies: game.world.dummies.map((d) => ({ id: d.id, alive: d.alive, health: d.health, pos: { ...d.pos } })),
    loop: { ...game.stats },
    audio: { ...game.audio.fired },
    render: { post: !!game.renderer.post, district: game.renderer.district, frames: game.renderer.frames, internalScale: game.renderer.post.scale, levelCalls: game.renderer.levelCalls, calls: game.renderer.renderer.info.render.calls, triangles: game.renderer.renderer.info.render.triangles },
    level: game.levelId,
    wake: game.world.wake ? { phase: game.world.wake.phase, timeLeft: game.world.wake.timeLeft, score: [...game.world.wake.score], pulses: game.world.wake.pulses, nodes: game.world.wake.nodes.map((n) => ({ id: n.id, label: n.label, owner: n.owner, hold: n.hold, contested: n.contested, puller: n.puller, boost: n.boost, flips: n.flips })) } : null,
    team: game.player.team,
    hash: game.hash(),
    mods: { ...modsFor(game.player) },
    weaponDef: (() => { const d = weaponDefOf(game.player); return { id: d.id, rpm: d.rpm, magSize: d.magSize, damage: d.damage, burst: d.burst ?? null }; })(),
    maxShield: game.player.maxShield,
    maxHealth: game.player.maxHealth,
    identity: game.file.identityView(),
    rituals: (() => {
      const r = game.hud.receiptState;
      const q = (sel: string) => document.querySelector("#hud " + sel) as HTMLElement | null;
      return { receipt: { open: r.open, lines: r.lines.slice(), printed: r.printed, stamped: r.stamped, signed: r.signed }, dossierOpen: !(q(".dossier")?.hidden ?? true), dossierEntries: document.querySelectorAll("#hud .dossier .ent:not(.dim)").length, debtText: q(".debt")?.classList.contains("on") ? (q(".debt")?.textContent ?? "") : "", riteOpen: !(q(".rite")?.hidden ?? true), riteTitle: q(".rite .rt")?.textContent ?? "" };
    })(),
    social: game.socialLog.slice(),
    debtTargetId: game.debtTargetId,
    hub: game.renderer.hub ? { renovations: game.renderer.hub.renovations, trophies: game.renderer.hub.trophyCount, ghost: { recording: game.ghost?.recording ?? false, playing: game.ghost?.playing ?? false, best: game.ghost?.best?.seconds ?? null, runs: game.ghost?.runs ?? 0, last: game.ghost?.lastSeconds ?? 0, pose: (() => { const g = game.ghost?.pose() ?? null; return g ? { x: g.x, z: g.z } : null; })() }, fileLoaded: game.file.loaded } : null,
    life: (() => {
      const L = game.renderer.life;
      const eye = { x: game.player.pos.x, y: game.player.pos.y + 1.6, z: game.player.pos.z };
      return { crowd: L.crowd?.count ?? 0, sample: L.crowd?.sample(8) ?? [], tram: L.tram ? L.tram.position : null, tramNear: !!L.tram?.near, tramDist: L.tram ? L.tram.distanceTo(eye) : Infinity, pa: game.cityLog.slice(), steam: !!L.steam, ads: L.ads?.group.children.length ?? 0, adRedraws: L.ads?.redraws ?? 0, ship: L.sky.shipPos, blinkers: L.sky.blinkers, flicker: !!game.renderer.signFlicker };
    })(),
  }),
  file: () => game.file.view(),
  setLoadout: (raw) => game.file.setRaw(raw),
  toggleFile: (on) => game.file.toggle(on),
  toggleGraph: (on) => game.file.toggleGraph(on),
  buy: (id, refund) => game.file.buy(id, refund),
  sign: () => game.sign(),
  endgame: () => ({ ...game.file.endgame, wakelight: game.file.accountRecord?.wallet.wakelight ?? game.file.wakelight, rewrites: game.file.accountRecord?.rewrites ?? 0, theme: game.file.accountRecord?.theme ?? null, cosmetics: game.file.accountRecord?.cosmetics ?? [], presets: (game.file.accountRecord?.presets ?? []).map((p) => ({ name: p?.name ?? "" })), aliases: game.file.accountRecord?.aliases ?? [], audits: game.file.accountRecord?.audits ?? null, mode: game.net?.mode ?? "", gravity: game.world.gravityMult }),
  loadEndgame: () => game.file.loadEndgame(),
  claim: (id) => game.file.postEndgame("claim", { id }),
  rewrite: () => game.file.postEndgame("rewrite", {}),
  cosmetic: (body) => game.file.postEndgame("cosmetic", body),
  loadPreset: (slot) => game.file.loadPreset(slot),
  joinAudit: () => game.joinAudit(),
  counter: () => ({ view: game.file.counterState, wallet: game.file.counter?.address ?? null, last: game.file.counter?.last ?? "", info: game.file.counter?.info ?? null, tint: game.renderer.skinTint, remotes: (game.net?.remoteViews() ?? []).map((r) => ({ id: r.id, name: r.name ?? "", tag: r.tag ?? "", skin: parseTag(r.tag ?? "", "").skin })) }),
  link: () => game.file.counter?.link() ?? Promise.resolve({ ok: false, reason: "offline" }),
  buySkin: (listing) => game.file.counter?.buy(listing) ?? Promise.resolve({ ok: false, reason: "offline" }),
  wearSkin: (token) => game.file.counter?.op("wear", { token }) ?? Promise.resolve({ ok: false, reason: "offline" }),
  registerName: (name) => game.file.counter?.registerName(name) ?? Promise.resolve({ ok: false, reason: "offline" }),
  reconcile: () => game.file.counter?.op("reconcile") ?? Promise.resolve({ ok: false, reason: "offline" }),
  crawl: () => crawl?.view() ?? null,
  crawlSkip: () => crawl?.skip() ?? false,
  crawlFinish: () => crawl?.finish(true),
  crawlPause: (on) => {
    if (crawl) crawl.paused = on;
  },
  crawlSeek: (t) => crawl?.seek(t),
  menu: () => menu?.view() ?? null,
  menuKey: (code) => menu?.key(code),
  menuChoose: (id) => menu?.choose(id) ?? null,
  pause: () => menu?.pause(),
  menuPause: (on) => {
    if (menu) menu.paused = on;
  },
  settings: () => ({ ...game.settings, applied: { sensitivity: game.input.sensitivity, fov: game.renderer.fov, crt: game.renderer.crtLevel(), volumes: game.audio.getVolumes() } }),
  setSetting: (key, value) => {
    const s = clampSettings({ ...game.settings, [key]: value });
    saveSettings(s);
    game.applySettings(s);
    return s;
  },
  audioCues: () => ({ ...game.audio.fired }),
  run: () => game.runView,
  payout: () => game.file.counter?.op("payout") ?? Promise.resolve({ ok: false, reason: "offline" }),
  sellSkin: (token, price) => game.file.counter?.sell(token, price) ?? Promise.resolve({ ok: false, reason: "offline" }),
  hurt: (dmg) => {
    game.player.health = Math.max(1, game.player.health - dmg);
    return game.player.health;
  },
  campaign: () => game.campaign.view(),
  dialogueAdvance: (choice) => game.campaign.advance(choice ?? -1),
  contracts: (on) => game.campaign.toggleContracts(on),
  launch: (id) => game.campaign.launch(id),
  pickFaction: (f) => game.campaign.chooseFaction(f),
  wear: (ids) => game.campaign.wear(ids),
  playScript: (id) => game.campaign.playScript(id, () => {}),
  setMoniker: (id) => game.file.setMoniker(id),
  events: () => game.recentEvents.slice(),
  clearEvents: () => {
    game.recentEvents.length = 0;
  },
  resumeAudio: () => game.audio.resume(),
  setDrawing: (on) => {
    game.drawing = on;
  },
  connect: (cfg) => game.connect(cfg),
  reconnect: () => game.reconnect(),
  disconnect: () => game.net?.close(),
  net: () =>
    game.net
      ? {
          online: true,
          status: game.net.status,
          synced: game.synced,
          playerId: game.net.playerId,
          token: game.net.token,
          rttMs: game.net.rttMs,
          joinMs: game.net.stats.joinedAtMs ? game.net.stats.joinedAtMs - game.net.stats.connectStartMs : -1,
          pending: game.net.pendingInputs.length,
          stats: { ...game.net.stats },
          game: { ...game.netStats },
          remotes: game.net.remoteViews(),
          kickReason: game.net.kickReason,
        }
      : null,
};

// URL-driven connect: ?net=ws://host/room/name&name=ALPHA&lat=75&jitter=8&loss=0.05
{
  const q = new URLSearchParams(location.search);
  const url = q.get("net");
  if (url) {
    const lat = Number(q.get("lat") ?? 0);
    const loss = Number(q.get("loss") ?? 0);
    const jitter = Number(q.get("jitter") ?? 0);
    const seed = Number(q.get("seed") ?? 1);
    game.connect({ url, name: q.get("name") ?? "BLANK", token: q.get("token") ?? undefined, sim: lat || loss || jitter ? { latencyMs: lat, jitterMs: jitter, loss, seed } : undefined });
  }
}

/** The opening crawl plays over the booting game; headless probes skip it unless they ask for it. */
const bootQ = new URLSearchParams(location.search);
const crawl = crawlWanted(bootQ) ? new OpeningCrawl(game.audio, Number(bootQ.get("crawlspeed") ?? 1) || 1) : null;
/** The CRT menu flow: title cards then the menu after the crawl (or straight away); ESC in play is the pause menu. */
const menu = menuWanted(bootQ)
  ? new Menu(
      {
        audio: game.audio,
        settings: game.settings,
        applySettings: (s) => game.applySettings(s),
        openFile: () => game.file.toggle(true),
        resume: () => (document.getElementById("view") as HTMLCanvasElement | null)?.requestPointerLock?.(),
        identityLine: () => {
          const v = game.file.identityView();
          return `${v.display} · DEPTH ${String(game.file.depth).padStart(2, "0")} · ${game.file.account}`;
        },
      },
      Number(bootQ.get("menuspeed") ?? 1) || 1,
    )
  : null;
if (menu) {
  if (crawl) crawl.onFinish = () => menu.start();
  else menu.start();
  game.onLockLost = () => {
    if (menu.screen === "hidden" && !game.file.isOpen && !crawl?.active) menu.pause();
  };
}
game.start();
