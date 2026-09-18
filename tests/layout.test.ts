/**
 * The chrome crossed the play (Stage 97): the right band, the alert's seat, and what "crossing the
 * play" means.
 */
import { describe, expect, it } from "vitest";
import { ALERT_FLOOR, ALERT_GAP, alertTop, crossesPlay, RIGHT_BAND, rightBandWidth, missionMaxWidth, STATUS_GAP, STATUS_MIN, STATUS_WIDTH, statusWidth } from "../client/hud/layout";

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

describe("statusWidth (Stage 107)", () => {
  it("rests at the stylesheet's width when nothing is in the way", () => {
    expect(statusWidth(null, 14, 20)).toBe(STATUS_WIDTH);
    expect(statusWidth(900, 14, 20)).toBe(STATUS_WIDTH);
  });
  it("gives way to the mission panel with the gap kept", () => {
    // at 960 px the panel begins at 345: the box must end at 337
    const w = statusWidth(345, 14, 20);
    expect(14 + w + 20 + STATUS_GAP).toBeLessThanOrEqual(345);
    expect(w).toBe(345 - STATUS_GAP - 14 - 20);
  });
  it("never narrower than a name", () => {
    expect(statusWidth(100, 14, 20)).toBe(STATUS_MIN);
  });
});

describe("missionMaxWidth (Stage 110)", () => {
  it("leaves the status panel its floor and the map its place, centred", () => {
    // at 960: the status floor ends at 14 + 180 + 20 = 214, the map begins at 820
    const w = missionMaxWidth(960, 214, 820);
    expect(480 - w / 2).toBeGreaterThanOrEqual(214 + STATUS_GAP);
    expect(480 + w / 2).toBeLessThanOrEqual(820 - STATUS_GAP);
    expect(w).toBe(Math.floor((480 - 214 - STATUS_GAP) * 2));
  });
  it("is bounded by whichever side is nearer", () => {
    expect(missionMaxWidth(960, 214, 600)).toBe(Math.floor((600 - STATUS_GAP - 480) * 2));
  });
  it("and the status floor then fits beside it", () => {
    const w = missionMaxWidth(960, 214, 820);
    expect(statusWidth(480 - w / 2, 14, 20)).toBe(STATUS_MIN);
  });
  it("never negative", () => {
    expect(missionMaxWidth(300, 214, 200)).toBe(0);
  });
});
