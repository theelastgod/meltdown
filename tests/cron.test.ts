/**
 * The nightly job's decisions (Stage 57), pure and off the clock.
 *
 * Before this the Worker's cron settled one day (yesterday) and retried nothing; asked the vault to
 * reclaim every old epoch every night forever; and posted the season whose contributors the roll
 * had just erased. None of it had a test because none of it was a function.
 */
import { describe, expect, it } from "vitest";
import { daysToSettle, epochsToReclaim, RECLAIM_AFTER_MS, seasonToPost, SETTLE_WINDOW_DAYS } from "../server/chain/cron";
import type { StoredEpoch } from "../server/chain/prizes-store";
import { emptySeason, rollSeason } from "../shared/endgame/season";
import { seasonIndex } from "../shared/endgame/clock";
import { decodePath } from "../server/path";

const epoch = (n: number, over: Partial<StoredEpoch> = {}): StoredEpoch => ({ epoch: n, kind: "run", period: n, root: "0x00", total: "10", postedAt: 0, leaves: [], ...over });

describe("which days the night settles", () => {
  it("yesterday, always — a quiet day is marked settled so it is not retried", async () => {
    expect(await daysToSettle(100, () => false, () => false)).toEqual([99]);
  });
  it("and an earlier unsettled day in the window, but only when it has units", async () => {
    const settled = new Set([97, 98]);
    const units = new Set([94, 96]);
    expect(await daysToSettle(100, (d) => settled.has(d), (d) => units.has(d))).toEqual([94, 96, 99]);
  });
  it("nothing older than the window, nothing already settled, never today", async () => {
    const days = await daysToSettle(100, (d) => d === 99, () => true);
    expect(days).toEqual([93, 94, 95, 96, 97, 98]);
    expect(days.every((d) => d >= 100 - SETTLE_WINDOW_DAYS && d < 100)).toBe(true);
    expect(await daysToSettle(100, () => true, () => true)).toEqual([]);
  });
  it("the predicates may be asynchronous — the Worker's are D1 reads", async () => {
    expect(await daysToSettle(10, async (d) => d === 9, async (d) => d === 5, 6)).toEqual([5]);
  });
});

describe("which epochs the night reclaims", () => {
  const at = 1_000 * 86_400_000;
  it("old enough, worth something, and not swept before", () => {
    const es = [epoch(1, { postedAt: at - RECLAIM_AFTER_MS }), epoch(2, { postedAt: at - RECLAIM_AFTER_MS + 1 }), epoch(3, { postedAt: 0, total: "0" }), epoch(4, { postedAt: 0, sweptAt: at - 1 })];
    expect(epochsToReclaim(es, at).map((e) => e.epoch)).toEqual([1]);
  });
  it("an empty list is an empty night", () => {
    expect(epochsToReclaim([], at)).toEqual([]);
  });
});

describe("which season the night posts", () => {
  it("the one the roll closed, with the contributors it had — not the fresh season's empty map", () => {
    const now = Date.now();
    const st = emptySeason(seasonIndex(now));
    st.contributors = { "file-a": 3, "file-b": 1 };
    expect(seasonToPost(st)).toBeNull(); // nothing closed yet: nothing to post
    expect(rollSeason(st, now)).toBe(false); // same season: no roll, still nothing to post
    expect(seasonToPost(st)).toBeNull();
    expect(rollSeason(st, now + 28 * 86_400_000)).toBe(true);
    expect(st.season).toBe(seasonIndex(now) + 1);
    expect(st.contributors).toEqual({});
    expect(seasonToPost(st)).toEqual({ season: seasonIndex(now), contributors: { "file-a": 3, "file-b": 1 } });
    // the closed record is a copy: play in the new season does not leak into the old one's prizes
    st.contributors["file-c"] = 5;
    expect(seasonToPost(st)!.contributors).toEqual({ "file-a": 3, "file-b": 1 });
  });
});

describe("a path with a bad escape", () => {
  it("decodes to null rather than throwing out of the Worker", () => {
    expect(decodePath("/file/%E0%A4%A/counter")).toBeNull();
    expect(decodePath("/file/a%20b/counter")).toBe("/file/a b/counter");
    expect(decodePath("/plain")).toBe("/plain");
  });
});
