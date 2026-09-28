/**
 * The city's presence feed (Stage 705): who is walking which district, right now.
 *
 * The city is five persistent rooms (shared/net/city.ts), one per district, and until now a file saw
 * only its own. This is the small public, read-only report that lets the rest of the client see the
 * whole city: per district, how many files are online, up to PRESENCE_NAMES of their display names,
 * the public event running there (kind, title, time left) and the street-run records (course, time,
 * holder). The WORLD MAP (client/worldmap.ts) draws it; the main menu's PLAY picks the busiest
 * district from it.
 *
 * Privacy: a file id is a bearer credential (Stage 26: it named the file a secret proves). This feed
 * is served to anyone, so it carries DISPLAY NAMES ONLY — the name the city calls a file, as the
 * snapshot already shows it to everyone in the room — never an id, never a secret, never a board key.
 * Three layers keep it that way:
 *   1. the report is built from display names and titles; ids and secrets are passed in only as the
 *      list of strings it must never contain (`districtPresence`);
 *   2. every name goes through `presentName`, which refuses anything shaped like an account id
 *      (`blank:x7k2…`) or a secret, and anything that contains one of the room's own ids or secrets;
 *   3. the finished report is serialised and scanned for every one of those strings; a hit throws
 *      the names away (fail closed), and the aggregate (`aggregatePresence`) re-checks every name
 *      again by shape, so a report from another process is not trusted either.
 *
 * Rate: the feed is a cache (`PresenceCache`, PRESENCE_TTL_MS). However often it is asked, a host
 * builds it at most once per TTL (and one build at a time), so the endpoint cannot be used to make
 * the rooms do work.
 *
 * It imports nothing from the campaign, the economy or the chain, and no PvP room loads it.
 */
import { CITY_DISTRICTS, DEFAULT_CITY } from "../net/city";
import { levelDisplayName } from "../sim/level";
import { CITY_EVENT_KINDS, type CityEventKind } from "./events";

/** how long a built feed is served before it is built again (ms) */
export const PRESENCE_TTL_MS = 2000;
/** at most this many display names per district */
export const PRESENCE_NAMES = 8;
/** how long a page waits for the feed before it carries on without it (ms) */
export const PRESENCE_TIMEOUT_MS = 1500;
/** how long a display name may be (the room's own cap on a handle) */
const NAME_MAX = 16;

export interface PresenceEvent {
  kind: CityEventKind;
  title: string;
  /** seconds left on the event's clock when the feed was built */
  left: number;
}

export interface PresenceRecord {
  /** the course's name, as the city signs it */
  course: string;
  /** seconds */
  time: number;
  /** the holder's display name */
  holder: string;
}

export interface DistrictPresence {
  district: string;
  /** the district's name, as the city signs it */
  name: string;
  /** files online in the district's room */
  players: number;
  /** up to PRESENCE_NAMES of their display names */
  names: string[];
  /** the public event running there, if any */
  event: PresenceEvent | null;
  /** each course's record, where one has been set */
  records: PresenceRecord[];
}

export interface CityPresence {
  /** when the feed was built (the host's clock, ms) */
  at: number;
  /** how long it is good for (ms) */
  ttl: number;
  /** every district of the city, in CITY_DISTRICTS order */
  districts: DistrictPresence[];
}

/**
 * What a city room hands the feed: everything it knows, credentials included — they are here so the
 * feed can prove it never prints them. Nothing in this shape is published as it stands.
 */
export interface PresenceSource {
  district: string;
  seats: readonly { display: string; connected: boolean; account: string | null; secret: string | null }[];
  event: { kind: string; title: string; status: string; left: number } | null;
  records: readonly { course: string; time: number; holder: string; key: string | null }[];
}

/** an account id: a scheme and a body (`blank:x7k2m9qa`, `g:…`), which the client makes and the host keys on */
const ID_SHAPE = /[a-z0-9_.-]+:[a-z0-9_.-]+/i;
/** a file secret (`newFileSecret`: 24 of a 32-symbol alphabet), or anything like one: a long unbroken token */
const SECRET_SHAPE = /[a-z0-9_-]{20,}/i;

/** Whether a string is shaped like a credential: an account id or a secret. */
export const looksLikeCredential = (s: string): boolean => ID_SHAPE.test(s) || SECRET_SHAPE.test(s);

/** the strings a report must never contain: every id and secret it was built beside (short ones cannot be told from words) */
function forbiddenOf(src: PresenceSource): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (s && s.length >= 4) out.add(s.toLowerCase());
  };
  for (const s of src.seats) {
    add(s.account);
    add(s.secret);
  }
  for (const r of src.records) add(r.key);
  return [...out];
}

/**
 * A display name as the feed may print it, or null. Printable ASCII, the room's length cap, and never
 * anything shaped like a credential or containing (or contained in) one of `forbidden`.
 */
export function presentName(raw: unknown, forbidden: readonly string[] = []): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.replace(/[^\x20-\x7e]/g, "").trim().slice(0, NAME_MAX);
  if (!n || looksLikeCredential(n)) return null;
  const low = n.toLowerCase();
  for (const f of forbidden) if (low.includes(f) || (low.length >= 6 && f.includes(low))) return null;
  return n;
}

const cleanTitle = (raw: unknown): string => (typeof raw === "string" ? raw.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 48) : "");
const finite = (n: unknown, lo: number, hi: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
const isKind = (k: unknown): k is CityEventKind => typeof k === "string" && (CITY_EVENT_KINDS as readonly string[]).includes(k);

/** A district nobody is in: no names, no event, no records. */
export const emptyPresence = (district: string): DistrictPresence => ({ district, name: levelDisplayName(district), players: 0, names: [], event: null, records: [] });

/** whether a serialised report contains any of the strings it must not */
const leaks = (d: DistrictPresence, forbidden: readonly string[]): boolean => {
  if (!forbidden.length) return false;
  const s = JSON.stringify(d).toLowerCase();
  return forbidden.some((f) => s.includes(f));
};

/**
 * A district's report, from what its room knows. Players counts the seats with a live link; the names
 * are theirs, in seat order, through `presentName`; the event is there only while it runs; a record
 * holder whose name cannot be printed is BLANK. Then the whole report is scanned for the room's ids
 * and secrets, and a hit empties it of names (fail closed).
 */
export function districtPresence(src: PresenceSource, max = PRESENCE_NAMES): DistrictPresence {
  const forbidden = forbiddenOf(src);
  const online = src.seats.filter((s) => s.connected);
  const names: string[] = [];
  for (const s of online) {
    if (names.length >= max) break;
    const n = presentName(s.display, forbidden);
    if (n) names.push(n);
  }
  const ev = src.event && src.event.status === "running" && isKind(src.event.kind) ? { kind: src.event.kind, title: cleanTitle(src.event.title), left: Math.round(finite(src.event.left, 0, 3600)) } : null;
  const records = src.records.map((r) => ({ course: cleanTitle(r.course), time: finite(r.time, 0, 36_000), holder: presentName(r.holder, forbidden) ?? "BLANK" }));
  const d: DistrictPresence = { district: src.district, name: levelDisplayName(src.district), players: online.length, names, event: ev, records };
  if (!leaks(d, forbidden)) return d;
  const bare: DistrictPresence = { ...d, names: [], event: ev ? { ...ev, title: "" } : null, records: records.map((r) => ({ ...r, holder: "BLANK" })) };
  return leaks(bare, forbidden) ? { ...emptyPresence(src.district), players: online.length } : bare;
}

/** One district's report as another process sent it, checked field by field; null when it is not one. */
export function readDistrict(raw: unknown, max = PRESENCE_NAMES): DistrictPresence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const district = typeof r.district === "string" && CITY_DISTRICTS.includes(r.district) ? r.district : null;
  if (!district) return null;
  const names = Array.isArray(r.names) ? r.names.map((n) => presentName(n)).filter((n): n is string => n !== null).slice(0, max) : [];
  const e = r.event as Record<string, unknown> | null | undefined;
  const event = e && typeof e === "object" && isKind(e.kind) ? { kind: e.kind, title: cleanTitle(e.title), left: Math.round(finite(e.left, 0, 3600)) } : null;
  const records = Array.isArray(r.records)
    ? r.records.flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const o = x as Record<string, unknown>;
        const course = cleanTitle(o.course);
        return course ? [{ course, time: finite(o.time, 0, 36_000), holder: presentName(o.holder) ?? "BLANK" }] : [];
      })
    : [];
  return { district, name: levelDisplayName(district), players: Math.round(finite(r.players, 0, 10_000)), names, event, records };
}

/**
 * The whole city's feed from each district's report (a missing or unreadable one is an empty
 * district). Every report is read again (`readDistrict`), so a report from another process — a
 * Durable Object — is held to the same shape rules as one made here.
 */
export function aggregatePresence(reports: readonly unknown[], now: number, ttl = PRESENCE_TTL_MS): CityPresence {
  const got = new Map<string, DistrictPresence>();
  for (const r of reports) {
    const d = readDistrict(r);
    if (d && !got.has(d.district)) got.set(d.district, d);
  }
  return { at: now, ttl, districts: CITY_DISTRICTS.map((d) => got.get(d) ?? emptyPresence(d)) };
}

/** A feed as a page received it, checked; null when the answer is not one. */
export function parsePresence(raw: unknown): CityPresence | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { districts?: unknown }).districts)) return null;
  const r = raw as { at?: unknown; ttl?: unknown; districts: unknown[] };
  return aggregatePresence(r.districts, finite(r.at, 0, Number.MAX_SAFE_INTEGER), finite(r.ttl, 0, 60_000) || PRESENCE_TTL_MS);
}

/**
 * The feed's cache: built at most once per `ttl`, and never twice at once. `get` for a host that
 * builds in place (the Node host), `getAsync` for one that must ask other objects (the Worker).
 */
export class PresenceCache<T> {
  private value: T | null = null;
  private at = -Infinity;
  private pending: Promise<T> | null = null;
  /** how many times the feed has actually been built */
  builds = 0;

  constructor(readonly ttl = PRESENCE_TTL_MS) {}

  fresh(now: number): boolean {
    return this.value !== null && now - this.at < this.ttl && now >= this.at;
  }

  get(now: number, build: () => T): T {
    if (this.fresh(now)) return this.value!;
    this.builds++;
    this.value = build();
    this.at = now;
    return this.value;
  }

  getAsync(now: number, build: () => Promise<T>): Promise<T> {
    if (this.fresh(now)) return Promise.resolve(this.value!);
    if (this.pending) return this.pending;
    this.builds++;
    const p = build().then(
      (v) => {
        this.value = v;
        this.at = now;
        this.pending = null;
        return v;
      },
      (err: unknown) => {
        this.pending = null;
        throw err;
      },
    );
    this.pending = p;
    return p;
  }
}

/** The district with the most files online (ties to the first in CITY_DISTRICTS), or null when nobody is. */
export function busiestDistrict(p: CityPresence | null | undefined): { district: string; name: string; players: number } | null {
  let best: DistrictPresence | null = null;
  for (const d of p?.districts ?? []) {
    if (!CITY_DISTRICTS.includes(d.district) || !(d.players > 0)) continue;
    if (!best || d.players > best.players) best = d;
  }
  return best ? { district: best.district, name: best.name, players: best.players } : null;
}

/**
 * Where PLAY goes: the busiest district when anyone is online, LEASE ROW when nobody is or the feed
 * could not be read. `online` is how many are in the district it chose.
 */
export function playDistrict(p: CityPresence | null | undefined): { district: string; online: number } {
  const b = busiestDistrict(p);
  return b ? { district: b.district, online: b.players } : { district: DEFAULT_CITY, online: 0 };
}

/** The feed's address on the campaign host a city socket base names (`ws://h` → `http://h/city`). */
export function cityPresenceUrl(wsBase: string): string {
  return `${wsBase.replace(/\/$/, "").replace(/^ws(s?):/, "http$1:")}/city`;
}

/**
 * Read the feed, never waiting longer than `timeoutMs` and never throwing: null when the host is
 * unreachable, slow, or answers with something that is not a feed. A page carries on without it.
 */
export async function fetchPresence(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = PRESENCE_TIMEOUT_MS): Promise<CityPresence | null> {
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctl?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const read = (async () => {
    try {
      const r = await fetchImpl(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) return null;
      return parsePresence(await r.json());
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([read, late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
