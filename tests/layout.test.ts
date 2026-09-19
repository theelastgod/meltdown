/**
 * The chrome crossed the play (Stage 97): the right band, the alert's seat, and what "crossing the
 * play" means.
 */
import { describe, expect, it } from "vitest";
import { ALERT_FLOOR, ALERT_GAP, alertTop, crossesPlay, FLAG_GAP, FLAG_TOP, flagTop, FOOT_GAP, footRow, FRAME_GAP, FRAME_INSET, frameSeat, RIGHT_BAND, rightBandWidth, MISSION_MIN, missionMaxWidth, missionRow, STATUS_GAP, STATUS_MIN, STATUS_WIDTH, statusWidth, statusLineFit, stackShift, phoneRowTop, PHONE_ROW_GAP, logLines, LOG_LINES, PHONE_LOG_LINES } from "../client/hud/layout";

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

  it("stacks under the node line or the searchlight warning when one of them ends lower (Stage 120)", () => {
    expect(alertTop(90, 114)).toBe(114 + ALERT_GAP);
    expect(alertTop(90, 113.2)).toBe(114 + ALERT_GAP);
    expect(alertTop(90, 144)).toBe(144 + ALERT_GAP);
    expect(alertTop(90, null)).toBe(90 + ALERT_GAP);
    expect(alertTop(90, 40)).toBe(90 + ALERT_GAP);
    expect(alertTop(90, 400)).toBe(ALERT_FLOOR);
  });
});

describe("the searchlight warning's seat (Stage 116)", () => {
  it("keeps its old seat with no node line up", () => {
    expect(flagTop(null)).toBe(FLAG_TOP);
  });
  it("hangs a gap under the node line's measured bottom", () => {
    expect(flagTop(114)).toBe(114 + FLAG_GAP);
    expect(flagTop(114.2)).toBe(115 + FLAG_GAP);
  });
  it("never rises above its seat for a node line that ends higher", () => {
    expect(flagTop(40)).toBe(FLAG_TOP);
  });
});

describe("the foot line's row (Stage 118)", () => {
  it("sits beside the slots and the tabs when the room holds it with a gap either side", () => {
    expect(footRow(300, 170)).toBe("beside");
    expect(footRow(170 + 2 * FOOT_GAP, 170)).toBe("beside");
  });
  it("lifts above the row when it does not", () => {
    expect(footRow(170 + 2 * FOOT_GAP - 1, 170)).toBe("above");
    expect(footRow(67, 170)).toBe("above");
  });
});

describe("a reader frame's seat (Stage 119)", () => {
  it("hangs a gap under the header and takes the height left above the bottom inset", () => {
    expect(frameSeat(75, 540)).toEqual({ top: 75 + FRAME_GAP, maxHeight: 540 - 75 - FRAME_GAP - FRAME_INSET });
    expect(frameSeat(74.4, 540).top).toBe(75 + FRAME_GAP);
  });
  it("never reports a negative height", () => {
    expect(frameSeat(300, 200).maxHeight).toBe(0);
  });
  it("ends above the bottom row with a gap where the row is drawn under it (Stage 136)", () => {
    expect(frameSeat(75, 540, 474)).toEqual({ top: 75 + FRAME_GAP, maxHeight: 474 - FRAME_GAP - (75 + FRAME_GAP) });
    expect(frameSeat(75, 540, 474.6).maxHeight).toBe(474 - FRAME_GAP - (75 + FRAME_GAP));
    // a row lower than the inset changes nothing
    expect(frameSeat(75, 540, 539)).toEqual(frameSeat(75, 540));
    expect(frameSeat(75, 540, null)).toEqual(frameSeat(75, 540));
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

describe("missionRow (Stage 111)", () => {
  it("stays beside the status panel where the band can hold it", () => {
    expect(missionRow(960, 214, 820, 14)).toEqual({ row: "beside", maxWidth: missionMaxWidth(960, 214, 820) });
    expect(missionRow(800, 214, 660, 14).row).toBe("beside");
  });
  it("drops to the second row where it cannot, bounded by the map alone", () => {
    // at 640: the map begins at 502; beside, the panel could be 196 wide, under its 240 minimum
    expect(missionMaxWidth(640, 214, 502)).toBeLessThan(MISSION_MIN);
    const r = missionRow(640, 214, 502, 14);
    expect(r.row).toBe("below");
    expect(r.maxWidth).toBe(missionMaxWidth(640, 14, 502));
    expect(r.maxWidth).toBeGreaterThanOrEqual(MISSION_MIN);
  });
});


describe("statusLineFit (Stage 135)", () => {
  it("keeps the full line, XP and all, where the box holds it", () => {
    expect(statusLineFit(330, 232)).toBe("full");
    expect(statusLineFit(232, 232)).toBe("full");
  });
  it("drops to the short line, scrip and wakelight kept, where it does not", () => {
    expect(statusLineFit(216, 232)).toBe("short");
    expect(statusLineFit(180, 232)).toBe("short");
  });
});

describe("the phone's stack (Stage 139)", () => {
  it("moves the stack down to under the row, or under the legend under it; the desktop moves nothing", () => {
    expect(stackShift(null)).toBe(0);
    expect(stackShift(120)).toBe(120 + FLAG_GAP - FLAG_TOP);
    expect(stackShift(119.2)).toBe(120 + FLAG_GAP - FLAG_TOP);
    expect(stackShift(140)).toBe(140 + FLAG_GAP - FLAG_TOP);
    expect(stackShift(40)).toBe(0);
  });
  it("carries the warning's seat and the alert's floor with it", () => {
    const shift = stackShift(120);
    expect(flagTop(null, shift)).toBe(FLAG_TOP + shift);
    expect(flagTop(FLAG_TOP + shift + 22, shift)).toBe(FLAG_TOP + shift + 22 + FLAG_GAP);
    expect(alertTop(92, 300, shift)).toBe(ALERT_FLOOR + shift);
    expect(alertTop(92, 148, shift)).toBe(148 + ALERT_GAP);
    expect(alertTop(92, 300)).toBe(ALERT_FLOOR);
  });
});

describe("the phone's row and log (Stage 140)", () => {
  it("seats the row at its own seat, or a gap under a mission panel that reaches lower", () => {
    expect(phoneRowTop(72, null)).toBe(72);
    expect(phoneRowTop(72, 52)).toBe(72);
    expect(phoneRowTop(72, 92)).toBe(92 + PHONE_ROW_GAP);
    expect(phoneRowTop(72, 91.2)).toBe(92 + PHONE_ROW_GAP);
  });
  it("keeps three log entries on the phone and five on the desktop", () => {
    expect(logLines(false)).toBe(LOG_LINES);
    expect(logLines(true)).toBe(PHONE_LOG_LINES);
    expect(PHONE_LOG_LINES).toBeLessThan(LOG_LINES);
  });
});
