/**
 * The glyph: a procedural three-layer mark that is what other Blanks see of
 * you before the city learns your name. It is derived from the file id and
 * grows at the Chapter gates (Depth 10 / 25 / 50). Zero gameplay effect;
 * nothing here reads a stat, and nothing in the sim reads this.
 */

export type LayerKind = "ring" | "spokes" | "orbit" | "shard";

export interface GlyphLayer {
  kind: LayerKind;
  /** spokes / orbit count / shard count */
  n: number;
  /** rotation in radians */
  rot: number;
  /** radius as a fraction of the glyph radius */
  r: number;
  /** stroke weight as a fraction of the glyph radius */
  w: number;
}

export interface Glyph {
  seed: number;
  /** 1 layer at Chapter 0, 2 at Chapter I (Depth 10), 3 at Chapter II (Depth 25) */
  layers: GlyphLayer[];
  /** Chapter III (Depth 50): the outer ring closes — the file is NAMED */
  named: boolean;
  /** hue in degrees, from the seed; the client maps it onto the district palette */
  hue: number;
}

/** FNV-1a over the file id: the seed is stable for the life of the file (and survives a Rewrite). */
export function glyphSeed(accountId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) {
    h ^= accountId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** How many layers a Depth has earned: the Chapter gates are 10, 25, 50. */
export function layersForDepth(depth: number): number {
  return depth >= 25 ? 3 : depth >= 10 ? 2 : 1;
}

const KINDS: LayerKind[] = ["ring", "spokes", "orbit", "shard"];

/** Deterministic: same id + same depth → the same glyph, byte for byte. Layers already earned never change when a new one grows. */
export function glyphFor(accountId: string, depth: number): Glyph {
  const seed = glyphSeed(accountId);
  const rnd = lcg(seed);
  const hue = Math.floor(rnd() * 360);
  const all: GlyphLayer[] = [];
  // three layers are always derived so that layer k is identical whether or not layer k+1 exists yet
  for (let k = 0; k < 3; k++) {
    const kind = KINDS[Math.floor(rnd() * KINDS.length)]!;
    const n = 3 + Math.floor(rnd() * 6);
    const rot = rnd() * Math.PI * 2;
    const r = 0.3 + k * 0.25 + rnd() * 0.12;
    const w = 0.04 + rnd() * 0.05;
    all.push({ kind, n, rot, r, w });
  }
  return { seed, layers: all.slice(0, layersForDepth(depth)), named: depth >= 50, hue };
}

/** Inline SVG for HUD and dossier use. `color` is a CSS colour; the glyph is drawn as strokes only. */
export function glyphSvg(g: Glyph, size: number, color: string): string {
  const R = size / 2;
  const c = R;
  const parts: string[] = [];
  for (const L of g.layers) {
    const r = L.r * R * 0.92;
    const sw = Math.max(1, L.w * R);
    switch (L.kind) {
      case "ring":
        parts.push(`<circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-dasharray="${(r * 0.9).toFixed(2)} ${(r * 0.35).toFixed(2)}" transform="rotate(${((L.rot * 180) / Math.PI).toFixed(1)} ${c} ${c})"/>`);
        break;
      case "spokes": {
        const d: string[] = [];
        for (let i = 0; i < L.n; i++) {
          const a = L.rot + (i / L.n) * Math.PI * 2;
          d.push(`M${(c + Math.cos(a) * r * 0.45).toFixed(2)} ${(c + Math.sin(a) * r * 0.45).toFixed(2)}L${(c + Math.cos(a) * r).toFixed(2)} ${(c + Math.sin(a) * r).toFixed(2)}`);
        }
        parts.push(`<path d="${d.join("")}" stroke="${color}" stroke-width="${sw.toFixed(2)}" fill="none"/>`);
        break;
      }
      case "orbit": {
        const d: string[] = [];
        for (let i = 0; i < L.n; i++) {
          const a = L.rot + (i / L.n) * Math.PI * 2;
          d.push(`<circle cx="${(c + Math.cos(a) * r).toFixed(2)}" cy="${(c + Math.sin(a) * r).toFixed(2)}" r="${(sw * 1.2).toFixed(2)}" fill="${color}"/>`);
        }
        parts.push(d.join(""));
        break;
      }
      case "shard": {
        const pts: string[] = [];
        for (let i = 0; i < L.n; i++) {
          const a = L.rot + (i / L.n) * Math.PI * 2;
          const rr = i % 2 ? r * 0.55 : r;
          pts.push(`${(c + Math.cos(a) * rr).toFixed(2)},${(c + Math.sin(a) * rr).toFixed(2)}`);
        }
        parts.push(`<polygon points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}"/>`);
        break;
      }
    }
  }
  if (g.named) parts.push(`<circle cx="${c}" cy="${c}" r="${(R * 0.96).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${Math.max(1, R * 0.06).toFixed(2)}"/>`);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/** The slice of a 2D canvas context the glyph drawer uses (structural, so the server build needs no DOM lib). */
export interface GlyphCanvas {
  save(): void;
  restore(): void;
  strokeStyle: unknown;
  fillStyle: unknown;
  lineCap: string;
  lineWidth: number;
  beginPath(): void;
  closePath(): void;
  setLineDash(segments: number[]): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
}

/** Draw the glyph onto a 2D canvas (the renderer's over-the-head tags). */
export function drawGlyph(ctx: GlyphCanvas, g: Glyph, cx: number, cy: number, R: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  for (const L of g.layers) {
    const r = L.r * R * 0.92;
    ctx.lineWidth = Math.max(1, L.w * R);
    switch (L.kind) {
      case "ring":
        ctx.beginPath();
        ctx.setLineDash([r * 0.9, r * 0.35]);
        ctx.arc(cx, cy, r, L.rot, L.rot + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      case "spokes":
        ctx.beginPath();
        for (let i = 0; i < L.n; i++) {
          const a = L.rot + (i / L.n) * Math.PI * 2;
          ctx.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.stroke();
        break;
      case "orbit":
        for (let i = 0; i < L.n; i++) {
          const a = L.rot + (i / L.n) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1, L.w * R * 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "shard":
        ctx.beginPath();
        for (let i = 0; i < L.n; i++) {
          const a = L.rot + (i / L.n) * Math.PI * 2;
          const rr = i % 2 ? r * 0.55 : r;
          if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.stroke();
        break;
    }
  }
  if (g.named) {
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.96, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
