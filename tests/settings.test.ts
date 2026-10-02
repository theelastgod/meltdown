import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clampSettings, DEFAULT_SETTINGS, formatSetting, sensitivityLabel, stepSetting } from "../client/settings";

describe("settings", () => {
  it("clamps a hand-edited store to sane ranges and keeps the defaults for anything missing or malformed", () => {
    const s = clampSettings({ sensitivity: 99, fov: "wide", master: -1, crt: 1.2, crawlEveryTime: "yes", bogus: 1 });
    expect(s.sensitivity).toBe(3);
    expect(s.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(s.master).toBe(0);
    expect(s.crt).toBeCloseTo(1.2);
    expect(s.crawlEveryTime).toBe(false);
    expect("bogus" in s).toBe(false);
  });
  it("steps by the range's increment, stops at the ends, toggles booleans, and formats for the menu", () => {
    let s = { ...DEFAULT_SETTINGS };
    s = stepSetting(s, "fov", 1);
    expect(s.fov).toBe(81);
    for (let i = 0; i < 100; i++) s = stepSetting(s, "fov", 1);
    expect(s.fov).toBe(105);
    s = stepSetting(s, "crawlEveryTime", 1);
    expect(s.crawlEveryTime).toBe(true);
    expect(formatSetting(s, "fov")).toBe("105°");
    expect(formatSetting(DEFAULT_SETTINGS, "master")).toBe("70%");
    expect(formatSetting(DEFAULT_SETTINGS, "sensitivity")).toBe("1.00×");
  });
  it("names the drag on a phone and the mouse on a keyboard", () => {
    expect(sensitivityLabel(true)).toBe("DRAG SENSITIVITY");
    expect(sensitivityLabel(false)).toBe("MOUSE SENSITIVITY");
    expect(sensitivityLabel(true)).not.toMatch(/MOUSE/);
    const menu = readFileSync(new URL("../client/menu.ts", import.meta.url), "utf8");
    expect(menu).toMatch(/k === "sensitivity" \? sensitivityLabel\(wantsTouch\(\)\) : SETTING_LABELS\[k\]/);
  });
});
