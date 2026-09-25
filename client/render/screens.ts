/**
 * The screens that move (Stage 633).
 *
 * A still plate is uploaded to the GPU once and then costs nothing. A clip is decoded on the CPU
 * every frame it is visible, in the same thread as a sim that owes the player 60 Hz. So this is a
 * pool with a hard ceiling rather than a texture loader: `MAX_LIVE_SCREENS` clips may be decoding
 * at once across the whole process, and the pool refuses to create the next one rather than letting
 * a district with nine shop fronts open nine decoders.
 *
 * Everything here fails soft, in the sense `shared/assets/manifest.ts` means it. A clip that 404s,
 * that the codec cannot take, that autoplay refuses, or that simply has not arrived yet leaves the
 * material exactly as it was — wearing the still plate Stage 632 dealt it. There is no error state
 * a player can see, only a sign that is not moving.
 */
import * as THREE from "three";
import { clipsFor, MAX_LIVE_SCREENS, videoUrl, type ScreenId, type VideoDef } from "../../shared/assets/video";

interface LiveScreen {
  id: string;
  screen: ScreenId;
  el: HTMLVideoElement;
  tex: THREE.VideoTexture;
  mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
  /** the map the material wore before the clip arrived, restored if we ever let it go */
  was: THREE.Texture | null;
  playing: boolean;
}

export interface ScreenStats {
  /** clips that own a decoder right now */
  live: number;
  /** of those, the ones actually advancing */
  playing: number;
  /** clips asked for and refused a slot because the pool was full */
  refused: number;
  /** clips that asked for a slot and could not load, decode, or autoplay */
  failed: number;
  ids: string[];
  /** the newest currentTime of each live clip, so a probe can prove the picture is moving */
  times: number[];
}

export class ScreenPool {
  private live: LiveScreen[] = [];
  private refused = 0;
  private failed = 0;
  private taken = new Set<string>();

  /**
   * Give a material the next clip for its screen family, if the pool has room.
   *
   * Returns immediately; the swap happens when the clip is ready. The material is not touched at
   * all unless a clip actually decodes, which is what keeps the failure path invisible.
   */
  attach(mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial, screen: ScreenId, seed = 0): void {
    if (typeof document === "undefined") return;
    const pool = clipsFor(screen).filter((c) => !this.taken.has(c.id));
    if (pool.length === 0) return;
    if (this.live.length >= MAX_LIVE_SCREENS) {
      this.refused++;
      return;
    }
    const clip = pool[Math.abs(seed) % pool.length]!;
    this.taken.add(clip.id);
    this.open(clip, mat);
  }

  private open(clip: VideoDef, mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial): void {
    const el = document.createElement("video");
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    // a decoder that is never displayed still has to be in the document for some engines to run it
    el.style.display = "none";
    el.src = videoUrl(clip);

    let settled = false;
    const giveUp = (): void => {
      if (settled) return;
      settled = true;
      this.failed++;
      this.taken.delete(clip.id);
      el.removeAttribute("src");
      el.load();
      el.remove();
    };
    // a clip that never arrives must not hold a slot against the ones that would have
    const timer = setTimeout(giveUp, 12000);

    el.onerror = giveUp;
    el.onloadeddata = () => {
      if (settled) return;
      clearTimeout(timer);
      // the pool may have filled while this one was fetching
      if (this.live.length >= MAX_LIVE_SCREENS) {
        this.refused++;
        giveUp();
        return;
      }
      settled = true;
      const tex = new THREE.VideoTexture(el);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const was = mat.map ?? null;
      mat.map = tex;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.emissiveMap = tex;
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.1);
      }
      mat.needsUpdate = true;
      const rec: LiveScreen = { id: clip.id, screen: clip.screen, el, tex, mat, was, playing: false };
      this.live.push(rec);
      void el.play().then(
        () => { rec.playing = true; },
        // autoplay refused: the texture stays, the picture is a still frame, nothing breaks
        () => { rec.playing = false; },
      );
    };
    document.body?.appendChild(el);
  }

  /** Pause what nobody is looking at. A paused decoder costs nothing; a playing one costs a core. */
  setVisible(visible: boolean): void {
    for (const s of this.live) {
      if (visible && !s.playing) void s.el.play().then(() => { s.playing = true; }, () => undefined);
      else if (!visible && s.playing) {
        s.el.pause();
        s.playing = false;
      }
    }
  }

  stats(): ScreenStats {
    return {
      live: this.live.length,
      playing: this.live.filter((s) => s.playing && !s.el.paused).length,
      refused: this.refused,
      failed: this.failed,
      ids: this.live.map((s) => s.id),
      times: this.live.map((s) => +s.el.currentTime.toFixed(3)),
    };
  }

  dispose(): void {
    for (const s of this.live) {
      s.el.pause();
      s.mat.map = s.was;
      if (s.mat instanceof THREE.MeshStandardMaterial) s.mat.emissiveMap = s.was;
      s.mat.needsUpdate = true;
      s.tex.dispose();
      s.el.removeAttribute("src");
      s.el.load();
      s.el.remove();
    }
    this.live = [];
    this.taken.clear();
    this.refused = 0;
    this.failed = 0;
  }
}

/**
 * The one pool.
 *
 * The ceiling is on decoders in the process, not decoders per scene — a district's shop fronts and
 * a safe zone's kiosk are competing for the same cores. A singleton is how that ceiling stays true
 * when two unrelated bits of the renderer both want a screen.
 */
export const screens = new ScreenPool();
