/**
 * The CRT menu flow (Stage 13). After the crawl's title: two title cards — "Every mind in Lethe
 * is leased." / "You woke free." — then the menu: WAKE (a district and the public room), CAMPAIGN
 * (the desk), THE OFFICE (the hub), THE RANGE (offline, dummies), FILE, SETTINGS. In play, ESC
 * opens the pause menu (RESUME / SETTINGS / FILE / QUIT TO MENU). Choices are URLs, like district
 * travel: the client reloads with the query that describes the mode.
 *
 *   ?menu=1 forces the flow (headless probes skip it), ?menu=0 never; ?nonav=1 reports the URL a
 *   choice would load instead of loading it (the probe).
 */
import { HUB_LEVEL_ID } from "@shared/sim/hub";
import { LEVEL_INFO } from "@shared/sim/level";
import { HOSTS } from "./config";
import { DEFAULT_SETTINGS, formatSetting, loadSettings, saveSettings, SETTING_LABELS, stepSetting, type Settings } from "./settings";
import type { GameAudio } from "./audio";

export const TITLE_CARDS: readonly string[] = ["Every mind in Lethe is leased.", "You woke free."];
export const CARD_SECONDS = 2.4;
export const CARD_GAP = 0.5;

export type MenuScreen = "cards" | "main" | "wake" | "settings" | "pause" | "hidden";

export interface MenuEntry {
  id: string;
  label: string;
  line: string;
}

const MAIN: MenuEntry[] = [
  { id: "wake", label: "WAKE", line: "the signature mode: flip the nodes, hold the district, beat THE KERNEL's clock" },
  { id: "run", label: "THE RUN", line: "play to earn: carry $CAPITAL claims out of the PvP zone to a gate; die and they drop" },
  { id: "campaign", label: "CAMPAIGN", line: "the desk at the Deadletter Office: fixers, gigs, the seven-mission arc" },
  { id: "office", label: "THE OFFICE", line: "the hub: your file on the wall, the range ghosts, the dossier" },
  { id: "range", label: "THE RANGE", line: "the drainage yard, offline, with dummies" },
  { id: "file", label: "FILE", line: "the Ghostfile: nodes, mastery, stamps, the counter-ledger" },
  { id: "settings", label: "SETTINGS", line: "sensitivity, field of view, volumes, the CRT" },
];

const PAUSE: MenuEntry[] = [
  { id: "resume", label: "RESUME", line: "" },
  { id: "settings", label: "SETTINGS", line: "" },
  { id: "file", label: "FILE", line: "" },
  { id: "quit", label: "QUIT TO MENU", line: "" },
];

export interface MenuView {
  screen: MenuScreen;
  card: number;
  cardText: string;
  cursor: number;
  entries: string[];
  settings: Settings;
  /** the URL the last choice would have loaded (nonav) */
  target: string | null;
  skippable: boolean;
}

export interface MenuHost {
  audio: GameAudio | null;
  settings: Settings;
  applySettings: (s: Settings) => void;
  openFile: () => void;
  /** the pause menu's RESUME: back to the game (pointer lock is the click's) */
  resume: () => void;
  identityLine: () => string;
}

export function menuWanted(q: URLSearchParams): boolean {
  const flag = q.get("menu");
  if (flag === "0") return false;
  if (flag === "1") return true;
  if (q.has("headless")) return false;
  // a deep link (a room, a mission, an explicit level) skips the menu
  return !q.has("net") && !q.has("mission") && !q.has("level") && !q.has("explore");
}

/** The URL a choice loads: the mode as a query, like district travel. */
export function choiceUrl(id: string, base: string, opts: { level?: string; account?: string } = {}): string | null {
  const u = new URL(base);
  for (const k of ["net", "mission", "explore", "level", "ai", "menu", "crawl", "shop", "mode"]) u.searchParams.delete(k);
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
      if (id.startsWith("wake:")) {
        const level = id.slice(5);
        u.searchParams.set("level", level);
        u.searchParams.set("net", `${HOSTS.ws}/room/${HOSTS.publicRoom}-${level}?level=${level}`);
        return u.toString();
      }
      if (id.startsWith("run:")) {
        const level = id.slice(4);
        u.searchParams.set("level", level);
        u.searchParams.set("mode", "run");
        u.searchParams.set("net", `${HOSTS.ws}/room/${HOSTS.publicRoom}-run-${level}?level=${level}&mode=run`);
        return u.toString();
      }
      return null;
  }
}

export class Menu {
  readonly root: HTMLDivElement;
  screen: MenuScreen = "hidden";
  cursor = 0;
  card = -1;
  target: string | null = null;
  private cardTimer = 0;
  private seen: boolean;
  private nonav: boolean;
  private prev: MenuScreen = "main";
  /** which mode the district list serves: the wake or the run */
  private pick: "wake" | "run" = "wake";
  private raf = 0;
  private started = 0;
  onQuit: (() => void) | null = null;

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
    root.innerHTML = `<div class="card"></div><div class="panel"><div class="hd"><span class="word">MELTDOWN</span><span class="who"></span></div><div class="list"></div><div class="line"></div><div class="ft">↑↓ MOVE · ENTER SELECT · ← → ADJUST · ESC BACK · <span class="build">${HOSTS.build}</span></div></div><div class="scan"></div>`;
    document.body.appendChild(root);
    this.root = root;
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

  /** The flow from the top: the two title cards, then the main menu. */
  start(): void {
    this.started = performance.now();
    this.cardStart = 0;
    this.card = 0;
    this.show("cards");
    this.host.audio?.card();
    this.raf = requestAnimationFrame(this.tick);
  }

  private cardStart = 0;
  /** Each card runs its own clock from the frame it appeared, so a slow frame can never skip one. */
  private tick = (now: number): void => {
    if (this.screen !== "cards") return;
    if (!this.cardStart) this.cardStart = now;
    const t = ((now - this.cardStart) / 1000) * this.speed;
    if (t >= CARD_SECONDS + CARD_GAP) {
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
    this.screen = "hidden";
    this.root.hidden = true;
    this.root.className = "";
  }

  private show(screen: MenuScreen): void {
    this.screen = screen;
    this.root.hidden = false;
    this.root.className = screen;
    (this.root.querySelector(".who") as HTMLElement).textContent = this.host.identityLine();
    this.render();
  }

  private entries(): MenuEntry[] {
    switch (this.screen) {
      case "main":
        return MAIN;
      case "pause":
        return PAUSE;
      case "wake":
        return [...LEVEL_INFO.filter((l) => l.kind === "district").map((l) => ({ id: `${this.pick}:${l.id}`, label: l.displayName, line: this.pick === "run" ? `${l.cast.toUpperCase()} cast · PvP zone with two gates · room ${HOSTS.publicRoom}-run-${l.id}` : `${l.cast.toUpperCase()} cast · public room ${HOSTS.publicRoom}-${l.id}` })), { id: "back", label: "BACK", line: "" }];
      case "settings":
        return [...(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((k) => ({ id: `set:${k}`, label: SETTING_LABELS[k], line: formatSetting(this.host.settings, k) })), { id: "back", label: "BACK", line: "" }];
      default:
        return [];
    }
  }

  private render(): void {
    if (this.screen === "cards" || this.screen === "hidden") return;
    const es = this.entries();
    if (this.cursor >= es.length) this.cursor = 0;
    const list = this.root.querySelector(".list") as HTMLElement;
    list.innerHTML = es.map((e, i) => `<div class="row ${i === this.cursor ? "on" : ""}" data-i="${i}"><span class="k">${i === this.cursor ? "▸" : " "}</span><span class="lb">${e.label}</span>${e.id.startsWith("set:") ? `<span class="v"><span class="adj" data-adj="-1">[−]</span> ${e.line} <span class="adj" data-adj="1">[+]</span></span>` : ""}</div>`).join("");
    const line = this.root.querySelector(".line") as HTMLElement;
    const cur = es[this.cursor];
    line.textContent = cur && !cur.id.startsWith("set:") ? cur.line : cur ? "← → adjusts · applied live · kept in this browser" : "";
    const hd = this.root.querySelector(".hd .word") as HTMLElement;
    hd.textContent = this.screen === "pause" ? "PAUSED" : this.screen === "wake" ? `${this.pick === "run" ? "THE RUN" : "WAKE"} · PICK A DISTRICT` : this.screen === "settings" ? "SETTINGS" : "MELTDOWN";
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
    if (!cur?.id.startsWith("set:")) return;
    const k = cur.id.slice(4) as keyof Settings;
    const s = stepSetting(this.host.settings, k, dir);
    this.host.settings = s;
    saveSettings(s);
    this.host.applySettings(s);
    this.host.audio?.uiMove();
    this.render();
  }

  private back(): void {
    this.host.audio?.uiBack();
    if (this.screen === "wake") this.show("main");
    else if (this.screen === "settings") this.show(this.prev === "pause" ? "pause" : "main");
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
      for (const k of ["net", "mission", "explore", "level", "ai", "mode"]) u.searchParams.delete(k);
      u.searchParams.set("menu", "1");
      u.searchParams.set("crawl", "0");
      this.target = u.toString();
      if (!this.nonav) location.assign(this.target);
      return this.target;
    }
    const url = choiceUrl(id, location.href);
    if (!url) return null;
    this.target = url;
    if (!this.nonav) location.assign(url);
    return url;
  }

  view(): MenuView {
    return { screen: this.screen, card: this.card, cardText: (this.root.querySelector(".card") as HTMLElement | null)?.textContent ?? "", cursor: this.cursor, entries: this.entries().map((e) => e.label), settings: { ...this.host.settings }, target: this.target, skippable: this.seen };
  }

  static settingsOf(): Settings {
    return loadSettings();
  }
}
