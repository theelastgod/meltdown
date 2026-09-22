/** The round ended with a line (Stage 121): the card for the results phase. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deathsWord, killsWord, nextRoundLine, nodeSecondsLine, pullsWord, roundCard, roundWinner } from "../client/hud/round";

const stats = { kills: 3, deaths: 1, flips: 2, nodeSeconds: 41.4 };

describe("roundWinner", () => {
  it("is the full wake's winner when there is one", () => {
    expect(roundWinner({ phase: "results", timeLeft: 15, score: [0, 10, 40], winner: 1 })).toBe(1);
  });
  it("is otherwise the cell ahead on the score, or nobody", () => {
    expect(roundWinner({ phase: "results", timeLeft: 15, score: [0, 10, 40], winner: 0 })).toBe(2);
    expect(roundWinner({ phase: "results", timeLeft: 15, score: [0, 40, 10], winner: 0 })).toBe(1);
    expect(roundWinner({ phase: "results", timeLeft: 15, score: [0, 10, 10], winner: 0 })).toBe(0);
  });
});

describe("roundCard", () => {
  it("is nothing outside the results phase", () => {
    expect(roundCard({ phase: "wake", timeLeft: 100, score: [0, 40, 12], winner: 0 }, 1, "DRAINAGE YARD", stats)).toBeNull();
    expect(roundCard({ phase: "warmup", timeLeft: 20, score: [0, 0, 0], winner: 0 }, 1, "DRAINAGE YARD", stats)).toBeNull();
  });
  it("names the cell that woke the district, lays out the score, your line and the countdown", () => {
    const c = roundCard({ phase: "results", timeLeft: 12.4, score: [0, 40, 12], winner: 1 }, 1, "DRAINAGE YARD", stats)!;
    expect(c.title).toBe("ROUND OVER");
    expect(c.lines).toEqual(["CELL ONE WOKE DRAINAGE YARD", "CELL ONE 40 · CELL TWO 12", "YOU · CELL ONE · 3 KILLS · 1 DEATH · 2 PULLS · 41 S ON NODES", "NEXT ROUND IN 13S"]);
    expect(c.color).toBe("cy");
  });
  it("is magenta for the cell that lost and amber when no one woke or you are on no cell", () => {
    expect(roundCard({ phase: "results", timeLeft: 15, score: [0, 40, 12], winner: 1 }, 2, "Z", stats)!.color).toBe("mg");
    const none = roundCard({ phase: "results", timeLeft: 15, score: [0, 10, 10], winner: 0 }, 1, "Z", stats)!;
    expect(none.color).toBe("am");
    expect(none.lines[0]).toBe("NO ONE WOKE Z");
    const spectator = roundCard({ phase: "results", timeLeft: 15, score: [0, 40, 12], winner: 1 }, 0, "Z", stats)!;
    expect(spectator.color).toBe("am");
    expect(spectator.lines).toHaveLength(3);
  });
  it("changes its key as the countdown ticks and not otherwise", () => {
    const a = roundCard({ phase: "results", timeLeft: 12.4, score: [0, 40, 12], winner: 1 }, 1, "Z", stats)!;
    const b = roundCard({ phase: "results", timeLeft: 12.1, score: [0, 40, 12], winner: 1 }, 1, "Z", stats)!;
    const c = roundCard({ phase: "results", timeLeft: 11.9, score: [0, 40, 12], winner: 1 }, 1, "Z", stats)!;
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
  it("never counts below zero", () => {
    expect(roundCard({ phase: "results", timeLeft: -0.3, score: [0, 1, 0], winner: 1 }, 1, "Z", stats)!.lines.at(-1)).toBe("NEXT ROUND IN 0S");
  });

  it("one pull is PULL, not PULLS", () => {
    expect(pullsWord(1)).toBe("1 PULL");
    expect(pullsWord(2)).toBe("2 PULLS");
    expect(pullsWord(0)).toBe("0 PULLS");
    expect(pullsWord(1)).not.toBe("1 PULLS");
    const src = readFileSync(new URL("../client/hud/round.ts", import.meta.url), "utf8");
    expect(src).toMatch(/pullsWord\(stats\.flips\)/);
    expect(src).not.toMatch(/stats\.flips\} PULLS/);
  });

  it("one kill is KILL, not KILLS", () => {
    expect(killsWord(1)).toBe("1 KILL");
    expect(killsWord(3)).toBe("3 KILLS");
    expect(killsWord(0)).toBe("0 KILLS");
    expect(killsWord(1)).not.toBe("1 KILLS");
    const src = readFileSync(new URL("../client/hud/round.ts", import.meta.url), "utf8");
    expect(src).toMatch(/killsWord\(stats\.kills\)/);
    expect(src).not.toMatch(/stats\.kills\} KILLS/);
  });

  it("one death is DEATH, not DEATHS", () => {
    expect(deathsWord(1)).toBe("1 DEATH");
    expect(deathsWord(2)).toBe("2 DEATHS");
    expect(deathsWord(0)).toBe("0 DEATHS");
    expect(deathsWord(1)).not.toBe("1 DEATHS");
    const src = readFileSync(new URL("../client/hud/round.ts", import.meta.url), "utf8");
    expect(src).toMatch(/deathsWord\(stats\.deaths\)/);
    expect(src).not.toMatch(/stats\.deaths\} DEATHS/);
    const probe = readFileSync(new URL("../probe/stage5.ts", import.meta.url), "utf8");
    expect(probe).toMatch(/1 DEATH · 2 PULLS/);
    expect(probe).not.toMatch(/1 DEATHS · 2 PULLS/);
  });

  it("ON NODES suffixes seconds as S, not 41 s", () => {
    expect(nodeSecondsLine(41.4)).toBe("41 S ON NODES");
    expect(nodeSecondsLine(41.4)).not.toBe("41 s ON NODES");
    const src = readFileSync(new URL("../client/hud/round.ts", import.meta.url), "utf8");
    expect(src).toMatch(/nodeSecondsLine\(stats\.nodeSeconds\)/);
    expect(src).not.toMatch(/Math\.round\(stats\.nodeSeconds\)\} s ON NODES/);
    const probe = readFileSync(new URL("../probe/stage5.ts", import.meta.url), "utf8");
    expect(probe).toMatch(/41 S ON NODES/);
    expect(probe).not.toMatch(/41 s ON NODES/);
  });

  it("NEXT ROUND IN suffixes seconds as S, not 13s", () => {
    expect(nextRoundLine(13)).toBe("NEXT ROUND IN 13S");
    expect(nextRoundLine(0)).toBe("NEXT ROUND IN 0S");
    expect(nextRoundLine(13)).not.toBe("NEXT ROUND IN 13s");
    const src = readFileSync(new URL("../client/hud/round.ts", import.meta.url), "utf8");
    expect(src).toMatch(/nextRoundLine\(left\)/);
    expect(src).not.toMatch(/NEXT ROUND IN \$\{left\}s/);
    const probe = readFileSync(new URL("../probe/stage5.ts", import.meta.url), "utf8");
    expect(probe).toMatch(/NEXT ROUND IN 1\[23\]S/);
    expect(probe).not.toMatch(/NEXT ROUND IN 1\[23\]s/);
  });
});
