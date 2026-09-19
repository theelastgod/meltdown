/**
 * The room's readouts (Stage 149): the header line and the right-hand band say the same thing, and
 * what they say is what the net client knows.
 */
import { describe, expect, it } from "vitest";
import { roomLabel } from "../client/hud/room";

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
