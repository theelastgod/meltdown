/**
 * Deadletter Office dressing: the safehouse renovates itself with the
 * file's Chapters, the trophy wall fills with plaques cut from real match
 * metadata (ledger lines), and the range ghost is a translucent figure.
 * Everything here is render-only and rebuilt whenever the file changes.
 */
import * as THREE from "three";
import type { LevelDef } from "@shared/sim/level";
import type { HubDef } from "@shared/sim/hub";
import { MeshBatch, PALETTE, SignAtlas } from "./city";
import { MOVE } from "@shared/sim/constants";

export interface HubState {
  chapter: number;
  /** the name on the desk plate at Chapter III (null before) */
  named: string | null;
  /** plaque texts, newest first */
  trophies: string[];
}

const RENO_COLORS: Record<string, number> = { shelf: 0x2a2f3a, crates: 0x3a3126, rug: 0x2c0f24, server_rack: 0x121a24, nameplate: 0x3a3218, window_glow: 0x0b2a30 };

export class HubDressing {
  readonly group = new THREE.Group();
  private hub: HubDef;
  private key = "";
  readonly ghost: THREE.Group;
  private ghostMat: THREE.MeshBasicMaterial;
  trophyCount = 0;
  renovations = 0;

  constructor(private scene: THREE.Scene, level: LevelDef) {
    this.hub = level.hub!;
    scene.add(this.group);
    // the ghost: a translucent cyan figure, additive so it reads through the lane's fog
    this.ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ghost = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(MOVE.capsuleRadius - 0.02, MOVE.standHeight - MOVE.capsuleRadius * 2, 4, 10), this.ghostMat);
    body.position.y = MOVE.standHeight / 2;
    this.ghost.add(body);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(MOVE.capsuleRadius + 0.06, 0.5, 8), this.ghostMat);
    hood.position.y = MOVE.standHeight - 0.05;
    this.ghost.add(hood);
    this.ghost.visible = false;
    scene.add(this.ghost);
    this.set({ chapter: 0, named: null, trophies: [] });
  }

  /** Rebuild the renovation decor and the trophy wall for this file. */
  set(st: HubState): void {
    const key = `${st.chapter}|${st.named ?? ""}|${st.trophies.join("")}`;
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    const batch = new MeshBatch(this.group);
    const mats = new Map<string, THREE.Material>();
    const matFor = (tag: string) => {
      let m = mats.get(tag);
      if (!m) {
        m = tag === "window_glow" || tag === "rug" ? new THREE.MeshBasicMaterial({ color: RENO_COLORS[tag] ?? 0x222222 }) : new THREE.MeshStandardMaterial({ color: RENO_COLORS[tag] ?? 0x222222, roughness: 0.8, metalness: tag === "server_rack" ? 0.6 : 0.1, emissive: tag === "server_rack" ? PALETTE.cyan : 0x000000, emissiveIntensity: 0.15 });
        mats.set(tag, m);
      }
      return m;
    };
    this.renovations = 0;
    for (const r of this.hub.renovation) {
      if (st.chapter >= r.chapter) {
        batch.box(r.box, matFor(r.tag));
        this.renovations++;
      }
    }
    batch.flush();
    // the trophy wall: plaques in a grid, newest top-left; the desk nameplate at Chapter III
    const signs = new SignAtlas();
    const wall = this.hub.wall;
    const cols = 4;
    const pw = wall.w / cols - 0.3;
    const ph = 0.55;
    const rows = Math.max(1, Math.floor(wall.h / (ph + 0.2)));
    const shown = st.trophies.slice(0, cols * rows);
    shown.forEach((text, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = wall.x - wall.w / 2 + pw / 2 + 0.15 + c * (pw + 0.3);
      const y = wall.y + wall.h / 2 - ph / 2 - 0.1 - r * (ph + 0.2);
      const fg = i === 0 ? "#ffe34a" : text.includes("WOKE") ? "#37ff8b" : text.startsWith("STAMP") ? "#35f2ff" : text.startsWith("DEBT") ? "#ff3ec9" : "#ffb02e";
      signs.add({ text, fg, bg: "#0a0c12", border: fg, w: pw, h: ph, x, y, z: wall.z, rotY: wall.rotY });
    });
    this.trophyCount = shown.length;
    if (st.chapter >= 3 && st.named) signs.add({ text: st.named, fg: "#ffe34a", bg: "#1a1206", border: "#ffe34a", w: 1.7, h: 0.3, x: -2.6, y: 1.08, z: -5.88, rotY: 0 });
    signs.flush(this.group);
  }

  setGhost(pose: { x: number; y: number; z: number; yaw: number } | null): void {
    this.ghost.visible = pose !== null;
    if (pose) {
      this.ghost.position.set(pose.x, pose.y, pose.z);
      this.ghost.rotation.y = pose.yaw;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.scene.remove(this.ghost);
  }
}

/** Cut plaques from a file's ledger: matches, Debts, Chapters, stamps, range records. Newest first. */
export function trophiesFromLedger(ledger: readonly string[], max = 16): string[] {
  const out: string[] = [];
  for (let i = ledger.length - 1; i >= 0 && out.length < max; i--) {
    const l = ledger[i]!;
    if (/^MATCH \d+ · (WOKE|LEASED)/.test(l) || l.startsWith("DEBT CLEARED") || l.startsWith("CHAPTER ") || l.startsWith("STAMP · ") || l.startsWith("RANGE · ")) out.push(l.replace(/^STAMP · /, "◆ "));
  }
  return out;
}
