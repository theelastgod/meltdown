/**
 * The Blank's look (Stage 689): a body, a build, a coat and a shoulder, built on the CHARACTER page.
 *
 * What these hold: every look is a real, distinct cut of the cloth, measured from the geometry the
 * game draws, and none of them buys anything. Every look stays inside the sim's capsule, keeps the
 * hood's height and the floor, keeps its lights on the outside of the cloth and stays inside the
 * triangle budget; the wire carries it for a file and a guest alike, and junk becomes the default.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MOVE } from "../shared/sim/constants";
import { decodeLook, DEFAULT_LOOK, encodeLook, LOOK_COUNT, LOOK_FIELDS, sanitizeLookCode, stepLook, type Look } from "../shared/identity/look";
import { identityTag, parseTag, publicIdentity } from "../shared/identity/identity";
import { BODY_TRIANGLES, BONE, buildRig, cloakGeometry, rigReport, setRigLook, TRIM_TRIANGLES, trimGeometry } from "../client/render/rig";
import { Room, type Conn } from "../server/room";
import { MemoryAccountStore } from "../server/accounts";
import { createAccount } from "../shared/progression/account";
import { decodeServerMessage, encodeJoin, type RemotePlayerQ } from "../shared/net/protocol";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
const code = (l: Partial<Look>) => encodeLook({ ...DEFAULT_LOOK, ...l });
const opt = (key: Look extends never ? never : keyof Look, id: string) => LOOK_FIELDS.find((f) => f.key === key)!.options.findIndex((o) => o.id === id);

/** the widest the cloth reaches across the body (x) in a band of heights, from the vertices the game draws */
function widthAt(g: THREE.BufferGeometry, y0: number, y1: number): number {
  const pos = g.getAttribute("position");
  const idx = g.getAttribute("skinIndex");
  let w = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // the torso's cloth only: arms, legs and the head hang from their own bones (a thigh is on the hips and its leg)
    const a = idx.getX(i), b = idx.getY(i);
    if ((a !== BONE.chest && a !== BONE.hips) || (b !== BONE.chest && b !== BONE.hips)) continue;
    if (y >= y0 && y <= y1) w = Math.max(w, Math.abs(pos.getX(i)));
  }
  return w;
}

describe("the look's code", () => {
  it("every look round-trips, 0 is the Blank as it was, and junk is the default", () => {
    expect(LOOK_COUNT).toBe(LOOK_FIELDS.reduce((n, f) => n * f.options.length, 1));
    const seen = new Set<string>();
    for (let c = 0; c < LOOK_COUNT; c++) {
      const l = decodeLook(c);
      expect(encodeLook(l)).toBe(c);
      seen.add(JSON.stringify(l));
    }
    expect(seen.size).toBe(LOOK_COUNT);
    expect(encodeLook(DEFAULT_LOOK)).toBe(0);
    for (const junk of [-1, LOOK_COUNT, 2.5, "3", null, undefined, {}, NaN]) expect(sanitizeLookCode(junk)).toBe(0);
    // stepping wraps both ways
    const f = LOOK_FIELDS[0]!;
    expect(stepLook(DEFAULT_LOOK, f.key, -1)[f.key]).toBe(f.options.length - 1);
    expect(stepLook(stepLook(DEFAULT_LOOK, f.key, -1), f.key, 1)[f.key]).toBe(0);
  });
});

describe("every look is fair: cloth only", () => {
  const base = cloakGeometry(null, 0);
  const baseY = (() => {
    const p = base.getAttribute("position");
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) (lo = Math.min(lo, p.getY(i))), (hi = Math.max(hi, p.getY(i)));
    return { lo, hi };
  })();

  it("every look stays inside the sim's capsule, on the same floor under the same hood, within the triangle budgets", () => {
    for (let c = 0; c < LOOK_COUNT; c++) {
      const g = cloakGeometry(null, c);
      const p = g.getAttribute("position");
      let r = 0, lo = Infinity, hi = -Infinity;
      for (let i = 0; i < p.count; i++) {
        r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
        lo = Math.min(lo, p.getY(i));
        hi = Math.max(hi, p.getY(i));
      }
      expect(r, `look ${c} reaches ${r.toFixed(3)} m, outside the ${MOVE.capsuleRadius} m capsule`).toBeLessThanOrEqual(MOVE.capsuleRadius);
      expect(hi, `look ${c} changes the hood's height`).toBeCloseTo(baseY.hi, 6);
      expect(lo, `look ${c} changes the floor`).toBeCloseTo(baseY.lo, 6);
      expect(tris(g), `look ${c}`).toBeLessThanOrEqual(BODY_TRIANGLES);
      expect(tris(trimGeometry(c)), `look ${c}`).toBeLessThanOrEqual(TRIM_TRIANGLES);
      const rig = buildRig(null, c);
      expect(rigReport(rig).hoodApex, `look ${c} moves the point the crouch check reads`).toBeCloseTo(rigReport(buildRig(null, 0)).hoodApex, 9);
    }
  });

  it("no look puts a strip-light inside its own cloth", () => {
    // measured against the cloak's own vertices: every coat light sits at or outside the cloth at its height and angle
    for (let c = 0; c < LOOK_COUNT; c++) {
      const cloth = cloakGeometry(null, c).getAttribute("position");
      const trim = trimGeometry(c).getAttribute("position");
      const cl: { phi: number; y: number; rho: number }[] = [];
      for (let i = 0; i < cloth.count; i++) {
        const y = cloth.getY(i);
        if (y < 0.5 || y > 0.985) continue;
        cl.push({ phi: Math.atan2(cloth.getX(i), cloth.getZ(i)), y, rho: Math.hypot(cloth.getX(i), cloth.getZ(i)) });
      }
      let worst = 0;
      for (let i = 0; i < trim.count; i++) {
        const x = trim.getX(i), y = trim.getY(i), z = trim.getZ(i);
        if (y < 0.55 || y > 0.95) continue;
        const rho = Math.hypot(x, z);
        if (rho < 0.12) continue;
        const phi = Math.atan2(x, z);
        let near = 0;
        for (const v of cl) {
          const dphi = Math.abs(Math.atan2(Math.sin(v.phi - phi), Math.cos(v.phi - phi)));
          if (Math.abs(v.y - y) < 0.03 && dphi < 0.12) near = Math.max(near, v.rho);
        }
        worst = Math.max(worst, near - rho);
      }
      expect(worst, `look ${c}: a light sits ${(worst * 1000).toFixed(1)} mm inside the cloth`).toBeLessThan(0.012);
    }
  });
});

describe("every look is its own cut", () => {
  it("a masculine body is broader at the shoulder and a feminine one narrower at the waist and fuller at the hip, than the androgynous", () => {
    const n = cloakGeometry(null, 0);
    const m = cloakGeometry(null, code({ body: opt("body", "masc") }));
    const f = cloakGeometry(null, code({ body: opt("body", "fem") }));
    expect(widthAt(m, 1.3, 1.45)).toBeGreaterThan(widthAt(n, 1.3, 1.45) * 1.04);
    expect(widthAt(f, 1.3, 1.45)).toBeLessThan(widthAt(n, 1.3, 1.45) * 0.96);
    expect(widthAt(f, 0.99, 1.04)).toBeLessThan(widthAt(n, 0.99, 1.04) * 0.93);
    expect(widthAt(f, 0.88, 0.92)).toBeGreaterThan(widthAt(n, 0.88, 0.92) * 1.02);
  });

  it("a slim build is narrower than standard and a heavy one wider, at the waist", () => {
    const s = widthAt(cloakGeometry(null, code({ build: opt("build", "slim") })), 0.99, 1.04);
    const n = widthAt(cloakGeometry(null, 0), 0.99, 1.04);
    const h = widthAt(cloakGeometry(null, code({ build: opt("build", "heavy") })), 0.99, 1.04);
    expect(s).toBeLessThan(n * 0.95);
    expect(h).toBeGreaterThan(n * 1.03);
  });

  it("the short jacket ends above the knee, and its lights end with it", () => {
    const lowest = (g: THREE.BufferGeometry): number => {
      const p = g.getAttribute("position"), idx = g.getAttribute("skinIndex"), w = g.getAttribute("skinWeight");
      let lo = Infinity;
      // the coat is on the hips/chest blend; the legs are on their own bones
      for (let i = 0; i < p.count; i++) if ((idx.getX(i) === BONE.chest || idx.getX(i) === BONE.hips) && (idx.getY(i) === BONE.hips || w.getX(i) > 0.99)) lo = Math.min(lo, p.getY(i));
      return lo;
    };
    const short = code({ coat: opt("coat", "short") });
    expect(lowest(cloakGeometry(null, 0))).toBeLessThan(0.52);
    expect(lowest(cloakGeometry(null, short))).toBeGreaterThan(0.72);
    const trimLow = (c: number): number => {
      const p = trimGeometry(c).getAttribute("position");
      let lo = Infinity;
      // the boot bands sit at 0.23 m: look above them
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.3) lo = Math.min(lo, p.getY(i));
      return lo;
    };
    expect(trimLow(0)).toBeLessThan(0.52);
    expect(trimLow(short)).toBeGreaterThan(0.72);
  });

  it("the shoulder plate sits where the look says: right, left, both or neither", () => {
    const plates = (c: number): { r: boolean; l: boolean } => {
      const p = cloakGeometry(null, c).getAttribute("position");
      let r = false, l = false;
      // the plate is the only cloth out past 0.28 m at the shoulder's height
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < 1.4 || p.getY(i) > 1.5) continue;
        if (p.getX(i) > 0.28) r = true;
        if (p.getX(i) < -0.28) l = true;
      }
      return { r, l };
    };
    expect(plates(code({ kit: opt("kit", "right") }))).toEqual({ r: true, l: false });
    expect(plates(code({ kit: opt("kit", "left") }))).toEqual({ r: false, l: true });
    expect(plates(code({ kit: opt("kit", "both") }))).toEqual({ r: true, l: true });
    expect(plates(code({ kit: opt("kit", "bare") }))).toEqual({ r: false, l: false });
  });

  it("a rig recut to a look draws that look's cloth and lights, with the weapon still in its hand", () => {
    const rig = buildRig("stack_smg", 0);
    const c = code({ body: opt("body", "fem"), coat: opt("coat", "short") });
    expect(setRigLook(rig, c)).toBe(true);
    expect(setRigLook(rig, c)).toBe(false);
    expect(rig.cloak.geometry).toBe(cloakGeometry("stack_smg", c));
    expect(rig.trimMesh.geometry).toBe(trimGeometry(c));
  });
});

describe("the look on the wire", () => {
  it("the tag carries the look, and a look-0 tag is the tag it always was", () => {
    const pi = publicIdentity(null, "GUEST");
    expect(identityTag(pi).split(".")).toHaveLength(4);
    const c = code({ body: 2, build: 1, coat: 1, kit: 3 });
    const withLook = { ...pi, look: c };
    expect(parseTag(identityTag(withLook), "").look).toBe(c);
    expect(parseTag(identityTag({ ...withLook, skin: 3, finish: 5 }), "")).toMatchObject({ look: c, skin: 3, finish: 5 });
    expect(parseTag(identityTag({ ...pi, skin: 3 }), "").look).toBe(0);
    expect(parseTag("0.0.-1.0.0.0.zz", "").look).toBe(0);
  });

  function conn() {
    const msgs: ReturnType<typeof decodeServerMessage>[] = [];
    const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
    return { c, msgs };
  }
  function seen(msgs: ReturnType<typeof decodeServerMessage>[], id: number): RemotePlayerQ | undefined {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.type !== "snapshot") continue;
      const p = m.snapshot.players.find((x) => x.id === id);
      if (p) return p;
    }
    return undefined;
  }
  const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

  it("the room wears the look a file or a guest sent at the join, and the other players see it; junk is the default", () => {
    const c1 = code({ body: 1, build: 2 });
    const c2 = code({ body: 2, coat: 1, kit: 2 });
    const store = new MemoryAccountStore(createAccount);
    const r = new Room({ ai: false, seed: 7, level: "drainage_yard", accounts: store, warmupSeconds: 1, roundSeconds: 60 });
    const a = conn(), b = conn(), g = conn();
    r.onOpen(a.c);
    r.onMessage(a.c, encodeJoin("ALPHA", "", "look-a", LOADOUT, JSON.stringify({ moniker: null, look: c1 })));
    r.onOpen(b.c);
    r.onMessage(b.c, encodeJoin("BRAVO", "", "look-b", LOADOUT, JSON.stringify({ moniker: null, look: "wide" })));
    r.onOpen(g.c);
    r.onMessage(g.c, encodeJoin("GHOST", "", "", LOADOUT, JSON.stringify({ look: c2 })));
    for (let t = 0; t < 4; t++) r.step();
    const ids = (msgs: ReturnType<typeof decodeServerMessage>[]) => {
      for (const m of msgs) if (m?.type === "welcome") return m.playerId;
      return -1;
    };
    const [ia, ib, ig] = [ids(a.msgs), ids(b.msgs), ids(g.msgs)];
    expect(parseTag(seen(b.msgs, ia)?.tag ?? "", "").look).toBe(c1);
    expect(parseTag(seen(a.msgs, ib)?.tag ?? "", "").look).toBe(0);
    expect(parseTag(seen(a.msgs, ig)?.tag ?? "", "").look).toBe(c2);
    // the file keeps it for the next join that sends none
    expect(store.load("look-a", "ALPHA").look).toBe(c1);
  });
});
