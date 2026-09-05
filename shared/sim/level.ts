import { type Vec3, v3 } from "../math/vec3";

export interface Box {
  min: Vec3;
  max: Vec3;
  /** Semantic tag, used by the renderer for tint and by tests. */
  tag?: string;
}

export interface SpawnPoint {
  pos: Vec3;
  yaw: number;
}

export interface DummyDef {
  id: number;
  pos: Vec3;
  /** Optional patrol endpoint; dummy paces between pos and patrolTo. */
  patrolTo?: Vec3;
}

export interface LevelDef {
  name: string;
  boxes: Box[];
  spawns: SpawnPoint[];
  dummies: DummyDef[];
  /** Kill plane: falling below this respawns the player. */
  killY: number;
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tag?: string): Box => ({
  min: v3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
  max: v3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
  tag,
});

/**
 * Stage 1 grey-box: "Drainage Yard". A 64x64 m arena with a sunken channel,
 * mantle ledges, crates for step-ups, a long sightline for the rifle, and a
 * raised gantry. Layout is authored so the probe can exercise sprint → slide →
 * slide-jump → mantle → kill on one straight-ish run.
 */
export function drainageYard(): LevelDef {
  const boxes: Box[] = [];
  const H = 32; // half extent
  // floor slab
  boxes.push(box(-H, -1, -H, H, 0, H, "floor"));
  // perimeter walls
  boxes.push(box(-H, 0, -H - 1, H, 6, -H, "wall"));
  boxes.push(box(-H, 0, H, H, 6, H + 1, "wall"));
  boxes.push(box(-H - 1, 0, -H, -H, 6, H, "wall"));
  boxes.push(box(H, 0, -H, H + 1, 6, H, "wall"));

  // --- probe lane (runs along -Z from spawn at z=+24) ---
  // low curb for step-up at z=12
  boxes.push(box(-3, 0, 11.6, 3, 0.3, 12.4, "curb"));
  // mantle ledge block (1.2 m) at z=-2..-8 : the landing deck
  boxes.push(box(-4, 0, -8, 4, 1.2, -2, "deck"));
  // second, taller mantle (1.55 m) on top of the deck's far end -> upper deck
  boxes.push(box(-4, 0, -14, 4, 2.7, -8, "upperdeck"));
  // stairs of crates down the west side of the deck
  boxes.push(box(-8, 0, -6, -4.5, 0.4, -3, "crate"));
  boxes.push(box(-8, 0, -9.5, -4.5, 0.8, -6.5, "crate"));

  // --- sunken channel cutting east-west at z = 2..6 (a slide-jump gap) ---
  // The floor is one slab, so model the channel as a pit: replace with rims
  // (we simply leave the floor and mark the channel with kerbs; the gap is
  // represented by the drop into the pit below.)
  boxes.push(box(-H, 0, 5.6, -6, 0.5, 6.4, "kerb"));
  boxes.push(box(6, 0, 5.6, H, 0.5, 6.4, "kerb"));

  // --- east arena: pillars and cover for future PvP ---
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 5;
    boxes.push(box(x - 0.6, 0, -0.6, x + 0.6, 4.5, 0.6, "pillar"));
  }
  boxes.push(box(10, 0, -18, 26, 1.0, -16, "lowwall"));
  boxes.push(box(14, 0, 14, 22, 2.2, 15, "highwall"));
  // gantry (raised walkway) along the east wall
  boxes.push(box(26, 3.2, -26, 30, 3.5, 26, "gantry"));
  boxes.push(box(26, 0, 22, 30, 3.2, 26, "gantrystair"));

  // --- west arena: warehouse blocks ---
  boxes.push(box(-28, 0, -26, -16, 5, -14, "block"));
  boxes.push(box(-28, 0, 10, -18, 3, 22, "block"));
  boxes.push(box(-14, 0, 18, -8, 1.6, 24, "crate"));
  boxes.push(box(-14, 1.6, 21, -11, 2.4, 24, "crate"));

  const spawns: SpawnPoint[] = [
    { pos: v3(0, 0, 24), yaw: 0 },
    { pos: v3(20, 0, 20), yaw: Math.PI / 2 },
    { pos: v3(-20, 0, 0), yaw: -Math.PI / 2 },
    { pos: v3(0, 3.5, -24), yaw: Math.PI },
  ];

  const dummies: DummyDef[] = [
    { id: 1, pos: v3(0, 2.7, -12) }, // on the upper deck, the probe's target
    { id: 2, pos: v3(18, 0, -10), patrolTo: v3(18, 0, 8) },
    { id: 3, pos: v3(-12, 0, -4) },
    { id: 4, pos: v3(6, 0, 18), patrolTo: v3(-6, 0, 18) },
    { id: 5, pos: v3(28, 3.5, 0) },
  ];

  return { name: "drainage_yard", boxes, spawns, dummies, killY: -20 };
}
