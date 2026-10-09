/**
 * A shot streak does not hang for the same time on every street.
 * Lease Row, the yard, and the indoor rooms keep the 0.12 the pool shipped with.
 * Spark life stays 0.12. The pool size stays.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { STREET_HANG, tracerHang, VfxPool } from "../client/render/vfx";
import { CITY_DISTRICTS } from "../shared/net/city";

describe("each district hangs a shot streak for its own time", () => {
  it("keeps the street hang and gives the other nineteen their own", () => {
    expect(STREET_HANG).toBe(0.12);
    expect(tracerHang(undefined)).toBe(STREET_HANG);
    expect(tracerHang("lease_row")).toBe(STREET_HANG);
    expect(tracerHang("drainage_yard")).toBe(STREET_HANG);
    expect(tracerHang("deadletter_office")).toBe(STREET_HANG);
    expect(tracerHang("white_office")).toBe(STREET_HANG);
    const hangs = CITY_DISTRICTS.map((id) => tracerHang(id));
    expect(new Set(hangs).size).toBe(CITY_DISTRICTS.length);
    expect(tracerHang("night_market")).toBeGreaterThan(STREET_HANG);
    expect(tracerHang("deadletter_docks")).toBeLessThan(tracerHang("relay_heights"));
  });

  it("a streak stays up for that hang, and a spark still dies at 0.12", () => {
    const pool = new VfxPool(new THREE.Scene());
    try {
      expect(pool.hangNow()).toBe(STREET_HANG);
      pool.addTracer(0, 1, 0, 2, 1, 0, 0x35f2ff, 0);
      expect(pool.live(0.119)).toBe(1);
      expect(pool.live(STREET_HANG)).toBe(0);
      pool.setHang(tracerHang("night_market"));
      expect(pool.hangNow()).toBe(tracerHang("night_market"));
      pool.addTracer(0, 1, 0, 3, 1, 0, 0x35f2ff, 1);
      pool.addSpark(0, 1, 0, 0xffb02e, 1);
      expect(pool.live(1.13)).toBe(1);
      expect(pool.live(1 + tracerHang("night_market") + 0.001)).toBe(0);
      pool.setHang(tracerHang("lease_row"));
      expect(pool.hangNow()).toBe(STREET_HANG);
      pool.setHang(tracerHang("deadletter_docks"));
      pool.addTracer(0, 1, 0, 4, 1, 0, 0x35f2ff, 2);
      expect(pool.live(2 + tracerHang("deadletter_docks") - 0.001)).toBe(1);
      expect(pool.live(2 + tracerHang("deadletter_docks") + 0.001)).toBe(0);
      pool.setHang(tracerHang("relay_heights"));
      pool.addTracer(0, 1, 0, 5, 1, 0, 0x35f2ff, 3);
      expect(pool.live(3 + tracerHang("deadletter_docks") + 0.001)).toBe(1);
      expect(pool.live(3 + tracerHang("relay_heights") + 0.001)).toBe(0);
    } finally {
      pool.dispose();
    }
  });

  it("fails closed if the read is removed from the streak", () => {
    const vfx = readFileSync(new URL("../client/render/vfx.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../client/render/renderer.ts", import.meta.url), "utf8");
    expect(vfx).toContain("function tracerHang");
    expect(vfx).toContain("clock - this.tracerBorn[i]! < this.hang");
    expect(vfx).toContain("age >= this.hang");
    expect(vfx).toContain("const SPARK_LIFE = 0.12");
    expect(vfx).toContain("export const MAX_TRACERS = 64");
    expect(renderer).toContain("this.vfxPool.setHang(tracerHang(level.name))");
  });
});
