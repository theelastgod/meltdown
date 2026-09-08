/**
 * Wire protocol. Binary, little-endian, versioned. Shared verbatim by the
 * browser client, the Node host, and the Cloudflare Durable Object host.
 */
import type { InputFrame } from "../sim/input";
import type { HitZone } from "../sim/world";

export const PROTOCOL_VERSION = 9;
/** Server snapshot cadence in sim ticks (60 Hz sim → 30 Hz snapshots). */
export const SNAPSHOT_EVERY = 2;
/** Lag compensation rewind cap in ticks (200 ms at 60 Hz). */
/**
 * How far back lag compensation will reconstruct the world, in ticks (Stage 34).
 *
 * Twenty, not twelve. A shot's rewind demand is arithmetic and not a player's choice — half the
 * round trip for the input to reach the server, plus the `INTERP_DELAY_TICKS` the client was already
 * rendering behind live — so at the 150 ms link this game claims to support it is 10.5 ticks. At a
 * ceiling of 12 that left 25 ms of headroom, less than one dropped frame at 30 fps, and past the
 * ceiling a shot is not compensated at all: it resolves against a world newer than the one the
 * shooter saw, and silently misses. Measured with nothing else wrong: 89% hit registration with two
 * shots clamped, 4% with all sixty-nine clamped.
 *
 * Twenty covers the supported link about twice over (333 ms). The cost is the other side of every
 * lag-compensation budget — how long after breaking line of sight a lagging shooter can still kill
 * you — and it is paid deliberately. A game whose PvP pays $CAPITAL cannot have players on an
 * ordinary transcontinental connection quietly missing shots they aimed correctly. 333 ms is
 * generous but ordinary for the genre, and far short of what a deliberate lag switch wants.
 */
export const MAX_REWIND_TICKS = 20;
/** Inputs re-sent per packet for loss tolerance. */
export const INPUT_REDUNDANCY = 3;
/** Max inputs a client may have queued server-side before extras are dropped. */
export const MAX_INPUT_QUEUE = 24;

export const Msg = {
  Join: 1,
  Input: 2,
  Ping: 3,
  Welcome: 10,
  Snapshot: 11,
  Pong: 12,
  Kick: 13,
  /** Ghostfile snapshot / ledger entry (JSON payload; sent on join and at results). */
  File: 14,
  /** Identity & rituals (JSON payload): the pre-match dossier, Debts, Chapter rites. Carries nothing mechanical. */
  Social: 15,
  /** Campaign co-op: mission state / events from the room (JSON). */
  Mission: 16,
  /** room → client: THE RUN (Stage 14): carried / banked / banking, the claims and the safe zones */
  Run: 18,
  /** Campaign co-op: a dialogue resolution from the host player (JSON). */
  Choice: 4,
} as const;

/** Co-op mission traffic (the campaign room only; the PvP room never sends this). */
export interface MissionMsg {
  view: unknown;
  events: unknown[];
  /** the player who resolves dialogue (the first to join) */
  hostId: number;
  /** contract completion applied to every file (rewards) */
  settled?: { id: string; ok: boolean; reason?: string }[];
}

/** One file as the dossier shows it: identity only (see shared/identity/identity.ts). */
export interface DossierEntry {
  id: number;
  team: number;
  glyph: number;
  chapter: number;
  moniker: string | null;
  display: string;
  stamps: number;
  debt: boolean;
}

export type SocialMsg =
  | { kind: "dossier"; seconds: number; entries: DossierEntry[] }
  | { kind: "debt"; event: "owed" | "cleared"; id: number; display: string; glyph: number; kills: number; credit: number; capped: boolean }
  | { kind: "rite"; chapter: number; numeral: string; title: string; lines: string[]; named: boolean; display: string };

/** What the server tells a client about its own Ghostfile. */
export interface FileMsg {
  /** "join": your file as admitted (apply the loadout); "settle": a ledger entry after results; "stamp": a first, a rank, a challenge — mid-round. */
  reason: "join" | "settle" | "stamp";
  account: string;
  depth: number;
  xp: number;
  scrip: number;
  wakelight: number;
  salvage: number;
  owned: string[];
  /** Ledger lines from the latest match settlement (empty on join). */
  ledger: string[];
  /** Validated loadout the server applied (what you actually spawned with). */
  loadout: { primary: string; secondary: string; attested: string[]; keystone: string | null; chips?: Record<string, Record<string, string>>; firmware?: Record<string, string> };
  /** weapon mastery: xp, rank, challenges done, counters (Stage 7) */
  mastery?: Record<string, { xp: number; rank: number; done: string[]; counters: Record<string, number> }>;
  /** un-redacted stamp ids, and the ones this message un-redacts */
  stamps?: string[];
  newStamps?: string[];
  /** ranks gained and challenges completed since the last message: `weapon:r12`, `lease_breaker:r5` */
  ranks?: string[];
  challenges?: string[];
  /** the file's own identity (Stage 8): glyph seed, Chapter, moniker worn + earned, display name, the Debt owed */
  identity?: { glyph: number; chapter: number; moniker: string | null; display: string; unlocked: string[]; debt: { display: string; glyph: number; kills: number } | null; chapters: number[] };
}

export interface NetInput extends InputFrame {
  /** Monotonic client sequence. */
  seq: number;
  /** Server tick of the remote states the client was rendering (for lag comp). */
  viewTick: number;
  /**
   * How far past `viewTick` the client had actually interpolated, in 1/256ths of a tick (Stage 34).
   *
   * The client draws remotes at a *continuous* view time and aims at what it drew, but `viewTick` is
   * that time floored — so without this the server rewinds to a snapshot up to one whole tick before
   * the position the shooter was looking at. At a strafe that is more than a body's width.
   */
  viewFrac: number;
  /** Client's predicted feet position after applying this input (trace comparison). */
  px: number;
  py: number;
  pz: number;
}

export interface RemotePlayerQ {
  id: number;
  slot: number;
  team: number;
  shield: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  health: number;
  ammo: number;
  alive: boolean;
  grounded: boolean;
  stance: number; // 0 stand 1 crouch 2 slide 3 mantle
  height: number;
  name: string;
  /** identity tag `glyph.chapter.moniker.debt` (shared/identity/identity.ts); "" for a guest */
  tag: string;
}

export interface LocalAuth {
  seq: number; // last processed input seq
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number;
  stance: number; height: number; grounded: number; airTime: number; jumpBuffer: number;
  slideTime: number; slideCooldown: number; sdx: number; sdz: number;
  mfx: number; mfy: number; mfz: number; mtx: number; mty: number; mtz: number; mantleT: number;
  health: number; alive: number; respawnTimer: number; prevButtons: number;
  kills: number; deaths: number; shots: number; hits: number;
  team: number;
  shield: number; sinceDamage: number;
  // weapon state (exact)
  slot: number; ammo: number[]; reloadTimer: number; reloadTotal: number; reloadSeated: number; fireCooldown: number;
  charge: number; charging: number; shotIndex: number; magSeed: number; magCount: number; altActive: number; altCooldown: number;
  lungeT: number; lungeHit: number; grenades: number[]; grenadeSel: number; grenadeCooldown: number; swapTimer: number;
  kickPitch: number; kickYaw: number; patX: number; patY: number; stunTimer: number; empTimer: number; sinceShot: number;
  burstLeft: number; burstTimer: number;
}

/** Generic server-driven entity record: projectiles, clouds, wasps, mechs. */
export interface NetEntity {
  kind: 1 | 2 | 3 | 4 | 5;
  id: number;
  x: number;
  y: number;
  z: number;
  a: number;
  b: number;
  c: number;
  d: number;
}
export const ENT_PROJECTILE = 1, ENT_CLOUD = 2, ENT_WASP = 3, ENT_MECH = 4, ENT_NODE = 5;

/** Match header carried in every snapshot. */
export interface MatchQ {
  phase: number; // 0 warmup, 1 wake, 2 results
  timeLeft: number;
  score1: number;
  score2: number;
  winner: number;
  round: number;
}

export interface DummyQ {
  id: number;
  alive: boolean;
  health: number;
  x: number;
  y: number;
  z: number;
}

export type NetEvent =
  | { type: "shot"; playerId: number; weapon: number; fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; hitKind: number; zone?: HitZone; victimId: number; pierce: number }
  | { type: "kill"; playerId: number; victimKind: number; victimId: number; ttkTicks: number; weapon: number }
  | { type: "death"; playerId: number; killerId: number }
  | { type: "join"; playerId: number; name: string }
  | { type: "leave"; playerId: number }
  /** Generic effect: kind (FX_*), player, position, two small args. */
  | { type: "fx"; kind: number; playerId: number; x: number; y: number; z: number; a: number; b: number };

export const FX = { explode: 1, cloud: 2, emp: 3, flagged: 4, stun: 5, swap: 6, melee: 7, mechBeam: 8, hurt: 9, waspDeath: 10, mechDeath: 11, throw: 12, chargeFull: 13, lunge: 14, nodeFlip: 15, nodeContest: 16, kernelPulse: 17, phase: 18, fullWake: 19 } as const;
/** weapon numbering on the wire: 0 wasp/none, 1..6 slots, 7 grenade, 8 mech */
export const WEAPON_WIRE: Record<string, number> = { wasp: 0, lease_breaker: 1, repo_hammer: 2, stack_smg: 3, longwave: 4, phage: 5, shock_baton: 6, frag: 7, smoke: 7, emp: 7, grenade: 7, mech: 8, directive: 9, clockeater: 10 };
/** ammo slots carried on the wire: index 0 unused, 1–8 the weapon slots */
export const AMMO_SLOTS = 9;

export interface Snapshot {
  tick: number;
  serverTimeMs: number;
  local: LocalAuth | null;
  players: RemotePlayerQ[];
  dummies: DummyQ[];
  entities: NetEntity[];
  match: MatchQ | null;
  events: NetEvent[];
  bytes: number;
}

// ---------------------------------------------------------------------------
// Writer / reader

class W {
  private buf = new ArrayBuffer(2048);
  private dv = new DataView(this.buf);
  private o = 0;
  private grow(n: number): void {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf));
    this.buf = nb;
    this.dv = new DataView(nb);
  }
  u8(v: number): void { this.grow(1); this.dv.setUint8(this.o, v); this.o += 1; }
  u16(v: number): void { this.grow(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  i16(v: number): void { this.grow(2); this.dv.setInt16(this.o, Math.max(-32768, Math.min(32767, Math.round(v))), true); this.o += 2; }
  u32(v: number): void { this.grow(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  f32(v: number): void { this.grow(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  f64(v: number): void { this.grow(8); this.dv.setFloat64(this.o, v, true); this.o += 8; }
  str(s: string): void {
    const b = new TextEncoder().encode(s);
    this.u16(b.length);
    this.grow(b.length);
    new Uint8Array(this.buf, this.o, b.length).set(b);
    this.o += b.length;
  }
  done(): ArrayBuffer { return this.buf.slice(0, this.o); }
}

class R {
  private dv: DataView;
  private o = 0;
  constructor(buf: ArrayBuffer) { this.dv = new DataView(buf); }
  get remaining(): number { return this.dv.byteLength - this.o; }
  u8(): number { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  u16(): number { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i16(): number { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u32(): number { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32(): number { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  f64(): number { const v = this.dv.getFloat64(this.o, true); this.o += 8; return v; }
  str(): string { const n = this.u16(); const b = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.o, n); this.o += n; return new TextDecoder().decode(b); }
}

const LOCAL_FLOAT_KEYS = ["x", "y", "z", "vx", "vy", "vz", "yaw", "pitch", "height", "airTime", "jumpBuffer", "slideTime", "slideCooldown", "sdx", "sdz", "mfx", "mfy", "mfz", "mtx", "mty", "mtz", "mantleT", "respawnTimer", "reloadTimer", "reloadTotal", "fireCooldown", "charge", "altCooldown", "lungeT", "grenadeCooldown", "swapTimer", "kickPitch", "kickYaw", "patX", "patY", "stunTimer", "empTimer", "sinceShot", "shield", "sinceDamage", "burstLeft", "burstTimer"] as const;
const localFloats = (l: LocalAuth): number[] => LOCAL_FLOAT_KEYS.map((k) => l[k]);

const wrapRad = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const Q_POS = 100; // 1 cm
const Q_VEL = 100;
const Q_ANG = 10000;

// ---------------------------------------------------------------------------
// Client → server

/**
 * Join. `account` is the Ghostfile id the client claims; `loadout` is raw JSON
 * (validated server-side against that file: unknown fields are refused, not stripped).
 */
/**
 * `secret` is the file's own credential (Stage 26). A join that names a file without it plays a
 * guest rather than that file — the id is a name and the secret is the proof, and the id is
 * published on the prize board.
 */
export function encodeJoin(name: string, token: string, account = "", loadout = "", identity = "", secret = ""): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Join);
  w.u8(PROTOCOL_VERSION);
  w.str(name);
  w.str(token);
  w.str(account);
  w.str(loadout);
  w.str(identity);
  w.str(secret);
  return w.done();
}

export function encodeInputs(inputs: NetInput[], ackTick: number): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Input);
  w.u32(ackTick);
  w.u8(inputs.length);
  for (const i of inputs) {
    w.u32(i.seq);
    w.u32(i.tick);
    w.u16(i.buttons);
    w.i16(wrapRad(i.yaw) * Q_ANG);
    w.i16(i.pitch * Q_ANG);
    w.u32(i.viewTick);
    w.u8(Math.max(0, Math.min(255, Math.round(i.viewFrac * 256))));
    w.f64(i.px);
    w.f64(i.py);
    w.f64(i.pz);
  }
  return w.done();
}

export function encodePing(clientTime: number): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Ping);
  w.u32(clientTime);
  return w.done();
}

// ---------------------------------------------------------------------------
// Server → client

/** `mode`: "" for a plain wake, `audit:<playlist>:<week>` for an Audit room, `campaign` for co-op — the client applies the same rules it will be judged by. */
export function encodeWelcome(playerId: number, tick: number, token: string, levelName: string, seed: number, mode = ""): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Welcome);
  w.u8(playerId);
  w.u32(tick);
  w.str(token);
  w.str(levelName);
  w.u32(seed);
  w.str(mode);
  return w.done();
}

export function encodePong(clientTime: number, tick: number): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Pong);
  w.u32(clientTime);
  w.u32(tick);
  return w.done();
}

export function encodeFile(f: FileMsg): ArrayBuffer {
  const w = new W();
  w.u8(Msg.File);
  w.str(JSON.stringify(f));
  return w.done();
}

export function encodeMission(m: MissionMsg): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Mission);
  w.str(JSON.stringify(m));
  return w.done();
}

/** Room → client: the run as this client sees it (JSON, like a Mission). */
export interface RunMsg {
  carried: number;
  banked: number;
  banking: number;
  inSafe: boolean;
  zone: string | null;
  /** $CAPITAL units credited to the file today / the day's cap / units owed to the wallet */
  today: number;
  cap: number;
  owed: number;
  claims: { id: number; x: number; y: number; z: number; value: number; dropped: boolean }[];
  zones: { label: string; x: number; z: number; radius: number }[];
  events: { type: string; value?: number; zone?: string; playerId?: number }[];
}
export function encodeRun(m: RunMsg): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Run);
  w.str(JSON.stringify(m));
  return w.done();
}

/** Client → room: the host resolved a dialogue (script id + the testimony chosen). */
export function encodeChoice(script: string, testimony: Record<string, string>): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Choice);
  w.str(JSON.stringify({ script, testimony }));
  return w.done();
}

export function encodeSocial(m: SocialMsg): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Social);
  w.str(JSON.stringify(m));
  return w.done();
}

export function encodeKick(reason: string): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Kick);
  w.str(reason);
  return w.done();
}

/** Per-remote-player field mask for delta encoding. */
const F_POS = 1, F_VEL = 2, F_VIEW = 4, F_STATE = 8, F_NAME = 16;
/**
 * Entity and dummy delta flags (Stage 34).
 *
 * These two lists used to be written in full on every snapshot, under the comment
 * "full each snapshot; small". Measured at the room cap that assumption cost real budget: a wake
 * node is 15 bytes and its x/y/z do not change for the length of a match, and there are five of them
 * thirty times a second. They carry a mask against the acked baseline now, exactly like players do.
 */
const E_POS = 1, E_STATE = 2;
const D_POS = 1, D_STATE = 2;

export function quantizeRemote(p: RemotePlayerQ): RemotePlayerQ {
  return {
    ...p,
    x: Math.round(p.x * Q_POS) / Q_POS,
    y: Math.round(p.y * Q_POS) / Q_POS,
    z: Math.round(p.z * Q_POS) / Q_POS,
    vx: Math.round(p.vx * Q_VEL) / Q_VEL,
    vy: Math.round(p.vy * Q_VEL) / Q_VEL,
    vz: Math.round(p.vz * Q_VEL) / Q_VEL,
    yaw: Math.round(p.yaw * Q_ANG) / Q_ANG,
    pitch: Math.round(p.pitch * Q_ANG) / Q_ANG,
    height: Math.round(p.height * Q_POS) / Q_POS,
  };
}

/**
 * Encode a snapshot. `baseline` is the last snapshot the receiver acked (or
 * null for a full snapshot): unchanged remote fields are omitted.
 */
export function encodeSnapshot(s: Omit<Snapshot, "bytes">, baseline: Snapshot | null): ArrayBuffer {
  const w = new W();
  w.u8(Msg.Snapshot);
  w.u32(s.tick);
  w.u32(baseline ? baseline.tick : 0);
  w.u32(s.serverTimeMs >>> 0);
  // local authoritative state (exact)
  if (s.local) {
    w.u8(1);
    const l = s.local;
    w.u32(l.seq);
    /*
     * Forty-two f64s is 336 bytes, and at 15 Hz that was 5.0 KB/s — 39% of what a client at the room
     * cap receives, for one block (Stage 34).
     *
     * It is deltaed rather than narrowed. These are the authoritative values the client replays its
     * prediction from, and Stage 31 spent a whole stage earning `0.00e+0 m` of trace error against
     * them; f32 would buy the same bytes and quietly spend that. A mask costs six bytes and every
     * field that *did* change still arrives as the exact double. Most of them are timers sitting at
     * zero.
     */
    const bl = baseline?.local ?? null;
    const cur = localFloats(l);
    const prev = bl ? localFloats(bl) : null;
    const mask = new Uint8Array(6);
    for (let i = 0; i < cur.length; i++) if (!prev || prev[i] !== cur[i]) mask[i >> 3]! |= 1 << (i & 7);
    for (const byte of mask) w.u8(byte);
    for (let i = 0; i < cur.length; i++) if (mask[i >> 3]! & (1 << (i & 7))) w.f64(cur[i]!);
    w.u8(l.stance);
    w.u8(l.grounded);
    w.u8(l.alive);
    w.i16(l.health);
    w.u16(l.prevButtons);
    w.u16(l.kills);
    w.u16(l.deaths);
    w.u32(l.shots);
    w.u32(l.hits);
    w.u8(l.team);
    w.u8(l.slot);
    for (let i = 0; i < AMMO_SLOTS; i++) w.u8(l.ammo[i] ?? 0);
    w.u8(l.reloadSeated);
    w.u8(l.charging);
    w.u16(l.shotIndex);
    w.u32(l.magSeed);
    w.u16(l.magCount);
    w.u8(l.altActive);
    w.u8(l.lungeHit);
    for (let i = 0; i < 3; i++) w.u8(l.grenades[i] ?? 0);
    w.u8(l.grenadeSel);
  } else w.u8(0);
  // remote players (delta vs baseline)
  w.u8(s.players.length);
  for (const p of s.players) {
    const b = baseline?.players.find((x) => x.id === p.id);
    let mask = 0;
    if (!b || b.x !== p.x || b.y !== p.y || b.z !== p.z) mask |= F_POS;
    if (!b || b.vx !== p.vx || b.vy !== p.vy || b.vz !== p.vz) mask |= F_VEL;
    if (!b || b.yaw !== p.yaw || b.pitch !== p.pitch) mask |= F_VIEW;
    if (!b || b.health !== p.health || b.ammo !== p.ammo || b.alive !== p.alive || b.grounded !== p.grounded || b.stance !== p.stance || b.height !== p.height || b.slot !== p.slot || b.team !== p.team || b.shield !== p.shield) mask |= F_STATE;
    if (!b || b.name !== p.name || b.tag !== p.tag) mask |= F_NAME;
    w.u8(p.id);
    w.u8(mask);
    if (mask & F_POS) { w.i16(p.x * Q_POS); w.i16(p.y * Q_POS); w.i16(p.z * Q_POS); }
    if (mask & F_VEL) { w.i16(p.vx * Q_VEL); w.i16(p.vy * Q_VEL); w.i16(p.vz * Q_VEL); }
    if (mask & F_VIEW) { w.i16(p.yaw * Q_ANG); w.i16(p.pitch * Q_ANG); }
    if (mask & F_STATE) { w.i16(p.health); w.u8(p.ammo); w.u8((p.alive ? 1 : 0) | (p.grounded ? 2 : 0) | (p.stance << 2) | (p.slot << 4)); w.i16(p.height * Q_POS); w.u8(p.team); w.u8(p.shield); }
    if (mask & F_NAME) { w.str(p.name); w.str(p.tag); }
  }
  // dummies (delta against the baseline: they stand still until they are shot)
  w.u8(s.dummies.length);
  for (const d of s.dummies) {
    const bd = baseline?.dummies.find((x) => x.id === d.id);
    let mask = 0;
    if (!bd || bd.x !== d.x || bd.y !== d.y || bd.z !== d.z) mask |= D_POS;
    if (!bd || bd.alive !== d.alive || bd.health !== d.health) mask |= D_STATE;
    w.u8(d.id);
    w.u8(mask);
    if (mask & D_POS) { w.i16(d.x * Q_POS); w.i16(d.y * Q_POS); w.i16(d.z * Q_POS); }
    if (mask & D_STATE) { w.u8(d.alive ? 1 : 0); w.i16(d.health); }
  }
  // match header
  if (s.match) {
    w.u8(1);
    w.u8(s.match.phase); w.u16(Math.max(0, Math.round(s.match.timeLeft))); w.u16(Math.min(65535, Math.round(s.match.score1))); w.u16(Math.min(65535, Math.round(s.match.score2))); w.u8(s.match.winner); w.u8(s.match.round);
  } else w.u8(0);
  // entities (delta against the baseline; a wake node's position never moves at all)
  w.u8(Math.min(255, s.entities.length));
  for (const e of s.entities.slice(0, 255)) {
    const be = baseline?.entities.find((x) => x.kind === e.kind && x.id === e.id);
    let mask = 0;
    if (!be || be.x !== e.x || be.y !== e.y || be.z !== e.z) mask |= E_POS;
    if (!be || be.a !== e.a || be.b !== e.b || be.c !== e.c || be.d !== e.d) mask |= E_STATE;
    w.u8(e.kind); w.u16(e.id); w.u8(mask);
    if (mask & E_POS) { w.i16(e.x * Q_POS); w.i16(e.y * Q_POS); w.i16(e.z * Q_POS); }
    if (mask & E_STATE) { w.u8(e.a); w.u8(e.b); w.i16(e.c); w.i16(e.d); }
  }
  // events
  w.u8(Math.min(255, s.events.length));
  for (const e of s.events.slice(0, 255)) {
    switch (e.type) {
      case "shot":
        w.u8(1); w.u8(e.playerId & 0xff); w.u8(e.weapon);
        w.i16(e.fx * Q_POS); w.i16(e.fy * Q_POS); w.i16(e.fz * Q_POS);
        w.i16(e.tx * Q_POS); w.i16(e.ty * Q_POS); w.i16(e.tz * Q_POS);
        w.u8(e.hitKind); w.u8(e.zone === "head" ? 1 : e.zone === "legs" ? 2 : 0); w.u8(e.victimId & 0xff); w.u8(e.pierce);
        break;
      case "kill": w.u8(2); w.u8(e.playerId & 0xff); w.u8(e.victimKind); w.u8(e.victimId & 0xff); w.u16(e.ttkTicks); w.u8(e.weapon); break;
      case "death": w.u8(3); w.u8(e.playerId); w.u8(e.killerId & 0xff); break;
      case "join": w.u8(4); w.u8(e.playerId); w.str(e.name); break;
      case "leave": w.u8(5); w.u8(e.playerId); break;
      case "fx": w.u8(6); w.u8(e.kind); w.u8(e.playerId & 0xff); w.i16(e.x * Q_POS); w.i16(e.y * Q_POS); w.i16(e.z * Q_POS); w.u8(e.a); w.u8(e.b); break;
    }
  }
  return w.done();
}

// ---------------------------------------------------------------------------
// Decoding

export type ClientMessage =
  | { type: "join"; version: number; name: string; token: string; account: string; loadout: string; identity: string; secret: string }
  | { type: "choice"; script: string; testimony: Record<string, string> }
  | { type: "input"; ackTick: number; inputs: NetInput[] }
  | { type: "ping"; clientTime: number };

export function decodeClientMessage(buf: ArrayBuffer): ClientMessage | null {
  try {
    const r = new R(buf);
    const t = r.u8();
    if (t === Msg.Join) {
      const version = r.u8();
      const name = r.str();
      const token = r.str();
      // v4 joins carried no file; tolerate the short form so the version check can answer properly
      const account = r.remaining > 0 ? r.str() : "";
      const loadout = r.remaining > 0 ? r.str() : "";
      const identity = r.remaining > 0 ? r.str() : "";
      // older joins carry no secret; the room treats a file claimed without one as a guest
      const secret = r.remaining > 0 ? r.str() : "";
      return { type: "join", version, name, token, account, loadout, identity, secret };
    }
    if (t === Msg.Choice) {
      const c = JSON.parse(r.str()) as { script?: unknown; testimony?: unknown };
      const testimony: Record<string, string> = {};
      if (c.testimony && typeof c.testimony === "object") for (const [k, v] of Object.entries(c.testimony as Record<string, unknown>)) if (typeof v === "string" && /^[a-z0-9:_]{1,32}$/.test(k) && /^[a-z0-9_]{1,32}$/.test(v)) testimony[k] = v;
      return { type: "choice", script: String(c.script ?? "").slice(0, 48), testimony };
    }
    if (t === Msg.Input) {
      const ackTick = r.u32();
      const n = r.u8();
      if (n > 32) return null;
      const inputs: NetInput[] = [];
      for (let i = 0; i < n; i++) {
        inputs.push({ seq: r.u32(), tick: r.u32(), buttons: r.u16(), yaw: r.i16() / Q_ANG, pitch: r.i16() / Q_ANG, viewTick: r.u32(), viewFrac: r.u8() / 256, px: r.f64(), py: r.f64(), pz: r.f64() });
      }
      if (r.remaining !== 0) return null;
      return { type: "input", ackTick, inputs };
    }
    if (t === Msg.Ping) return { type: "ping", clientTime: r.u32() };
    return null;
  } catch {
    return null;
  }
}

export type ServerMessage =
  | { type: "welcome"; playerId: number; tick: number; token: string; level: string; seed: number; mode: string }
  | { type: "snapshot"; snapshot: Snapshot; baselineTick: number }
  | { type: "pong"; clientTime: number; tick: number }
  | { type: "kick"; reason: string }
  | { type: "file"; file: FileMsg }
  | { type: "social"; social: SocialMsg }
  | { type: "mission"; mission: MissionMsg }
  | { type: "run"; run: RunMsg };

/** Decode a server message. `baselines` resolves the acked snapshot a delta was built on. */
export function decodeServerMessage(buf: ArrayBuffer, baselines: (tick: number) => Snapshot | null): ServerMessage | null {
  try {
    const r = new R(buf);
    const t = r.u8();
    if (t === Msg.Welcome) {
      const playerId = r.u8(), tick = r.u32(), token = r.str(), level = r.str(), seed = r.u32();
      return { type: "welcome", playerId, tick, token, level, seed, mode: r.remaining > 0 ? r.str() : "" };
    }
    if (t === Msg.Pong) return { type: "pong", clientTime: r.u32(), tick: r.u32() };
    if (t === Msg.Kick) return { type: "kick", reason: r.str() };
    if (t === Msg.File) return { type: "file", file: JSON.parse(r.str()) as FileMsg };
    if (t === Msg.Social) return { type: "social", social: JSON.parse(r.str()) as SocialMsg };
    if (t === Msg.Mission) return { type: "mission", mission: JSON.parse(r.str()) as MissionMsg };
    if (t === Msg.Run) return { type: "run", run: JSON.parse(r.str()) as RunMsg };
    if (t !== Msg.Snapshot) return null;
    const tick = r.u32();
    const baselineTick = r.u32();
    const serverTimeMs = r.u32();
    const base = baselineTick ? baselines(baselineTick) : null;
    if (baselineTick && !base) return null; // can't apply this delta; the server will send a full one once it sees our ack
    let local: LocalAuth | null = null;
    if (r.u8() === 1) {
      const seq = r.u32();
      const l: Record<string, number> = { seq };
      const bl = base?.local ?? null;
      const mask = [r.u8(), r.u8(), r.u8(), r.u8(), r.u8(), r.u8()];
      LOCAL_FLOAT_KEYS.forEach((k, i) => {
        if (mask[i >> 3]! & (1 << (i & 7))) l[k] = r.f64();
        else l[k] = bl ? (bl as unknown as Record<string, number>)[k]! : 0;
      });
      l.stance = r.u8(); l.grounded = r.u8(); l.alive = r.u8(); l.health = r.i16(); l.prevButtons = r.u16(); l.kills = r.u16(); l.deaths = r.u16(); l.shots = r.u32(); l.hits = r.u32();
      l.team = r.u8();
      l.slot = r.u8();
      const ammo: number[] = [];
      for (let i = 0; i < AMMO_SLOTS; i++) ammo.push(r.u8());
      l.reloadSeated = r.u8(); l.charging = r.u8(); l.shotIndex = r.u16(); l.magSeed = r.u32(); l.magCount = r.u16(); l.altActive = r.u8(); l.lungeHit = r.u8();
      const grenades: number[] = [];
      for (let i = 0; i < 3; i++) grenades.push(r.u8());
      l.grenadeSel = r.u8();
      local = { ...(l as unknown as LocalAuth), ammo, grenades };
    }
    const n = r.u8();
    const players: RemotePlayerQ[] = [];
    for (let i = 0; i < n; i++) {
      const id = r.u8();
      const mask = r.u8();
      const b = base?.players.find((x) => x.id === id);
      const p: RemotePlayerQ = b ? { ...b } : { id, slot: 1, team: 0, shield: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, health: 100, ammo: 0, alive: true, grounded: true, stance: 0, height: 1.8, name: "BLANK", tag: "" };
      if (mask & F_POS) { p.x = r.i16() / Q_POS; p.y = r.i16() / Q_POS; p.z = r.i16() / Q_POS; }
      if (mask & F_VEL) { p.vx = r.i16() / Q_VEL; p.vy = r.i16() / Q_VEL; p.vz = r.i16() / Q_VEL; }
      if (mask & F_VIEW) { p.yaw = r.i16() / Q_ANG; p.pitch = r.i16() / Q_ANG; }
      if (mask & F_STATE) { p.health = r.i16(); p.ammo = r.u8(); const fl = r.u8(); p.alive = !!(fl & 1); p.grounded = !!(fl & 2); p.stance = (fl >> 2) & 3; p.slot = fl >> 4; p.height = r.i16() / Q_POS; p.team = r.u8(); p.shield = r.u8(); }
      if (mask & F_NAME) { p.name = r.str(); p.tag = r.str(); }
      players.push(p);
    }
    const nd = r.u8();
    const dummies: DummyQ[] = [];
    for (let i = 0; i < nd; i++) {
      const id = r.u8();
      const mask = r.u8();
      const bd = base?.dummies.find((x) => x.id === id);
      const d: DummyQ = bd ? { ...bd } : { id, alive: true, health: 100, x: 0, y: 0, z: 0 };
      d.id = id;
      if (mask & D_POS) { d.x = r.i16() / Q_POS; d.y = r.i16() / Q_POS; d.z = r.i16() / Q_POS; }
      if (mask & D_STATE) { d.alive = r.u8() === 1; d.health = r.i16(); }
      dummies.push(d);
    }
    let match: MatchQ | null = null;
    if (r.u8() === 1) match = { phase: r.u8(), timeLeft: r.u16(), score1: r.u16(), score2: r.u16(), winner: r.u8(), round: r.u8() };
    const nent = r.u8();
    const entities: NetEntity[] = [];
    for (let i = 0; i < nent; i++) {
      const kind = r.u8() as NetEntity["kind"];
      const id = r.u16();
      const mask = r.u8();
      const be = base?.entities.find((x) => x.kind === kind && x.id === id);
      const e: NetEntity = be ? { ...be } : { kind, id, x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, d: 0 };
      if (mask & E_POS) { e.x = r.i16() / Q_POS; e.y = r.i16() / Q_POS; e.z = r.i16() / Q_POS; }
      if (mask & E_STATE) { e.a = r.u8(); e.b = r.u8(); e.c = r.i16(); e.d = r.i16(); }
      entities.push(e);
    }
    const ne = r.u8();
    const events: NetEvent[] = [];
    for (let i = 0; i < ne; i++) {
      const k = r.u8();
      if (k === 1) {
        const playerId = r.u8();
        const weapon = r.u8();
        const fx = r.i16() / Q_POS, fy = r.i16() / Q_POS, fz = r.i16() / Q_POS;
        const tx = r.i16() / Q_POS, ty = r.i16() / Q_POS, tz = r.i16() / Q_POS;
        const hitKind = r.u8();
        const z = r.u8();
        const victimId = r.u8();
        const pierce = r.u8();
        events.push({ type: "shot", playerId, weapon, fx, fy, fz, tx, ty, tz, hitKind, zone: z === 1 ? "head" : z === 2 ? "legs" : "body", victimId, pierce });
      } else if (k === 2) events.push({ type: "kill", playerId: r.u8(), victimKind: r.u8(), victimId: r.u8(), ttkTicks: r.u16(), weapon: r.u8() });
      else if (k === 3) events.push({ type: "death", playerId: r.u8(), killerId: r.u8() });
      else if (k === 4) events.push({ type: "join", playerId: r.u8(), name: r.str() });
      else if (k === 5) events.push({ type: "leave", playerId: r.u8() });
      else if (k === 6) events.push({ type: "fx", kind: r.u8(), playerId: r.u8(), x: r.i16() / Q_POS, y: r.i16() / Q_POS, z: r.i16() / Q_POS, a: r.u8(), b: r.u8() });
      else return null;
    }
    return { type: "snapshot", baselineTick, snapshot: { tick, serverTimeMs, local, players, dummies, entities, match, events, bytes: buf.byteLength } };
  } catch {
    return null;
  }
}

export const stanceToNum = (s: string): number => (s === "stand" ? 0 : s === "crouch" ? 1 : s === "slide" ? 2 : 3);
export const numToStance = (n: number): "stand" | "crouch" | "slide" | "mantle" => (n === 0 ? "stand" : n === 1 ? "crouch" : n === 2 ? "slide" : "mantle");
