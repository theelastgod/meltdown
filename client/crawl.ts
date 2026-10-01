/**
 * The opening (Stage 691): a trailer, shown once.
 *
 * Until Stage 690 the opening was the crawl: the opening text typed out paragraph by paragraph over
 * black, ~35 s, on every visit (the "only until seen" setting existed and nothing read it). The
 * owner asked for it once, and as a trailer. It is now a 29.6 s cut of the game's Higgsfield footage
 * with the opening text's own lines typed over it, ending on MELTDOWN, then the title and its
 * ▲ CLICK TO WAKE, which hands the first real click to the game booting underneath.
 *
 * It shows on a browser's first visit and never again, unless OPENING TRAILER EVERY VISIT is on.
 * A browser will not play sound before a gesture, so it starts muted: the first click turns the
 * sound on and does not skip. SPACE, ENTER or ESC skip to the title. A phone has no SPACE, so the
 * tap after the sound is up skips. It is marked seen the moment it
 * starts playing, so a reload halfway through does not play it again. It fails soft: a trailer that
 * cannot load or decode goes straight to the title.
 *
 *   ?crawl=1 forces it (headless probes skip it by default); ?crawl=0 never shows it;
 *   ?crawlspeed=<k> plays it k× faster (the probe).
 */
import { TRAILER } from "@shared/assets/video";
import type { GameAudio } from "./audio";
import { wantsTouch } from "./touch";

/** A tap on the trailer. The first one is sound. A phone has no SPACE, so the next tap skips. A keyboard click still only unmutes. */
export function trailerTap(muted: boolean, touch: boolean): "unmute" | "skip" {
  if (muted || !touch) return "unmute";
  return "skip";
}

/** The line under the trailer once sound is on. A phone is not told to press SPACE. */
export function trailerSkipLine(touch: boolean): string {
  return touch ? "TAP TO SKIP" : "[SPACE] SKIP";
}

/** The line under the trailer before the first tap. A phone is not told to press SPACE. */
export function trailerOpenLine(touch: boolean): string {
  return touch ? "TAP FOR SOUND" : "CLICK FOR SOUND · [SPACE] SKIP";
}

const SEEN_KEY = "meltdown.crawl.seen";

export type CrawlPhase = "trailer" | "title";

export interface CrawlView {
  active: boolean;
  phase: CrawlPhase;
  /** seconds into the trailer */
  t: number;
  /** the trailer's length as the browser decoded it (0 until its metadata is in) */
  duration: number;
  done: boolean;
  titleUp: boolean;
  seen: boolean;
  skippable: boolean;
  muted: boolean;
  /** whether the trailer is advancing */
  playing: boolean;
  src: string;
  speed: number;
}

/** whether this browser has already been shown the opening */
export function crawlSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the opening plays on this boot: once per browser, or every visit when the setting asks. */
export function crawlWanted(q: URLSearchParams, seen: boolean = crawlSeen(), everyTime = false): boolean {
  const flag = q.get("crawl");
  if (flag === "0") return false;
  if (flag === "1") return true;
  if (q.has("headless")) return false;
  return !seen || everyTime;
}

export class OpeningCrawl {
  readonly root: HTMLDivElement;
  private video: HTMLVideoElement;
  private title: HTMLDivElement;
  private prompt: HTMLDivElement;
  private hint: HTMLDivElement;
  private phase: CrawlPhase = "trailer";
  readonly seen: boolean;
  readonly speed: number;
  active = true;
  private resolve!: () => void;
  readonly finished: Promise<void>;
  onFinish: (() => void) | null = null;

  constructor(private audio: GameAudio | null, speed = 1) {
    this.speed = speed;
    this.seen = crawlSeen();
    this.finished = new Promise((r) => (this.resolve = r));
    const root = document.createElement("div");
    root.id = "crawl";
    root.innerHTML = `<video class="tv" playsinline muted preload="auto"></video><div class="title" hidden><div class="word">MELTDOWN</div><div class="prompt">▲ CLICK TO WAKE</div></div><div class="skip">CLICK FOR SOUND · [SPACE] SKIP</div><div class="scan"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.video = root.querySelector("video")!;
    this.title = root.querySelector(".title")!;
    this.prompt = root.querySelector(".prompt")!;
    this.hint = root.querySelector(".skip")!;
    this.hint.textContent = trailerOpenLine(wantsTouch());
    const v = this.video;
    v.muted = true;
    v.src = `/video/${TRAILER.file}`;
    v.playbackRate = speed;
    v.addEventListener("playing", () => this.markSeen(), { once: true });
    v.addEventListener("ended", () => this.toTitle());
    v.addEventListener("error", () => this.toTitle());
    void v.play().catch(() => {
      /* refused even muted: the title still waits for the click */
      if (v.paused && v.readyState === 0) this.toTitle();
    });
    root.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.phase === "title") this.finish(true);
      else if (trailerTap(this.video.muted, wantsTouch()) === "skip") this.skip();
      else this.unmute();
    });
    document.addEventListener("keydown", this.onKey);
  }

  private markSeen(): void {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* no storage */
    }
  }

  /** the first gesture: the trailer's own sound comes up, and the game's audio wakes with it */
  private unmute(): void {
    if (!this.video.muted) return;
    this.video.muted = false;
    this.audio?.resume();
    this.hint.textContent = trailerSkipLine(wantsTouch());
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (this.phase === "title") {
      if (e.code === "Space" || e.code === "Enter") this.finish(false);
      return;
    }
    if (e.code === "Space" || e.code === "Escape" || e.code === "Enter") this.skip();
    else this.unmute();
  };

  /** The probe's seek: moves the trailer's clock. */
  seek(t: number): void {
    if (this.phase !== "trailer") return;
    this.video.currentTime = Math.max(0, t);
  }

  set paused(on: boolean) {
    if (on) this.video.pause();
    else if (this.phase === "trailer") void this.video.play().catch(() => undefined);
  }

  get paused(): boolean {
    return this.video.paused;
  }

  /** SPACE, ENTER or ESC: straight to the title. */
  skip(): boolean {
    if (this.phase !== "trailer") return false;
    this.toTitle();
    return true;
  }

  private toTitle(): void {
    if (this.phase === "title" || !this.active) return;
    this.phase = "title";
    this.markSeen();
    this.video.pause();
    this.root.classList.add("titled");
    this.title.hidden = false;
    this.hint.hidden = true;
    this.prompt.style.opacity = "0";
    setTimeout(() => (this.prompt.style.opacity = "1"), 900 / this.speed);
  }

  view(): CrawlView {
    const v = this.video;
    return {
      active: this.active,
      phase: this.phase,
      t: v.currentTime,
      duration: Number.isFinite(v.duration) ? v.duration : 0,
      done: this.phase === "title",
      titleUp: this.phase === "title",
      seen: this.seen,
      skippable: this.phase === "trailer",
      muted: v.muted,
      playing: !v.paused && !v.ended && v.readyState > 2,
      src: v.currentSrc || v.src,
      speed: this.speed,
    };
  }

  /** The title's click: the overlay goes, the wake takes the gesture. */
  finish(fromClick: boolean): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener("keydown", this.onKey);
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.root.remove();
    if (fromClick) {
      this.audio?.resume();
      (document.getElementById("view") as HTMLCanvasElement | null)?.requestPointerLock?.();
    }
    this.onFinish?.();
    this.resolve();
  }
}
