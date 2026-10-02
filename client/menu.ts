/**
 * The CRT menu flow (Stage 13). Two title cards — "Every mind in Neo-China is leased." / "You woke
 * free." — only on a boot the trailer did not open (the trailer already says both), then the menu:
 * PLAY first and preselected (the campaign in the shared city: `playUrl`), CHARACTER, MODES (a
 * screen of its own: WAKE, THE RUN, THE RANGE, THE OFFICE), FILE, WALLET (the page drawn in place,
 * like SETTINGS, from the Counter-Ledger's own client: client/wallet.ts), SETTINGS. In play, ESC
 * opens the pause menu (RESUME / SETTINGS / FILE / QUIT TO MENU). Choices are URLs, like district
 * travel: the client reloads with the query that describes the mode, behind the loading card
 * (client/loading.ts) the choice raises before the page goes.
 *
 *   ?menu=1 forces the flow (headless probes skip it), ?menu=0 never; ?nonav=1 reports the URL a
 *   choice would load instead of loading it (the probe).
 */
import { cityPageUrl } from "@shared/net/city";
import { cityPresenceUrl, fetchPresence, playDistrict, type CityPresence } from "@shared/city/presence";
import { decodeLook, encodeLook, LOOK_FIELDS, stepLook, type LookField } from "@shared/identity/look";
import { LookPreview } from "./render/lookpreview";
import { HUB_LEVEL_ID } from "@shared/sim/hub";
import { LEVEL_INFO } from "@shared/sim/level";
import { HOSTS } from "./config";
import { DEFAULT_SETTINGS, formatSetting, loadSettings, saveSettings, sensitivityLabel, SETTING_LABELS, stepSetting, type Settings } from "./settings";
import { wantsTouch } from "./touch";
import { menuFooter, settingsLine } from "./hud/keyhint";
import type { GameAudio } from "./audio";
import { clipsFor, videoUrl } from "../shared/assets/video";
import { CAPITAL_MARK } from "./brand";
import { walletEntries, walletHtml, walletState, type WalletState } from "./wallet";
import { hideLoading, loadingFor, placeName, showLoading, travelTo, writeLoading, type LoadingDescriptor } from "./loading";
import { MISSION_ART } from "./missionart";
import { nextMission, type CampaignSave } from "@shared/campaign/save";
import { MAIN_ARC } from "@shared/campaign/missions";

/** a row with [−] [+]: a setting, or a field of the look (Stage 689) */
const adjustable = (id: string): boolean => id.startsWith("set:") || id.startsWith("look:");

export const TITLE_CARDS: readonly string[] = ["Every mind in Neo-China is leased.", "You woke free."];
export const CARD_SECONDS = 2.4;
export const CARD_GAP = 0.5;

/**
 * Whether the title cards play on this boot. They are the trailer's own opening line and its last,
 * so a boot the trailer just opened goes straight to the menu; a returning player, whose trailer is
 * long seen, still gets the two lines once per boot — except coming back from a game (QUIT TO MENU),
 * which is not an arrival.
 */
export function cardsWanted(trailerPlayed: boolean, fromGame = false): boolean {
  return !trailerPlayed && !fromGame;
}

export type MenuScreen = "cards" | "main" | "modes" | "wake" | "settings" | "character" | "wallet" | "pause" | "hidden";

export interface MenuEntry {
  id: string;
  label: string;
  /** a mark beside the label: the token's own, for the mode that pays it (Stage 679) */
  icon?: string;
  line: string;
}

/** The modes, on their own screen under MODES: each with its line and its behaviour, as they were on the main menu. */
export const MODES: readonly MenuEntry[] = [
  { id: "wake", label: "WAKE", line: "THE SIGNATURE MODE: FLIP THE NODES, HOLD THE DISTRICT, BEAT THE KERNEL'S CLOCK" },
  { id: "run", label: "THE RUN", line: "PLAY TO EARN: CARRY $CAPITAL CLAIMS OUT OF THE PVP ZONE TO A GATE; DIE AND THEY DROP", icon: CAPITAL_MARK.small },
  { id: "range", label: "THE RANGE", line: "THE DRAINAGE YARD, OFFLINE, WITH DUMMIES" },
  { id: "office", label: "THE OFFICE", line: "THE HUB: YOUR FILE ON THE WALL, THE RANGE GHOSTS, THE DOSSIER" },
];

/** The desk, straight to the office. PLAY is the campaign now; the id still chooses (the probes, old links). */
export const CAMPAIGN_DESK: MenuEntry = { id: "campaign", label: "CAMPAIGN", line: "THE DESK AT THE DEADLETTER OFFICE: FIXERS, GIGS, THE SEVEN-MISSION ARC" };

/** The main menu: PLAY first and preselected; everything else is one step aside. PLAY's line is the file's own (`playLine`). */
export const MAIN: readonly MenuEntry[] = [
  { id: "play", label: "PLAY", line: "THE CITY · THE CAMPAIGN · EVERYONE ONLINE IS HERE" },
  { id: "character", label: "CHARACTER", line: "BUILD YOUR BLANK: BODY, BUILD, COAT, SHOULDER · CLOTH ONLY, THE SAME HITBOX FOR EVERY BODY" },
  { id: "modes", label: "MODES", line: "WAKE · THE RUN · THE RANGE · THE OFFICE" },
  { id: "file", label: "FILE", line: "THE GHOSTFILE: NODES, MASTERY, STAMPS, THE COUNTER-LEDGER" },
  { id: "wallet", label: "WALLET", line: "CONNECT A WALLET: YOUR ADDRESS, YOUR $CAPITAL, YOUR GHOSTFILE ON-CHAIN" },
  { id: "settings", label: "SETTINGS", line: "SENSITIVITY, FIELD OF VIEW, VOLUMES, THE CRT" },
];

/** Where the campaign stands for PLAY's line: the next mission in the arc, its number and its district; null once the arc is done. */
export interface PlayInfo {
  next: { index: number; id: string; title: string; level: string } | null;
  begun: boolean;
}

export function playInfo(save: CampaignSave): PlayInfo {
  const n = nextMission(save);
  return { next: n ? { index: MAIN_ARC.indexOf(n) + 1, id: n.id, title: n.title, level: n.level } : null, begun: save.missionsDone.length > 0 };
}

const nextWords = (n: NonNullable<PlayInfo["next"]>) => `NEXT: ${String(n.index).padStart(2, "0")} ${n.title}`;

/**
 * PLAY's line: what it does and where, from the file's campaign save when there is one. When the
 * city's presence feed says files are online (Stage 705), the line names the district PLAY will drop
 * you into — the busiest — and how many are there: `THE CITY · NIGHT MARKET · 6 ONLINE`.
 */
export function playLine(p: PlayInfo | null, busy: { district: string; online: number } | null = null): string {
  if (busy && busy.online > 0) return `THE CITY · ${placeName(busy.district)} · ${busy.online} ONLINE${p?.next ? ` · ${nextWords(p.next)}` : p ? " · THE ARC IS CLOSED" : ""}`;
  if (!p) return MAIN[0]!.line;
  if (!p.next) return "THE CITY · THE ARC IS CLOSED: GIGS AND THE STREET · EVERYONE ONLINE IS HERE";
  return `THE CITY · ${placeName(p.next.level)} · ${nextWords(p.next)} · EVERYONE ONLINE IS HERE`;
}

/** PLAY's loading card: the destination the URL names, the campaign's next step, the next mission's art. */
export function playLoading(url: string, p: PlayInfo | null): LoadingDescriptor {
  const line = `THE CITY · ${p?.begun ? "CONTINUE" : "BEGIN"} THE CAMPAIGN${p?.next ? ` · ${nextWords(p.next)}` : ""}`;
  return loadingFor(url, { kind: "play", line, art: p?.next ? MISSION_ART[p.next.id] : undefined });
}

const PAUSE: MenuEntry[] = [
  { id: "resume", label: "RESUME", line: "" },
  { id: "settings", label: "SETTINGS", line: "" },
  { id: "file", label: "FILE", line: "" },
  { id: "quit", label: "QUIT TO MENU", line: "" },
];

export interface MenuView {
  /** a district pick asked the host for a room (the target updates when it answers) */
  matched: boolean;
  screen: MenuScreen;
  card: number;
  cardText: string;
  /** the current card's own elapsed seconds, held where a freeze caught it */
  cardT: number;
  cursor: number;
  entries: string[];
  settings: Settings;
  /** the URL the last choice would have loaded (nonav) */
  target: string | null;
  skippable: boolean;
  /** the look the CHARACTER page's turntable is wearing, or null before it was first opened (Stage 689) */
  previewLook: number | null;
  /** the text of the page drawn above the list (the WALLET page); "" on the list-only screens */
  page: string;
  /** the line under the list: what the row under the cursor does (PLAY's names the city and the next mission) */
  line: string;
  /** where PLAY goes (Stage 705): the busiest district when the city's feed says anyone is online, else LEASE ROW */
  play: { district: string; online: number; feed: "off" | "pending" | "live" | "unreachable" };
}

/** The WALLET page's side of the host: the Counter-Ledger's client, loaded on demand (client/wallet.ts). */
export interface MenuWallet {
  state: () => WalletState;
  /** the page opened: load the chain client if it is not in yet, re-read the holdings if connected */
  open: () => void;
  /** a button on the page: walletconnect / injected / disconnect / copy / switch */
  act: (id: string) => void;
}

export interface MenuHost {
  audio: GameAudio | null;
  settings: Settings;
  applySettings: (s: Settings) => void;
  openFile: () => void;
  /** the pause menu's RESUME: back to the game (pointer lock is the click's) */
  resume: () => void;
  identityLine: () => string;
  /** the WALLET page (absent: the entry opens an empty page that says there is no ledger host) */
  wallet?: MenuWallet;
  /** the file's campaign save, for PLAY's line (absent: the line says the campaign without the next step) */
  campaign?: () => CampaignSave | null;
  /** the look the file wears, and wearing another (Stage 689) */
  look: () => number;
  setLook: (code: number) => void;
}

/** The line under a look row (Stage 689): how to change it, and that it changes nothing but the cloth. */
export function lookLine(touch: boolean): string {
  return `${touch ? "TAP [−] [+]" : "← → OR [−] [+]"} TO CHANGE · CLOTH ONLY: EVERY BODY HAS THE SAME HITBOX, EYE HEIGHT AND SPEED`;
}

export function menuWanted(q: URLSearchParams): boolean {
  const flag = q.get("menu");
  if (flag === "0") return false;
  if (flag === "1") return true;
  if (q.has("headless")) return false;
  // a deep link (a room, a mission, an explicit level) skips the menu
  return !q.has("net") && !q.has("mission") && !q.has("level") && !q.has("explore");
}

/** The line under a district pick: the city's name, not the room id (Stage 297). */
export function districtPickLine(pick: "wake" | "run", l: { displayName: string; cast: string }): string {
  const cast = l.cast.toUpperCase();
  return pick === "run" ? `${cast} CAST · PVP ZONE WITH TWO GATES · ${l.displayName}` : `${cast} CAST · ${l.displayName}`;
}

/** The URL a choice loads: the mode as a query, like district travel. */
export function choiceUrl(id: string, base: string, opts: { level?: string; account?: string } = {}): string | null {
  const u = new URL(base);
  for (const k of ["net", "mission", "explore", "level", "ai", "menu", "crawl", "shop", "mode", "city"]) u.searchParams.delete(k);
  if (opts.account) u.searchParams.set("account", opts.account);
  switch (id) {
    case "range":
      u.searchParams.set("level", "drainage_yard");
      u.searchParams.set("shop", HOSTS.ledger);
      return u.toString();
    case "office":
      u.searchParams.set("level", HUB_LEVEL_ID);
      u.searchParams.set("ai", "0");
      u.searchParams.set("shop", HOSTS.ledger);
      return u.toString();
    case "campaign":
      u.searchParams.set("level", HUB_LEVEL_ID);
      u.searchParams.set("mode", "campaign");
      u.searchParams.set("ai", "0");
      u.searchParams.set("shop", HOSTS.ledger);
      return u.toString();
    default:
      if (id.startsWith("wake:") || id.startsWith("run:")) {
        // the default room; matchmaking (host /match) swaps in the first shard with space before the client navigates
        const run = id.startsWith("run:");
        const level = id.slice(run ? 4 : 5);
        u.searchParams.set("level", level);
        if (run) u.searchParams.set("mode", "run");
        u.searchParams.set("net", `${HOSTS.ws}/room/${HOSTS.publicRoom}-${run ? "run-" : ""}${level}?level=${level}${run ? "&mode=run" : ""}`);
        return u.toString();
      }
      return null;
  }
}

/**
 * PLAY's destination — the ONE place it is decided. PLAY starts the campaign in the shared open world:
 * the city (Stage 692), a district's persistent co-op room on the campaign host, with the ledger host
 * kept as `shop` so the page can fetch the file and its campaign save. PLAY's loading card is derived
 * from this URL, and the probes follow it.
 */
export function playUrl(base: string, opts: { account?: string; level?: string; presence?: CityPresence | null } = {}): string {
  const u = new URL(base);
  if (opts.account) u.searchParams.set("account", opts.account);
  // where: the district named, else the busiest district the city's feed has told the menu of, else
  // LEASE ROW (Stage 705) — a feed that never answered is LEASE ROW, as PLAY always was
  const level = opts.level ?? playDistrict(opts.presence === undefined ? playPresence : opts.presence).district;
  return cityPageUrl(u.toString(), { wsBase: playWsBase(), level, shop: HOSTS.ledger });
}

/** the campaign host PLAY walks the city on */
const playWsBase = (): string => (HOSTS.build === "dev" ? HOSTS.ledger.replace(/^http/, "ws") : HOSTS.campaignWs);

/** the city's presence as the menu last read it (Stage 705); null until the feed answers, and when it cannot */
let playPresence: CityPresence | null = null;

/** what the menu read from the feed: PLAY's line and PLAY's district follow it */
export function notePlayPresence(p: CityPresence | null): void {
  playPresence = p;
}

/**
 * Where the menu reads the city's presence feed, or null when it does not: the campaign host PLAY
 * walks, on a build that names one, or the `?shop=` host a dev page was given. A dev page with
 * neither asks nothing, so a menu with no host behind it puts no failed fetch in the console.
 */
export function playFeedUrl(q: URLSearchParams, build: string = HOSTS.build): string | null {
  const shop = q.get("shop");
  if (shop) return cityPresenceUrl(shop.replace(/^http/, "ws"));
  return build !== "dev" ? cityPresenceUrl(playWsBase()) : null;
}

export class Menu {
  readonly root: HTMLDivElement;
  screen: MenuScreen = "hidden";
  cursor = 0;
  card = -1;
  target: string | null = null;
  /** the matchmaking answer, when a district was picked */
  matched: Promise<string> | null = null;
  private cardTimer = 0;
  private seen: boolean;
  private nonav: boolean;
  private prev: MenuScreen = "main";
  /** which mode the district list serves: the wake or the run */
  private pick: "wake" | "run" = "wake";
  private raf = 0;
  private started = 0;
  private pageHtml = "";
  onQuit: (() => void) | null = null;
  /** the city's presence feed (Stage 705): asked once when the menu is made, never waited on */
  presence: Promise<CityPresence | null> = Promise.resolve(null);
  private feed: "off" | "pending" | "live" | "unreachable" = "off";

  constructor(private host: MenuHost, private speed = 1) {
    const q = new URLSearchParams(location.search);
    this.nonav = q.get("nonav") === "1";
    let seen = false;
    try {
      seen = localStorage.getItem("meltdown.menu.seen") === "1";
    } catch {
      seen = false;
    }
    this.seen = seen;
    const root = document.createElement("div");
    root.id = "menu";
    root.hidden = true;
    root.innerHTML = `<video class="bg" muted loop playsinline preload="auto"></video><div class="card"></div><div class="panel"><div class="hd"><span class="word">MELTDOWN</span><span class="who"></span></div><div class="page"></div><div class="list"></div><canvas class="pv" width="440" height="600" hidden></canvas><div class="line"></div><div class="ft"><span class="hint"></span> · <span class="build">${HOSTS.build}</span></div></div><div class="scan"></div>`;
    // The title sits over the city rather than over black (Stage 633). A DOM video, not a pooled
    // one: the menu is not a scene and this costs no material. It fails soft in the strongest
    // sense — the element simply never plays and the menu is the flat panel it has always been.
    const bg = root.querySelector("video.bg") as HTMLVideoElement | null;
    const clip = clipsFor("backdrop")[0];
    if (bg && clip) {
      bg.src = videoUrl(clip);
      bg.onerror = () => bg.remove();
      void bg.play().catch(() => undefined);
    }
    document.body.appendChild(root);
    this.root = root;
    this.readPresence(q);
    document.addEventListener("keydown", this.onKey);
    root.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("[data-i]") as HTMLElement | null;
      if (this.screen === "cards") {
        if (this.seen) this.showMain();
        return;
      }
      if (!t) return;
      this.cursor = Number(t.dataset.i);
      const adj = (e.target as HTMLElement).closest("[data-adj]") as HTMLElement | null;
      if (adj) this.adjust(Number(adj.dataset.adj) as 1 | -1);
      else this.select();
    });
  }

  /** The flow from the top: the two title cards (unless `cards: false` — see `cardsWanted`), then the main menu. */
  start(o: { cards?: boolean } = {}): void {
    this.started = performance.now();
    if (o.cards === false) {
      this.showMain();
      return;
    }
    this.cardStart = 0;
    this.card = 0;
    this.show("cards");
    this.host.audio?.card();
    this.raf = requestAnimationFrame(this.tick);
  }

  private cardStart = 0;
  /** Each card runs its own clock from the frame it appeared, so a slow frame can never skip one. */
  /** the probe's freeze: the card clock holds while paused (screenshots under SwiftShader are slow) */
  paused = false;
  private pausedAt = 0;
  /** The card's own elapsed seconds: wall time since the frame it appeared, held while frozen. */
  private cardClock(now: number): number {
    return (((this.pausedAt || now) - this.cardStart) / 1000) * this.speed;
  }
  private tick = (now: number): void => {
    if (this.screen !== "cards") return;
    // A card's clock starts on the frame it appears, and it starts whether or not the menu is frozen:
    // freezing before that first frame used to leave cardStart at 0, so the release added the held
    // span to nothing and the card was already seconds past its own end — the first card vanished.
    if (!this.cardStart) this.cardStart = now;
    if (this.paused) {
      if (!this.pausedAt) this.pausedAt = now;
    } else if (this.pausedAt) {
      this.cardStart += now - this.pausedAt;
      this.pausedAt = 0;
    }
    // The card's own clock, held where the freeze caught it. Only the advance is gated on it — the
    // card still draws while frozen, or freezing one before its first frame would hold a blank screen.
    const t = this.cardClock(now);
    if (!this.paused && t >= CARD_SECONDS + CARD_GAP) {
      if (this.card + 1 >= TITLE_CARDS.length) {
        this.showMain();
        return;
      }
      this.card++;
      this.cardStart = now;
      this.host.audio?.card();
    }
    const inGap = t > CARD_SECONDS && t < CARD_SECONDS + CARD_GAP;
    const el = this.root.querySelector(".card") as HTMLElement;
    const text = inGap ? "" : TITLE_CARDS[this.card]!;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("gap", inGap);
    this.raf = requestAnimationFrame(this.tick);
  };

  private showMain(): void {
    try {
      localStorage.setItem("meltdown.menu.seen", "1");
    } catch {
      /* no storage */
    }
    this.seen = true;
    this.cursor = 0;
    this.show("main");
  }

  /** The pause menu (ESC in play). */
  pause(): void {
    this.cursor = 0;
    this.show("pause");
  }

  hide(): void {
    cancelAnimationFrame(this.raf);
    this.preview?.stop();
    this.screen = "hidden";
    this.root.hidden = true;
    this.root.className = "";
  }

  private show(screen: MenuScreen): void {
    // a screen coming up is the menu answering: any loading card left standing (a trip the probe did not take) goes
    hideLoading(false);
    this.screen = screen;
    this.root.hidden = false;
    this.root.className = screen;
    (this.root.querySelector(".who") as HTMLElement).textContent = this.host.identityLine();
    this.showPreview(screen === "character");
    this.render();
  }

  /** the CHARACTER page's turntable (Stage 689): built on first open, stopped whenever the page is not showing */
  preview: LookPreview | null = null;
  private showPreview(on: boolean): void {
    const cv = this.root.querySelector(".pv") as HTMLCanvasElement;
    cv.hidden = !on;
    if (!on) {
      this.preview?.stop();
      return;
    }
    if (!this.preview) this.preview = new LookPreview(cv, this.host.look());
    else this.preview.set(this.host.look());
    this.preview.start();
  }

  private entries(): readonly MenuEntry[] {
    switch (this.screen) {
      case "main":
        return MAIN.map((e) => (e.id === "play" ? { ...e, line: playLine(this.playInfo(), playDistrict(playPresence)) } : e));
      case "modes":
        return [...MODES, { id: "back", label: "BACK", line: "" }];
      case "pause":
        return PAUSE;
      case "wake":
        return [...LEVEL_INFO.filter((l) => l.kind === "district").map((l) => ({ id: `${this.pick}:${l.id}`, label: l.displayName, line: districtPickLine(this.pick, l) })), { id: "back", label: "BACK", line: "" }];
      case "settings":
        return [...(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((k) => ({ id: `set:${k}`, label: k === "sensitivity" ? sensitivityLabel(wantsTouch()) : SETTING_LABELS[k], line: formatSetting(this.host.settings, k) })), { id: "back", label: "BACK", line: "" }];
      case "character": {
        const l = decodeLook(this.host.look());
        return [...LOOK_FIELDS.map((f) => ({ id: `look:${f.key}`, label: f.label, line: f.options[l[f.key]]?.label ?? "" })), { id: "back", label: "BACK", line: "" }];
      }
      case "wallet":
        return [...walletEntries(this.walletState()).map((e) => ({ ...e, id: `wallet:${e.id}` })), { id: "back", label: "BACK", line: "" }];
      default:
        return [];
    }
  }

  /**
   * Ask the city who is online (Stage 705), with a short timeout, and redraw PLAY's line when it
   * answers. The menu never waits for it: PLAY chosen before the answer (or with none) is LEASE ROW.
   */
  private readPresence(q: URLSearchParams): void {
    const url = playFeedUrl(q);
    if (!url || typeof fetch !== "function") return;
    this.feed = "pending";
    this.presence = fetchPresence(url).then((p) => {
      this.feed = p ? "live" : "unreachable";
      notePlayPresence(p);
      if (this.screen === "main") this.render();
      return p;
    });
  }

  /** PLAY's pick as it stands: the district, how many are there, and where the feed is */
  playPick(): { district: string; online: number; feed: "off" | "pending" | "live" | "unreachable" } {
    return { ...playDistrict(playPresence), feed: this.feed };
  }

  private playInfo(): PlayInfo | null {
    const s = this.host.campaign?.();
    return s ? playInfo(s) : null;
  }

  private walletState(): WalletState {
    return this.host.wallet?.state() ?? walletState(null, false);
  }

  /** Redraw when something the current page shows changed underneath it (the wallet connecting). */
  refresh(): void {
    if (this.screen === "wallet") this.render();
  }

  private render(): void {
    if (this.screen === "cards" || this.screen === "hidden") return;
    // written only when it changed, so the page's $CAPITAL mark is not re-fetched on every key
    const pageHtml = this.screen === "wallet" ? walletHtml(this.walletState()) : "";
    if (pageHtml !== this.pageHtml) (this.root.querySelector(".page") as HTMLElement).innerHTML = this.pageHtml = pageHtml;
    const es = this.entries();
    if (this.cursor >= es.length) this.cursor = 0;
    const list = this.root.querySelector(".list") as HTMLElement;
    list.innerHTML = es.map((e, i) => `<div class="row ${i === this.cursor ? "on" : ""}${e.id === "play" ? " play" : ""}" data-i="${i}"><span class="k">${i === this.cursor ? "▸" : " "}</span><span class="lb">${e.label}${e.icon ? `<img class="cap-mark after" src="${e.icon}" alt="¥" width="64" height="64">` : ""}</span>${adjustable(e.id) ? `<span class="v"><span class="adj" data-adj="-1">[−]</span> ${e.line} <span class="adj" data-adj="1">[+]</span></span>` : ""}</div>`).join("");
    const line = this.root.querySelector(".line") as HTMLElement;
    const cur = es[this.cursor];
    line.textContent = cur && cur.id.startsWith("look:") ? lookLine(wantsTouch()) : cur && !cur.id.startsWith("set:") ? cur.line : cur ? settingsLine(wantsTouch()) : "";
    // the footer names what this screen offers (Stage 163): every screen is a list, so moving and
    // selecting are always there; adjusting and going back are not
    const hint = this.root.querySelector(".ft .hint") as HTMLElement;
    const wants = menuFooter(wantsTouch(), es.some((e) => adjustable(e.id)), this.canBack());
    if (hint.textContent !== wants) hint.textContent = wants;
    const hd = this.root.querySelector(".hd .word") as HTMLElement;
    hd.textContent = this.screen === "pause" ? "PAUSED" : this.screen === "modes" ? "MODES" : this.screen === "wake" ? `${this.pick === "run" ? "THE RUN" : "WAKE"} · PICK A DISTRICT` : this.screen === "settings" ? "SETTINGS" : this.screen === "character" ? "CHARACTER" : this.screen === "wallet" ? "WALLET" : "MELTDOWN";
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.screen === "hidden") return;
    if (this.screen === "cards") {
      if (this.seen && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) this.showMain();
      return;
    }
    const es = this.entries();
    if (e.code === "ArrowDown" || e.code === "KeyS") {
      this.cursor = (this.cursor + 1) % es.length;
      this.host.audio?.uiMove();
      this.render();
    } else if (e.code === "ArrowUp" || e.code === "KeyW") {
      this.cursor = (this.cursor - 1 + es.length) % es.length;
      this.host.audio?.uiMove();
      this.render();
    } else if (e.code === "ArrowLeft" || e.code === "KeyA") this.adjust(-1);
    else if (e.code === "ArrowRight" || e.code === "KeyD") this.adjust(1);
    else if (e.code === "Enter" || e.code === "Space") this.select();
    else if (e.code === "Escape") this.back();
    else return;
    e.preventDefault();
  };

  /** The probe drives the menu with key codes. */
  key(code: string): void {
    this.onKey(new KeyboardEvent("keydown", { code }));
  }

  private adjust(dir: 1 | -1): void {
    const cur = this.entries()[this.cursor];
    if (cur?.id.startsWith("look:")) {
      const key = cur.id.slice(5) as LookField["key"];
      const next = encodeLook(stepLook(decodeLook(this.host.look()), key, dir));
      this.host.setLook(next);
      this.preview?.set(next);
      this.host.audio?.uiMove();
      this.render();
      return;
    }
    if (!cur?.id.startsWith("set:")) return;
    const k = cur.id.slice(4) as keyof Settings;
    const s = stepSetting(this.host.settings, k, dir);
    this.host.settings = s;
    saveSettings(s);
    this.host.applySettings(s);
    this.host.audio?.uiMove();
    this.render();
  }

  /** Whether ESC goes anywhere from here. The main menu is the root: there is nothing behind it. */
  private canBack(): boolean {
    return this.screen === "modes" || this.screen === "wake" || this.screen === "settings" || this.screen === "character" || this.screen === "wallet" || this.screen === "pause";
  }

  private back(): void {
    // no cue for a key that does nothing (Stage 163): the main menu used to answer ESC with the
    // back sound and stay exactly where it was
    if (!this.canBack()) return;
    this.host.audio?.uiBack();
    if (this.screen === "wake") {
      // the district list is a mode's: back is the modes it was picked from
      this.cursor = Math.max(0, MODES.findIndex((m) => m.id === this.pick));
      this.show("modes");
    } else if (this.screen === "modes") {
      this.cursor = MAIN.findIndex((e) => e.id === "modes");
      this.show("main");
    } else if (this.screen === "wallet") this.show("main");
    else if (this.screen === "settings") this.show(this.prev === "pause" ? "pause" : "main");
    else if (this.screen === "character") this.show("main");
    else if (this.screen === "pause") this.choose("resume");
  }

  select(): void {
    const cur = this.entries()[this.cursor];
    if (!cur) return;
    this.host.audio?.uiSelect();
    this.choose(cur.id);
  }

  /** A choice by id: screens switch in place; modes are URLs. Returns the URL a mode would load. */
  choose(id: string): string | null {
    if (id === "back") {
      this.back();
      return null;
    }
    if (id === "modes") {
      this.cursor = 0;
      this.show("modes");
      return null;
    }
    if (id === "play") {
      const url = playUrl(location.href);
      return this.go(url, playLoading(url, this.playInfo()));
    }
    if (id === "wake" || id === "run") {
      this.cursor = 0;
      this.pick = id;
      this.show("wake");
      return null;
    }
    if (id === "settings") {
      this.prev = this.screen === "pause" ? "pause" : "main";
      this.cursor = 0;
      this.show("settings");
      return null;
    }
    if (id === "character") {
      this.cursor = 0;
      this.show("character");
      return null;
    }
    if (id.startsWith("look:")) {
      this.adjust(1);
      return null;
    }
    if (id === "wallet") {
      this.cursor = 0;
      this.show("wallet");
      this.host.wallet?.open();
      return null;
    }
    if (id.startsWith("wallet:")) {
      this.host.wallet?.act(id.slice(7));
      return null;
    }
    if (id.startsWith("set:")) {
      const k = id.slice(4) as keyof Settings;
      if (typeof this.host.settings[k] === "boolean") this.adjust(1);
      return null;
    }
    if (id === "file") {
      this.host.openFile();
      if (this.screen === "pause") this.hide();
      return null;
    }
    if (id === "resume") {
      this.hide();
      this.host.resume();
      return null;
    }
    if (id === "quit") {
      const u = new URL(location.href);
      for (const k of ["net", "mission", "explore", "level", "ai", "mode", "city"]) u.searchParams.delete(k);
      u.searchParams.set("menu", "1");
      u.searchParams.set("crawl", "0");
      return this.go(u.toString(), { kind: "menu", title: "MELTDOWN", line: "BACK TO THE MENU" });
    }
    const url = choiceUrl(id, location.href);
    if (!url) return null;
    this.target = url;
    if (id.startsWith("wake:") || id.startsWith("run:")) {
      // the card is up from the click; the descriptor is written before the page goes, matched or not
      const card = loadingFor(url);
      if (!this.nonav) writeLoading(card);
      showLoading(card);
      // ask the host for the room with space; fall back to the default name when it does not answer
      const run = id.startsWith("run:");
      const level = id.slice(run ? 4 : 5);
      // the host to ask: `?shop=` when given, the built host in production; a dev page without either keeps the default room (no failed fetch in the console)
      const ledger = new URLSearchParams(location.search).get("shop") ?? (HOSTS.build !== "dev" ? HOSTS.ledger : null);
      if (!ledger) {
        if (!this.nonav) location.assign(url);
        return url;
      }
      // the input class rides along: a thumb and a mouse do not share a room that pays (Stage 34)
      this.matched = fetch(`${ledger}/match?district=${level}&mode=${run ? "run" : "wake"}&input=${wantsTouch() ? "touch" : "desk"}`)
        .then((r) => r.json() as Promise<{ room: string; url: string }>)
        .then((m) => {
          const u2 = new URL(url);
          u2.searchParams.set("net", m.url);
          this.target = u2.toString();
          return this.target;
        })
        .catch(() => url)
        .then((t) => {
          if (!this.nonav) location.assign(t);
          return t;
        });
      return url;
    }
    return this.go(url, id === "campaign" ? loadingFor(url, { line: `CAMPAIGN · ${CAMPAIGN_DESK.line}` }) : loadingFor(url));
  }

  /** A trip: the loading card up with the destination, the descriptor written, then the page goes (not under nonav). */
  private go(url: string, card: LoadingDescriptor): string {
    this.target = url;
    travelTo(url, card, { nonav: this.nonav });
    return url;
  }

  view(): MenuView {
    return { matched: !!this.matched, screen: this.screen, card: this.card, cardT: this.cardClock(performance.now()), cardText:(this.root.querySelector(".card") as HTMLElement | null)?.textContent ?? "", cursor: this.cursor, entries: this.entries().map((e) => e.label), settings: { ...this.host.settings }, target: this.target, skippable: this.seen, previewLook: this.preview ? this.preview.look : null, page: (this.root.querySelector(".page") as HTMLElement | null)?.textContent ?? "", line: (this.root.querySelector(".line") as HTMLElement | null)?.textContent ?? "", play: this.playPick() };
  }

  static settingsOf(): Settings {
    return loadSettings();
  }
}
