/**
 * What the radar knows (Stage 88).
 *
 * The map in the corner has drawn two things since the first stage: the dummies, and the file at the
 * middle of it. In THE WAKE — the mode the game is named for — it has never drawn the nodes. The
 * strip at the top says who holds each of the eight and says nothing about where they are, so a
 * player crossing the yard with a node coming free has no way to know which way to run.
 *
 * This is the placement rule, pure so it is unit-tested: world positions into the map's own frame,
 * which is rotated so that forward is up, and anything past the edge pinned to the rim rather than
 * dropped — a node you cannot see is exactly the one you need pointing at.
 */

export interface RadarNode {
  id: number;
  label: string;
  pos: { x: number; z: number };
  owner: number;
  contested: boolean;
  puller: number;
}

export interface RadarMark {
  id: number;
  label: string;
  /** canvas pixels */
  x: number;
  y: number;
  /** true when the node is off the map and this mark is pinned to the rim */
  edge: boolean;
  /** how far away it is, in metres */
  distance: number;
  owner: number;
  contested: boolean;
  puller: number;
}

/** the colours the map draws a node in: VANTAGE's violet, the two cells, and amber for a contest */
export const NODE_COLOURS = { vantage: "#8f4dff", one: "#37ff8b", two: "#35f2ff", contested: "#ffb02e" } as const;

export function nodeColour(n: { owner: number; contested: boolean }): string {
  if (n.contested) return NODE_COLOURS.contested;
  return n.owner === 1 ? NODE_COLOURS.one : n.owner === 2 ? NODE_COLOURS.two : NODE_COLOURS.vantage;
}

/**
 * A world offset in the map's own frame. The map turns under the file so that forward is up, which
 * means the file's own basis: `yawRight` across and `viewDir` up the screen. It had been turning the
 * other way since the first stage — a rotation by +yaw where the file's basis is −yaw — so at any
 * heading but due north the marks were mirrored through the forward axis, and facing west put what
 * was behind you at the top of the map (Stage 88).
 */
export function toMap(dx: number, dz: number, yaw: number, scale: number, w: number, h: number): { x: number; y: number } {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const right = dx * cos - dz * sin; // d · yawRight
  const fwd = -dx * sin - dz * cos; // d · viewDir
  return { x: w / 2 + right * scale, y: h / 2 - fwd * scale };
}

/**
 * Where each node goes on the map. `scale` is pixels per metre and the frame is the player's: the
 * map turns under them, so forward is always up. A node further out than the map reaches is pinned
 * to the rim on the same bearing, and says so, so the caller can draw it smaller.
 */
export function nodeMarks(nodes: readonly RadarNode[], at: { x: number; z: number }, yaw: number, scale: number, w: number, h: number, pad = 3): RadarMark[] {
  const cx = w / 2;
  const cy = h / 2;
  const out: RadarMark[] = [];
  for (const n of nodes) {
    const m = toMap(n.pos.x - at.x, n.pos.z - at.z, yaw, scale, w, h);
    let px = m.x;
    let py = m.y;
    const dx = n.pos.x - at.x;
    const dz = n.pos.z - at.z;
    let edge = false;
    if (px < pad || px > w - pad || py < pad || py > h - pad) {
      edge = true;
      // pin it to the rim along its own bearing rather than clamping each axis, which would slide a
      // node round the corner of the map and point at the wrong street
      const vx = px - cx;
      const vy = py - cy;
      const len = Math.hypot(vx, vy) || 1;
      const limit = Math.min((cx - pad) / (Math.abs(vx) / len || 1e-6), (cy - pad) / (Math.abs(vy) / len || 1e-6));
      px = cx + (vx / len) * limit;
      py = cy + (vy / len) * limit;
    }
    out.push({ id: n.id, label: n.label, x: px, y: py, edge, distance: Math.hypot(dx, dz), owner: n.owner, contested: n.contested, puller: n.puller });
  }
  return out;
}
