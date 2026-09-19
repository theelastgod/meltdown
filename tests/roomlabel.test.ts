/**
 * The room's readouts (Stage 149): the header line and the right-hand band say the same thing, and
 * what they say is what the net client knows.
 */
import { describe, expect, it } from "vitest";
import { LINK_BAD_MS, LINK_SLOW_MS, linkLabel, linkTone, roomLabel } from "../client/hud/room";

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
