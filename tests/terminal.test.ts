/**
 * The guest is not a spectator (Stage 52): the host's terminal mirrors to the crew.
 *
 * The wire message is bounded, the co-op room forwards it from the host only, a crew member who
 * joins while the host is mid-terminal gets the open terminal with its first mission message, and
 * a closed terminal is not handed to anyone.
 */
import { describe, expect, it } from "vitest";
import { decodeClientMessage, decodeServerMessage, encodeJoin, encodeTerminal, type TerminalMsg } from "../shared/net/protocol";
import { createCampaignRoom } from "../server/campaign-room";
import { MemoryAccountStore, devSeed } from "../server/accounts";
import type { Conn } from "../server/room";

const KIT = JSON.stringify({ primary: "lease_breaker", secondary: "shock_baton", attested: [] });

describe("the terminal message", () => {
  it("round-trips, and is bounded: four choices at most, text cut, a non-string pick is none", () => {
    const m: TerminalMsg = { script: "m1_intro", node: "a", choices: ["BURN IT", "KEEP IT"], picked: null };
    expect(decodeClientMessage(encodeTerminal(m))).toEqual({ type: "terminal", ...m });
    const big = decodeClientMessage(encodeTerminal({ script: "s".repeat(80), node: "n", choices: ["1", "2", "3", "4", "5"], picked: "p".repeat(400) }));
    expect(big).toMatchObject({ type: "terminal", node: "n" });
    if (big?.type !== "terminal") throw new Error("not a terminal");
    expect(big.script).toHaveLength(48);
    expect(big.choices).toEqual(["1", "2", "3", "4"]);
    expect(big.picked).toHaveLength(160);
    expect((decodeClientMessage(encodeTerminal({ script: "s", node: "", choices: [], picked: 7 as unknown as string })) as { picked: unknown }).picked).toBeNull();
  });
});

/** a connection that keeps what the room sent it, decoded */
function conn(): Conn & { missions: () => { events: { type: string; node?: string }[] }[] } {
  const got: { events: { type: string; node?: string }[] }[] = [];
  return {
    send: (buf) => {
      const m = decodeServerMessage(buf, () => null);
      if (m?.type === "mission") got.push(m.mission as { events: { type: string; node?: string }[] });
    },
    close: () => {},
    missions: () => got,
  };
}

describe("the co-op room mirrors the host's terminal", () => {
  it("forwards the host's terminal to everyone, ignores a guest's, hands an open terminal to a late joiner, and a closed one to nobody", () => {
    const h = createCampaignRoom({ accounts: new MemoryAccountStore(devSeed), mission: "m1_wake_unlisted", ai: false });
    const room = h.room;
    const host = conn();
    room.onOpen(host);
    room.onMessage(host, encodeJoin("HOST", "", "sandbox-host", KIT, ""));
    room.onMessage(host, encodeTerminal({ script: "m1_intro", node: "a", choices: [], picked: null }));
    room.step();
    expect(host.missions().flatMap((m) => m.events).filter((e) => e.type === "terminal").map((e) => e.node)).toEqual(["a"]);

    // a late joiner sees the open terminal in its very first mission message
    const late = conn();
    room.onOpen(late);
    room.onMessage(late, encodeJoin("LATE", "", "sandbox-late", KIT, ""));
    expect(late.missions()[0]?.events.filter((e) => e.type === "terminal").map((e) => e.node)).toEqual(["a"]);

    // a guest's terminal message is not the host's and goes nowhere
    room.onMessage(late, encodeTerminal({ script: "m1_intro", node: "zzz", choices: [], picked: null }));
    room.step();
    expect(host.missions().flatMap((m) => m.events).some((e) => e.type === "terminal" && e.node === "zzz")).toBe(false);

    // the host closes its terminal: everyone hears it, and a joiner after that gets no terminal at all
    room.onMessage(host, encodeTerminal({ script: "m1_intro", node: "", choices: [], picked: "KEEP IT" }));
    room.step();
    expect(late.missions().flatMap((m) => m.events).filter((e) => e.type === "terminal").map((e) => e.node)).toEqual(["a", ""]);
    const later = conn();
    room.onOpen(later);
    room.onMessage(later, encodeJoin("LATER", "", "sandbox-later", KIT, ""));
    expect(later.missions()[0]?.events.filter((e) => e.type === "terminal")).toEqual([]);
  });
});
