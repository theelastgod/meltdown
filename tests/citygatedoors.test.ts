/**
 * The city's gates dressed as doors (Stage 704).
 *
 * In the city (campaign mode "city") each of a district's eight gates is a door to the next district
 * (Stage 697), and now it looks like one: a lit sign over its mouth naming where it goes, in that
 * district's cast colour, a light frame round the mouth and a strip across the street at its feet;
 * and the map in the corner marks each gate with its destination. Everywhere else — a PvP room, a
 * contract, THE RUN, an Audit, offline — the gates are the chain-link they were, to the byte.
 *
 * The byte-identical guard is a fingerprint of the whole non-city dressing (every merged mesh's
 * geometry and material, and every stroke drawn on its canvases) recorded on the code before this
 * stage. A deliberate change to the district dressing changes it too, and is re-recorded on purpose.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createHash } from "node:crypto";
import { DISTRICT_SPECS, generateDistrict } from "../shared/sim/city";
import { levelDisplayName, LEVEL_INFO, type LevelDef } from "../shared/sim/level";
import { gateInward, gateSigns, neighbourAt, GATES_PER_DISTRICT, type GateSign } from "../shared/net/citygates";
import { CAST_HEX, gateInitials, gateMarks, radarGates } from "../client/hud/radar";

/** every stroke drawn on any canvas, in order: the sign atlas's text and colours are in it */
const strokes: string[] = [];
const ctx2d = new Proxy({}, {
  get: (_t, k) =>
    k === "measureText" ? () => ({ width: 0 })
    : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: () => undefined })
    : k === "getImageData" || k === "createImageData" ? () => ({ data: new Uint8ClampedArray(4) })
    : (...a: unknown[]) => void strokes.push(`${String(k)}(${a.join(",")})`),
  set: (_t, k, v) => (strokes.push(`${String(k)}=${String(v)}`), true),
});
const g = globalThis as unknown as { document?: unknown };
let hadDocument = false;
beforeAll(() => {
  hadDocument = "document" in g;
  if (!hadDocument) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
});
afterAll(() => {
  if (!hadDocument) delete g.document;
});

const bytes = (a: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** The dressing, to the byte: each mesh's material and geometry in scene order, then every canvas stroke. */
function fingerprint(scene: THREE.Object3D, log: readonly string[]): string {
  const h = createHash("sha256");
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshBasicMaterial;
    h.update(`${mat.type}|${mat.color?.getHexString()}|${mat.opacity}|${mat.transparent}|${mat.side}|${!!mat.map};`);
    const geo = m.geometry;
    for (const name of Object.keys(geo.attributes).sort()) {
      h.update(name);
      h.update(bytes((geo.getAttribute(name) as THREE.BufferAttribute).array as Float32Array));
    }
    if (geo.index) h.update(bytes(geo.index.array as Uint32Array));
  });
  h.update(log.join("\n"));
  return h.digest("hex").slice(0, 16);
}

/** recorded from the dressing as it was before Stage 704. LEASE ROW was re-recorded at Stage 945. DEADLETTER DOCKS was re-recorded at Stage 1067: the west martingale is part of that district's own dressing. REPO DEPOT was re-recorded at Stage 1066: the west whelp is part of that district's own dressing. RELAY HEIGHTS was re-recorded at Stage 1065: the west brail is part of that district's own dressing. NIGHT MARKET was re-recorded at Stage 1064: the west weft is part of that district's own dressing. */
const BEFORE: Record<string, string> = {
  lease_row: "b8d19dc8b6676174",
  deadletter_docks: "d90f6f7dcb516c4c",
  repo_depot: "441956b2ab1f62ed",
  // Stage 701's districts, recorded on the Stage 703 commit, before the doors: the three above
  // reproduce there exactly, which is what makes these two a record of "before" and not of "now"
  night_market: "4b76bf2766964367",
  relay_heights: "82dc7c2347192003",
};

async function dress(L: LevelDef, gates?: readonly GateSign[]): Promise<{ scene: THREE.Scene; log: string[] }> {
  const { dressLevel } = await import("../client/render/city");
  strokes.length = 0;
  const scene = new THREE.Scene();
  if (gates) dressLevel(scene, L, undefined, gates);
  else dressLevel(scene, L);
  return { scene, log: [...strokes] };
}

const meshes = (o: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  o.traverse((m) => (m as THREE.Mesh).isMesh && out.push(m as THREE.Mesh));
  return out;
};

/** every mode a district is walked in that is not the city: PvP, a contract, THE RUN, an Audit, offline explore, co-op */
const NOT_CITY = ["none", "pvp", "mission", "explore", "coop", "run", "audit", ""];

describe("the city's gates are doors, and look like them (Stage 704)", () => {
  it("outside the city nothing changes: every district's dressing is byte-identical to before, in every mode", async () => {
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      const plain = await dress(L);
      expect(fingerprint(plain.scene, plain.log), spec.id).toBe(BEFORE[spec.id]);
      for (const mode of NOT_CITY) {
        expect(gateSigns(L, mode), `${spec.id} in ${mode}`).toEqual([]);
        const d = await dress(L, gateSigns(L, mode));
        expect(fingerprint(d.scene, d.log), `${spec.id} in ${mode}`).toBe(BEFORE[spec.id]);
      }
      // and what the renderer hands the dressing on a page that is not walking the city
      const { cityDoors } = await import("../client/render/city");
      expect(cityDoors(L, false)).toEqual([]);
      const r = await dress(L, cityDoors(L, false));
      expect(fingerprint(r.scene, r.log), `${spec.id}: the renderer off the city`).toBe(BEFORE[spec.id]);
      expect(cityDoors(L, true).length).toBe(GATES_PER_DISTRICT);
    }
  }, 60_000);

  it("in the city every gate is a door with a name: the neighbour it leads to, in that neighbour's colour", () => {
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      const doors = gateSigns(L, "city");
      expect(doors.map((d) => d.gate), spec.id).toEqual([...Array(GATES_PER_DISTRICT).keys()]);
      for (const d of doors) {
        const to = neighbourAt(L.name, d.gate)!;
        expect(d.to).toEqual(to);
        expect(d.to.district).not.toBe(L.name);
        expect(d.name).toBe(levelDisplayName(to.district));
        expect(d.cast).toBe(LEVEL_INFO.find((l) => l.id === to.district)!.cast);
        const e = L.exits![d.gate]!;
        expect([d.x, d.z, d.dir]).toEqual([e.x, e.z, e.dir]);
        // the mouth is the street the gate seals (9 m), and the gate stands 3.2 m
        expect(d.half).toBeCloseTo(4.5, 6);
        expect(d.top).toBeCloseTo(3.2, 6);
      }
    }
  });

  it("a district that is not a city room has no doors, even in city mode", () => {
    const L = { ...generateDistrict(DISTRICT_SPECS[0]!), name: "drainage_yard" };
    expect(gateSigns(L, "city")).toEqual([]);
  });

  it("each sign reads '→ <DISTRICT>' in its destination's colour, over the gate's mouth, facing into the streets", async () => {
    const { dressGateDoors, NeonBatch, SignAtlas, gateSignText, CAST_COLOR } = await import("../client/render/city");
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      const doors = gateSigns(L, "city");
      strokes.length = 0;
      const atlas = new SignAtlas();
      const neon = new NeonBatch(new THREE.Group());
      dressGateDoors(neon, atlas, doors);
      expect(atlas.geos.length).toBe(doors.length);
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i]!;
        const text = gateSignText(d);
        expect(text).toBe(`→ ${levelDisplayName(d.to.district)}`);
        // drawn on the atlas, in the destination's cast colour
        const at = strokes.indexOf(`fillText(${text},${(i % 8) * 256 + 128},${Math.floor(i / 8) * 64 + 34})`);
        expect(at, `${spec.id} gate ${d.gate}: ${text}`).toBeGreaterThan(0);
        const colour = `#${CAST_COLOR[d.cast].toString(16).padStart(6, "0")}`;
        expect(colour).toBe(CAST_HEX[d.cast]);
        expect(strokes.lastIndexOf(`fillStyle=${colour}`, at)).toBeGreaterThan(strokes.lastIndexOf("fillStyle=#06070c", at));
        // the quad: centred on the gate's street, above its posts, just inside its line, its face turned inward
        const geo = atlas.geos[i]!;
        geo.computeBoundingBox();
        const c = geo.boundingBox!.getCenter(new THREE.Vector3());
        const inn = gateInward(d.dir);
        const along = inn.x === 0 ? c.x - d.x : c.z - d.z;
        const depth = (c.x - d.x) * inn.x + (c.z - d.z) * inn.z;
        expect(Math.abs(along)).toBeLessThan(1e-6);
        expect(depth).toBeGreaterThan(0);
        expect(depth).toBeLessThan(0.5);
        expect(geo.boundingBox!.min.y).toBeGreaterThan(d.top + 0.3);
        const width = inn.x === 0 ? geo.boundingBox!.max.x - geo.boundingBox!.min.x : geo.boundingBox!.max.z - geo.boundingBox!.min.z;
        expect(width).toBeLessThanOrEqual(d.half * 2);
        const n = geo.getAttribute("normal") as THREE.BufferAttribute;
        expect(n.getX(0)).toBeCloseTo(inn.x, 6);
        expect(n.getZ(0)).toBeCloseTo(inn.z, 6);
      }
    }
  });

  it("the city's dressing is the district's own with the doors appended: nothing it had is moved, recoloured or dropped", async () => {
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      const plain = meshes((await dress(L)).scene);
      const city = meshes((await dress(L, gateSigns(L, "city"))).scene);
      expect(city.length, spec.id).toBe(plain.length);
      let grew = 0;
      for (let i = 0; i < plain.length; i++) {
        const a = plain[i]!;
        const b = city[i]!;
        expect((b.material as THREE.MeshBasicMaterial).color?.getHex()).toBe((a.material as THREE.MeshBasicMaterial).color?.getHex());
        for (const name of Object.keys(a.geometry.attributes)) {
          const x = (a.geometry.getAttribute(name) as THREE.BufferAttribute).array;
          const y = (b.geometry.getAttribute(name) as THREE.BufferAttribute).array;
          expect(y.length).toBeGreaterThanOrEqual(x.length);
          expect(Array.from(y.slice(0, x.length)), `${spec.id} mesh ${i} ${name}`).toEqual(Array.from(x));
        }
        if (b.geometry.getAttribute("position").count > a.geometry.getAttribute("position").count) grew++;
      }
      // the sign atlas and the neon batches of the destinations' colours: the doors went somewhere
      expect(grew, spec.id).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);

  it("the atlas has room for the doors: a district's own signs and its eight destination signs fit it", async () => {
    const { SIGN_ATLAS_SLOTS } = await import("../client/render/city");
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      expect((L.signs ?? []).length + gateSigns(L, "city").length, spec.id).toBeLessThanOrEqual(SIGN_ATLAS_SLOTS);
    }
  });

  it("the map marks each gate with its destination: its initials, in its colour, pinned to the rim when off the map", () => {
    expect(gateInitials("DEADLETTER DOCKS")).toBe("DD");
    expect(gateInitials("LEASE ROW")).toBe("LR");
    expect(gateInitials("REPO DEPOT")).toBe("RD");
    const L = generateDistrict(DISTRICT_SPECS.find((s) => s.id === "lease_row")!);
    const gates = radarGates(gateSigns(L, "city"));
    expect(gates.length).toBe(8);
    for (const [i, d] of gateSigns(L, "city").entries()) {
      expect(gates[i]!.label).toBe(gateInitials(levelDisplayName(d.to.district)));
      expect(gates[i]!.colour).toBe(CAST_HEX[d.cast]);
    }
    // outside the city the map has nothing to mark
    expect(radarGates(gateSigns(L, "pvp"))).toEqual([]);
    // the map is 54×42 px and 180 m across: from the plaza every gate is past the edge, pinned on its bearing
    const scale = 54 / ((L.bounds ?? 32) * 2 + 6);
    const far = gateMarks(gates, { x: 0, z: 0 }, 0, scale, 54, 42);
    expect(far.every((m) => m.edge)).toBe(true);
    // facing north (yaw 0), the north gates are at the top of the map and the south ones at the bottom
    const north = far.filter((_, i) => L.exits![i]!.dir === "n");
    const south = far.filter((_, i) => L.exits![i]!.dir === "s");
    for (const m of north) expect(m.y).toBeLessThan(21);
    for (const m of south) expect(m.y).toBeGreaterThan(21);
    // standing in front of a gate, it is on the map, ahead, with its name
    const e = L.exits![0]!;
    const inn = gateInward(e.dir);
    const near = gateMarks(gates, { x: e.x + inn.x * 5, z: e.z + inn.z * 5 }, Math.atan2(inn.x, inn.z), scale, 54, 42);
    expect(near[0]!.edge).toBe(false);
    expect(near[0]!.y).toBeLessThan(21);
    expect(near[0]!.distance).toBeCloseTo(5, 6);
  });
});
