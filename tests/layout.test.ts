/**
 * The chrome crossed the play (Stage 97): the right band, the alert's seat, and what "crossing the
 * play" means.
 */
import { describe, expect, it } from "vitest";
import { ALERT_FLOOR, ALERT_GAP, alertTop, crossesPlay, RIGHT_BAND, rightBandWidth } from "../client/hud/layout";

describe("the right band", () => {
  it("is a fixed share of the width, less the inset, and never negative", () => {
    expect(rightBandWidth(960, 14)).toBe(Math.floor(960 * RIGHT_BAND) - 14);
    expect(rightBandWidth(1920, 14)).toBe(Math.floor(1920 * RIGHT_BAND) - 14);
    expect(rightBandWidth(20, 14)).toBe(0);
  });

  it("keeps the rack out of the middle at every width a desktop has", () => {
    for (const w of [960, 1280, 1366, 1440, 1600, 1920, 2560]) {
      const left = w - 14 - rightBandWidth(w, 14);
      expect(crossesPlay(left, w - 14, w)).toBe(false);
    }
  });
});

describe("crossing the play", () => {
  it("is a box that reaches from the right of centre into the middle band", () => {
    expect(crossesPlay(325, 946, 960)).toBe(true); // the rack as it was
    expect(crossesPlay(540, 946, 960)).toBe(false); // wrapped into the band
    expect(crossesPlay(0, 300, 960)).toBe(false); // the log, on the left
  });
});

describe("the alert's seat", () => {
  it("sits a gap under the panel above it", () => {
    expect(alertTop(52)).toBe(52 + ALERT_GAP);
    expect(alertTop(52.4)).toBe(53 + ALERT_GAP);
  });

  it("but never drops out of the top band", () => {
    expect(alertTop(400)).toBe(ALERT_FLOOR);
  });
});
