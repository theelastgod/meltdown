/**
 * The opening crawl: cyan monospace on black, one paragraph typed then held, scanlines
 * flickering over it, a glitch tear between paragraphs, ~35 s, skippable after the first view.
 * Then a hard cut to silence and the MELTDOWN title. It sits over the game (which boots
 * underneath) and hands the first real click to the wake.
 *
 *   ?crawl=1 forces it (headless probes skip it by default); ?crawl=0 never shows it;
 *   ?crawlspeed=<k> runs the schedule k× faster (the probe).
 */
import { CRAWL_TEXT } from "./crawl-text";
import { buildSchedule, crawlAt, crawlDuration, type CrawlState, type Phase } from "./crawl-schedule";
import type { GameAudio } from "./audio";

const SEEN_KEY = "meltdown.crawl.seen";

export interface CrawlView extends CrawlState {
  active: boolean;
  duration: number;
  skippable: boolean;
  seen: boolean;
  speed: number;
  /** the tear's current band offsets (px), for the probe */
  bands: number[];
  hum: boolean;
  titleUp: boolean;
}

export function crawlWanted(q: URLSearchParams): boolean {
  const flag = q.get("crawl");
  if (flag === "0") return false;
  if (flag === "1") return true;
  return !q.has("headless");
}

export class OpeningCrawl {
  readonly root: HTMLDivElement;
  private txt: HTMLDivElement;
  private ghosts: HTMLDivElement[];
  private title: HTMLDivElement;
  private prompt: HTMLDivElement;
  private skipHint: HTMLDivElement;
  private schedule = buildSchedule(CRAWL_TEXT);
  private t = 0;
  private last = 0;
  private state: CrawlState;
  private raf = 0;
  private lastTick = -1;
  private tearsPlayed = 0;
  private bands: number[] = [];
  private humOn = false;
  readonly seen: boolean;
  readonly speed: number;
  active = true;
  /** the probe freezes the clock to photograph a tear; the tear's bands keep moving */
  paused = false;
  private resolve!: () => void;
  readonly finished: Promise<void>;
  onFinish: (() => void) | null = null;

  constructor(private audio: GameAudio | null, speed = 1) {
    this.speed = speed;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    this.seen = seen;
    this.finished = new Promise((r) => (this.resolve = r));
    const root = document.createElement("div");
    root.id = "crawl";
    // the scanline pass is the last child: it lies over the text and the title alike
    root.innerHTML = `<div class="body"><div class="txt"></div><div class="txt g1"></div><div class="txt g2"></div></div><div class="title" hidden><div class="word">MELTDOWN</div><div class="prompt">▲ CLICK TO WAKE</div></div><div class="skip" hidden>[SPACE] SKIP</div><div class="scan"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.txt = root.querySelector(".txt")!;
    this.ghosts = [root.querySelector(".g1")!, root.querySelector(".g2")!];
    this.title = root.querySelector(".title")!;
    this.prompt = root.querySelector(".prompt")!;
    this.skipHint = root.querySelector(".skip")!;
    this.skipHint.hidden = !seen;
    this.state = crawlAt(this.schedule, CRAWL_TEXT, 0);
    root.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.state.done) this.finish(true);
      else this.skip();
    });
    document.addEventListener("keydown", this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (this.state.done) {
      if (e.code === "Space" || e.code === "Enter") this.finish(false);
      return;
    }
    if (e.code === "Space" || e.code === "Escape" || e.code === "Enter") this.skip();
  };

  /** The probe's seek: moves the clock and renders now. */
  seek(t: number): void {
    this.t = Math.max(0, t);
    this.render();
  }

  /** Skippable after the first view: jumps to the cut. */
  skip(): boolean {
    if (!this.seen || this.state.done) return false;
    const cut = this.schedule.find((s) => s.kind === "cut")!;
    this.t = cut.start;
    this.render(); // take effect now, not on the next frame
    return true;
  }

  private frame = (now: number): void => {
    if (!this.active) return;
    // never negative: the first rAF timestamp is the START of the frame in progress, which can
    // predate the performance.now() the constructor stored a moment earlier. seek() has clamped its
    // clock since Stage 12; the frame loop had not, and one backwards step was enough to run the
    // schedule off its front edge.
    const dt = Math.max(0, Math.min(0.25, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) this.t += dt * this.speed;
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private render(): void {
    const prev = this.state;
    const s = crawlAt(this.schedule, CRAWL_TEXT, this.t);
    this.state = s;
    const text = CRAWL_TEXT[s.paragraph] ?? "";
    const shown = s.phase === "cut" || s.phase === "title" ? "" : text.slice(0, s.typed) + (s.phase === "type" ? "▮" : "");
    if (this.txt.textContent !== shown) {
      this.txt.textContent = shown;
      for (const g of this.ghosts) g.textContent = shown.replace("▮", "");
    }
    // the hum runs under the text and stops dead at the cut
    const wantHum = s.phase !== "cut" && s.phase !== "title";
    if (wantHum !== this.humOn) {
      this.humOn = wantHum;
      this.audio?.crawlHum(wantHum);
    }
    if (s.phase === "type" && s.typed !== this.lastTick && s.typed % 2 === 0) {
      this.lastTick = s.typed;
      this.audio?.crawlTick();
    }
    if (s.phase === "tear") {
      if (s.tears + 1 > this.tearsPlayed) {
        this.tearsPlayed = s.tears + 1;
        this.audio?.tear();
      }
      this.tear(true);
    } else if (prev.phase === "tear") this.tear(false);
    const titleUp = s.phase === "title";
    // derived every frame rather than latched once: the branch below is edge-triggered and fires on
    // BOTH transitions, so a hint hidden on the way into the title never came back on the way out.
    const wantHint = this.seen && !titleUp;
    if (this.skipHint.hidden === wantHint) this.skipHint.hidden = !wantHint;
    if (this.title.hidden === titleUp) {
      this.title.hidden = !titleUp;
      this.root.classList.toggle("cut", s.phase === "cut" || titleUp);
      this.root.classList.toggle("titled", titleUp);
      if (titleUp) {
        try {
          localStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* no storage */
        }
        this.prompt.style.opacity = "0";
        setTimeout(() => (this.prompt.style.opacity = "1"), 900 / this.speed);
      }
    } else if (s.phase === "cut" && !this.root.classList.contains("cut")) this.root.classList.add("cut");
  }

  /** The glitch tear: three ghost layers, random horizontal bands shifted apart, chromatic tint. */
  private tear(on: boolean): void {
    this.root.classList.toggle("tearing", on);
    if (!on) {
      this.bands = [];
      for (const g of [this.txt, ...this.ghosts]) {
        g.style.clipPath = "";
        g.style.transform = "";
      }
      return;
    }
    const layers = [this.txt, ...this.ghosts];
    this.bands = [];
    layers.forEach((el, i) => {
      const top = Math.random() * 70;
      const h = 8 + Math.random() * 22;
      const dx = (Math.random() * 2 - 1) * (10 + i * 14);
      this.bands.push(Math.round(dx));
      el.style.clipPath = i === 0 ? `inset(0 0 ${Math.max(0, 100 - top).toFixed(1)}% 0)` : `inset(${top.toFixed(1)}% 0 ${Math.max(0, 100 - top - h).toFixed(1)}% 0)`;
      el.style.transform = `translateX(${dx.toFixed(1)}px)`;
    });
  }

  view(): CrawlView {
    return { ...this.state, active: this.active, duration: crawlDuration(CRAWL_TEXT), skippable: this.seen && !this.state.done, seen: this.seen, speed: this.speed, bands: this.bands.slice(), hum: this.humOn, titleUp: this.state.done };
  }

  /** The title's click: the overlay goes, the wake takes the gesture. */
  finish(fromClick: boolean): void {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("keydown", this.onKey);
    this.audio?.crawlHum(false);
    this.root.remove();
    if (fromClick) {
      this.audio?.resume();
      (document.getElementById("view") as HTMLCanvasElement | null)?.requestPointerLock?.();
    }
    this.onFinish?.();
    this.resolve();
  }
}
