/**
 * The line under the crosshair (Stage 157). Its `1 · BLANK` was typed into the HUD's markup at the
 * look stage and never written again, so it named a file that did not exist in the room it was
 * drawn in: the run probe's frame has the header saying ALPHA and the log saying FILE #1, with this
 * line between them saying BLANK.
 */
import { describe, expect, it } from "vitest";
import { BLANK_FILE, footTag, footTagText } from "../client/hud/footline";

describe("the foot line's identity", () => {
  it("says the file's number in the room and what the city calls it", () => {
    expect(footTag(1, "ALPHA")).toEqual({ num: "#1", name: "ALPHA" });
    expect(footTag(7, "BRAVO")).toEqual({ num: "#7", name: "BRAVO" });
  });

  it("calls an unnamed file what the room calls it, never an empty gap", () => {
    for (const nameless of ["", "   ", null as unknown as string, undefined as unknown as string]) {
      expect(footTag(2, nameless).name).toBe(BLANK_FILE);
    }
  });

  it("says a dash rather than a number before the room has given one", () => {
    // offline, or in the seconds before the Welcome lands, there is no file number to print — and
    // `#0` or `#-1` would each be a claim about a seat that does not exist
    for (const none of [-1, 1.5, NaN]) expect(footTag(none, "ALPHA").num).toBe("#—");
    expect(footTag(0, "ALPHA").num).toBe("#0");
  });

  it("changes when either half does, so the cache cannot hold a stale line", () => {
    const first = footTagText(footTag(1, "BLANK"));
    expect(footTagText(footTag(1, "ALPHA"))).not.toBe(first); // the room named the file
    expect(footTagText(footTag(2, "BLANK"))).not.toBe(first); // the file took another seat
  });
});
