/**
 * The city's presence feed (Stage 705): per district, who is online, the running event and the
 * course records — public, read-only, cached, and made of display names only.
 *
 * A file id is a bearer credential (Stage 26) and a secret is the proof behind it; neither may ever
 * reach this payload. These drive the real city room with real files joined by id and secret, then
 * scan everything the feed would publish for anything shaped like either.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCityRoom } from "../server/city-room";
import { MemoryAccountStore } from "../server/accounts";
import campaignWorker, { CampaignRoom, cityPresenceFeed } from "../server/campaign-worker";
import { createAccount, newFileSecret, type Account } from "../shared/progression/account";
import { decodeServerMessage, encodeJoin } from "../shared/net/protocol";
import type { Conn } from "../server/room";
import { CITY_DISTRICTS, DEFAULT_CITY } from "../shared/net/city";
import {
  aggregatePresence,
  busiestDistrict,
  cityPresenceUrl,
  districtPresence,
  emptyPresence,
  fetchPresence,
  looksLikeCredential,
  parsePresence,
  playDistrict,
  presentName,
  PresenceCache,
  PRESENCE_NAMES,
  PRESENCE_TTL_MS,
  readDistrict,
  type CityPresence,
  type PresenceSource,
} from "../shared/city/presence";

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function conn() {
  const c: Conn = { send: (buf) => void decodeServerMessage(buf, () => null), close: () => {} };
  return c;
}

/** A city with named files in it: each joined by its id and its secret, as a real client joins. */
function cityWith(district: string, files: { id: string; name: string; handle?: string }[]) {
  const store = new MemoryAccountStore(createAccount);
  const h = createCityRoom({ district, accounts: store, seed: 7 });
  const creds: string[] = [];
  const conns: Conn[] = [];
  for (const f of files) {
    const a = store.load(f.id, f.name) as Account;
    // Chapter III: the city calls a file by its registered name
    a.depth = 60;
    a.name = f.name;
    a.secret = newFileSecret();
    creds.push(a.id, a.secret);
    const c = conn();
    h.room.onOpen(c);
    h.room.onMessage(c, encodeJoin(f.handle ?? f.name, "", f.id, LOADOUT, "", a.secret));
    conns.push(c);
  }
  h.room.step();
  return { h, store, creds, conns };
}

/** Everything in a payload that looks like a credential: an account id (`scheme:body`) or a secret-length token. */
function credentialShapes(payload: unknown): string[] {
  const s = JSON.stringify(payload);
  return [...(s.match(/[a-z0-9_.-]+:[a-z0-9_.-]+/gi) ?? []), ...(s.match(/[a-z0-9_-]{20,}/gi) ?? [])].filter((m) => !/^"?(district|name|players|names|event|records|course|time|holder|kind|title|left|at|ttl|districts)"?$/.test(m));
}

/** The payload scan: none of the given ids or secrets appear anywhere, in any case, and nothing shaped like one does. */
function expectNoCredentials(payload: unknown, creds: readonly string[]): void {
  const s = JSON.stringify(payload).toLowerCase();
  for (const c of creds) expect(s.includes(c.toLowerCase()), `the feed published ${c}`).toBe(false);
  // keys in JSON are "k":v, so a colon between a quoted key and a value is not a credential: scan values only
  const values: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") values.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(payload);
  for (const v of values) expect(looksLikeCredential(v), `a value shaped like a credential: ${v}`).toBe(false);
}

describe("a district's line of the feed", () => {
  it("counts the files online and names them by the name the city calls them", () => {
    const { h, creds } = cityWith("night_market", [
      { id: "blank:alpha001", name: "ALPHA" },
      { id: "blank:bravo002", name: "BRAVO" },
    ]);
    const p = h.presence();
    expect(p).toMatchObject({ district: "night_market", name: "NIGHT MARKET", players: 2, names: ["ALPHA", "BRAVO"], event: null, records: [] });
    expectNoCredentials(p, creds);
  });

  it("names at most PRESENCE_NAMES; the count is everyone", () => {
    const files = Array.from({ length: PRESENCE_NAMES + 3 }, (_, i) => ({ id: `blank:file${String(i).padStart(4, "0")}`, name: `RUNNER${i}` }));
    const { h, creds } = cityWith("lease_row", files);
    const p = h.presence();
    expect(p.players).toBe(PRESENCE_NAMES + 3);
    expect(p.names).toHaveLength(PRESENCE_NAMES);
    expectNoCredentials(p, creds);
  });

  it("a dropped link is not online (its seat is held for the rejoin, but nobody is on the street)", () => {
    const { h, conns } = cityWith("lease_row", [
      { id: "blank:alpha001", name: "ALPHA" },
      { id: "blank:bravo002", name: "BRAVO" },
    ]);
    h.room.onClose(conns[1]!);
    expect(h.presence()).toMatchObject({ players: 1, names: ["ALPHA"] });
  });

  it("the running event, by kind, title and time left; nothing once it is over", () => {
    const { h } = cityWith("lease_row", [{ id: "blank:alpha001", name: "ALPHA" }]);
    h.startEvent("hold");
    h.room.step();
    h.room.step();
    const p = h.presence();
    expect(p.event).not.toBeNull();
    expect(p.event!.kind).toBe("hold");
    expect(p.event!.title.length).toBeGreaterThan(0);
    expect(p.event!.left).toBeGreaterThan(0);
    // exactly those three fields: no site, no participants, no ids
    expect(Object.keys(p.event!).sort()).toEqual(["kind", "left", "title"]);
  });

  it("each course's record: its name, the time and the holder's display name — never the board's key", () => {
    const { h, creds } = cityWith("lease_row", [{ id: "blank:alpha001", name: "ALPHA" }]);
    const [c0, c1] = h.runs.courses;
    h.board.post(c0!.id, { key: "blank:alpha001", name: "ALPHA", ticks: 1860, splits: [600], at: 1 });
    // a board entry whose name is somebody's id: printed as BLANK
    h.board.post(c1!.id, { key: "blank:zulu0009", name: "blank:zulu0009", ticks: 2400, splits: [], at: 2 });
    const p = h.presence();
    expect(p.records).toEqual([
      { course: c0!.name, time: 31, holder: "ALPHA" },
      { course: c1!.name, time: 40, holder: "BLANK" },
    ]);
    expectNoCredentials(p, [...creds, "blank:zulu0009"]);
    // a holder long gone from the room whose name is the body of its own board key: still not printed
    h.board.post(c0!.id, { key: "blank:yankee07", name: "YANKEE07", ticks: 1500, splits: [], at: 3 });
    expect(h.presence().records[0]).toEqual({ course: c0!.name, time: 25, holder: "BLANK" });
  });

  it("an event that is over is not on the feed", () => {
    const src = (status: string): PresenceSource => ({ district: "lease_row", seats: [], event: { kind: "hold", title: "HOLD", status, left: 0 }, records: [] });
    expect(districtPresence(src("running")).event).toEqual({ kind: "hold", title: "HOLD", left: 0 });
    expect(districtPresence(src("complete")).event).toBeNull();
    expect(districtPresence(src("failed")).event).toBeNull();
  });
});

describe("redaction: no id and no secret ever reaches the payload", () => {
  it("a file named after its own id, another's id, or a slice of another's secret is not printed", () => {
    const store = new MemoryAccountStore(createAccount);
    const h = createCityRoom({ district: "relay_heights", accounts: store, seed: 7 });
    const bravoSecret = newFileSecret();
    const files = [
      { id: "blank:alpha001", name: "ALPHA", secret: newFileSecret() },
      { id: "blank:bravo002", name: "BRAVO", secret: bravoSecret },
      { id: "blank:mimic003", name: "blank:mimic003", secret: newFileSecret() },
      { id: "blank:thief004", name: "blank:bravo002", secret: newFileSecret() },
      { id: "blank:spill005", name: bravoSecret.slice(0, 16).toUpperCase(), secret: newFileSecret() },
    ];
    const creds: string[] = [];
    for (const f of files) {
      const a = store.load(f.id, f.name) as Account;
      a.depth = 60;
      a.name = f.name;
      a.secret = f.secret;
      creds.push(f.id, f.secret);
      const c = conn();
      h.room.onOpen(c);
      h.room.onMessage(c, encodeJoin(f.name.slice(0, 16), "", f.id, LOADOUT, "", f.secret));
    }
    h.room.step();
    h.board.post(h.runs.courses[0]!.id, { key: "blank:spill005", name: bravoSecret.slice(0, 16), ticks: 1200, splits: [], at: 1 });
    const p = h.presence();
    expect(p.players).toBe(5);
    expect(p.names).toEqual(["ALPHA", "BRAVO"]);
    expect(p.records[0]!.holder).toBe("BLANK");
    expectNoCredentials(p, creds);
    // and the whole city's feed, as the host serves it
    const feed = aggregatePresence([p], 1);
    expectNoCredentials(feed, creds);
    expect(credentialShapes(feed)).toEqual([]);
  });

  it("guests are keyed by a made-up id: that id is not printed either", () => {
    const store = new MemoryAccountStore(createAccount);
    const h = createCityRoom({ district: "lease_row", accounts: store, seed: 7 });
    const c = conn();
    h.room.onOpen(c);
    h.room.onMessage(c, encodeJoin("WANDERER", "", "", LOADOUT));
    h.room.step();
    const seats = h.room.presenceSeats();
    expect(seats[0]!.account).toMatch(/^guest:/);
    const p = h.presence();
    expect(p.players).toBe(1);
    expectNoCredentials(p, [seats[0]!.account!]);
  });

  it("the last layer fails closed: a report that would carry a credential anywhere is emptied of names", () => {
    const src: PresenceSource = {
      district: "lease_row",
      seats: [
        { display: "ALPHA", connected: true, account: "blank:alpha001", secret: "abcdefghijkmnpqrstuvwxyz" },
        { display: "BRAVO", connected: true, account: "blank:bravo002", secret: null },
      ],
      // a title that somehow carries an id (the event text is the district's, but the scan does not care where a leak is)
      event: { kind: "hold", title: "HOLD FOR blank:alpha001", status: "running", left: 30 },
      records: [{ course: "HIGH LINE", time: 30, holder: "ALPHA", key: "blank:alpha001" }],
    };
    const p = districtPresence(src);
    expect(p.players).toBe(2);
    expect(p.names).toEqual([]);
    expect(p.records.every((r) => r.holder === "BLANK")).toBe(true);
    expectNoCredentials(p, ["blank:alpha001", "abcdefghijkmnpqrstuvwxyz"]);
  });

  it("presentName: printable, capped, and never shaped like an id or a secret", () => {
    expect(presentName("ALPHA")).toBe("ALPHA");
    expect(presentName("  NEON\u0007 FOX  ")).toBe("NEON FOX");
    expect(presentName("blank:x7k2m9qa")).toBeNull();
    expect(presentName("G:ANY")).toBeNull();
    // a secret is longer than any name: what survives the cap is not a secret-length token (the room's own secrets are caught by the forbidden list)
    expect(presentName("abcdefghijkmnpqrstuvwxyz")).toBe("abcdefghijkmnpqr");
    expect(presentName("ALPHA", ["alpha"])).toBeNull();
    expect(presentName("KMNPQRST", ["abcdefghkmnpqrstuvwxyz23"])).toBeNull();
    expect(presentName(42)).toBeNull();
    expect(presentName("")).toBeNull();
  });

  it("a report from another process is read again: its names and holders are held to the same shape rules", () => {
    const d = readDistrict({ district: "lease_row", players: 3, names: ["ALPHA", "blank:alpha001", 7], event: { kind: "hold", title: "HOLD", left: 12, site: { x: 1 } }, records: [{ course: "HIGH LINE", time: 30, holder: "blank:alpha001", key: "blank:alpha001" }], secret: "zzz" });
    expect(d).toEqual({ district: "lease_row", name: "LEASE ROW", players: 3, names: ["ALPHA"], event: { kind: "hold", title: "HOLD", left: 12 }, records: [{ course: "HIGH LINE", time: 30, holder: "BLANK" }] });
    expect(readDistrict({ district: "the_moon", players: 9 })).toBeNull();
    expect(readDistrict({ district: "lease_row", event: { kind: "rave" } })!.event).toBeNull();
  });
});

describe("the whole city", () => {
  it("every district in CITY_DISTRICTS order; a district nobody has walked into is an empty line", () => {
    const { h } = cityWith("night_market", [{ id: "blank:alpha001", name: "ALPHA" }]);
    const feed = aggregatePresence([null, h.presence(), "junk"], 1234);
    expect(feed.at).toBe(1234);
    expect(feed.ttl).toBe(PRESENCE_TTL_MS);
    expect(feed.districts.map((d) => d.district)).toEqual([...CITY_DISTRICTS]);
    expect(feed.districts.find((d) => d.district === "night_market")!.players).toBe(1);
    expect(feed.districts.filter((d) => d.district !== "night_market").every((d) => d.players === 0 && d.names.length === 0)).toBe(true);
    expect(parsePresence(JSON.parse(JSON.stringify(feed)))).toEqual(feed);
    expect(parsePresence({ nope: 1 })).toBeNull();
  });

  it("the busiest district; ties to the first in the city's order; nobody online is no district", () => {
    const feed = (counts: Record<string, number>): CityPresence => ({ at: 0, ttl: PRESENCE_TTL_MS, districts: CITY_DISTRICTS.map((d) => ({ ...emptyPresence(d), players: counts[d] ?? 0 })) });
    expect(busiestDistrict(feed({ night_market: 6, repo_depot: 2 }))).toMatchObject({ district: "night_market", players: 6, name: "NIGHT MARKET" });
    const [first, second] = CITY_DISTRICTS;
    expect(busiestDistrict(feed({ [second!]: 3, [first!]: 3 }))!.district).toBe(first);
    expect(busiestDistrict(feed({}))).toBeNull();
    expect(busiestDistrict(null)).toBeNull();
    expect(playDistrict(feed({ relay_heights: 1 }))).toEqual({ district: "relay_heights", online: 1 });
    expect(playDistrict(null)).toEqual({ district: DEFAULT_CITY, online: 0 });
  });
});

describe("the feed is a cache: built at most once per TTL, one build at a time", () => {
  it("get: once inside the TTL however often it is asked; again after", () => {
    const c = new PresenceCache<number>(2000);
    let n = 0;
    const build = () => ++n;
    for (let t = 0; t < 2000; t += 10) expect(c.get(1000 + t, build)).toBe(1);
    expect(c.builds).toBe(1);
    expect(c.get(3000, build)).toBe(2);
    expect(c.builds).toBe(2);
    // a clock that runs backwards does not keep a stale answer forever
    expect(c.get(10, build)).toBe(3);
  });

  it("getAsync: concurrent asks share one build; a failed build is not cached", async () => {
    const c = new PresenceCache<string>(2000);
    let n = 0;
    let release: (v: string) => void = () => {};
    const build = () => {
      n++;
      return new Promise<string>((r) => (release = r));
    };
    const asks = Array.from({ length: 50 }, () => c.getAsync(0, build));
    release("feed");
    expect(await Promise.all(asks)).toEqual(Array(50).fill("feed"));
    expect(n).toBe(1);
    expect(await c.getAsync(1999, build)).toBe("feed");
    expect(n).toBe(1);
    await expect(c.getAsync(5000, () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await c.getAsync(5001, () => Promise.resolve("back"))).toBe("back");
  });
});

describe("the campaign Worker's feed: a fan-out to the five city objects behind the cache", () => {
  /** a Durable Object namespace of real CampaignRoom objects over in-memory storage */
  function namespace() {
    const objects = new Map<string, CampaignRoom>();
    const stores = new Map<string, Map<string, unknown>>();
    const asked: string[] = [];
    const env = {
      CAMPAIGN_ROOM: {
        idFromName: (n: string) => n,
        get: (id: string) => {
          let o = objects.get(id);
          if (!o) {
            // an evicted object's storage outlives it
            const m = stores.get(id) ?? new Map<string, unknown>();
            stores.set(id, m);
            o = new CampaignRoom({ storage: { get: async (k: string) => m.get(k), put: async (k: string, v: unknown) => void m.set(k, v) } } as unknown as DurableObjectState, env as never);
            objects.set(id, o);
          }
          return { fetch: (r: Request) => (asked.push(id), o!.fetch(r)) };
        },
      },
      PLAYER_FILE: null,
    };
    return { env, objects, stores, asked };
  }

  it("asks each city object once per TTL, aggregates their lines, and asking builds no room", async () => {
    const { env, objects, asked } = namespace();
    const feed = JSON.parse(await cityPresenceFeed(env as never, 1_000_000)) as CityPresence;
    expect(feed.districts.map((d) => d.district)).toEqual([...CITY_DISTRICTS]);
    expect(feed.districts.every((d) => d.players === 0)).toBe(true);
    expect(asked.sort()).toEqual(CITY_DISTRICTS.map((d) => `city-${d}`).sort());
    // an object asked for its line has no room in it: presence is not a walk-in
    for (const o of objects.values()) expect((o as unknown as { handle: unknown }).handle).toBeNull();
    // inside the TTL: no second fan-out
    await cityPresenceFeed(env as never, 1_000_000 + PRESENCE_TTL_MS - 1);
    expect(asked).toHaveLength(CITY_DISTRICTS.length);
    await cityPresenceFeed(env as never, 1_000_000 + PRESENCE_TTL_MS + 1);
    expect(asked).toHaveLength(CITY_DISTRICTS.length * 2);
  });

  it("a live city object reports its room and keeps its records; evicted, it still reports them; neither prints the board's key", async () => {
    const { env, objects, stores } = namespace();
    const stub = env.CAMPAIGN_ROOM.get("city-night_market");
    const o = objects.get("city-night_market")! as unknown as { roomFor: (u: URL) => unknown; city: ReturnType<typeof createCityRoom> };
    // the room a walk-in builds (no socket in a unit test), and a record set on its board
    o.roomFor(new URL("https://campaign/campaign/city-night_market"));
    const course = o.city.runs.courses[0]!;
    o.city.board.post(course.id, { key: "blank:alpha001", name: "ALPHA", ticks: 1800, splits: [], at: 1 });
    const ask = async () => (await (await stub.fetch(new Request("https://city/presence?city=night_market"))).json()) as { players: number; records: unknown[] };
    const live = await ask();
    expect(live).toMatchObject({ district: "night_market", players: 0, records: [{ course: course.name, time: 30, holder: "ALPHA" }] });
    expectNoCredentials(live, ["blank:alpha001"]);
    // kept beside the board, already reduced to display names
    expect(stores.get("city-night_market")!.get("cityRecords:night_market")).toEqual([{ course: course.name, time: 30, holder: "ALPHA" }]);
    // evicted: a new object over the same storage, with no room in it
    objects.delete("city-night_market");
    const again = env.CAMPAIGN_ROOM.get("city-night_market");
    const cold = (await (await again.fetch(new Request("https://city/presence?city=night_market"))).json()) as { players: number };
    expect(cold).toMatchObject({ district: "night_market", players: 0, names: [], event: null, records: [{ course: course.name, time: 30, holder: "ALPHA" }] });
    expect((objects.get("city-night_market") as unknown as { handle: unknown }).handle).toBeNull();
    // and a question about something that is not a city is not answered
    expect((await again.fetch(new Request("https://city/presence?city=the_moon"))).status).toBe(404);
  });

  it("serves GET /city with CORS, a short max-age, and the aggregate — and never an id", async () => {
    const { env } = namespace();
    const r = await campaignWorker.fetch(new Request("https://campaign/city"), env as never);
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toMatch(/max-age=2\b/);
    const feed = parsePresence(await r.json());
    expect(feed!.districts).toHaveLength(CITY_DISTRICTS.length);
  });

  it("a city object that does not answer is an empty line, not an error", async () => {
    const env = { CAMPAIGN_ROOM: { idFromName: (n: string) => n, get: () => ({ fetch: () => Promise.reject(new Error("evicted")) }) }, PLAYER_FILE: null };
    const feed = JSON.parse(await cityPresenceFeed(env as never, 9_000_000)) as CityPresence;
    expect(feed.districts.every((d) => d.players === 0)).toBe(true);
  });
});

describe("reading the feed from a page", () => {
  afterEach(() => vi.useRealTimers());

  it("the feed's address is the campaign host's, over http", () => {
    expect(cityPresenceUrl("ws://127.0.0.1:8787")).toBe("http://127.0.0.1:8787/city");
    expect(cityPresenceUrl("wss://campaign.example.dev/")).toBe("https://campaign.example.dev/city");
  });

  it("an answer is checked; a refusal, junk, or a host that never answers is null inside the timeout", async () => {
    const feed = aggregatePresence([{ ...emptyPresence("night_market"), players: 2, names: ["ALPHA", "blank:leak0001"] }], 5);
    const ok = await fetchPresence("http://h/city", (async () => new Response(JSON.stringify(feed))) as typeof fetch);
    expect(ok!.districts.find((d) => d.district === "night_market")).toMatchObject({ players: 2, names: ["ALPHA"] });
    expect(await fetchPresence("http://h/city", (async () => new Response("nope", { status: 500 })) as typeof fetch)).toBeNull();
    expect(await fetchPresence("http://h/city", (async () => new Response("<html>")) as typeof fetch)).toBeNull();
    expect(await fetchPresence("http://h/city", (async () => Promise.reject(new TypeError("refused"))) as typeof fetch)).toBeNull();
    const t0 = Date.now();
    expect(await fetchPresence("http://h/city", (() => new Promise(() => {})) as typeof fetch, 30)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
