/**
 * Interest management for the city (Stage 706).
 *
 * A city room used to tell every client about every file and every machine in the district, thirty
 * times a second. The cost of a client's snapshots grew with the room: measured at the city's cap
 * (24 files spread over LEASE ROW, every one moving), 17.9 KB/s per client, 21.3 with everyone
 * firing, against the 12 KB/s budget `probe:net` holds a match to. The cap is what the city was built
 * to hold, so the room was over budget exactly when it worked. (`tests/interest.test.ts` measures it.)
 *
 * Now a city room tells each client about what is near it:
 *
 *  - **itself, always** (the local block is not filtered at all);
 *  - **other files within `enter` metres**, kept until they pass `leave`. The ten metres between is
 *    the hysteresis: a file standing on the line does not blink in and out of view every snapshot;
 *  - **no more than `maxPlayers` of them**, nearest first. A radius bounds what a client is told by
 *    how crowded the street is; this bounds it outright, so a crowd of 24 in one street costs each of
 *    them about what a full match does. A file already in view competes as if `leave - enter`
 *    nearer, the same hysteresis in the other direction, so the cut does not flicker either;
 *  - **machines (wasps, mechs, dummies), charges and smoke within the same radius**;
 *  - **anything hunting, hurting or hit by this client, wherever it is**: a wasp or mech whose
 *    target it is, the charge it threw, and for `stickyTicks` anything that hurt it or that it hit.
 *    A client is never shot by something it was not told about;
 *  - **a public event's machines** (the convoy, a hold's wave) from `eventEnter`, and from anywhere
 *    to a file on the event's list of who took part;
 *  - **gunfire** from files in view and from machines within `hearing` (the range a client can hear
 *    a shot at, `client/gunfire.ts` GUN_RANGE); **blasts** within `hearing`; and anything this client
 *    fired or was hit by. A file out of view is not heard firing: its body is not there to have fired;
 *  - **the kill feed, deaths, joins and leaves, always**. Who is in the room is not a position: the
 *    city sends the whole roster, names and all, as its own message (`Msg.CityRoster`), so the HUD's
 *    file count and anything that lists names still sees everyone.
 *
 * What a client is not told about simply is not in its snapshot. The client already treats a file
 * missing from a snapshot as gone (`client/net/netclient.ts` drops its samples, the renderer drops
 * its body), so there is no frozen ghost; and a file coming back into view starts a fresh sample
 * list, so it appears where it is rather than sliding in from where it was last seen.
 *
 * None of this touches the world. Hitscan, lag compensation and damage are the room's, against every
 * body in the district, whatever any snapshot said (`server/room.ts` rewinds `world.poses()`).
 *
 * Only a room that asks for it (`RoomOptions.interest`, set by `server/city-room.ts`) filters at all.
 * A match, an Audit, THE RUN and a contract send exactly the bytes they always did.
 */
import { SIM_HZ } from "../sim/constants";
import type { SimEvent, ShotHit } from "../sim/world";
import { ENT_MECH, ENT_WASP, FX, type NetEvent } from "./protocol";

export const INTEREST = {
  /**
   * A file comes into view at 72 m. LEASE ROW is 174 m across, so from the middle of the district
   * almost all of it is in view and from a corner about half is. The haze is half at 128 m, so a
   * body appearing at 72 m is not yet a clear figure; a player's other senses reach further, and are
   * served further (`hearing`). It is well past the range anything in the city fights at: a wasp
   * sees 18 m and fires from 25, a mech's light reaches 30, and every weapon but the Longwave is at
   * its floor damage by 75 m. A Longwave aimed further still hits: the room resolves it against the
   * world, and a body it hits is then held in view (`stickyTicks`).
   */
  enter: 72,
  /** and leaves only past 82 m: ten metres of hysteresis, about a second and a half at a sprint */
  leave: 82,
  /**
   * The most other files one client is told about: one more than a full match shows (seven others).
   * All 24 files crowded into one street, every one moving and firing, cost each client 9.6 KB/s at
   * 8 and 10.7 at 10, against 20.9 unfiltered — and eight files in that street unfiltered, a full
   * match's worth, cost 11.0. So a city crowd costs a client no more than a full match does, with
   * room under the 12 KB/s budget for what a real round adds. `tests/interest.test.ts` measures it.
   */
  maxPlayers: 8,
  /** a public event's own machines are seen from further: it is where the district is being told to go */
  eventEnter: 120,
  eventLeave: 130,
  /** gunfire and blasts are sent within the range a shot is heard at (client/gunfire.ts GUN_RANGE) */
  hearing: 120,
  /** a body that hurt this client, or that it hit, stays in view this long afterwards, wherever it is */
  stickyTicks: 3 * SIM_HZ,
} as const;

/** body keys: an entity's own (kind << 16 | id, as the snapshot's delta baseline indexes it), and two more kinds */
export const BODY_PLAYER = 0;
export const BODY_DUMMY = 7;
export const bodyKey = (kind: number, id: number): number => kind * 65536 + (id & 0xffff);

/** One body a client might be told about. */
export interface InterestBody {
  key: number;
  x: number;
  z: number;
  /** in view whatever the distance (it hunts this client; it is this client's charge; this client took part in its event) */
  always?: boolean;
  /** a public event's machine: seen from `eventEnter` rather than `enter` */
  wide?: boolean;
  /** a file, counted against `maxPlayers` */
  player?: boolean;
}

/**
 * What one client is told about, and what it was told about last time (the hysteresis needs both).
 * One per client, kept by the room for as long as the client is.
 */
export class InterestSet {
  private view = new Set<number>();
  private sticky = new Map<number, number>();

  /** keep `key` in view until `untilTick`, wherever it goes (it hurt this client, or this client hit it) */
  hold(key: number, untilTick: number): void {
    if ((this.sticky.get(key) ?? -1) < untilTick) this.sticky.set(key, untilTick);
  }

  /** whether `key` was in view at the last selection */
  has(key: number): boolean {
    return this.view.has(key);
  }

  /** everything in view at the last selection */
  get keys(): ReadonlySet<number> {
    return this.view;
  }

  /**
   * Decide what this client is told about this snapshot, from where it stands (`at`), and remember it.
   * Bodies not offered at all (a charge that went off, a file that left) simply fall out of view.
   */
  select(at: { x: number; z: number }, bodies: Iterable<InterestBody>, tick: number): ReadonlySet<number> {
    const next = new Set<number>();
    const files: { key: number; rank: number; forced: boolean }[] = [];
    for (const b of bodies) {
      const until = this.sticky.get(b.key);
      const stuck = until !== undefined && until >= tick;
      if (until !== undefined && !stuck) this.sticky.delete(b.key);
      const was = this.view.has(b.key);
      const d = Math.hypot(b.x - at.x, b.z - at.z);
      const reach = b.wide ? (was ? INTEREST.eventLeave : INTEREST.eventEnter) : was ? INTEREST.leave : INTEREST.enter;
      const forced = !!b.always || stuck;
      if (!forced && d > reach) continue;
      if (b.player) {
        // A held file must stay visible; a seen file ranks as if `leave - enter` nearer. The
        // resulting rank can also be negative, so it is not a substitute for the forced flag.
        files.push({ key: b.key, rank: forced ? -1 : was ? d - (INTEREST.leave - INTEREST.enter) : d, forced });
        continue;
      }
      next.add(b.key);
    }
    files.sort((a, b) => a.rank - b.rank || a.key - b.key);
    for (let i = 0; i < files.length && i < INTEREST.maxPlayers; i++) next.add(files[i]!.key);
    // a file forced into view past the cap (it hunts you: never in a PvE city, but a rule has no exceptions)
    for (const f of files) if (f.forced) next.add(f.key);
    for (const k of this.sticky.keys()) if ((this.sticky.get(k) ?? -1) < tick) this.sticky.delete(k);
    this.view = next;
    return next;
  }
}

/** A sim attacker id as a body key: a player's own id, a wasp's −(100 + id), a mech's −(200 + id) (shared/sim/world.ts). */
export function attackerKey(by: number): number | null {
  if (by > 0) return bodyKey(BODY_PLAYER, by);
  if (by <= -200) return bodyKey(ENT_MECH, -by - 200);
  if (by <= -100) return bodyKey(ENT_WASP, -by - 100);
  return null;
}

const hitKey = (h: ShotHit): number | null =>
  h.kind === "player" ? bodyKey(BODY_PLAYER, h.id) : h.kind === "wasp" ? bodyKey(ENT_WASP, h.id) : h.kind === "mech" ? bodyKey(ENT_MECH, h.id) : h.kind === "dummy" ? bodyKey(BODY_DUMMY, h.id) : null;

/**
 * Who should keep whom in view after one sim event: the victim its attacker, the shooter what it hit.
 * `viewer` is a player id; the room holds `key` in that player's set for `INTEREST.stickyTicks`.
 */
export function stickyFrom(ev: SimEvent): { viewer: number; key: number }[] {
  const out: { viewer: number; key: number }[] = [];
  const add = (viewer: number, key: number | null) => {
    if (viewer > 0 && key !== null && key !== bodyKey(BODY_PLAYER, viewer)) out.push({ viewer, key });
  };
  switch (ev.type) {
    case "hurt":
      add(ev.playerId, attackerKey(ev.by));
      if (ev.by > 0) add(ev.by, bodyKey(BODY_PLAYER, ev.playerId));
      break;
    case "shot":
    case "melee":
      for (const h of ev.hits) {
        add(ev.playerId, hitKey(h));
        if (h.kind === "player") add(h.id, attackerKey(ev.playerId));
      }
      break;
    case "kill":
      add(ev.playerId, hitKey({ kind: ev.victimKind, id: ev.victimId, damage: 0 }));
      break;
    case "mechBeam":
    case "flagged":
      add(ev.playerId, bodyKey(ENT_MECH, ev.mechId));
      break;
    case "stun":
      add(ev.playerId, attackerKey(ev.by));
      break;
  }
  return out;
}

/** effects whose position is where they happened (and so are heard from there) */
const PLACED_FX: ReadonlySet<number> = new Set([FX.explode, FX.cloud, FX.emp, FX.mechBeam]);
/** effects a client only ever acts on when they are its own (client/game.ts onNetEvent) */
const OWN_FX: ReadonlySet<number> = new Set([FX.hurt, FX.flagged, FX.stun]);
/** effects about another file's hands: heard only from a file in view */
const FILE_FX: ReadonlySet<number> = new Set([FX.swap, FX.melee, FX.throw, FX.chargeFull, FX.lunge]);

/**
 * Whether one wire event goes to a client in a city room. `me` is its player id, `at` where it
 * stands, `inView` the keys it was just told about. Kills, deaths, joins, leaves and the district's
 * own announcements (a wasp downed, a node, a phase) always go: they are the feed, not a position.
 */
export function eventInterest(ev: NetEvent, me: number, at: { x: number; z: number }, inView: ReadonlySet<number>, machineShot = false): boolean {
  const near = (x: number, z: number) => Math.hypot(x - at.x, z - at.z) <= INTEREST.hearing;
  // Machine shots and real players share wire ids 200–255. The room preserves the sim's shooter
  // kind separately: neither the numeric id nor a matching visible file can identify a machine.
  const fileInView = (id: number) => inView.has(bodyKey(BODY_PLAYER, id));
  switch (ev.type) {
    case "shot":
      if (ev.hitKind === 3 && ev.victimId === me) return true;
      if (machineShot) return near(ev.fx, ev.fz) || near(ev.tx, ev.tz);
      // A file out of view is not heard firing: its body is not there to have fired it.
      return ev.playerId === me || fileInView(ev.playerId);
    case "fx":
      if (ev.playerId === me) return true;
      if (PLACED_FX.has(ev.kind)) return near(ev.x, ev.z);
      if (OWN_FX.has(ev.kind)) return false;
      if (FILE_FX.has(ev.kind)) return fileInView(ev.playerId);
      return true;
    default:
      return true;
  }
}
