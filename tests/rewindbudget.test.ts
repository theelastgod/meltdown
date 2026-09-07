/**
 * The lag-compensation budget is spent before the player shoots (Stage 34).
 *
 * `Room.rewindFor` refuses to rewind further than `MAX_REWIND_TICKS`. That ceiling exists for a good
 * reason — an unbounded rewind lets a client claim to have been looking at any moment it likes — but
 * it has to be larger than what an honest client on a supported connection *needs*, and it is not.
 *
 * A shot's rewind demand is fixed by the protocol, not by the player:
 *
 *   the input takes half the round trip to reach the server        (RTT/2)
 *   and the client was already rendering remotes behind live       (INTERP_DELAY_TICKS)
 *
 * so the server, when it processes the shot, must reach back `RTT/2 + INTERP_DELAY_TICKS` ticks to
 * find the world the shooter was looking at. At the 150 ms this project's own netcode probe
 * advertises as a supported link, that is 10.5 of a 12-tick budget before anything goes wrong.
 *
 * What that costs is measured, not theorised. Under load, as the demand crosses the cap, hit
 * registration collapses in step with the number of shots clamped:
 *
 *   clamped 0-2 of 25   →  88%    (rewind avg 10.9)
 *   clamped 7  of 34    →  50%    (rewind avg 11.7)
 *   clamped 70 of 70    →   9%    (rewind avg 22.8, misses avg 0.93 m)
 *
 * Every one of those misses is a shot whose ray the server then found blocked by level geometry,
 * because it was aimed at where the target had been and the target is no longer there.
 */
import { describe, expect, it } from "vitest";
import { MAX_REWIND_TICKS } from "../shared/net/protocol";
import { INTERP_DELAY_TICKS } from "../client/net/netclient";
import { SIM_HZ } from "../shared/sim/constants";

/** Ticks the server must reach back to find the world a shooter on `rttMs` was looking at. */
function rewindDemand(rttMs: number): number {
  return (rttMs / 2 / 1000) * SIM_HZ + INTERP_DELAY_TICKS;
}

/** The RTT the netcode probe drives, and therefore the link the project claims to support. */
const SUPPORTED_RTT_MS = 150;

describe("what an honest shot needs from the rewind budget", () => {
  it("is fixed by the protocol: half the round trip plus the interpolation delay", () => {
    expect(rewindDemand(0)).toBe(INTERP_DELAY_TICKS);
    expect(rewindDemand(200)).toBeCloseTo(6 + 6, 6); // 100 ms each way at 60 Hz
  });

  it("at the supported RTT it is already most of the cap", () => {
    const need = rewindDemand(SUPPORTED_RTT_MS);
    expect(need).toBeCloseTo(10.5, 6);
    expect(need).toBeLessThan(MAX_REWIND_TICKS); // it does fit — that is why a quiet machine passes
    expect(need / MAX_REWIND_TICKS).toBeGreaterThan(0.85); // …with 1.5 ticks, 25 ms, to spare
  });

  it("so the headroom for jitter and a slow frame is a fraction of one frame at 30 fps", () => {
    const headroomMs = ((MAX_REWIND_TICKS - rewindDemand(SUPPORTED_RTT_MS)) / SIM_HZ) * 1000;
    expect(headroomMs).toBeCloseTo(25, 0);
    expect(headroomMs).toBeLessThan(1000 / 30); // one dropped frame at 30 fps is 33 ms and overruns it
  });

  it("names the RTT at which an unhitched client cannot be compensated at all", () => {
    // beyond this the demand exceeds the cap with a perfectly smooth client and no jitter
    let rtt = 0;
    while (rewindDemand(rtt) <= MAX_REWIND_TICKS) rtt += 1;
    expect(rtt).toBe(201); // ~200 ms RTT, which is an ordinary transcontinental link
  });

  it("a budget that covered the supported link twice over would need roughly twice the cap", () => {
    // stated as arithmetic, not applied: raising the ceiling trades against how long after breaking
    // line of sight a laggy shooter can still kill you, which is an economy decision in a game whose
    // PvP pays $CAPITAL and is not one to make from a probe's hit rate
    expect(Math.ceil(rewindDemand(SUPPORTED_RTT_MS) * 2)).toBe(21);
  });
});
