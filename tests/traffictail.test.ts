/**
 * Lease Row's traffic tail stays the street red.
 * Nineteen districts each keep their own tail, and none matches that district's head.
 */
import { describe, expect, it } from "vitest";
import { TRAFFIC_TAIL, trafficHead, trafficTail } from "../client/render/city";

const IDS = [
  "lease_row",
  "deadletter_docks",
  "repo_depot",
  "night_market",
  "relay_heights",
  "ash_canal",
  "glass_mile",
  "bone_market",
  "cold_vault",
  "neon_chapel",
  "slag_pit",
  "wire_garden",
  "red_kiln",
  "paper_wharf",
  "velvet_court",
  "rust_crown",
  "salt_stairs",
  "lamp_bazaar",
  "debt_orchard",
  "black_relay",
] as const;

const TAILS: Record<(typeof IDS)[number], readonly [number, number, number]> = {
  lease_row: [1, 0.1, 0.18],
  deadletter_docks: [0.15, 0.35, 0.7],
  repo_depot: [0.85, 0.25, 0.05],
  night_market: [0.7, 0.05, 0.35],
  relay_heights: [0.45, 0.6, 0.85],
  ash_canal: [0.1, 0.55, 0.35],
  glass_mile: [0.55, 0.4, 0.85],
  bone_market: [0.7, 0.45, 0.2],
  cold_vault: [0.25, 0.7, 0.65],
  neon_chapel: [0.4, 0.1, 0.7],
  slag_pit: [0.75, 0.15, 0.05],
  wire_garden: [0.1, 0.65, 0.3],
  red_kiln: [0.65, 0.12, 0.1],
  paper_wharf: [0.4, 0.5, 0.65],
  velvet_court: [0.7, 0.05, 0.25],
  rust_crown: [0.75, 0.3, 0.08],
  salt_stairs: [0.55, 0.65, 0.8],
  lamp_bazaar: [0.75, 0.15, 0.45],
  debt_orchard: [0.4, 0.65, 0.12],
  black_relay: [0.2, 0.25, 0.35],
};

describe("each district keeps its own traffic tail", () => {
  it("the street red stays, the twenty tails differ, and no tail is that district's head", () => {
    const street: readonly [number, number, number] = [1, 0.1, 0.18];
    expect(TRAFFIC_TAIL).toEqual(street);
    expect(trafficTail("lease_row")).toEqual(street);
    expect(trafficTail(undefined)).toEqual(street);
    expect(trafficTail(undefined)).toEqual(TRAFFIC_TAIL);
    expect(trafficTail("drainage_yard")).toEqual(street);
    expect(trafficTail("deadletter_office")).toEqual(street);
    expect(trafficTail("white_office")).toEqual(street);
    const tails = IDS.map((id) => JSON.stringify(trafficTail(id)));
    expect(new Set(tails).size).toBe(20);
    expect(IDS.length).toBe(20);
    for (const id of IDS) {
      expect(trafficTail(id), id).toEqual(TAILS[id]);
      expect(JSON.stringify(trafficTail(id)), id).not.toBe(JSON.stringify(trafficHead(id)));
    }
  });
});
