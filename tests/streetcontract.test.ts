/**
 * A district contract taken on the city street stays in that room.
 * It does not add a private patrol, a hold does not pour a wave into the shared room,
 * and a relay breaks when a file stands on it. The white office still leaves.
 */
import { describe, expect, it } from "vitest";
import { createMission, noteStreetKill, stepMission } from "../shared/campaign/runtime";
import { cityContractPlan, cityPageUrl, inCity, streetJobUrl } from "../shared/net/city";
import { levelById } from "../shared/sim/level";
import { SIM_HZ } from "../shared/sim/constants";
import { World } from "../shared/sim/world";

describe("a contract on the city street", () => {
  it("stays in this district's room, travels to another district's room, and leaves only for a room that is not a district", () => {
    expect(cityContractPlan(true, "lease_row", "lease_row")).toBe("stay");
    expect(cityContractPlan(true, "lease_row", "deadletter_docks")).toBe("travel");
    expect(cityContractPlan(true, "lease_row", "white_office")).toBe("solo");
    expect(cityContractPlan(false, "lease_row", "lease_row")).toBe("solo");
    const url = streetJobUrl("http://x/?job=old&mission=no", { wsBase: "ws://h", level: "deadletter_docks", shop: "http://h", job: "m2_deadletter_run" });
    const q = new URL(url).searchParams;
    expect(q.get("job")).toBe("m2_deadletter_run");
    expect(q.get("level")).toBe("deadletter_docks");
    expect(q.get("city")).toBe("1");
    expect(q.has("mission")).toBe(false);
    expect(inCity(q)).toBe(true);
    const gate = new URL(cityPageUrl(url, { wsBase: "ws://h", level: "repo_depot" })).searchParams;
    expect(gate.has("job")).toBe(false);
    expect(inCity(gate)).toBe(true);
  });

  it("does not add patrols, breaks a post by standing on it, and does not spawn a wave into the room", () => {
    const level = levelById("lease_row");
    const w = new World(level, { ai: false, seed: 3, wakePhase: "off", dummyRespawn: false, pvp: false });
    const before = w.wasps.length;
    const st = createMission("g_lattice_row", w, {}, "cells", 4, true)!;
    expect(st.street).toBe(true);
    expect(st.spawned.wasps).toBe(0);
    expect(st.spawned.mechs).toBe(0);
    expect(w.wasps.length).toBe(before);
    expect(w.dummies.length).toBe(0);
    const p = w.addPlayer(1, "BLANK", 1);
    const b = level.nodes.find((n) => n.label === "B")!;
    p.pos.x = b.pos.x;
    p.pos.z = b.pos.z;
    stepMission(st, w, []);
    expect(st.broken).toContain(0);
    expect(st.progress).toBeGreaterThan(0);
    expect(w.dummies.length).toBe(0);

    const hold = new World(level, { ai: false, seed: 3, wakePhase: "off", dummyRespawn: false, pvp: false });
    const walker = hold.addPlayer(1, "BLANK", 1);
    const d = level.nodes.find((n) => n.label === "D")!;
    walker.pos.x = d.pos.x;
    walker.pos.z = d.pos.z;
    const job = createMission("g_escrow_row", hold, {}, "cells", 0, true)!;
    const patrols = hold.wasps.length;
    // reach D is already true, so the next steps are the hold. A wave is due partway through 15s.
    for (let t = 0; t < 10 * SIM_HZ; t++) stepMission(job, hold, []);
    expect(job.objectives[job.index]?.kind).toBe("survive");
    expect(hold.wasps.length).toBe(patrols);

    const solo = new World(level, { ai: false, seed: 3, wakePhase: "off", dummyRespawn: false });
    const added = solo.wasps.length;
    const priv = createMission("g_lattice_row", solo, {}, "cells", 0, false)!;
    expect(priv.street).toBe(false);
    expect(solo.wasps.length).toBeGreaterThan(added);
  });

  it("counts a wasp another file downs on the same street", () => {
    const w = new World(levelById("deadletter_docks"), { ai: false, seed: 1, wakePhase: "off", pvp: false });
    const st = createMission("m2_deadletter_run", w, {}, "cells", 0, true)!;
    // first objective is the kill
    expect(st.objectives[0]?.kind).toBe("kill");
    noteStreetKill(st, "player");
    expect(st.progress).toBe(0);
    noteStreetKill(st, "wasp");
    noteStreetKill(st, "wasp");
    expect(st.progress).toBe(2);
  });
});
