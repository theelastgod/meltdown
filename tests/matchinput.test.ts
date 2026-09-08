/**
 * A thumb and a mouse do not share a room that pays (Stage 34).
 *
 * Stage 32 shipped the phone build; Stage 34 gave it a rotational aim assist, because a thumb cannot
 * do what a mouse does and mobile is where the audience is. That help is only defensible if the two
 * never meet where the scoreboard pays $CAPITAL — a slowdown one player gets and the other does not
 * is an advantage the moment they share a room.
 *
 * The split is not a weighting or a preference the matchmaker balances. It is the room's *name*: a
 * touch player and a desktop player are handed different strings, and neither host will give out the
 * other's. These cases hold that rule, and hold the one deliberate escape hatch to being an operator
 * switch rather than an automatic fallback.
 */
import { describe, expect, it } from "vitest";
import { inputClassOf, matchRoomName, MAX_PLAYERS_PER_ROOM } from "../shared/net/matchmaking";

const wake = (input: Parameters<typeof matchRoomName>[4], shard = 0, mix = false) => matchRoomName("neochina", "lease_row", "wake", shard, input, mix);
const run = (input: Parameters<typeof matchRoomName>[4], shard = 0, mix = false) => matchRoomName("neochina", "lease_row", "run", shard, input, mix);

describe("the input class is part of the room's name", () => {
  it("a thumb and a mouse are never handed the same room, in either mode", () => {
    expect(wake("touch")).not.toBe(wake("desk"));
    expect(run("touch")).not.toBe(run("desk"));
  });

  it("holds across every fill shard, so a full touch room rolls to another touch room", () => {
    for (let shard = 0; shard < 6; shard++) {
      expect(wake("touch", shard)).not.toBe(wake("desk", shard));
      // …and never collides with a desktop room on some *other* shard either
      for (let other = 0; other < 6; other++) expect(wake("touch", shard)).not.toBe(wake("desk", other));
    }
  });

  it("leaves the desktop room name exactly as it was, so nothing already deployed moves", () => {
    // the split adds a pool; it does not rename the one that exists
    expect(wake("desk")).toBe("neochina-lease_row");
    expect(run("desk")).toBe("neochina-run-lease_row");
    expect(wake("desk", 2)).toBe("neochina-lease_row-3");
  });

  it("keeps the run's own prefix, so a touch run room is still a run room", () => {
    expect(run("touch")).toContain("run-");
    expect(run("touch")).toContain("touch-");
  });
});

describe("reading the class off a request", () => {
  it("takes only the exact string, and treats everything else as desktop", () => {
    expect(inputClassOf("touch")).toBe("touch");
    expect(inputClassOf("desk")).toBe("desk");
    for (const v of [null, undefined, "", "TOUCH", "mobile", "phone", "1", "desk "]) expect(inputClassOf(v)).toBe("desk");
  });

  it("defaults to desktop, which is the pool without the assist", () => {
    // failing open into the *unassisted* pool is the safe direction: an unrecognised client cannot
    // talk its way into the room where everyone else is slowed toward targets
    expect(inputClassOf(undefined)).toBe("desk");
  });
});

describe("the escape hatch is an operator switch, not a per-match fallback", () => {
  it("mixInputs collapses the two pools into one", () => {
    expect(wake("touch", 0, true)).toBe(wake("desk", 0, true));
    expect(run("touch", 0, true)).toBe(run("desk", 0, true));
  });

  it("and when it is off — the default — nothing can put the two together", () => {
    for (let shard = 0; shard < 8; shard++) expect(wake("touch", shard, false)).not.toBe(wake("desk", shard, false));
  });

  it("the room cap is unchanged by any of it", () => {
    expect(MAX_PLAYERS_PER_ROOM).toBe(8);
  });
});
