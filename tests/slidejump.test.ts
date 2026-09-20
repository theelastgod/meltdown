/**
 * A slide-jump kill is a kill made during the airborne arc that began as a slide-jump (Stage 179).
 *
 * `KillCtx.shooterSlideJump` used to reconstruct that as `!grounded && slideTime > 0`. `slideTime`
 * is only zeroed on slide entry and on respawn, so from the first slide of a life the flag is just
 * `!grounded`. Measured on a real world: after a slide that ended on its own, a plain jump with
 * `stats.slideJumps === 0` still produced `shooterSlideJump: true`.
 *
 * Clearing `slideTime` on exit is not enough. After a genuine slide-jump it would survive the
 * landing too, and the next plain jump would still be flagged. The fact lives on `fromSlideJump`:
 * set in the slide-jump branch, cleared on landing / mantle / revive.
 */
import { describe, expect, it } from "vitest";
import { World, hashWorld } from "../shared/sim/world";
import { drainageYard } from "../shared/sim/level";
import { Btn } from "../shared/sim/input";
import { respawnPlayer } from "../shared/sim/player";
import { encodeSnapshot, decodeServerMessage } from "../shared/net/protocol";
import { v3 } from "../shared/math/vec3";

const LOADOUT = { primary: "lease_breaker" as const, secondary: "shock_baton" as const, attested: [] as string[], keystone: null };
const SPRINT = Btn.Forward | Btn.Sprint;
const SPAWN = { pos: v3(0, 0, 0), yaw: 0 };

function settled() {
  const w = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
  const p = w.addPlayer(1, "A", 1, LOADOUT);
  const step = (buttons: number) => w.step(new Map([[1, { tick: w.tick, buttons, yaw: 0, pitch: 0 }]]));
  for (let i = 0; i < 30; i++) step(0);
  w.drainEvents();
  return { w, p, step };
}

function slideThenEnd(s: ReturnType<typeof settled>) {
  for (let i = 0; i < 120; i++) s.step(SPRINT);
  s.step(SPRINT | Btn.Crouch);
  expect(s.p.stance, "the slide did not take, so this test proves nothing").toBe("slide");
  for (let i = 0; i < 40; i++) s.step(Btn.Forward);
  const ended = s.w.drainEvents().filter((e) => e.type === "slideEnd" || e.type === "slideJump");
  expect(ended.some((e) => e.type === "slideEnd"), "the slide did not end on its own").toBe(true);
  expect(s.p.stance).not.toBe("slide");
  expect(s.p.stats.slideJumps).toBe(0);
}

function slideJump(s: ReturnType<typeof settled>) {
  for (let i = 0; i < 120; i++) s.step(SPRINT);
  for (let i = 0; i < 6; i++) s.step(SPRINT | Btn.Crouch);
  s.step(SPRINT | Btn.Crouch | Btn.Jump);
  const ev = s.w.drainEvents();
  expect(ev.some((e) => e.type === "slideJump"), "the slide-jump did not fire").toBe(true);
  expect(s.p.stats.slideJumps).toBe(1);
  expect(s.p.grounded).toBe(false);
}

function killInPlace(s: ReturnType<typeof settled>) {
  const d = s.w.spawnDummy({ x: s.p.pos.x, y: s.p.pos.y, z: s.p.pos.z - 3 });
  d.health = 1;
  s.w.applyDamage("dummy", d.id, 50, s.p.id, "lease_breaker", "shot");
  const kill = s.w.drainEvents().find((e) => e.type === "kill");
  expect(kill, "the dummy did not die").toBeDefined();
  if (!kill || kill.type !== "kill") throw new Error("no kill");
  return kill.ctx;
}

describe("slide-jump kills are kills from a slide-jump, not from any jump after a slide", () => {
  it("a plain jump after a finished slide is not a slide-jump kill", () => {
    const s = settled();
    slideThenEnd(s);
    expect(s.p.slideTime, "slideTime was left at the duration of a slide that has already ended").toBe(0);
    for (let i = 0; i < 60; i++) s.step(Btn.Forward);
    s.step(Btn.Jump);
    s.w.drainEvents();
    expect(s.p.grounded).toBe(false);
    expect(s.p.stats.slideJumps).toBe(0);
    expect(s.p.fromSlideJump, "the flag reconstructed itself from leftover slideTime").toBe(false);
    const ctx = killInPlace(s);
    expect(ctx.shooterAir).toBe(true);
    expect(ctx.shooterSlideJump, "an ordinary jump-shot after a slide was credited as a slide-jump kill").toBe(false);
  });

  it("a kill in the air out of a slide-jump is one", () => {
    const s = settled();
    slideJump(s);
    expect(s.p.fromSlideJump).toBe(true);
    const ctx = killInPlace(s);
    expect(ctx.shooterAir).toBe(true);
    expect(ctx.shooterSlideJump).toBe(true);
  });

  it("landing ends the arc: the next plain jump is not a slide-jump kill either", () => {
    const s = settled();
    slideJump(s);
    for (let i = 0; i < 90 && !s.p.grounded; i++) s.step(0);
    expect(s.p.grounded, "never landed").toBe(true);
    expect(s.p.fromSlideJump, "fromSlideJump survived the landing").toBe(false);
    s.step(Btn.Jump);
    s.w.drainEvents();
    expect(s.p.grounded).toBe(false);
    expect(s.p.stats.slideJumps).toBe(1);
    expect(s.p.fromSlideJump).toBe(false);
    const ctx = killInPlace(s);
    expect(ctx.shooterSlideJump, "a plain jump after a real slide-jump was still flagged").toBe(false);
  });

  it("a mantle ends the arc without waiting for a land event", () => {
    const s = settled();
    s.p.pos.x = 0;
    s.p.pos.z = 2;
    for (let i = 0; i < 30; i++) s.step(0);
    for (let i = 0; i < 6; i++) s.step(Btn.Forward);
    s.step(Btn.Forward | Btn.Jump);
    s.w.drainEvents();
    if (s.p.stance !== "mantle") s.p.fromSlideJump = true;
    for (let i = 0; i < 90 && s.p.stance !== "mantle"; i++) s.step(Btn.Forward);
    expect(s.p.stance, "did not mantle the 1.2 m deck").toBe("mantle");
    expect(s.p.fromSlideJump, "a mantle kept the slide-jump flag").toBe(false);
  });
});

describe("fromSlideJump is this life's motion", () => {
  it("a respawn does not carry a slide-jump arc into the next life", () => {
    const s = settled();
    s.p.fromSlideJump = true;
    respawnPlayer(s.p, SPAWN);
    expect(s.p.fromSlideJump).toBe(false);
  });

  it("crosses the wire: exportLocal / importLocal keep the flag", () => {
    const s = settled();
    slideJump(s);
    expect(s.p.fromSlideJump).toBe(true);
    const wire = s.w.exportLocal(s.p, 7);
    expect(wire.fromSlideJump).toBe(1);
    const other = new World(drainageYard(), { ai: false, seed: 3, wakePhase: "off" });
    const q = other.addPlayer(1, "B", 1, LOADOUT);
    expect(q.fromSlideJump).toBe(false);
    other.importLocal(q, wire);
    expect(q.fromSlideJump).toBe(true);
  });

  it("is in the world hash, so two lives that differ only in the flag are not the same world", () => {
    const a = settled();
    const b = settled();
    expect(hashWorld(a.w)).toBe(hashWorld(b.w));
    a.p.fromSlideJump = true;
    expect(hashWorld(a.w), "hashWorld does not see fromSlideJump").not.toBe(hashWorld(b.w));
  });

  it("the snapshot carries the flag in the same place encode and decode agree on", () => {
    const s = settled();
    slideJump(s);
    const local = s.w.exportLocal(s.p, 1);
    expect(local.fromSlideJump).toBe(1);
    const buf = encodeSnapshot({ tick: 1, serverTimeMs: 0, local, players: [], dummies: [], entities: [], match: null, events: [] }, null);
    const msg = decodeServerMessage(buf, () => null);
    expect(msg?.type).toBe("snapshot");
    if (msg && msg.type === "snapshot") {
      expect(msg.snapshot.local?.fromSlideJump, "decode consumed a later field as fromSlideJump").toBe(1);
      expect(msg.snapshot.local?.alive).toBe(1);
      expect(msg.snapshot.local?.grounded).toBe(0);
    }
  });
});

describe("slideTime is the duration of the slide that is happening", () => {
  it("is zero once the slide has ended", () => {
    const s = settled();
    slideThenEnd(s);
    expect(s.p.slideTime).toBe(0);
    expect(s.p.slideCooldown).toBeGreaterThan(0);
  });

  it("is zero after a slide-jump too, so leftover duration cannot reconstruct the flag", () => {
    const s = settled();
    slideJump(s);
    expect(s.p.slideTime).toBe(0);
    expect(s.p.fromSlideJump).toBe(true);
    // the old formula, written out, so a revert of world.ts fails this rather than hiding behind
    // a leftover duration that happens to still be true
    expect(!s.p.grounded && s.p.slideTime > 0).toBe(false);
  });
});

