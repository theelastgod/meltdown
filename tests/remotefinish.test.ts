/**
 * Remote players carry their mastery finish.
 *
 * Stage 675 drew a weapon at the rank cap with inlay lines, on the local viewmodel and the local
 * held model. The other players in the room saw the same weapon plain: nothing about a file's
 * mastery reached them. Now the server reads the cap from the file's own record into the identity
 * tag (a bitmask, one bit per weapon), and a remote's held weapon is built with the finish exactly
 * when that tag has it for the weapon in the remote's hand.
 *
 * These drive a real Room, decode what it sent the other client, and measure the strip mesh the
 * remote build path produced against the viewmodels Stage 675 already verified.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Room, type Conn } from "../server/room";
import { MemoryAccountStore } from "../server/accounts";
import { createAccount } from "../shared/progression/account";
import { GATES, MAX_RANK, rankFor, xpForRank, type Mastery } from "../shared/progression/mastery";
import { decodeServerMessage, encodeJoin, type RemotePlayerQ } from "../shared/net/protocol";
import { Btn, withSlot } from "../shared/sim/input";
import { WEAPON_LIST, type WeaponId } from "../shared/weapons/manifest";
import { buildRig, holdRemoteWeapon } from "../client/render/rig";
import { buildViewmodel } from "../client/render/weapons";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0)) / 3;

/** the unlit strip triangles of a viewmodel: what a remote's strip mesh is built from */
const stripTris = (id: WeaponId, mastered: boolean): number => {
  const vm = buildViewmodel(id, mastered);
  let n = 0;
  for (const c of vm.children) if (c instanceof THREE.Mesh && !(c.material instanceof THREE.MeshStandardMaterial)) n += tris(c.geometry);
  return n;
};

/** a weapon's record at `rank`, gates cleared, with the XP that earns exactly that rank */
const ranked = (w: WeaponId, m: Mastery, rank: number, short = 0): void => {
  m.done = GATES.map((g) => `${w}:r${g}`);
  let xp = 0;
  for (let r = 1; r < rank; r++) xp += xpForRank(r);
  m.xp = xp - short;
  m.rank = rankFor(w, m.xp, m.done);
};

const LOADOUT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

function conn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const c: Conn = { send: (buf) => msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  return { c, msgs };
}

/** the last state of player `id` the client was sent */
function seen(msgs: ReturnType<typeof decodeServerMessage>[], id: number): RemotePlayerQ | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.type !== "snapshot") continue;
    const p = m.snapshot.players.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

/** ALPHA's file has the lease-breaker at `rank`; BRAVO's is fresh and claims every finish in its join */
function room(rank: number, short = 0) {
  const store = new MemoryAccountStore(createAccount);
  const fa = store.load("fin-a", "ALPHA");
  ranked("lease_breaker", fa.mastery.lease_breaker, rank, short);
  const r = new Room({ ai: false, seed: 7, level: "drainage_yard", accounts: store, warmupSeconds: 1, roundSeconds: 60 });
  const a = conn();
  r.onOpen(a.c);
  r.onMessage(a.c, encodeJoin("ALPHA", "", "fin-a", LOADOUT));
  const b = conn();
  r.onOpen(b.c);
  // a client cannot claim the finish: the join's identity is read for the moniker and nothing else
  r.onMessage(b.c, encodeJoin("BRAVO", "", "fin-b", LOADOUT, JSON.stringify({ moniker: null, finish: 0xff, skin: 1 })));
  for (let t = 0; t < 4; t++) r.step();
  return { r, a, b, store, fa };
}

/** build a remote's held weapon from a wire view, as the renderer does, and count its strip */
function heldStrip(view: RemotePlayerQ, rig = buildRig(null), strip = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())) {
  holdRemoteWeapon(rig, strip, view.slot, view.tag);
  return { rig, strip, tris: tris(strip.geometry) };
}

const idOf = (slot: number): WeaponId => WEAPON_LIST[slot - 1]!.id;
const bit = (id: WeaponId) => 1 << WEAPON_LIST.findIndex((w) => w.id === id);

describe("remote players carry their mastery finish", () => {
  it("the snapshot a client is sent carries the finish for a weapon the file's record has at the cap, not for one it has not, and never a client's claim", () => {
    const { a, b, fa } = room(MAX_RANK);
    expect(fa.mastery.lease_breaker.rank).toBe(MAX_RANK);
    expect(fa.mastery.shock_baton.rank).toBeLessThan(MAX_RANK);
    const alpha = seen(b.msgs, 1);
    const bravo = seen(a.msgs, 2);
    expect(alpha, "BRAVO was never sent ALPHA").toBeDefined();
    expect(bravo, "ALPHA was never sent BRAVO").toBeDefined();
    // the finish is the tag's sixth segment, base 36, one bit per weapon in rack order
    const segs = alpha!.tag.split(".");
    expect(segs.length, `ALPHA's tag [${alpha!.tag}]`).toBe(6);
    const mask = parseInt(segs[5]!, 36);
    expect(mask & bit("lease_breaker"), "the mastered lease-breaker").not.toBe(0);
    expect(mask & bit("shock_baton"), "the unmastered baton").toBe(0);
    expect(mask).toBe(bit("lease_breaker"));
    // BRAVO claimed a finish and a skin it does not have: its tag carries neither
    expect(bravo!.tag.split(".").length, `BRAVO's tag [${bravo!.tag}]`).toBe(4);
  });

  it("a remote's held weapon is drawn with the finish exactly when that file mastered the weapon in its hand", () => {
    const { r, a, b } = room(MAX_RANK);
    const alpha = seen(b.msgs, 1)!;
    const bravo = seen(a.msgs, 2)!;
    expect(idOf(alpha.slot)).toBe("lease_breaker");
    expect(idOf(bravo.slot)).toBe("lease_breaker");
    const plain = stripTris("lease_breaker", false);
    const fin = stripTris("lease_breaker", true);
    expect(fin - plain).toBe(4 * 12);
    // ALPHA mastered the lease-breaker it holds: its remote strip carries the inlays
    const alphaHeld = heldStrip(alpha);
    expect(alphaHeld.tris, "ALPHA's lease-breaker as BRAVO draws it").toBe(fin);
    // BRAVO holds the same weapon and has not mastered it: plain
    expect(heldStrip(bravo).tris, "BRAVO's lease-breaker as ALPHA draws it").toBe(plain);
    // ALPHA swaps to the baton, which it has not mastered: the same remote, rebuilt plain
    const pa = r.world.players.get(1)!;
    for (let t = 0; t < 40 && idOf(pa.weapon.slot) !== "shock_baton"; t++) {
      r.world.applyInput(pa, { tick: 1000 + t, buttons: withSlot(0, WEAPON_LIST.findIndex((w) => w.id === "shock_baton") + 1), yaw: pa.yaw, pitch: pa.pitch }, { online: true });
      r.step();
    }
    for (let t = 0; t < 4; t++) r.step();
    const swapped = seen(b.msgs, 1)!;
    expect(idOf(swapped.slot)).toBe("shock_baton");
    expect(swapped.tag).toBe(alpha.tag);
    holdRemoteWeapon(alphaHeld.rig, alphaHeld.strip, swapped.slot, swapped.tag);
    expect(tris(alphaHeld.strip.geometry), "ALPHA's baton as BRAVO draws it").toBe(stripTris("shock_baton", false));
    // and back to the lease-breaker: the finish returns
    holdRemoteWeapon(alphaHeld.rig, alphaHeld.strip, alpha.slot, alpha.tag);
    expect(tris(alphaHeld.strip.geometry)).toBe(fin);
    // one strip mesh either way: the finish costs no draw call
    expect(alphaHeld.strip.visible).toBe(true);
  });

  it("a rank-30 landing mid-round reaches the other client, and its remote gains the finish on the same mesh", () => {
    // one hit's XP short of the cap
    const { r, a, b, fa } = room(MAX_RANK, 1);
    expect(fa.mastery.lease_breaker.rank).toBe(MAX_RANK - 1);
    const before = seen(b.msgs, 1)!;
    expect(before.tag.split(".").length, `ALPHA's tag at rank 29 [${before.tag}]`).toBe(4);
    const held = heldStrip(before);
    expect(held.tris).toBe(stripTris("lease_breaker", false));
    const pa = r.world.players.get(1)!;
    const pb = r.world.players.get(2)!;
    pa.pos.x = -20; pa.pos.z = 0; pb.pos.x = -12; pb.pos.z = 0;
    for (let t = 0; t < 300 && fa.mastery.lease_breaker.rank < MAX_RANK; t++) {
      const aim = r.world.aimAt(pa, { x: pb.pos.x, y: pb.pos.y + 0.95, z: pb.pos.z });
      r.world.applyInput(pa, { tick: t, buttons: Btn.Fire, yaw: aim.yaw - (pa.weapon.kickYaw + pa.weapon.patX), pitch: aim.pitch - (pa.weapon.kickPitch + pa.weapon.patY) }, { online: true });
      r.step();
    }
    expect(fa.mastery.lease_breaker.rank).toBe(MAX_RANK);
    for (let t = 0; t < 4; t++) r.step();
    const after = seen(b.msgs, 1)!;
    expect(after.tag, "the others still see ALPHA plain after the cap landed").not.toBe(before.tag);
    expect(parseInt(after.tag.split(".")[5] ?? "0", 36) & bit("lease_breaker")).not.toBe(0);
    expect(holdRemoteWeapon(held.rig, held.strip, after.slot, after.tag)).toBe(true);
    expect(tris(held.strip.geometry)).toBe(stripTris("lease_breaker", true));
    // the same view again changes nothing
    expect(holdRemoteWeapon(held.rig, held.strip, after.slot, after.tag)).toBe(false);
    void a;
  });
});
