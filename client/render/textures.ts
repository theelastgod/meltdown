import * as THREE from "three";

/** Deterministic procedural canvas textures. Nearest-filtered for the clip's pixel read. */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function brickTexture(seed = 1, base = "#1b2130", mortar = "#0c0f16"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  const rnd = lcg(seed);
  g.fillStyle = mortar;
  g.fillRect(0, 0, 128, 128);
  const bh = 8;
  const bw = 24;
  for (let y = 0; y < 128; y += bh) {
    const off = (y / bh) % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 128 + bw; x += bw) {
      const v = 0.8 + rnd() * 0.4;
      const rgb = base.match(/[0-9a-f]{2}/g)!.map((h) => Math.min(255, Math.round(parseInt(h, 16) * v)));
      g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
  }
  return finish(c);
}

/** Facade: dark with sparse lit windows. Returns color map and emissive map sharing layout. */
export function facadeTextures(seed: number, litFrac = 0.1): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const w = 64;
  const h = 128;
  const rnd = lcg(seed);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const e = document.createElement("canvas");
  e.width = w;
  e.height = h;
  const g = c.getContext("2d")!;
  const ge = e.getContext("2d")!;
  g.fillStyle = "#0b0e15";
  g.fillRect(0, 0, w, h);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, w, h);
  const cols = ["#35f2ff", "#ffd28a", "#9fd8ff", "#ffb02e", "#35f2ff"];
  for (let y = 6; y < h - 6; y += 16) {
    for (let x = 4; x < w - 4; x += 16) {
      const lit = rnd() < litFrac;
      g.fillStyle = lit ? "#151c28" : "#07090e";
      g.fillRect(x, y, 7, 9);
      if (lit) {
        ge.fillStyle = cols[Math.floor(rnd() * cols.length)]!;
        ge.globalAlpha = 0.25 + rnd() * 0.45;
        ge.fillRect(x, y, 7, 9);
        ge.globalAlpha = 1;
      }
    }
  }
  return { map: finish(c), emissive: finish(e) };
}

/** Pixel signage: text on a colored panel, upscaled nearest so the glyphs stay chunky. */
export function signTexture(text: string, fg: string, bg: string, border: string, w = 128, h = 32): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = border;
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.55)}px "Courier New", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 1);
  return finish(c, false);
}

/** Hazard stripes for kerbs and crates. */
export function hazardTexture(a = "#f2c230", b = "#0b0b0b"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = b;
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = a;
  for (let i = -32; i < 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 8, 0);
    g.lineTo(i + 8 + 32, 32);
    g.lineTo(i + 32, 32);
    g.closePath();
    g.fill();
  }
  return finish(c);
}

/** Corrugated shutter panel. */
export function shutterTexture(tone = "#141a24"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = tone;
  g.fillRect(0, 0, 16, 32);
  g.fillStyle = "#0a0d13";
  for (let y = 0; y < 32; y += 4) g.fillRect(0, y, 16, 1);
  g.fillStyle = "#222a38";
  for (let y = 2; y < 32; y += 4) g.fillRect(0, y, 16, 1);
  return finish(c);
}
