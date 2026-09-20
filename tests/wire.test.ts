/**
 * The wire has a version, and the version has to move when the wire does (Stage 56).
 *
 * Stage 34 changed the input record and the snapshot layout and left PROTOCOL_VERSION at 9, so a
 * browser holding a stale bundle would have passed the version gate and been kicked for
 * "malformed message" — or fed garbage — instead of the clean "protocol 9 != 10" the gate exists
 * to give. These fingerprints are the encoders' bytes for a fixed fixture, paired with the version
 * they were taken at. Change the wire and this fails until PROTOCOL_VERSION is bumped and the
 * fingerprints are re-taken together.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { encodeInputs, encodeJoin, encodeSnapshot, PROTOCOL_VERSION, type NetInput } from "../shared/net/protocol";

const hex = (b: ArrayBuffer) => createHash("sha256").update(Buffer.from(b)).digest("hex").slice(0, 16);

const FIXTURE_INPUTS = [0, 1, 2].map((i) => ({ tick: 100 + i, seq: 10 + i, buttons: i, yaw: 0.5 * i, pitch: -0.1 * i, px: 1.5, py: 0.25, pz: -3, viewTick: 90 + i, viewFrac: 40 * i })) as unknown as NetInput[];
const FIXTURE_SNAPSHOT = { tick: 500, serverTimeMs: 123456, local: null, players: [{ id: 2, name: "B", tag: "t", x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, yaw: 0.1, pitch: 0.2, health: 70, ammo: 12, alive: true, grounded: true, stance: 0, height: 1.8, slot: 1, team: 1, shield: 20 }], dummies: [{ id: 1, x: 0, y: 0, z: 0, alive: true, health: 100 }], entities: [{ kind: 1, id: 7, x: 1, y: 1, z: 1, a: 1, b: 2, c: 3, d: 4 }], match: null, events: [] } as unknown as Parameters<typeof encodeSnapshot>[0];

/** taken at each version the wire has had since this guard existed */
const FINGERPRINTS: Record<number, { inputs: string; snapshot: string; join: string }> = {
  10: { inputs: "30a69bbb14c295b4", snapshot: "7dea40f9d78fe131", join: "092459bcd00d16cd" },
  11: { inputs: "30a69bbb14c295b4", snapshot: "7dea40f9d78fe131", join: "9f10ff65e39ceb05" },
};

describe("the protocol version moves with the wire", () => {
  it("the encoders' bytes for a fixed fixture match the fingerprint taken at PROTOCOL_VERSION", () => {
    const want = FINGERPRINTS[PROTOCOL_VERSION];
    const got = { inputs: hex(encodeInputs(FIXTURE_INPUTS, 77)), snapshot: hex(encodeSnapshot(FIXTURE_SNAPSHOT, null)), join: hex(encodeJoin("N", "", "acct", "{}", "", "s")) };
    expect(want, `no fingerprint for PROTOCOL_VERSION ${PROTOCOL_VERSION}: take one (tests/wire.test.ts) — ${JSON.stringify(got)}`).toBeDefined();
    expect(got, `the wire changed at PROTOCOL_VERSION ${PROTOCOL_VERSION}: bump the version and record the new fingerprint together`).toEqual(want);
  });
  it("the join carries the version it was encoded with", () => {
    expect(new Uint8Array(encodeJoin("N", "", "", ""))[1]).toBe(PROTOCOL_VERSION);
  });
});
