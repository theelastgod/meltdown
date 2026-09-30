/**
 * Deadletter Office dressing: the safehouse renovates itself with the
 * file's Chapters, the trophy wall fills with plaques cut from real match
 * metadata (ledger lines), and the range ghost is a translucent figure.
 * Everything here is render-only and rebuilt whenever the file changes.
 */
import * as THREE from "three";
import { release } from "./dispose";
import type { LevelDef } from "@shared/sim/level";
import type { HubDef } from "@shared/sim/hub";
import { bindPlate, MeshBatch, PALETTE, SignAtlas } from "./city";
import { cloakGeometry } from "./rig";
import { attend, buildFixer, type FixerBody } from "./figures";

export interface HubState {
  chapter: number;
  /** the name on the desk plate at Chapter III (null before) */
  named: string | null;
  /** plaque texts, newest first */
  trophies: string[];
  /** the fixer of the next contract, waiting by the terminal (Stage 667); none for the last, or once the arc is done */
  visitor?: FixerBody | null;
}

/** where the visitor stands: by the terminal, clear of the desk and the bench, facing the door the file comes in by */
export const VISITOR_AT = { x: 1.6, z: -5.0, faceX: 0, faceZ: 3 } as const;

const RENO_COLORS: Record<string, number> = { shelf: 0x2a2f3a, crates: 0x3a3126, rug: 0x2c0f24, server_rack: 0x121a24, nameplate: 0x3a3218, window_glow: 0x0b2a30 };

export class HubDressing {
  readonly group = new THREE.Group();
  private hub: HubDef;
  private key = "";
  readonly ghost: THREE.Group;
  private ghostMat: THREE.MeshBasicMaterial;
  trophyCount = 0;
  renovations = 0;
  /** who is standing in the office, for probes and tests */
  visitor: FixerBody | null = null;
  /** where that figure stands and which way it faces, for the dialogue close-up */
  visitorPose(): { id: FixerBody; x: number; z: number; yaw: number } | null {
    if (!this.visitor || !this.visitorFig) return null;
    return { id: this.visitor, x: this.visitorFig.position.x, z: this.visitorFig.position.z, yaw: this.visitorFig.rotation.y };
  }

  /** Turn the standing fixer to the line. Their placed yaw is where the office sat them. */
  faceVisitor(yaw: number): void {
    if (this.visitorFig) this.visitorFig.rotation.y = yaw;
  }
  private visitorFig: THREE.Group | null = null;

  constructor(private scene: THREE.Scene, level: LevelDef) {
    this.hub = level.hub!;
    scene.add(this.group);
    // the ghost: a translucent cyan figure, additive so it reads through the lane's fog
    this.ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    bindPlate(this.ghostMat, "tex_cloak");
    this.ghost = new THREE.Group();
    // the file's own best run, in the file's own body: the Blank's cloak at rest (Stage 667; it was a capsule and a cone)
    this.ghost.add(new THREE.Mesh(cloakGeometry(null), this.ghostMat));
    this.ghost.visible = false;
    scene.add(this.ghost);
    this.set({ chapter: 0, named: null, trophies: [] });
  }

  /** Rebuild the renovation decor and the trophy wall for this file. */
  set(st: HubState): void {
    const key = `${st.chapter}|${st.named ?? ""}|${st.trophies.join("")}|${st.visitor ?? ""}`;
    if (key === this.key) return;
    this.key = key;
    // the last visitor's materials are its own (its geometry is shared): let them go with it
    for (const c of [...this.group.children]) if (c.name.startsWith("fixer:")) release(c);
    this.group.clear();
    const batch = new MeshBatch(this.group);
    const mats = new Map<string, THREE.Material>();
    const matFor = (tag: string) => {
      let m = mats.get(tag);
      if (!m) {
        m = tag === "window_glow" || tag === "rug" ? new THREE.MeshBasicMaterial({ color: RENO_COLORS[tag] ?? 0x222222 }) : new THREE.MeshStandardMaterial({ color: RENO_COLORS[tag] ?? 0x222222, roughness: 0.8, metalness: tag === "server_rack" ? 0.6 : 0.1, emissive: tag === "server_rack" ? PALETTE.cyan : 0x000000, emissiveIntensity: 0.15 });
        if (tag === "server_rack" && m instanceof THREE.MeshStandardMaterial) bindPlate(m, "tex_server_rack", true);
        else if (tag === "crates" && m instanceof THREE.MeshStandardMaterial) bindPlate(m, "tex_crate");
        else if (tag === "shelf" && m instanceof THREE.MeshStandardMaterial) bindPlate(m, "tex_metal");
        else if (tag === "rug" && m instanceof THREE.MeshBasicMaterial) bindPlate(m, "tex_rug");
        else if (tag === "window_glow" && m instanceof THREE.MeshBasicMaterial) bindPlate(m, "tex_glass");
        else if (tag === "desk" && m instanceof THREE.MeshStandardMaterial) bindPlate(m, "tex_desk");
        else if (tag === "nameplate" && m instanceof THREE.MeshStandardMaterial) bindPlate(m, "tex_nameplate");
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
    // the fixer with work for you, in person
    this.visitor = st.visitor ?? null;
    if (this.visitor) {
      const f = buildFixer(this.visitor);
      f.position.set(VISITOR_AT.x, 0, VISITOR_AT.z);
      // a figure faces -z; turn it toward the door
      f.rotation.y = Math.atan2(-(VISITOR_AT.faceX - VISITOR_AT.x), -(VISITOR_AT.faceZ - VISITOR_AT.z));
      this.group.add(f);
      this.visitorFig = f;
    } else this.visitorFig = null;
  }

  /** the visitor breathes, and turns to the file when it comes near (Stage 672) */
  attendVisitor(dt: number, px: number, pz: number, time: number): void {
    if (this.visitorFig) attend(this.visitorFig, dt, px, pz, time);
  }

  setGhost(pose: { x: number; y: number; z: number; yaw: number } | null): void {
    this.ghost.visible = pose !== null;
    if (pose) {
      this.ghost.position.set(pose.x, pose.y, pose.z);
      this.ghost.rotation.y = pose.yaw;
    }
  }

  dispose(): void {
    release(this.group);
    release(this.ghost);
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
