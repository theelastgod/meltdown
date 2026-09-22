/**
 * The room's readouts (Stage 149): the header line and the right-hand band say the same thing, and
 * what they say is what the net client knows.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINK_BAD_MS, LINK_SLOW_MS, linkLabel, linkStatusLine, linkingSimNote, linkTone, roomLabel, roomName } from "../client/hud/room";

describe("the room's label", () => {
  it("says offline when there is no room, whatever the count says", () => {
    expect(roomLabel(false, 0)).toBe("OFFLINE");
    expect(roomLabel(false, 4)).toBe("OFFLINE");
  });

  it("counts the files in the room, this one included", () => {
    expect(roomLabel(true, 1)).toBe("1 ONLINE");
    expect(roomLabel(true, 2)).toBe("2 ONLINE");
    expect(roomLabel(true, 8)).toBe("8 ONLINE");
  });

  it("never claims fewer than the file reading it", () => {
    expect(roomLabel(true, 0)).toBe("1 ONLINE");
    expect(roomLabel(true, -3)).toBe("1 ONLINE");
  });

  it("takes whole files", () => {
    expect(roomLabel(true, 2.7)).toBe("2 ONLINE");
  });
});

describe("the link's own cost (Stage 154)", () => {
  it("says the round trip in a room, and nothing outside one", () => {
    expect(linkLabel(true, 48)).toBe("48 MS");
    expect(linkLabel(true, 48.4)).toBe("48 MS");
    expect(linkLabel(false, 48)).toBe("");
  });

  it("says nothing before the first sample, rather than claiming a perfect link", () => {
    expect(linkLabel(true, 0)).toBe("");
    expect(linkLabel(true, -1)).toBe("");
    expect(linkLabel(true, Number.NaN)).toBe("");
  });

  it("is worried in proportion", () => {
    expect(linkTone(20)).toBe("ok");
    expect(linkTone(LINK_SLOW_MS - 1)).toBe("ok");
    expect(linkTone(LINK_SLOW_MS)).toBe("slow");
    expect(linkTone(LINK_BAD_MS - 1)).toBe("slow");
    expect(linkTone(LINK_BAD_MS)).toBe("bad");
    expect(linkTone(900)).toBe("bad");
  });

  it("keeps its thresholds in the order a player would read them", () => {
    expect(LINK_SLOW_MS).toBeLessThan(LINK_BAD_MS);
    expect(LINK_SLOW_MS).toBeGreaterThan(0);
  });
});

/**
 * The join line's room (Stage 159). It took the last segment of the socket URL whole, so the run
 * probe's own frame read `LINKED · ROOM run-yard?mode=run&ai=0&level=drainage_yard · FILE #1` and
 * wrapped onto a second line of a log that holds five.
 */
describe("the room's name in the join line", () => {
  it("is the room, not the link it was reached by", () => {
    expect(roomName("ws://127.0.0.1:8787/room/run-yard?mode=run&ai=0&level=drainage_yard")).toBe("run-yard");
    expect(roomName("wss://host/room/wake-run-drainage_yard?level=drainage_yard&mode=run")).toBe("wake-run-drainage_yard");
    expect(roomName("wss://host/room/audit-3020?audit=1&level=lease_row")).toBe("audit-3020");
    expect(roomName("ws://h/room/probe")).toBe("probe");
  });

  it("never carries a query, a fragment or a trailing slash into the log", () => {
    for (const url of [
      "ws://h/room/probe?ai=0&level=x",
      "ws://h/room/probe#frag",
      "ws://h/room/probe/",
      "ws://h/room/probe?",
    ]) {
      expect(roomName(url)).toBe("probe");
    }
  });

  it("is not fooled by a slash inside the query", () => {
    // the query is cut off before the path is split, not after: a query value carrying a slash —
    // another room's URL, a path, a list — would otherwise hand the last segment of *that* to the log
    expect(roomName("ws://h/room/probe?next=ws://other/room/decoy")).toBe("probe");
    expect(roomName("ws://h/room/probe?level=a/b")).toBe("probe");
  });

  it("reads a name the link had to escape, and survives one it cannot", () => {
    expect(roomName("ws://h/room/my%20room?x=1")).toBe("my room");
    expect(roomName("ws://h/room/lease%3Frow")).toBe("lease"); // an escaped ? is a real one once read
    expect(roomName("ws://h/room/100%")).toBe("100%"); // a malformed escape is a name like any other
  });

  it("the RANGE log suffixes seconds as S, not 5.55s", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/RANGE · \$\{run\.seconds\.toFixed\(2\)\}S/);
    expect(src).not.toMatch(/RANGE · \$\{run\.seconds\.toFixed\(2\)\}s/);
    expect(src).toMatch(/BEST \$\{this\.ghost!\.best!\.seconds\.toFixed\(2\)\}S/);
    expect(src).not.toMatch(/BEST \$\{this\.ghost!\.best!\.seconds\.toFixed\(2\)\}s/);
  });

  it("an empty attested list prints NONE, not none", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/attested\.map\(itemName\)\.join\(", "\) \|\| "NONE"/);
    expect(src).not.toMatch(/attested\.map\(itemName\)\.join\(", "\) \|\| "none"/);
  });

  it("THE RUN admit line is CRT, not carry the claims", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/THE RUN · CARRY THE CLAIMS TO A GATE; DIE AND THEY DROP/);
    expect(src).not.toMatch(/THE RUN · carry the claims/);
  });

  it("the private-room admit line is CRT, not the buyer's rules", () => {
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/PRIVATE ROOM · THE BUYER'S RULES AND INVITE LIST · BANKS SCRIP, NEVER \$CAPITAL/);
    expect(src).not.toMatch(/PRIVATE ROOM · the buyer's rules/);
  });

  it("the drop line CRT-cases the kick reason", () => {
    expect(linkStatusLine("closed", "room full")).toBe("LINK CLOSED · ROOM FULL");
    expect(linkStatusLine("closed", "malformed message")).toBe("LINK CLOSED · MALFORMED MESSAGE");
    expect(linkStatusLine("closed", "room full")).not.toBe("LINK CLOSED · room full");
    expect(linkStatusLine("connecting")).toBe("LINK CONNECTING");
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/linkStatusLine\(st, net\.kickReason\)/);
    expect(src).not.toMatch(/net\.kickReason \? " · " \+ net\.kickReason/);
  });

  it("says something rather than nothing when the link names no room", () => {
    for (const url of ["", "ws://h", "ws://h/", "?only=query"]) {
      expect(roomName(url).length).toBeGreaterThan(0);
    }
  });
});

describe("the LINKING sim suffix is CRT", () => {
  it("prints SIM / MS RTT / LOSS, not sim / ms rtt / loss", () => {
    expect(linkingSimNote({ latencyMs: 50, loss: 0.1 })).toBe(" (SIM 100MS RTT, 10% LOSS)");
    expect(linkingSimNote({ latencyMs: 50, loss: 0.1 })).not.toMatch(/sim /);
    expect(linkingSimNote({ latencyMs: 50, loss: 0.1 })).not.toMatch(/rtt/);
    const src = readFileSync(new URL("../client/game.ts", import.meta.url), "utf8");
    expect(src).toMatch(/linkingSimNote\(cfg\.sim\)/);
    expect(src).not.toMatch(/\(sim \$\{cfg\.sim\.latencyMs/);
  });
});
