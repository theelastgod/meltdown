/**
 * The way in (the menu that leads with PLAY) and the loading card that covers every trip.
 *
 * The owner asked for an opening that is obvious — start the campaign in the shared city — and the
 * reload between a choice and the world was a black page. These pin: PLAY's one URL; the main menu
 * in order with PLAY first and preselected, the four modes on their own screen and every old id
 * still choosing; the title cards skipped on a boot the trailer opened; the descriptor written before
 * the page goes and read back on the next boot; and the card's stages, from the real signals.
 */
import { inCity } from "../shared/net/city";
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { CAMPAIGN_DESK, cardsWanted, choiceUrl, MAIN, Menu, MODES, playInfo, playLine, playLoading, playUrl, type MenuHost } from "../client/menu";
import { bootStage, bootWanted, hideLoading, LEVEL_ART, LOADING_HTML, LOADING_KEY, LOADING_STAGES, loadingFor, loadingView, readLoading, showLoading, stageProgress, travelTo, watchBoot, writeLoading, type BootSignals } from "../client/loading";
import { DEFAULT_SETTINGS } from "../client/settings";
import { campaignOf } from "../shared/campaign/save";
import { sandboxAccount } from "../shared/progression/account";
import { MISSION_ART } from "../client/missionart";

const BASE = "http://127.0.0.1:5173/?account=sandbox-t&shop=http://127.0.0.1:8787";

/** Just enough DOM for the menu and the card: every selector answers with its own element, made on first ask. */
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

class MemStore {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

/** A page: the DOM stand-in, a session store, and a location whose navigations are recorded with what the store held at that moment. */
function page(search: string) {
  const store = new MemStore();
  const navs: { how: string; url: string; stored: string | null; cardShown: boolean; cardTitle: string }[] = [];
  const nav = (how: string) => (url: string) => {
    const v = loadingView();
    navs.push({ how, url, stored: store.getItem(LOADING_KEY), cardShown: !!v?.shown, cardTitle: v?.title ?? "" });
  };
  vi.stubGlobal("location", { search, href: `http://127.0.0.1:5173/${search}`, assign: nav("assign"), replace: nav("replace") });
  vi.stubGlobal("sessionStorage", store);
  vi.stubGlobal("document", { createElement: () => new FakeEl(), body: new FakeEl(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "KeyboardEvent",
    class {
      code: string;
      constructor(_type: string, init: { code: string }) {
        this.code = init.code;
      }
      preventDefault(): void {}
    },
  );
  return { store, navs };
}

const host = (save = campaignOf(sandboxAccount("sandbox-t"))): MenuHost => ({
  audio: null,
  settings: { ...DEFAULT_SETTINGS },
  applySettings: () => {},
  openFile: () => {},
  resume: () => {},
  identityLine: () => "BLANK · DEPTH 01 · test",
  look: () => 0,
  setLook: () => {},
  campaign: () => save,
});

afterEach(() => {
  hideLoading(false);
  vi.unstubAllGlobals();
});

describe("PLAY's one URL", () => {
  it("walks the city: LEASE ROW's shared room on the campaign host, in campaign mode, the ledger kept for the file (Stage 692)", () => {
    const play = new URL(playUrl(BASE));
    expect(play.searchParams.get("city")).toBe("1");
    expect(play.searchParams.get("mode")).toBe("campaign");
    expect(play.searchParams.get("level")).toBe("lease_row");
    expect(new URL(play.searchParams.get("net")!).pathname).toBe("/campaign/city-lease_row");
    expect(play.searchParams.get("shop")).toBe(new URL(choiceUrl("campaign", BASE)!).searchParams.get("shop"));
    expect(inCity(play.searchParams)).toBe(true);
    expect(new URL(playUrl(BASE, { level: "repo_depot" })).searchParams.get("level")).toBe("repo_depot");
  });

  it("drops what the page it leaves was doing (a room, a mission, a stale city flag) and keeps the account", () => {
    const u = new URL(playUrl("http://127.0.0.1:5173/?level=lease_row&net=ws://x/room/y&mission=m2_deadletter_run&explore=1&city=1&account=sandbox-k", { account: "sandbox-k" }));
    for (const k of ["mission", "explore"]) expect(u.searchParams.has(k)).toBe(false);
    expect(new URL(u.searchParams.get("net")!).pathname).toBe("/campaign/city-lease_row");
    expect(u.searchParams.getAll("city")).toEqual(["1"]);
    expect(u.searchParams.get("account")).toBe("sandbox-k");
    // and the other modes do not carry the city flag with them
    expect(new URL(choiceUrl("range", "http://127.0.0.1:5173/?city=1")!).searchParams.has("city")).toBe(false);
  });

  it("is the URL the menu's PLAY loads (one place to switch the target)", () => {
    const src = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(src).toMatch(/if \(id === "play"\) \{\s*const url = playUrl\(location\.href\);/);
    page("?nonav=1");
    const m = new Menu(host());
    m.start({ cards: false });
    expect(m.choose("play")).toBe(playUrl(location.href));
  });
});

describe("the main menu", () => {
  it("lists PLAY / CHARACTER / MODES / FILE / WALLET / SETTINGS, in that order, with PLAY preselected", () => {
    page("?nonav=1");
    const m = new Menu(host());
    m.start({ cards: false });
    expect(MAIN.map((e) => e.label)).toEqual(["PLAY", "CHARACTER", "MODES", "FILE", "WALLET", "SETTINGS"]);
    const v = m.view();
    expect(v.screen).toBe("main");
    expect(v.entries).toEqual(["PLAY", "CHARACTER", "MODES", "FILE", "WALLET", "SETTINGS"]);
    expect(v.cursor).toBe(0);
    expect(m.root.querySelector(".list")!.innerHTML).toMatch(/^<div class="row on play" data-i="0">/);
  });

  it("PLAY's line names what it does and where, from the file's campaign save", () => {
    page("?nonav=1");
    const fresh = campaignOf(sandboxAccount("sandbox-t"));
    const m = new Menu(host(fresh));
    m.start({ cards: false });
    expect(m.view().line).toBe("THE CITY · LEASE ROW · NEXT: 01 WAKE UNLISTED · EVERYONE ONLINE IS HERE");
    const two = { ...fresh, missionsDone: ["m1_wake_unlisted"] };
    expect(playLine(playInfo(two))).toBe("THE CITY · DEADLETTER DOCKS · NEXT: 02 DEADLETTER RUN · EVERYONE ONLINE IS HERE");
    expect(playLine(null)).toBe(MAIN[0]!.line);
    const all = { ...fresh, missionsDone: ["m1_wake_unlisted", "m2_deadletter_run", "m3_repo_volatility", "m4_the_leak", "m5_blind_the_model", "m6_trial_by_data", "m7_white_office"] };
    expect(playLine(playInfo(all))).toMatch(/^THE CITY · THE ARC IS CLOSED/);
    // and its loading card continues where the file stands, over the next mission's art
    const card = playLoading(playUrl(BASE), playInfo(two));
    expect(card).toMatchObject({ kind: "play", line: "THE CITY · CONTINUE THE CAMPAIGN · NEXT: 02 DEADLETTER RUN", art: MISSION_ART.m2_deadletter_run });
    expect(playLoading(playUrl(BASE), playInfo(fresh)).line).toBe("THE CITY · BEGIN THE CAMPAIGN · NEXT: 01 WAKE UNLISTED");
  });

  it("MODES is a screen of its own: WAKE, THE RUN, THE RANGE, THE OFFICE and BACK, each with its old line; ESC is back on MODES", () => {
    page("?nonav=1");
    const m = new Menu(host());
    m.start({ cards: false });
    m.key("ArrowDown");
    m.key("ArrowDown");
    m.key("Enter");
    expect(m.view().screen).toBe("modes");
    expect(m.view().entries).toEqual(["WAKE", "THE RUN", "THE RANGE", "THE OFFICE", "BACK"]);
    expect(MODES.map((e) => e.id)).toEqual(["wake", "run", "range", "office"]);
    expect(MODES.find((e) => e.id === "run")!.icon).toBeTruthy();
    m.key("Escape");
    expect(m.view().screen).toBe("main");
    expect(m.view().entries[m.view().cursor]).toBe("MODES");
  });

  it("every old id still chooses when called directly: wake and run list the districts (and back to MODES), range, office and campaign are URLs", () => {
    page("?nonav=1");
    const m = new Menu(host());
    m.start({ cards: false });
    expect(m.choose("wake")).toBeNull();
    expect(m.view().screen).toBe("wake");
    m.key("Escape");
    expect(m.view().screen).toBe("modes");
    expect(m.choose("run")).toBeNull();
    expect(m.view().screen).toBe("wake");
    expect(new URL(m.choose("run:lease_row")!).searchParams.get("mode")).toBe("run");
    expect(new URL(m.choose("range")!).searchParams.get("level")).toBe("drainage_yard");
    expect(new URL(m.choose("office")!).searchParams.get("level")).toBe("deadletter_office");
    const desk = new URL(m.choose("campaign")!);
    expect(desk.searchParams.get("mode")).toBe("campaign");
    expect(desk.searchParams.has("city")).toBe(false);
    expect(CAMPAIGN_DESK.id).toBe("campaign");
  });
});

describe("the title cards", () => {
  it("play when the trailer did not open this boot, and not when it did (or on the way back from a game)", () => {
    expect(cardsWanted(false)).toBe(true);
    expect(cardsWanted(true)).toBe(false);
    expect(cardsWanted(false, true)).toBe(false);
  });

  it("the menu goes straight to its list when told, and plays them otherwise", () => {
    page("?nonav=1");
    const a = new Menu(host());
    a.start({ cards: false });
    expect(a.view().screen).toBe("main");
    const b = new Menu(host());
    b.start();
    expect(b.view().screen).toBe("cards");
  });

  it("the boot asks after the trailer: a crawl that played starts the menu without them", () => {
    const main = readFileSync(new URL("../client/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/if \(crawl\) crawl\.onFinish = \(\) => menu\.start\(\{ cards: cardsWanted\(true, fromGame\) \}\);\s*else menu\.start\(\{ cards: cardsWanted\(false, fromGame\) \}\);/);
  });
});

describe("the loading descriptor", () => {
  it("a menu choice shows the card and writes the descriptor before the page goes; the next boot reads it back, once", () => {
    const { store, navs } = page("?account=sandbox-t");
    const m = new Menu(host());
    m.start({ cards: false });
    const url = m.choose("range")!;
    expect(navs).toHaveLength(1);
    expect(navs[0]!.url).toBe(url);
    expect(navs[0]!.cardShown).toBe(true);
    expect(navs[0]!.cardTitle).toBe("THE DRAINAGE YARD");
    expect(JSON.parse(navs[0]!.stored!)).toMatchObject({ title: "THE DRAINAGE YARD", kind: "mode", art: LEVEL_ART.drainage_yard });
    // the next page
    const back = readLoading(store);
    expect(back).toMatchObject({ title: "THE DRAINAGE YARD", line: "THE RANGE · OFFLINE, WITH DUMMIES", kind: "mode" });
    expect(readLoading(store)).toBeNull();
  });

  it("PLAY too: its card is on the page and in the store at the moment it navigates", () => {
    const { navs } = page("?account=sandbox-t");
    const m = new Menu(host());
    m.start({ cards: false });
    m.select(); // PLAY, preselected
    expect(navs).toHaveLength(1);
    expect(new URL(navs[0]!.url).searchParams.get("city")).toBe("1");
    expect(navs[0]!.cardShown).toBe(true);
    expect(JSON.parse(navs[0]!.stored!)).toMatchObject({ kind: "play", line: "THE CITY · BEGIN THE CAMPAIGN · NEXT: 01 WAKE UNLISTED", art: MISSION_ART.m1_wake_unlisted });
  });

  it("under nonav the card shows with the destination and nothing is written or loaded", () => {
    const { store, navs } = page("?nonav=1");
    const m = new Menu(host());
    m.start({ cards: false });
    m.choose("office");
    expect(loadingView()).toMatchObject({ shown: true, title: "THE DEADLETTER OFFICE" });
    expect(navs).toHaveLength(0);
    expect(store.getItem(LOADING_KEY)).toBeNull();
    // and a screen of the menu coming up takes it down
    m.choose("modes");
    expect(loadingView()?.shown ?? false).toBe(false);
  });

  it("the game's and the campaign's trips go through the same card: no bare reload left in either", () => {
    for (const f of ["../client/game.ts", "../client/campaign.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/location\.(replace|reload|assign)\(/);
      expect(src, f).toMatch(/travelTo\(/);
    }
    const { store, navs } = page("?level=lease_row");
    travelTo("http://127.0.0.1:5173/?level=repo_depot", loadingFor("http://127.0.0.1:5173/?level=repo_depot"), { replace: true });
    expect(navs[0]).toMatchObject({ how: "replace", cardShown: true, cardTitle: "REPO DEPOT" });
    expect(readLoading(store)?.title).toBe("REPO DEPOT");
  });

  it("a URL implies its own card when the trip did not write one (a shared link)", () => {
    expect(loadingFor("http://x/?level=lease_row&mission=m1_wake_unlisted")).toMatchObject({ kind: "mission", title: "LEASE ROW", line: "CONTRACT · WAKE UNLISTED", art: MISSION_ART.m1_wake_unlisted });
    expect(loadingFor("http://x/?city=1&mode=campaign&level=lease_row&mission=m1_wake_unlisted&net=ws://h/campaign/crew-ABCDEFGH?mission=m1_wake_unlisted&level=lease_row").line.startsWith("CREW ")).toBe(true);
    expect(loadingFor("http://x/?level=lease_row&net=ws://h/room/neochina-lease_row?level=lease_row")).toMatchObject({ kind: "district", title: "LEASE ROW", line: "WAKE · THE PUBLIC ROOM" });
    expect(loadingFor("http://x/?level=repo_depot&mode=run&net=ws://h/room/r")).toMatchObject({ title: "REPO DEPOT", line: "THE RUN · CARRY THE CLAIMS TO A GATE", art: "/districts/repo_depot.jpg" });
    expect(loadingFor("http://x/?level=deadletter_docks&city=1")).toMatchObject({ title: "DEADLETTER DOCKS", art: "/districts/deadletter_docks.jpg" });
    expect(loadingFor("http://x/?level=repo_depot&city=1").art).toBe("/districts/repo_depot.jpg");
    expect(loadingFor("http://x/?level=deadletter_office")).toMatchObject({ title: "THE DEADLETTER OFFICE", art: "/districts/deadletter_office.jpg" });
    expect(loadingFor("http://x/?level=drainage_yard")).toMatchObject({ title: "THE DRAINAGE YARD", art: "/districts/drainage_yard.jpg" });
    expect(loadingFor("http://x/?level=white_office")).toMatchObject({ title: "THE WHITE OFFICE", art: "/districts/white_office.jpg" });
    for (const id of ["deadletter_docks", "repo_depot", "deadletter_office", "drainage_yard", "white_office"] as const) {
      expect(LEVEL_ART[id]).toBe(`/districts/${id}.jpg`);
      expect(LEVEL_ART[id]).not.toMatch(/\/(missions|gigs)\//);
      const path = new URL(`../public${LEVEL_ART[id]}`, import.meta.url);
      const b = readFileSync(path);
      expect(b[0]).toBe(0xff);
      expect(b[1]).toBe(0xd8);
      let o = 2;
      let w = 0;
      let h = 0;
      while (o < b.length) {
        const m = b[o + 1]!;
        const len = b.readUInt16BE(o + 2);
        if (m === 0xc0 || m === 0xc2) {
          h = b.readUInt16BE(o + 5);
          w = b.readUInt16BE(o + 7);
          break;
        }
        o += 2 + len;
      }
      expect(w, id).toBe(960);
      expect(h, id).toBe(411);
      expect(b.length, id).toBeLessThan(150_000);
    }
    expect(loadingFor(playUrl(BASE))).toMatchObject({ kind: "play", title: "LEASE ROW", line: "THE CITY · CONTINUE THE CAMPAIGN" });
    expect(loadingFor("http://x/?level=nowhere").title).toBe("LEASE ROW");
    // every picture the card names is a file that ships
    for (const art of Object.values(LEVEL_ART)) expect(existsSync(new URL(`../public${art}`, import.meta.url)), art).toBe(true);
  });

  it("the reload's first frame is the card: index.html paints it from the descriptor before the bundle, with the card's own markup, never under the probes", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const snippet = html.slice(html.indexOf("<script>"), html.indexOf("</script>"));
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf('<script type="module" src="/client/main.ts">'));
    expect(snippet).toContain(`sessionStorage.getItem("${LOADING_KEY}")`);
    expect(snippet).toContain(`'${LOADING_HTML}'`);
    expect(snippet).toContain('el.dataset.boot = "1"');
    expect(snippet).toMatch(/if \(\/\[\?&\]\(headless\|loading=0\)\(=\|&\|\$\)\/\.test\(location\.search\)\) return;/);
    // the title and line go in as text, not markup
    expect(snippet).toMatch(/w\.textContent = d\.title;/);
    expect(snippet).not.toMatch(/innerHTML = [^']*d\./);
  });

  it("a descriptor that is not one (hand-edited, half-written) is ignored, not trusted", () => {
    const s = new MemStore();
    s.setItem(LOADING_KEY, "{not json");
    expect(readLoading(s)).toBeNull();
    s.setItem(LOADING_KEY, JSON.stringify({ title: 3, line: "x", kind: "mode" }));
    expect(readLoading(s)).toBeNull();
    s.setItem(LOADING_KEY, JSON.stringify({ title: "A", line: "B", kind: "mode", art: "javascript:alert(1)" }));
    expect(readLoading(s)).toEqual({ title: "A", line: "B", kind: "mode" });
    expect(writeLoading({ title: "A", line: "B", kind: "mode" }, null)).toBe(false);
  });

  it("the boot shows it after a trip and on a deep link; the title menu is its own first screen; headless probes only when asked", () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(bootWanted(q(""), true, true)).toBe(true);
    expect(bootWanted(q(""), false, true)).toBe(false);
    expect(bootWanted(q("level=lease_row"), false, false)).toBe(true);
    expect(bootWanted(q("headless=1&level=lease_row"), true, false)).toBe(false);
    expect(bootWanted(q("headless=1&loading=1"), false, false)).toBe(true);
    expect(bootWanted(q("loading=0"), true, false)).toBe(false);
    const main = readFileSync(new URL("../client/main.ts", import.meta.url), "utf8");
    // read before the world is built, and the card painted before the synchronous build starts
    expect(main.indexOf("const bootDesc = readLoading();")).toBeGreaterThan(-1);
    const paint = main.indexOf("if (bootCard) await nextPaint();");
    expect(paint).toBeGreaterThan(main.indexOf("const bootCard = bootWanted(bootQ, !!bootDesc, menuWanted(bootQ)) ? showLoading(bootDesc ?? loadingFor(location.href), \"city\") : null;"));
    expect(paint).toBeLessThan(main.indexOf("const game = new Game("));
    // and watched on the game's own signals until it is playable
    expect(main).toMatch(/watchBoot\(bootCard, \(\) => \(\{ built: true, frames: game\.drawing \? game\.stats\.frames : 1, networked, net: game\.net \? \{ status: game\.net\.status, reason: game\.net\.kickReason, synced: game\.synced \} : null \}\)\)/);
  });
});

describe("the card's stages", () => {
  const at = (o: Partial<BootSignals>): ReturnType<typeof bootStage> => bootStage({ built: true, frames: 1, networked: false, net: null, ...o });

  it("walk LOADING THE DISTRICT, BUILDING THE CITY, LINKING, READY, with a bar that only grows", () => {
    expect(LOADING_STAGES.map((s) => s.label)).toEqual(["LOADING THE DISTRICT", "BUILDING THE CITY", "LINKING", "READY"]);
    const p = LOADING_STAGES.map((s) => stageProgress(s.id));
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThan(p[i - 1]!);
    expect(p[p.length - 1]).toBe(1);
  });

  it("offline: the district until the world is built, the city until a frame is drawn, then ready", () => {
    expect(at({ built: false, frames: 0 }).stage).toBe("district");
    expect(at({ frames: 0 }).stage).toBe("city");
    expect(at({ frames: 1 })).toEqual({ stage: "ready", error: null });
  });

  it("in a room: linking until the room let the file in and its first exact state arrived", () => {
    const net = (status: string, synced = false, reason = "") => ({ status, synced, reason });
    expect(at({ networked: true, frames: 0, net: net("connecting") }).stage).toBe("city");
    expect(at({ networked: true, net: null }).stage).toBe("link");
    expect(at({ networked: true, net: net("connecting") })).toEqual({ stage: "link", error: null });
    expect(at({ networked: true, net: net("joined", false) }).stage).toBe("link");
    expect(at({ networked: true, net: net("joined", true) })).toEqual({ stage: "ready", error: null });
  });

  it("a join that fails shows the line the HUD prints for it rather than spinning", () => {
    expect(at({ networked: true, net: { status: "kicked", synced: false, reason: "room full" } })).toEqual({ stage: "link", error: "LINK KICKED · ROOM FULL" });
    expect(at({ networked: true, net: { status: "closed", synced: false, reason: "" } }).error).toBe("LINK CLOSED");
  });

  it("the boot's watch walks the card through them on the game's signals and takes it down at READY", () => {
    page("?level=lease_row&net=ws://h/room/r");
    vi.useFakeTimers();
    try {
      const card = showLoading(loadingFor("http://x/?level=lease_row&net=ws://h/room/r"), "city");
      let sig: BootSignals = { built: true, frames: 0, networked: true, net: { status: "connecting", synced: false, reason: "" } };
      watchBoot(card, () => sig);
      const seen: string[] = [];
      const step = (s: Partial<BootSignals>) => {
        sig = { ...sig, ...s };
        vi.advanceTimersByTime(100);
        seen.push(loadingView()?.shown ? loadingView()!.stage : "gone");
      };
      step({});
      step({ frames: 1 });
      step({ net: { status: "joined", synced: false, reason: "" } });
      expect(loadingView()!.progress).toBe(0.75);
      step({ net: { status: "joined", synced: true, reason: "" } });
      expect(seen).toEqual(["city", "link", "link", "gone"]);
      vi.advanceTimersByTime(1000);
      expect(loadingView()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the watch never holds the screen: a failed join shows its line and lets the player through, and so does a long wait", () => {
    page("?level=lease_row&net=ws://h/room/r");
    vi.useFakeTimers();
    try {
      let t = 0;
      // the room refuses at once: the line, and the way through, long before any patience runs out
      const kicked = showLoading(loadingFor("http://x/?level=lease_row"), "city");
      const stopKicked = watchBoot(kicked, () => ({ built: true, frames: 1, networked: true, net: { status: "kicked", synced: false, reason: "room full" } }), { now: () => t, patience: 5000 });
      vi.advanceTimersByTime(100);
      expect(loadingView()).toMatchObject({ shown: true, stage: "link", error: "LINK KICKED · ROOM FULL", through: true });
      stopKicked();
      hideLoading(false);
      // a room that never answers: linking, then let through once the wait has run long
      const card = showLoading(loadingFor("http://x/?level=lease_row"), "city");
      const sig: BootSignals = { built: true, frames: 1, networked: true, net: { status: "connecting", synced: false, reason: "" } };
      watchBoot(card, () => sig, { now: () => t, patience: 5000 });
      vi.advanceTimersByTime(100);
      expect(loadingView()).toMatchObject({ shown: true, stage: "link", error: null, through: false });
      t = 6000;
      vi.advanceTimersByTime(100);
      expect(loadingView()).toMatchObject({ shown: true, stage: "link", error: null, through: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
