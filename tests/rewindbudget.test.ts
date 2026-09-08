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

  it("at the supported RTT it leaves room for jitter and a hitch, which is what a ceiling is for", () => {
    const need = rewindDemand(SUPPORTED_RTT_MS);
    expect(need).toBeCloseTo(10.5, 6);
    expect(need).toBeLessThan(MAX_REWIND_TICKS);
    // the ceiling covers the supported link about twice over, against the 1.14x it used to
    expect(MAX_REWIND_TICKS / need).toBeGreaterThan(1.8);
  });

  it("headroom is several dropped frames now, not a fraction of one", () => {
    const headroomMs = ((MAX_REWIND_TICKS - rewindDemand(SUPPORTED_RTT_MS)) / SIM_HZ) * 1000;
    expect(headroomMs).toBeGreaterThan(4 * (1000 / 30));
    // at the old ceiling of 12 it was 25 ms, which a single dropped frame at 30 fps overran
    expect(((12 - rewindDemand(SUPPORTED_RTT_MS)) / SIM_HZ) * 1000).toBeLessThan(1000 / 30);
  });

  it("names the RTT at which an unhitched client can no longer be compensated", () => {
    let rtt = 0;
    while (rewindDemand(rtt) <= MAX_REWIND_TICKS) rtt += 1;
    expect(rtt).toBeGreaterThan(460); // was 201: an ordinary transcontinental link no longer falls off
  });

  it("stays bounded, because an unbounded rewind is what a lag switch wants", () => {
    // the cost of the ceiling is how long after breaking line of sight a lagging shooter can still
    // kill you. 333 ms is deliberate and paid, not an oversight.
    const ceilingMs = (MAX_REWIND_TICKS / SIM_HZ) * 1000;
    expect(ceilingMs).toBeCloseTo(333, 0);
    expect(ceilingMs).toBeLessThan(500);
  });
});
