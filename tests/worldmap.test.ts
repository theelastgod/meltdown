/**
 * The WORLD MAP and PLAY's pick (Stage 705).
 *
 * The map draws the city's districts where the gates put them: every join it draws must be a real
 * gate pair (`neighbourAt`), and every gate of every district is on the map exactly once, as a join
 * or as a stub naming where it leads. TRAVEL from the map in the city walks another district's city
 * room on the same campaign host — never the offline level travel. PLAY picks the busiest district
 * the city's presence feed reports, and LEASE ROW when nobody is online or the feed is unreachable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CITY_DISTRICTS, cityPageUrl, DEFAULT_CITY, inCity } from "../shared/net/city";
import { cityMapTravelUrl, GATES_PER_DISTRICT, gateSide, neighbourAt } from "../shared/net/citygates";
import { gateSummary, isGatePair, worldMapLayout } from "../shared/city/worldmap";
import { aggregatePresence, emptyPresence, PRESENCE_TTL_MS, type CityPresence } from "../shared/city/presence";
import { feedUrl, tileCount, worldMapDetails, worldMapHtml, type WorldMapState } from "../client/worldmap";
import { loadingFor } from "../client/loading";
import { MAIN, Menu, notePlayPresence, playFeedUrl, playInfo, playLine, playUrl, type MenuHost } from "../client/menu";
import { DEFAULT_SETTINGS } from "../client/settings";
import { campaignOf } from "../shared/campaign/save";
import { sandboxAccount } from "../shared/progression/account";

const CITY_PAGE = cityPageUrl("http://127.0.0.1:5173/?account=sandbox-t", { wsBase: "ws://127.0.0.1:8787", level: "lease_row", shop: "http://127.0.0.1:8787" });

const feed = (counts: Record<string, number>, events: string[] = []): CityPresence => ({
  at: 0,
  ttl: PRESENCE_TTL_MS,
  districts: CITY_DISTRICTS.map((d) => ({ ...emptyPresence(d), players: counts[d] ?? 0, names: Array.from({ length: Math.min(counts[d] ?? 0, 3) }, (_, i) => `FILE${i}`), event: events.includes(d) ? { kind: "hold" as const, title: "HOLD THE CORNER", left: 42 } : null })),
});

describe("the world map's layout is the gates' own", () => {
  const layout = worldMapLayout();

  it("every district once, on a cell of the tiling: the district at (x, z) is CITY_DISTRICTS[(x + z) mod n]", () => {
    expect(layout.tiles.map((t) => t.district)).toEqual([...CITY_DISTRICTS]);
    for (const t of layout.tiles) expect(CITY_DISTRICTS[(t.x + t.z) % CITY_DISTRICTS.length]).toBe(t.district);
    // no two on one cell
    expect(new Set(layout.tiles.map((t) => `${t.x},${t.z}`)).size).toBe(layout.tiles.length);
  });

  it("every drawn join is between tiles side by side, and every gate pair it carries is a real one, both ways", () => {
    expect(layout.links.length).toBeGreaterThanOrEqual(CITY_DISTRICTS.length - 1);
    for (const l of layout.links) {
      const a = layout.tiles.find((t) => t.district === l.a)!;
      const b = layout.tiles.find((t) => t.district === l.b)!;
      expect(l.side === "e" ? [b.x - a.x, b.z - a.z] : [b.x - a.x, b.z - a.z]).toEqual(l.side === "e" ? [1, 0] : [0, 1]);
      expect(l.gates.length).toBeGreaterThan(0);
      for (const [ga, gb] of l.gates) {
        expect(gateSide(ga)).toBe(l.side);
        expect(neighbourAt(l.a, ga)).toEqual({ district: l.b, gate: gb });
        expect(isGatePair(l.a, ga, l.b, gb)).toBe(true);
      }
    }
  });

  it("a gate not drawn as a join is a stub that names where it really leads; every gate of every district is on the map once", () => {
    const seen = new Map<string, number>();
    const mark = (d: string, g: number) => seen.set(`${d}:${g}`, (seen.get(`${d}:${g}`) ?? 0) + 1);
    for (const l of layout.links) for (const [ga, gb] of l.gates) (mark(l.a, ga), mark(l.b, gb));
    for (const s of layout.stubs) {
      for (const g of s.gates) {
        expect(gateSide(g)).toBe(s.side);
        expect(neighbourAt(s.district, g)!.district).toBe(s.to);
        mark(s.district, g);
      }
    }
    for (const d of CITY_DISTRICTS) for (let g = 0; g < GATES_PER_DISTRICT; g++) expect(seen.get(`${d}:${g}`), `${d} gate ${g}`).toBe(1);
  });

  it("the drawn markup joins exactly the layout's pairs, and each is a pair of neighbours", () => {
    const html = worldMapHtml(layout, { here: "lease_row", selected: "lease_row", presence: null, status: "loading", touch: false });
    const drawn = [...html.matchAll(/data-link="([a-z_]+)\|([a-z_]+)"/g)].map((m) => [m[1]!, m[2]!] as const);
    expect(drawn.map(([a, b]) => `${a}|${b}`).sort()).toEqual(layout.links.map((l) => `${l.a}|${l.b}`).sort());
    for (const [a, b] of drawn) expect(Array.from({ length: GATES_PER_DISTRICT }, (_, g) => neighbourAt(a, g)?.district).includes(b)).toBe(true);
  });

  it("a layout of other districts is still held to neighbourAt (the rule, not the five names)", () => {
    const ds = ["lease_row", "deadletter_docks", "repo_depot"];
    const l = worldMapLayout(ds);
    for (const k of l.links) for (const [ga, gb] of k.gates) expect(isGatePair(k.a, ga, k.b, gb, ds)).toBe(true);
    for (const s of l.stubs) for (const g of s.gates) expect(neighbourAt(s.district, g, ds)!.district).toBe(s.to);
  });

  it("the details name where each side's gates lead", () => {
    const g = gateSummary("lease_row");
    for (const { sides, to } of g) for (const side of sides) expect(Array.from({ length: GATES_PER_DISTRICT }, (_, i) => i).filter((i) => gateSide(i) === side).every((i) => neighbourAt("lease_row", i)!.district === to)).toBe(true);
  });
});

describe("what the map shows", () => {
  const layout = worldMapLayout();
  const state = (o: Partial<WorldMapState> = {}): WorldMapState => ({ here: "lease_row", selected: "lease_row", presence: feed({ night_market: 6, lease_row: 1 }, ["night_market"]), status: "live", touch: false, ...o });

  it("each tile's count, a pulse where an event runs, and the district you are in lit", () => {
    const html = worldMapHtml(layout, state());
    const tile = (d: string) => html.match(new RegExp(`<div class="wt [^"]*" data-wm="${d}"[^>]*>.*?</div>`))![0];
    expect(tile("night_market")).toMatch(/6 ONLINE/);
    expect(tile("night_market")).toMatch(/class="pulse"/);
    expect(tile("night_market")).toMatch(/class="wt [a-z]+ ev"/);
    expect(tile("lease_row")).toMatch(/ here/);
    expect(tile("lease_row")).toMatch(/YOU ARE HERE/);
    expect(tile("lease_row")).not.toMatch(/pulse/);
    expect(tile("repo_depot")).toMatch(/0 ONLINE/);
  });

  it("with the feed unreachable the counts are dashes, and the map and TRAVEL still work", () => {
    const s = state({ presence: null, status: "unreachable", selected: "night_market" });
    expect(tileCount(undefined, "unreachable")).toBe("—");
    const html = worldMapHtml(layout, s);
    expect(html).not.toMatch(/ONLINE ACROSS/);
    expect(html).toMatch(/PRESENCE FEED UNREACHABLE/);
    expect(html).toMatch(/data-wm-go="night_market"/);
  });

  it("choosing a district shows who is there, its event, its records, and TRAVEL — and no TRAVEL to where you are", () => {
    const p = feed({ night_market: 6 }, ["night_market"]);
    p.districts.find((d) => d.district === "night_market")!.records = [{ course: "HIGH LINE", time: 31.25, holder: "ALPHA" }];
    const d = worldMapDetails(state({ presence: p, selected: "night_market" }));
    expect(d).toMatch(/NIGHT MARKET<\/b> · 6 ONLINE/);
    expect(d).toMatch(/FILE0 · FILE1 · FILE2 · \+3/);
    expect(d).toMatch(/HOLD THE CORNER · HOLD · 42S LEFT/);
    expect(d).toMatch(/HIGH LINE · 31\.3S · ALPHA/);
    expect(d).toMatch(/data-wm-go="night_market"/);
    const here = worldMapDetails(state({ presence: p, selected: "lease_row" }));
    expect(here).not.toMatch(/data-wm-go/);
    expect(here).toMatch(/YOU ARE HERE/);
    expect(here).toMatch(/NO PUBLIC EVENT RUNNING/);
    expect(here).toMatch(/data-wm-run="lease_row"/);
    expect(here).toMatch(/LEDGER DESK AT THE METRO/);
    expect(worldMapHtml(layout, state({ touch: true }))).not.toMatch(/data-wm-run="[^"]*".*\[[A-Z]+\]/);
  });

  it("a name is text, never markup", () => {
    const p = feed({ night_market: 1 });
    p.districts.find((d) => d.district === "night_market")!.names = ["<img src=x>"];
    const d = worldMapDetails(state({ presence: p, selected: "night_market" }));
    expect(d).not.toMatch(/<img/);
    expect(d).toMatch(/&lt;img src=x&gt;/);
  });

  it("the close marker is the key on a keyboard and the gesture on a phone (no [KEY] on a touch frame)", () => {
    expect(worldMapHtml(layout, state())).toMatch(/\[M\] CLOSE/);
    expect(worldMapHtml(layout, state({ touch: true }))).not.toMatch(/\[[A-Z]+\]/);
  });
});

describe("TRAVEL from the map in the city", () => {
  it("walks the chosen district's city room on the same campaign host, the shop kept, no gate", () => {
    const url = cityMapTravelUrl(CITY_PAGE, "night_market")!;
    const u = new URL(url);
    expect(u.searchParams.get("level")).toBe("night_market");
    expect(u.searchParams.get("mode")).toBe("campaign");
    expect(u.searchParams.get("city")).toBe("1");
    expect(u.searchParams.get("shop")).toBe("http://127.0.0.1:8787");
    const net = new URL(u.searchParams.get("net")!);
    expect(`${net.protocol}//${net.host}${net.pathname}`).toBe("ws://127.0.0.1:8787/campaign/city-night_market");
    expect(u.searchParams.has("from")).toBe(false);
    expect(u.searchParams.has("gate")).toBe(false);
    expect(inCity(u.searchParams)).toBe(true);
    expect(url).toBe(cityPageUrl(CITY_PAGE, { wsBase: "ws://127.0.0.1:8787", level: "night_market", shop: "http://127.0.0.1:8787" }));
    // the card names the destination
    expect(loadingFor(url)).toMatchObject({ kind: "play", title: "NIGHT MARKET" });
  });

  it("a gate arrival carried in the page is dropped: the map's trip is not a walk through a gate", () => {
    const through = cityPageUrl(CITY_PAGE, { wsBase: "ws://127.0.0.1:8787", level: "lease_row", arrive: { from: "relay_heights", gate: 2 } });
    const u = new URL(cityMapTravelUrl(through, "repo_depot")!);
    expect(u.searchParams.has("from")).toBe(false);
    expect(new URL(u.searchParams.get("net")!).searchParams.has("gate")).toBe(false);
  });

  it("nowhere to go: not a city page, not a district, or where the page already is", () => {
    expect(cityMapTravelUrl("http://127.0.0.1:5173/?level=lease_row", "night_market")).toBeNull();
    expect(cityMapTravelUrl("http://127.0.0.1:5173/?level=lease_row&net=ws://h/room/neochina-lease_row", "night_market")).toBeNull();
    expect(cityMapTravelUrl(CITY_PAGE, "drainage_yard")).toBeNull();
    expect(cityMapTravelUrl(CITY_PAGE, "lease_row")).toBeNull();
    expect(cityMapTravelUrl("not a url", "night_market")).toBeNull();
  });

  it("the map reads the feed on the city's own campaign host, and not at all off a city page", () => {
    expect(feedUrl(CITY_PAGE)).toBe("http://127.0.0.1:8787/city");
    expect(feedUrl("http://127.0.0.1:5173/?level=lease_row")).toBeNull();
  });

  it("the game builds the map only in the city, and its TRAVEL goes through the loading card, not `travel(levelId)`", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("if (city) {\n      const nonav"), src.indexOf("this.hud.mapToggle = () => map.toggle();"));
    expect(block).toMatch(/new WorldMap\(/);
    expect(block).toMatch(/travelTo\(url, loadingFor\(url/);
    expect(block).not.toMatch(/this\.travel\(/);
    const hud = readFileSync(new URL("../client/hud/hud.ts", import.meta.url), "utf8");
    // outside the city the MAP tab is the district select, as it was
    expect(hud).toMatch(/if \(this\.mapToggle\) this\.mapToggle\(\);\s*else panel\.hidden = !panel\.hidden;/);
  });
});

// ---- PLAY ----

class FakeEl {
  innerHTML = "";
  textContent = "";
  hidden = false;
  className = "";
  id = "";
  src = "";
  onerror: unknown = null;
  classList = { toggle: () => false };
  private kids = new Map<string, FakeEl>();
  querySelector(sel: string): FakeEl {
    let k = this.kids.get(sel);
    if (!k) this.kids.set(sel, (k = new FakeEl()));
    return k;
  }
  addEventListener(): void {}
  appendChild(): void {}
  play(): Promise<void> {
    return Promise.resolve();
  }
  remove(): void {}
}

function page(search: string, fetchImpl?: typeof fetch) {
  const navs: string[] = [];
  vi.stubGlobal("location", { search, href: `http://127.0.0.1:5173/${search}`, assign: (u: string) => navs.push(u), replace: (u: string) => navs.push(u) });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("document", { createElement: () => new FakeEl(), body: new FakeEl(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  if (fetchImpl) vi.stubGlobal("fetch", fetchImpl);
  return navs;
}

const host = (): MenuHost => ({ audio: null, settings: { ...DEFAULT_SETTINGS }, applySettings: () => {}, openFile: () => {}, resume: () => {}, identityLine: () => "BLANK", look: () => 0, setLook: () => {}, campaign: () => campaignOf(sandboxAccount("sandbox-t")) });

describe("PLAY drops you where the city is busiest", () => {
  afterEach(() => {
    notePlayPresence(null);
    vi.unstubAllGlobals();
  });

  it("the busiest district, its name and its count on PLAY's line; LEASE ROW and the old line when nobody is online", () => {
    const busy = feed({ night_market: 6, repo_depot: 2 });
    expect(new URL(playUrl("http://127.0.0.1:5173/", { presence: busy })).searchParams.get("level")).toBe("night_market");
    expect(new URL(new URL(playUrl("http://127.0.0.1:5173/", { presence: busy })).searchParams.get("net")!).pathname).toBe("/campaign/city-night_market");
    expect(new URL(playUrl("http://127.0.0.1:5173/", { presence: feed({}) })).searchParams.get("level")).toBe(DEFAULT_CITY);
    expect(new URL(playUrl("http://127.0.0.1:5173/", { presence: null })).searchParams.get("level")).toBe(DEFAULT_CITY);
    // a district named outright still wins
    expect(new URL(playUrl("http://127.0.0.1:5173/", { presence: busy, level: "repo_depot" })).searchParams.get("level")).toBe("repo_depot");
    const p = playInfo(campaignOf(sandboxAccount("sandbox-t")));
    expect(playLine(p, { district: "night_market", online: 6 })).toBe("THE CITY · NIGHT MARKET · 6 ONLINE · NEXT: 01 WAKE UNLISTED");
    expect(playLine(null, { district: "night_market", online: 6 })).toBe("THE CITY · NIGHT MARKET · 6 ONLINE");
    expect(playLine(p, { district: DEFAULT_CITY, online: 0 })).toBe(playLine(p));
    expect(playLine(null, null)).toBe(MAIN[0]!.line);
  });

  it("the menu asks the feed without waiting: PLAY before the answer is LEASE ROW, after it the busiest", async () => {
    let answer: (r: Response) => void = () => {};
    const asked: string[] = [];
    page("?nonav=1&shop=http://127.0.0.1:8787", ((url: string) => {
      asked.push(String(url));
      return new Promise<Response>((r) => (answer = r));
    }) as unknown as typeof fetch);
    const m = new Menu(host());
    m.start({ cards: false });
    expect(asked).toEqual(["http://127.0.0.1:8787/city"]);
    expect(m.view().play).toEqual({ district: DEFAULT_CITY, online: 0, feed: "pending" });
    expect(new URL(m.choose("play")!).searchParams.get("level")).toBe(DEFAULT_CITY);
    answer(new Response(JSON.stringify(aggregatePresence(feed({ night_market: 6, relay_heights: 2 }).districts, 1))));
    await m.presence;
    expect(m.view().play).toEqual({ district: "night_market", online: 6, feed: "live" });
    expect(m.view().line).toBe("THE CITY · NIGHT MARKET · 6 ONLINE · NEXT: 01 WAKE UNLISTED");
    const url = m.choose("play")!;
    expect(url).toBe(playUrl(location.href));
    expect(new URL(url).searchParams.get("level")).toBe("night_market");
  });

  it("an unreachable feed falls back to LEASE ROW and the line it always had", async () => {
    page("?nonav=1&shop=http://127.0.0.1:8787", (() => Promise.reject(new TypeError("refused"))) as unknown as typeof fetch);
    const m = new Menu(host());
    m.start({ cards: false });
    expect(await m.presence).toBeNull();
    expect(m.view().play).toEqual({ district: DEFAULT_CITY, online: 0, feed: "unreachable" });
    expect(m.view().line).toBe("THE CITY · LEASE ROW · NEXT: 01 WAKE UNLISTED · EVERYONE ONLINE IS HERE");
    expect(new URL(m.choose("play")!).searchParams.get("level")).toBe(DEFAULT_CITY);
  });

  it("a feed that answers that nobody is online is LEASE ROW too", async () => {
    page("?nonav=1&shop=http://127.0.0.1:8787", (async () => new Response(JSON.stringify(aggregatePresence([], 1)))) as unknown as typeof fetch);
    const m = new Menu(host());
    m.start({ cards: false });
    await m.presence;
    expect(m.view().play).toEqual({ district: DEFAULT_CITY, online: 0, feed: "live" });
    expect(new URL(m.choose("play")!).searchParams.get("level")).toBe(DEFAULT_CITY);
  });

  it("a dev page with no host asks nothing (no failed fetch in the console); a build asks its campaign host", () => {
    expect(playFeedUrl(new URLSearchParams(""), "dev")).toBeNull();
    expect(playFeedUrl(new URLSearchParams("shop=http://127.0.0.1:9999"), "dev")).toBe("http://127.0.0.1:9999/city");
    expect(playFeedUrl(new URLSearchParams(""), "prod")).toMatch(/^https?:\/\/.+\/city$/);
    let asked = 0;
    page("?nonav=1", (() => (asked++, Promise.reject(new Error("no")))) as unknown as typeof fetch);
    const m = new Menu(host());
    m.start({ cards: false });
    expect(asked).toBe(0);
    expect(m.view().play.feed).toBe("off");
  });
});
