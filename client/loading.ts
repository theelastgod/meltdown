/**
 * The loading card: one screen for every trip that reloads the page.
 *
 * A choice on the menu, a district picked off the map, a contract launched or a crew joined all
 * travel the same way: the page reloads with the query that describes where it is going. Until now
 * the click did nothing visible and the reload was a black page until the world was built. Now the
 * caller writes a small descriptor to sessionStorage (`meltdown.loading`: title, line, art, kind) and
 * shows this card at once, so the click answers before the page goes; the next boot reads the
 * descriptor back (or derives one from the URL when there is none, as on a shared link) and shows
 * the same card until the game is actually playable: the world built, a first frame drawn, and, in
 * a room, the room joined. A join that fails does not spin forever: the card shows the link's own
 * error line and lets the player through.
 *
 *   ?loading=1 forces the boot card (headless probes skip it by default); ?loading=0 never shows it.
 */
import { DEFAULT_LEVEL_ID, LEVEL_INFO } from "@shared/sim/level";
import { HUB_LEVEL_ID } from "@shared/sim/hub";
import { WHITE_LEVEL_ID } from "@shared/sim/white";
import { FILE_APARTMENT_ID } from "@shared/sim/apartment";
import { SCRIP_PIT_ID } from "@shared/sim/pit";
import { missionById } from "@shared/campaign/missions";
import { crewCodeFromSocket } from "@shared/net/crew";
import { MISSION_ART } from "./missionart";
import { GIG_ART } from "./gigart";
import { linkStatusLine } from "./hud/room";
import { wantsTouch } from "./touch";

export const LOADING_KEY = "meltdown.loading";

export type LoadingKind = "play" | "mode" | "district" | "mission" | "crew" | "menu";

/** What the card says about where the page is going. */
export interface LoadingDescriptor {
  title: string;
  line: string;
  /** a picture under public/ (district or mission art) */
  art?: string;
  kind: LoadingKind;
}

/** Each place's picture. Districts, the office, the yard, and the white room each have their own card. */
export const LEVEL_ART: Readonly<Record<string, string>> = {
  lease_row: "/districts/lease_row.jpg",
  // Arrival art for the district, separate from the contract illustrations.
  deadletter_docks: "/districts/deadletter_docks.jpg",
  repo_depot: "/districts/repo_depot.jpg",
  // Stage 701's districts, painted for them: the market's lanterns and crowd, the relay towers' dishes
  night_market: "/districts/night_market.jpg",
  relay_heights: "/districts/relay_heights.jpg",
  [HUB_LEVEL_ID]: "/districts/deadletter_office.jpg",
  drainage_yard: "/districts/drainage_yard.jpg",
  [WHITE_LEVEL_ID]: "/districts/white_office.jpg",
};

/** The name a place goes by on the card: the city's name, never the level id. */
export function placeName(level: string): string {
  if (level === HUB_LEVEL_ID) return "THE DEADLETTER OFFICE";
  if (level === WHITE_LEVEL_ID) return "THE WHITE OFFICE";
  if (level === "drainage_yard") return "THE DRAINAGE YARD";
  const l = LEVEL_INFO.find((x) => x.id === level);
  return l ? l.displayName : placeName(DEFAULT_LEVEL_ID);
}

/**
 * The descriptor a URL implies: where it lands and what it is for. The boot uses it when the page
 * was reached without one (a shared link, a bookmark), and the callers start from it and say more.
 */
export function loadingFor(href: string, over: Partial<LoadingDescriptor> = {}): LoadingDescriptor {
  let q: URLSearchParams;
  try {
    q = new URL(href).searchParams;
  } catch {
    q = new URLSearchParams();
  }
  const level = LEVEL_INFO.some((l) => l.id === q.get("level")) || q.get("level") === WHITE_LEVEL_ID ? q.get("level")! : DEFAULT_LEVEL_ID;
  const net = q.get("net");
  const missionId = q.get("mission");
  const mission = missionId ? missionById(missionId) : undefined;
  const crew = crewCodeFromSocket(net);
  let d: LoadingDescriptor;
  if (mission) {
    d = { kind: crew ? "crew" : "mission", title: placeName(mission.level), line: crew ? `CREW ${crew} · ${mission.title}` : `CONTRACT · ${mission.title}`, art: MISSION_ART[mission.id] ?? GIG_ART[mission.id] ?? LEVEL_ART[mission.level] };
  } else if (q.get("mode") === "run") {
    d = { kind: "mode", title: placeName(level), line: "THE RUN · CARRY THE CLAIMS TO A GATE" };
  } else if (q.get("explore") === "1") {
    // ahead of the city: a page can still be carrying city=1 when the player asked for the street
    d = { kind: "district", title: placeName(level), line: "THE STREET · EXPLORE THE DISTRICT" };
  } else if (q.get("mode") === "campaign") {
    // a walk through a city gate (Stage 697) says where it came in from
    const from = q.get("from");
    const via = from && from !== level && LEVEL_INFO.some((l) => l.id === from && l.kind === "district") ? `THE CITY · IN FROM ${placeName(from)}` : "THE CITY · CONTINUE THE CAMPAIGN";
    d = q.get("city") === "1" ? { kind: "play", title: placeName(level), line: via } : { kind: "mode", title: placeName(level), line: "CAMPAIGN · THE DESK: FIXERS, GIGS, THE ARC" };
  } else if (net && /\/room\/audit-/.test(net)) {
    d = { kind: "district", title: placeName(level), line: "THE AUDIT · THIS WEEK'S ROOM" };
  } else if (net) {
    d = { kind: "district", title: placeName(level), line: "WAKE · THE PUBLIC ROOM" };
  } else if (level === FILE_APARTMENT_ID) {
    d = { kind: "mode", title: placeName(level), line: "THE APARTMENT · OFF THE STREET" };
  } else if (level === SCRIP_PIT_ID) {
    d = { kind: "mode", title: placeName(level), line: "THE PIT · ONE DUMMY" };
  } else if (level === "drainage_yard") {
    d = { kind: "mode", title: placeName(level), line: "THE RANGE · OFFLINE, WITH DUMMIES" };
  } else if (level === HUB_LEVEL_ID) {
    d = { kind: "mode", title: placeName(level), line: "THE OFFICE · YOUR FILE ON THE WALL" };
  } else {
    d = { kind: "district", title: placeName(level), line: "THE DISTRICT · OFFLINE" };
  }
  if (!d.art) d.art = LEVEL_ART[level];
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (d as unknown as Record<string, unknown>)[k] = v;
  return d;
}

/** sessionStorage, or null where there is none (a locked-down browser, the unit tests) */
function session(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * A private walk of this district, threat live. The city's flag and its room do not come along:
 * those are the shared streets, and explore is not them. The office has no street of its own, so
 * that page walks Lease Row.
 */
export function explorePageUrl(href: string): string {
  const u = new URL(href);
  if (u.searchParams.get("level") === HUB_LEVEL_ID) u.searchParams.set("level", DEFAULT_LEVEL_ID);
  u.searchParams.set("explore", "1");
  for (const k of ["mission", "city", "net", "back", "from", "gate", "mode"]) u.searchParams.delete(k);
  return u.toString();
}

/** Write the descriptor the next boot reads. Before navigating, always. */
export function writeLoading(d: LoadingDescriptor, store = session()): boolean {
  if (!store) return false;
  try {
    store.setItem(LOADING_KEY, JSON.stringify({ title: d.title, line: d.line, art: d.art, kind: d.kind }));
    return true;
  } catch {
    return false;
  }
}

/** Read the descriptor back, once: it is removed as it is read, so a plain reload later derives its own. */
export function readLoading(store = session()): LoadingDescriptor | null {
  if (!store) return null;
  try {
    const raw = store.getItem(LOADING_KEY);
    store.removeItem(LOADING_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LoadingDescriptor>;
    if (typeof o.title !== "string" || typeof o.line !== "string" || typeof o.kind !== "string") return null;
    return { title: o.title, line: o.line, kind: o.kind as LoadingKind, ...(typeof o.art === "string" && o.art.startsWith("/") ? { art: o.art } : {}) };
  } catch {
    return null;
  }
}

/** Whether the boot shows the card: a trip that wrote one, or a deep link; never under the headless probes unless asked. */
export function bootWanted(q: URLSearchParams, hasDescriptor: boolean, menuWanted: boolean): boolean {
  const flag = q.get("loading");
  if (flag === "0") return false;
  if (flag === "1") return true;
  if (q.has("headless")) return false;
  // the title menu is its own first screen; a trip back to it (QUIT TO MENU) still gets the card
  return hasDescriptor || !menuWanted;
}

export type LoadingStage = "district" | "city" | "link" | "ready";

/** The stages the bar walks through, in order. Offline skips LINKING. */
export const LOADING_STAGES: readonly { id: LoadingStage; label: string }[] = [
  { id: "district", label: "LOADING THE DISTRICT" },
  { id: "city", label: "BUILDING THE CITY" },
  { id: "link", label: "LINKING" },
  { id: "ready", label: "READY" },
];

/** how full the bar is at a stage: a quarter per stage, full at READY */
export function stageProgress(stage: LoadingStage): number {
  return (LOADING_STAGES.findIndex((s) => s.id === stage) + 1) / LOADING_STAGES.length;
}

export function stageLabel(stage: LoadingStage): string {
  return LOADING_STAGES.find((s) => s.id === stage)!.label;
}

/** What the boot knows about the game, read from its real signals. */
export interface BootSignals {
  /** the Game was constructed: world and renderer built */
  built: boolean;
  /** frames actually drawn */
  frames: number;
  /** the page was asked for a room (`?net=`) */
  networked: boolean;
  /** the link as the game has it, or null before (or without) one */
  net: { status: string; reason: string; synced: boolean } | null;
}

/**
 * Where the boot is: the district loading until the world is built, the city building until a frame
 * is drawn, then linking until the room has let the file in and the first exact state arrived.
 * A link that closed or kicked is an error — the line the HUD itself prints for it — not a spinner.
 */
export function bootStage(s: BootSignals): { stage: LoadingStage; error: string | null } {
  if (!s.built) return { stage: "district", error: null };
  if (s.frames < 1) return { stage: "city", error: null };
  if (!s.networked) return { stage: "ready", error: null };
  if (!s.net) return { stage: "link", error: null };
  if (s.net.status === "joined" && s.net.synced) return { stage: "ready", error: null };
  if (s.net.status === "closed" || s.net.status === "kicked") return { stage: "link", error: linkStatusLine(s.net.status, s.net.reason) };
  return { stage: "link", error: null };
}

/**
 * Walk the boot card through the stages the game reports, and take it down when the game is
 * playable. A failed join shows its line and lets the player through; so does a wait past
 * `patience` (a room that never answers is not a reason to hold the screen). A newer trip's card
 * (the room sent the page elsewhere) ends the watch. Returns the stop.
 */
export function watchBoot(card: LoadingCard, read: () => BootSignals, o: { every?: number; patience?: number; now?: () => number } = {}): () => void {
  const gen = card.gen;
  const now = o.now ?? (() => performance.now());
  const since = now();
  const timer = setInterval(() => {
    if (!card.shown || card.gen !== gen) return stop();
    const s = bootStage(read());
    card.setStage(s.stage, s.error);
    if (s.stage === "ready") {
      stop();
      card.hide();
    } else if (!s.error && now() - since > (o.patience ?? 30000)) card.letThrough();
  }, o.every ?? 100);
  const stop = () => clearInterval(timer);
  return stop;
}

/** The one-line tips the card turns through while it waits. */
export const LOADING_TIPS: readonly string[] = [
  "THE PAUSE MENU HOLDS YOUR SETTINGS AND YOUR FILE",
  "YOUR GHOSTFILE KEEPS NODES, MASTERY AND STAMPS BETWEEN ROOMS",
  "THE DISTRICT MAP TRAVELS: EVERY TRIP IS A RELOAD, AND THIS CARD",
  "HOLD A NODE TO FLIP IT · THE KERNEL'S CLOCK DOES NOT WAIT",
  "THE CONTRACTS DESK IS IN THE DEADLETTER OFFICE",
  "A CREW CODE BRINGS A FRIEND INTO YOUR CONTRACT",
  "THE RUN PAYS $CAPITAL · DIE CARRYING AND THE CLAIMS DROP",
  "CLOTH ONLY: EVERY BODY HAS THE SAME HITBOX, EYE HEIGHT AND SPEED",
];
export const TIP_SECONDS = 3.2;

/** The card's state, for the probes: `window.__game.loading()`. */
export interface LoadingView {
  shown: boolean;
  title: string;
  line: string;
  kind: LoadingKind;
  stage: LoadingStage;
  label: string;
  progress: number;
  error: string | null;
  art: string | null;
  tip: string;
  /** a click, a tap or ENTER takes the card down (a failed join, a long wait) */
  through: boolean;
}

/**
 * The card's markup. index.html carries it verbatim in the boot snippet that paints the card from
 * the descriptor before the bundle has even arrived (the reload's first frame); this class adopts
 * that element rather than building a second one.
 */
export const LOADING_HTML = `<img class="art" alt=""><div class="vig"></div><div class="body" role="status" aria-live="polite"><div class="ttl"></div><div class="ln"></div><div class="bar"><i></i></div><div class="st"></div><div class="tip"></div><div class="go" hidden></div></div><div class="scan"></div>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class LoadingCard {
  readonly root: HTMLDivElement;
  desc: LoadingDescriptor = { title: "", line: "", kind: "district" };
  stage: LoadingStage = "district";
  error: string | null = null;
  shown = false;
  /** bumped by every show: a watcher that started before a newer trip stops */
  gen = 0;
  private tip = 0;
  private tipTimer: ReturnType<typeof setInterval> | null = null;
  private dismissable = false;

  constructor() {
    // the boot snippet's card (index.html), already painted: adopt it
    const found = typeof document.getElementById === "function" ? (document.getElementById("loading") as HTMLDivElement | null) : null;
    const pre = found?.dataset.boot === "1" ? found : null;
    const root = pre ?? document.createElement("div");
    if (pre) delete pre.dataset.boot;
    else {
      root.id = "loading";
      root.hidden = true;
      root.innerHTML = LOADING_HTML;
      document.body.appendChild(root);
    }
    this.root = root;
    root.addEventListener("click", () => this.dismissable && this.hide());
    document.addEventListener("keydown", this.onKey);
    this.tip = Math.floor(Math.random() * LOADING_TIPS.length);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.shown || !this.dismissable) return;
    if (e.code === "Enter" || e.code === "Space" || e.code === "Escape") this.hide();
  };

  private q(sel: string): HTMLElement {
    return this.root.querySelector(sel) as HTMLElement;
  }

  show(d: LoadingDescriptor, stage: LoadingStage = "district"): this {
    this.gen++;
    this.desc = { ...d };
    this.shown = true;
    this.dismissable = false;
    this.root.hidden = false;
    this.root.className = `on ${d.kind}`;
    const img = this.q(".art") as HTMLImageElement;
    img.hidden = !d.art;
    if (d.art && img.src !== d.art) {
      img.onerror = () => (img.hidden = true);
      img.src = d.art;
    }
    this.q(".ttl").innerHTML = `<span class="w" data-t="${esc(d.title)}">${esc(d.title)}</span>`;
    this.q(".ln").textContent = d.line;
    this.setStage(stage, null);
    this.turnTip();
    if (!this.tipTimer) this.tipTimer = setInterval(() => this.turnTip(1), TIP_SECONDS * 1000);
    return this;
  }

  private turnTip(step = 0): void {
    this.tip = (this.tip + step) % LOADING_TIPS.length;
    this.q(".tip").textContent = LOADING_TIPS[this.tip]!;
  }

  setStage(stage: LoadingStage, error: string | null = null): void {
    this.stage = stage;
    this.error = error;
    this.q(".st").textContent = error ?? `${stageLabel(stage)}${stage === "ready" ? "" : " …"}`;
    const bar = this.q(".bar i");
    bar.style?.setProperty("width", `${Math.round(stageProgress(stage) * 100)}%`);
    this.root.className = `on ${this.desc.kind}${error ? " err" : ""}`;
    if (error) this.letThrough(error);
  }

  /** a failed join, or a wait that has run long: the player can go on without the card */
  letThrough(why: string | null = null): void {
    if (this.dismissable && !why) return;
    this.dismissable = true;
    const go = this.q(".go");
    go.hidden = false;
    go.textContent = loadingContinueLine(wantsTouch(), !why);
  }

  hide(fade = true): void {
    if (!this.shown) return;
    this.shown = false;
    this.gen++;
    if (this.tipTimer) clearInterval(this.tipTimer);
    this.tipTimer = null;
    document.removeEventListener("keydown", this.onKey);
    this.root.className = `${this.root.className} out`;
    const gone = () => {
      if (this.shown) return;
      this.root.remove();
      if (current === this) current = null;
    };
    if (fade) setTimeout(gone, 450);
    else gone();
  }

  view(): LoadingView {
    return { shown: this.shown, title: this.desc.title, line: this.desc.line, kind: this.desc.kind, stage: this.stage, label: stageLabel(this.stage), progress: stageProgress(this.stage), error: this.error, art: this.desc.art ?? null, tip: LOADING_TIPS[this.tip]!, through: this.dismissable };
  }
}

/** A card that has waited long enough, or failed. A phone has no Enter. */
export function loadingContinueLine(touch: boolean, waiting: boolean): string {
  const how = touch ? "TAP TO CONTINUE" : "CLICK OR PRESS ENTER TO CONTINUE";
  return waiting ? `STILL WAITING · ${how}` : how;
}

let current: LoadingCard | null = null;

/** Show the card (one per page: a second trip retitles the one already up). */
export function showLoading(d: LoadingDescriptor, stage: LoadingStage = "district"): LoadingCard {
  if (!current || !current.shown) {
    current?.hide(false);
    current = new LoadingCard();
  }
  return current.show(d, stage);
}

export function hideLoading(fade = true): void {
  current?.hide(fade);
}

/** The card's state, or null when none is on the page. */
export function loadingView(): LoadingView | null {
  return current ? current.view() : null;
}

/**
 * Every trip goes through here: the descriptor written, the card up, then the page goes. Under
 * `nonav` (the probes) the card still shows and nothing is written or loaded.
 */
export function travelTo(url: string, d: LoadingDescriptor, o: { replace?: boolean; delay?: number; nonav?: boolean } = {}): LoadingCard {
  if (!o.nonav) writeLoading(d);
  const card = showLoading(d);
  if (o.nonav) return card;
  const go = () => (o.replace ? location.replace(url) : location.assign(url));
  if (o.delay) setTimeout(go, o.delay);
  else go();
  return card;
}

// a page brought back from the back/forward cache still has the card it left with: it is a live page again
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) hideLoading(false);
  });
}

/** A frame for the card to be painted in before the boot's synchronous build starts (bounded: a hidden tab gets no frames). */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const once = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(once, 0));
    setTimeout(once, 120);
  });
}
