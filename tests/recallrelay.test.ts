/**
 * The host's recall reaches the crew through the real room (Stage 662).
 *
 * Stage 661 sent a recall index over the wire so a guest reads the screen the HOST's testimony
 * produced. CI's server typecheck then failed: `server/campaign-room.ts` rebuilt the terminal event
 * field by field and never copied `recall`, so the room relayed every terminal to the crew with the
 * index stripped and every guest read the plain node while the host read its recall.
 *
 * Stage 661's own co-op test passed throughout, because it called `linesAt` with an index it had
 * computed itself and never went near the room. It proved the function, not the relay — a guard
 * that could not see the thing it guarded. This one sends a real encoded message into a real room
 * from the host's connection and decodes what the room actually sends the guest.
 */
import { describe, expect, it } from "vitest";
import type { Conn } from "../server/room";
import { createCampaignRoom } from "../server/campaign-room";
import { devSeed, MemoryAccountStore } from "../server/accounts";
import { decodeServerMessage, encodeJoin, encodeTerminal, type MissionMsg } from "../shared/net/protocol";
import { linesAt, scriptById } from "../shared/campaign/script";

function fakeConn() {
  const msgs: ReturnType<typeof decodeServerMessage>[] = [];
  const conn: Conn = { send: (buf) => void msgs.push(decodeServerMessage(buf, () => null)), close: () => {} };
  const terminals = () =>
    msgs
      .filter((m) => m?.type === "mission")
      .flatMap((m) => ((m as { mission: MissionMsg }).mission.events ?? []) as { type: string; script?: string; node?: string; recall?: number }[])
      .filter((e) => e.type === "terminal");
  return { conn, msgs, terminals };
}

function join(h: ReturnType<typeof createCampaignRoom>, name: string, account: string) {
  const c = fakeConn();
  h.room.onOpen(c.conn);
  h.room.onMessage(c.conn, encodeJoin(name, "", account, ""));
  return c;
}

const mk = () => createCampaignRoom({ mission: "m2_deadletter_run", accounts: new MemoryAccountStore(devSeed), seed: 5, level: "deadletter_docks" });

describe("the host's recall reaches the crew through the real room", () => {
  it("a guest who joins mid-terminal is handed the host's recall index, not a stripped event", () => {
    const h = mk();
    const host = join(h, "HOST", "sandbox-a");
    // the host's terminal is on m2's opening node, with its first recall open
    h.room.onMessage(host.conn, encodeTerminal({ script: "m2_informant", node: "a", choices: [], picked: null, recall: 1 }));
    const guest = join(h, "GUEST", "sandbox-b");
    const seen = guest.terminals();
    // print whether the guarded path ran at all: no terminal event means the test proved nothing
    expect(seen.length, "the guest was never sent the host's terminal").toBeGreaterThan(0);
    expect(seen[0]!.node).toBe("a");
    expect(seen[0]!.recall, "the room stripped the host's recall index on the way to the crew").toBe(1);
  });

  it("and what the guest renders from it is the host's screen, not its own", () => {
    const h = mk();
    const host = join(h, "HOST", "sandbox-a");
    h.room.onMessage(host.conn, encodeTerminal({ script: "m2_informant", node: "a", choices: [], picked: null, recall: 0 }));
    const guest = join(h, "GUEST", "sandbox-b");
    const ev = guest.terminals()[0]!;
    const node = scriptById("m2_informant")!.nodes.find((n) => n.id === "a")!;
    const rendered = linesAt(node, ev.recall ?? -1);
    expect(rendered).toHaveLength(node.lines.length + 1);
    expect(rendered).not.toEqual(node.lines);
  });

  it("a hostile index is clamped by the decoder before the room ever sees it", () => {
    const h = mk();
    const host = join(h, "HOST", "sandbox-a");
    h.room.onMessage(host.conn, encodeTerminal({ script: "m2_informant", node: "a", choices: [], picked: null, recall: 9999 }));
    const guest = join(h, "GUEST", "sandbox-b");
    const r = guest.terminals()[0]!.recall!;
    expect(r).toBeLessThanOrEqual(7);
    // and an index past the node's recalls renders the plain node, never a crash
    const node = scriptById("m2_informant")!.nodes.find((n) => n.id === "a")!;
    expect(linesAt(node, r)).toEqual(node.lines);
  });
});
