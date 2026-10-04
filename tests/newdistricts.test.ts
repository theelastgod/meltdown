/**
 * Two more districts (Stage 701): NIGHT MARKET and RELAY HEIGHTS.
 *
 * The city was three districts joined by their gates, so a file walking east came back to where it
 * started after two crossings. These hold what the two new ones promise: each is its own place (its
 * own blocks, crowd, traffic and patrols, a cast the renderer already dresses), each is a 3×3
 * district built by the one generator and pinned by hash like the old ones, a Blank can walk from
 * any spawn to every node, claim and safe zone, its eight gates are there, and the gate map still
 * pairs every gate both ways and joins every district to every other. The frame budget in
 * `tests/citycost.test.ts` measures every entry of DISTRICT_SPECS, so it measures these two under
 * the same 190k it holds the others to.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISTRICT_SPECS, districtById, districtGrid, districtHalf, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { LEVEL_INFO, levelById, levelDisplayName } from "../shared/sim/level";
import { buildNav, cellOf, reachableFrom, walkable } from "../shared/sim/nav";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { CITY_DISTRICTS, cityDistrict, cityRoomName } from "../shared/net/city";
import { gateArrival, gateSide, GATES_PER_DISTRICT, neighbourAt } from "../shared/net/citygates";
import { applyRound, DISTRICTS as SEASON_DISTRICTS, emptySeason, NODE_LABELS } from "../shared/endgame/season";
import { LEVEL_ART } from "../client/loading";

const NEW = ["night_market", "relay_heights"] as const;
const spec = (id: string): DistrictSpec => districtById(id)!;
const hash = (s: DistrictSpec): string => createHash("sha256").update(JSON.stringify(generateDistrict(s))).digest("hex");

/** sha256 of JSON.stringify(generateDistrict(spec)). Night market was re-pinned at Stage 1028, when the slab between the north awning and the north lot opened. Relay heights was re-pinned at Stage 1025, when the slab between the west pylon and the north-west gate opened. */
const PINNED: Record<(typeof NEW)[number], string> = {
  night_market: "e06f568588550b1f7903cc0d312e929ef7cfbd0c008077d4373d7f4b124fa0ae",
  relay_heights: "3647a9a7a48600aecc269cd5ab9fd697326bd3e5365275cb8522fdaa88bbae6c",
};
/** Night market before Stage 950. Sealing the north lot puts this hash back. */
const NIGHT_SEALED = "49596a55f53b93a510a3e9ef2c20a0f7a3a98afe8521cc3761f9839c79bb2e56";
/** Night market after Stage 950. Sealing the south row puts this hash back. */
const NIGHT_LANE = "b1a6ca161b94a4dbfe5c578015731fa57ce8fc8efa1bcd694801fec4af6f467c";
/** Night market after Stage 957. Sealing the east aisle puts this hash back. */
const NIGHT_STALL = "cbaf3f3133adcd0861d026f2b9f5bf27cbde26a6bd639b095a6bb4c32bd6083f";
/** Night market after Stage 963. Sealing the west booth puts this hash back. */
const NIGHT_AISLE = "96a663639a841094d02087f445021b28ee796cb666f7ceaa5bf5cb10805eae2b";
/** Night market after Stage 964. Sealing the east crate puts this hash back. */
const NIGHT_BOOTH = "7e3e9c271d55509421a29e671f514ea0cb421b6a81174023293b57e20c0a5973";
/** Night market after Stage 971. Sealing the west lantern puts this hash back. */
const NIGHT_CRATE = "205bb293e4981c6bf20812cc5400280f83f60358b6696c0fc5c84b2df189377c";
/** Night market after Stage 975. Sealing the south hook puts this hash back. */
const NIGHT_LANTERN = "27100b0d27036735d2d243dfa78d52cf6993fc39c3c6d5930b7415dd9032bee4";
/** Night market after Stage 978. Sealing the north tarp puts this hash back. */
const NIGHT_HOOK = "68328cc93e81d2cae5663930d38d6a2b818600ee6428ef2e4660c4d643f319a0";
/** Night market after Stage 980. Sealing the north awning puts this hash back. */
const NIGHT_TARP = "da9971c48b2d2684c0718746158ea82d2a043c345a981fc5a3ff8f047ac2b4a0";
/** Night market after Stage 985. Sealing the north valance puts this hash back. */
const NIGHT_AWNING = "1c07b19d5e537cb8b684812dd3e511ad3265a05d7f64ee9de2e981b52fe7d4dc";
/** Night market after Stage 988. Sealing the north fringe puts this hash back. */
const NIGHT_VALANCE = "6b952b868a7c06b1f6ccd4170c1ebb2e8ed48a0d372e5e0978847f6e29461341";
/** Night market after Stage 992. Sealing the north hem puts this hash back. */
const NIGHT_FRINGE = "6bb7f22db75aa3ec7748e0a2bdd6c49dc3d6762d2073c99292794aa5882bb60a";
/** Night market after Stage 996. Sealing the south welt puts this hash back. */
const NIGHT_HEM = "c739abb50d17d07a1b6578fa831fe57ad01e7eee3feb898a245f6bf85a8fff32";
/** Night market after Stage 1000. Sealing the south seam puts this hash back. */
const NIGHT_WELT = "bbac26ea58fd0a0a2f2a67740b6f462e0c13e6afdc9792d0c54ab9941776a79f";
/** Night market after Stage 1004. Sealing the south gore puts this hash back. */
const NIGHT_SEAM = "80b094182cc926d26a942b08a859d2b036b3e2e31d8d1562fcc97c99a76abd34";
/** Night market after Stage 1008. Sealing the east gusset puts this hash back. */
const NIGHT_GORE = "a6c869472b0a245c4d25f4f6194720ac7fdb285008fc597658d94f2211c2ca44";
/** Night market after Stage 1012. Sealing the east dart puts this hash back. */
const NIGHT_GUSSET = "f97b1f43b1b301e476595c083c9a697e017154637549e5c289b4f70018b2b87e";
/** Night market after Stage 1016. Sealing the west pleat puts this hash back. */
const NIGHT_DART = "12602e8f1799dac1a39b7f307b46643f8b175a071307ff1ea625363d5735a5e6";
/** Night market after Stage 1020. Sealing the west tuck puts this hash back. */
const NIGHT_PLEAT = "71da91d3999f3244fa9bfdb189dfc36f72024ea25b27b59f0b2cc0a13b7313ab";
/** Night market after Stage 1024. Sealing the north grommet puts this hash back. */
const NIGHT_TUCK = "2720d5029fa1c5f0347c0848ce05fc475c0913b69fe7aa81cce28ea06b2bbfe2";
/** Relay heights after Stage 949. Sealing the south span puts this hash back. */
const RELAY_RACK = "0960af48b982c704f216cd0a42232cc5bf4b8f2e8cc5d53164d31cd440ee7cd7";
/** Relay heights after Stage 958. Sealing the north ledge puts this hash back. */
const RELAY_SPAN = "94c6972252f0a4b2e0ba65254c138e0b9fdaea96c4bb798d5c066ec3e3ec15a6";
/** Relay heights after Stage 962. Sealing the east mast puts this hash back. */
const RELAY_LEDGE = "715a09c1dc264b54c7e5ef95b03055325358e26cacf1bb2ea565d9f3c638a86a";
/** Relay heights after Stage 965. Sealing the west spire puts this hash back. */
const RELAY_MAST = "8047bc2467aaf5e41f7c22aee5753d2e76464cc6022772fbcb2ef9acc60a9819";
/** Relay heights after Stage 967. Sealing the west pylon puts this hash back. */
const RELAY_SPIRE = "7575fe55dded5bbacbee05d0b8be3aa31bcd82d76db689adf36067f257b52e85";
/** Relay heights after Stage 970. Sealing the east strut puts this hash back. */
const RELAY_PYLON = "4722f4fbe16ea7dbfda9f82d4171b444ade9cd4df58ea95586259fd45ebc69ec";
/** Relay heights after Stage 974. Sealing the south tie puts this hash back. */
const RELAY_STRUT = "715237e4aa8b3363a227823e380e4ee8d595546d1126600f3555a20bce438af4";
/** Relay heights after Stage 977. Sealing the north spar puts this hash back. */
const RELAY_TIE = "1dbba6beddb60db5f7246ed8da4ae82a82c32acf67341a6421e198817aca8e5f";
/** Relay heights after Stage 979. Sealing the north vane puts this hash back. */
const RELAY_SPAR = "210b0c73d925b84b0fe5a58c0ea9ad410dd311e388140b4cf8817b1823ff2cec";
/** Relay heights after Stage 986. Sealing the north stay puts this hash back. */
const RELAY_VANE = "41471028a760ab0b0f045063ab05177ec9189efbb93c94c4c5c151c68dfa8634";
/** Relay heights after Stage 989. Sealing the north halyard puts this hash back. */
const RELAY_STAY = "d31d7b35fb38439f8da27d8bd58cdc00a2aec221e6810568ec5b70ea3c1ea73e";
/** Relay heights after Stage 993. Sealing the north shroud puts this hash back. */
const RELAY_HALYARD = "8e27210bef375ea69308b5b7dd2f91f43d26b655d6869ad394362791f09ee5b2";
/** Relay heights after Stage 997. Sealing the south luff puts this hash back. */
const RELAY_SHROUD = "ff002f0aa53448e8e5bd4bfc915dd2479c39ce05160bf28f8f7aec87df14f649";
/** Relay heights after Stage 1001. Sealing the south leech puts this hash back. */
const RELAY_LUFF = "3c2a4fc913eb7d0e5c032724b086a9886fb964fee9424ff7083ef50218f373e4";
/** Relay heights after Stage 1005. Sealing the south batten puts this hash back. */
const RELAY_LEECH = "aa06295be744ca522289a0eb6bf1a041c0d4879c84717cdb94dbe7c0d2e0a5ed";
/** Relay heights after Stage 1009. Sealing the east clew puts this hash back. */
const RELAY_BATTEN = "d5c1b60be88f35daaa46c131e13295b73a8ca14cfc771188604ae21bf3b21cb4";
/** Relay heights after Stage 1013. Sealing the east roach puts this hash back. */
const RELAY_CLEW = "c202e52c064141cc3c416be4b2b2f07b1fe05613a566e6a825f70493af73dd4a";
/** Relay heights after Stage 1017. Sealing the west tack puts this hash back. */
const RELAY_ROACH = "179d050c69050c1da8f701e1fe8ae430e8d0aebc93d555ef2dc2d3912e9b4c16";
/** Relay heights after Stage 1021. Sealing the west vang puts this hash back. */
const RELAY_TACK = "ba07fc9e24fc12df8a0302dcf68cd16ffbe5fc8483c4d58da4d770ad81a94720";

describe("the city has five districts", () => {
  it("the two new ones are in the generator, the level registry, the city's rooms and the season's graph, after the three it had", () => {
    const ids = DISTRICT_SPECS.map((d) => d.id);
    expect(ids).toEqual(["lease_row", "deadletter_docks", "repo_depot", "night_market", "relay_heights"]);
    // the frame budget, the gates and the Deep Wake all read this one list
    expect(CITY_DISTRICTS).toEqual(ids);
    expect(SEASON_DISTRICTS).toEqual(ids);
    expect(LEVEL_INFO.filter((l) => l.kind === "district").map((l) => l.id)).toEqual(ids);
    for (const id of NEW) {
      expect(cityDistrict(id)).toBe(id);
      expect(cityRoomName(id)).toBe(`city-${id}`);
      expect(levelById(id).name).toBe(id);
    }
    expect(levelDisplayName("night_market")).toBe("NIGHT MARKET");
    expect(levelDisplayName("relay_heights")).toBe("RELAY HEIGHTS");
  });

  it("each is its own place: its name, seed, blocks, crowd, traffic and patrols differ from every other district's", () => {
    const counts = (s: DistrictSpec) => JSON.stringify([...s.blocks].sort());
    for (const id of NEW) {
      const s = spec(id);
      for (const o of DISTRICT_SPECS.filter((d) => d.id !== id)) {
        expect(s.displayName, `${id} vs ${o.id}`).not.toBe(o.displayName);
        expect(s.seed, `${id} vs ${o.id}`).not.toBe(o.seed);
        expect(counts(s), `${id}'s block mix is ${o.id}'s`).not.toBe(counts(o));
        expect([s.pedestrians, s.carDensity, s.wasps, s.mechs], `${id} vs ${o.id}`).not.toEqual([o.pedestrians, o.carDensity, o.wasps, o.mechs]);
      }
    }
    // the market is stalls and courtyards with the thickest crowd of the 3×3 districts and the fewest cars
    const m = spec("night_market");
    expect(m.blocks.filter((b) => b === "market" || b === "court").length).toBe(7);
    const small = DISTRICT_SPECS.filter((d) => districtGrid(d) === 3);
    expect(Math.max(...small.map((d) => d.pedestrians))).toBe(m.pedestrians);
    expect(Math.min(...DISTRICT_SPECS.map((d) => d.carDensity))).toBe(m.carDensity);
    // the heights are towers, with the thinnest crowd of any district
    const r = spec("relay_heights");
    expect(r.blocks.filter((b) => b === "tower").length).toBe(5);
    expect(Math.min(...DISTRICT_SPECS.map((d) => d.pedestrians))).toBe(r.pedestrians);
  });

  it("each is three blocks by three, 108 m across, with the plaza at its centre", () => {
    for (const id of NEW) {
      const s = spec(id);
      expect(districtGrid(s), id).toBe(3);
      expect(s.blocks, id).toHaveLength(9);
      expect(s.blocks[4], id).toBe("plaza");
      expect(s.blocks.filter((b) => b === "plaza"), id).toHaveLength(1);
      expect(generateDistrict(s).bounds, id).toBe(districtHalf(s));
      expect(districtHalf(s)).toBe(54);
    }
  });

  it("each generates deterministically, and builds the level it was added with", () => {
    for (const id of NEW) {
      const s = spec(id);
      expect(JSON.stringify(generateDistrict(s)), id).toBe(JSON.stringify(generateDistrict({ ...s })));
      expect(hash(s), id).toBe(PINNED[id]);
      // the grid written out builds the same level as the default
      expect(hash({ ...s, grid: 3 }), id).toBe(PINNED[id]);
    }
    expect(PINNED.night_market).not.toBe(NIGHT_SEALED);
    expect(PINNED.night_market).not.toBe(NIGHT_LANE);
    expect(PINNED.night_market).not.toBe(NIGHT_STALL);
    expect(PINNED.night_market).not.toBe(NIGHT_AISLE);
    expect(PINNED.night_market).not.toBe(NIGHT_BOOTH);
    expect(PINNED.night_market).not.toBe(NIGHT_CRATE);
    expect(PINNED.night_market).not.toBe(NIGHT_LANTERN);
    expect(PINNED.night_market).not.toBe(NIGHT_HOOK);
    expect(PINNED.night_market).not.toBe(NIGHT_TARP);
    expect(PINNED.night_market).not.toBe(NIGHT_AWNING);
    expect(PINNED.night_market).not.toBe(NIGHT_VALANCE);
    expect(PINNED.night_market).not.toBe(NIGHT_FRINGE);
    expect(PINNED.night_market).not.toBe(NIGHT_HEM);
    expect(PINNED.night_market).not.toBe(NIGHT_WELT);
    expect(PINNED.night_market).not.toBe(NIGHT_SEAM);
    expect(PINNED.night_market).not.toBe(NIGHT_GORE);
    expect(PINNED.night_market).not.toBe(NIGHT_GUSSET);
    expect(PINNED.night_market).not.toBe(NIGHT_DART);
    expect(PINNED.night_market).not.toBe(NIGHT_PLEAT);
    expect(PINNED.night_market).not.toBe(NIGHT_TUCK);
    expect(PINNED.relay_heights).not.toBe(RELAY_RACK);
    expect(PINNED.relay_heights).not.toBe(RELAY_SPAN);
    expect(PINNED.relay_heights).not.toBe(RELAY_LEDGE);
    expect(PINNED.relay_heights).not.toBe(RELAY_MAST);
    expect(PINNED.relay_heights).not.toBe(RELAY_SPIRE);
    expect(PINNED.relay_heights).not.toBe(RELAY_PYLON);
    expect(PINNED.relay_heights).not.toBe(RELAY_STRUT);
    expect(PINNED.relay_heights).not.toBe(RELAY_TIE);
    expect(PINNED.relay_heights).not.toBe(RELAY_SPAR);
    expect(PINNED.relay_heights).not.toBe(RELAY_VANE);
    expect(PINNED.relay_heights).not.toBe(RELAY_STAY);
    expect(PINNED.relay_heights).not.toBe(RELAY_HALYARD);
    expect(PINNED.relay_heights).not.toBe(RELAY_SHROUD);
    expect(PINNED.relay_heights).not.toBe(RELAY_LUFF);
    expect(PINNED.relay_heights).not.toBe(RELAY_LEECH);
    expect(PINNED.relay_heights).not.toBe(RELAY_BATTEN);
    expect(PINNED.relay_heights).not.toBe(RELAY_CLEW);
    expect(PINNED.relay_heights).not.toBe(RELAY_ROACH);
    expect(PINNED.relay_heights).not.toBe(RELAY_TACK);
    expect(generateDistrict(spec("night_market")).stall?.line).toMatch(/SOUTH ROW/);
    expect(generateDistrict(spec("relay_heights")).span?.line).toMatch(/SOUTH SPAN/);
    expect(generateDistrict(spec("relay_heights")).ledge?.line).toMatch(/NORTH LEDGE/);
    expect(generateDistrict(spec("relay_heights")).mast?.line).toMatch(/EAST MAST/);
    expect(generateDistrict(spec("relay_heights")).spire?.line).toMatch(/WEST SPIRE/);
    expect(generateDistrict(spec("relay_heights")).pylon?.line).toMatch(/WEST PYLON/);
    expect(generateDistrict(spec("relay_heights")).strut?.line).toMatch(/EAST STRUT/);
    expect(generateDistrict(spec("relay_heights")).tie?.line).toMatch(/SOUTH TIE/);
    expect(generateDistrict(spec("relay_heights")).spar?.line).toMatch(/NORTH SPAR/);
    expect(generateDistrict(spec("relay_heights")).vane?.line).toMatch(/NORTH VANE/);
    expect(generateDistrict(spec("relay_heights")).stay?.line).toMatch(/NORTH STAY/);
    expect(generateDistrict(spec("relay_heights")).halyard?.line).toMatch(/NORTH HALYARD/);
    expect(generateDistrict(spec("relay_heights")).shroud?.line).toMatch(/NORTH SHROUD/);
    expect(generateDistrict(spec("relay_heights")).luff?.line).toMatch(/SOUTH LUFF/);
    expect(generateDistrict(spec("relay_heights")).leech?.line).toMatch(/SOUTH LEECH/);
    expect(generateDistrict(spec("relay_heights")).batten?.line).toMatch(/SOUTH BATTEN/);
    expect(generateDistrict(spec("relay_heights")).clew?.line).toMatch(/EAST CLEW/);
    expect(generateDistrict(spec("relay_heights")).roach?.line).toMatch(/EAST ROACH/);
    expect(generateDistrict(spec("relay_heights")).tack?.line).toMatch(/WEST TACK/);
    expect(generateDistrict(spec("relay_heights")).vang?.line).toMatch(/WEST VANG/);
    expect(generateDistrict(spec("night_market")).lane?.line).toMatch(/OPEN AIR/);
    expect(generateDistrict(spec("night_market")).aisle?.line).toMatch(/EAST AISLE/);
    expect(generateDistrict(spec("night_market")).booth?.line).toMatch(/WEST BOOTH/);
    expect(generateDistrict(spec("night_market")).crate?.line).toMatch(/EAST CRATE/);
    expect(generateDistrict(spec("night_market")).lantern?.line).toMatch(/WEST LANTERN/);
    expect(generateDistrict(spec("night_market")).hook?.line).toMatch(/SOUTH HOOK/);
    expect(generateDistrict(spec("night_market")).tarp?.line).toMatch(/NORTH TARP/);
    expect(generateDistrict(spec("night_market")).awning?.line).toMatch(/NORTH AWNING/);
    expect(generateDistrict(spec("night_market")).valance?.line).toMatch(/NORTH VALANCE/);
    expect(generateDistrict(spec("night_market")).fringe?.line).toMatch(/NORTH FRINGE/);
    expect(generateDistrict(spec("night_market")).hem?.line).toMatch(/NORTH HEM/);
    expect(generateDistrict(spec("night_market")).welt?.line).toMatch(/SOUTH WELT/);
    expect(generateDistrict(spec("night_market")).seam?.line).toMatch(/SOUTH SEAM/);
    expect(generateDistrict(spec("night_market")).gore?.line).toMatch(/SOUTH GORE/);
    expect(generateDistrict(spec("night_market")).gusset?.line).toMatch(/EAST GUSSET/);
    expect(generateDistrict(spec("night_market")).dart?.line).toMatch(/EAST DART/);
    expect(generateDistrict(spec("night_market")).pleat?.line).toMatch(/WEST PLEAT/);
    expect(generateDistrict(spec("night_market")).tuck?.line).toMatch(/WEST TUCK/);
    expect(generateDistrict(spec("night_market")).grommet?.line).toMatch(/NORTH GROMMET/);
  });

  it("each is a place a crew can play: the patrols the spec asks for, claims for THE RUN, two safe zones, a picture on the loading card", () => {
    for (const id of NEW) {
      const s = spec(id);
      const L = generateDistrict(s);
      expect(L.wasps.length, id).toBe(s.wasps);
      expect(L.mechs.length, id).toBe(s.mechs);
      expect(L.pedestrians, id).toBe(s.pedestrians);
      expect(L.district, id).toBe(s.cast);
      expect(L.nodes.map((n) => n.label), id).toEqual(["A", "B", "C", "D", "E"]);
      expect(L.zones!.filter((z) => z.kind === "safe").length, id).toBe(2);
      expect(L.claims!.length, id).toBeGreaterThanOrEqual(10);
      for (const c of L.claims!) for (const z of L.zones!) expect(Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z), id).toBeGreaterThan(z.radius + 2);
      // the loading card names a picture, and it is one that ships
      expect(LEVEL_ART[id], id).toBeTruthy();
      expect(existsSync(new URL(`../public${LEVEL_ART[id]}`, import.meta.url)), LEVEL_ART[id]).toBe(true);
    }
  });
});

describe("a Blank can walk every new district", () => {
  for (const id of NEW) {
    it(`${id}: every spawn reaches every node, every claim and both safe zones at street level`, () => {
      const L = levelById(id);
      const nav = buildNav(L);
      const on = (reach: Set<number>, x: number, z: number, what: string) => {
        const c = cellOf(nav, x, z);
        expect(walkable(nav, c.i, c.j), `${id} ${what} (${x}, ${z}) stands on walkable ground`).toBe(true);
        expect(reach.has(c.j * nav.w + c.i), `${id} ${what} (${x}, ${z}) is reachable`).toBe(true);
      };
      for (const sp of L.spawns) {
        const reach = reachableFrom(nav, sp.pos);
        for (const s of L.spawns) on(reach, s.pos.x, s.pos.z, "spawn");
        for (const n of L.nodes) on(reach, n.pos.x, n.pos.z, `node ${n.label}`);
        for (const cl of L.claims!) on(reach, cl.pos.x, cl.pos.z, `claim worth ${cl.value}`);
        for (const z of L.zones!) on(reach, z.pos.x, z.pos.z, `safe zone ${z.label}`);
        // and every gate's arrival point: a file walking in can walk on
        for (let g = 0; g < GATES_PER_DISTRICT; g++) {
          const a = gateArrival(L, g)!.pos;
          on(reach, a.x, a.z, `gate ${g} arrival`);
        }
      }
    });

    it(`${id}: spawns, nodes, claims, zones and gate arrivals stand clear of every box`, () => {
      const L = levelById(id);
      const free = (x: number, z: number) => capsuleFree({ x, y: 0.03, z }, MOVE.capsuleRadius, MOVE.standHeight, L.boxes);
      for (const s of L.spawns) expect(free(s.pos.x, s.pos.z), `spawn ${s.pos.x},${s.pos.z}`).toBe(true);
      for (const n of L.nodes) expect(free(n.pos.x, n.pos.z), `node ${n.label}`).toBe(true);
      for (const c of L.claims!) expect(free(c.pos.x, c.pos.z), `claim ${c.pos.x},${c.pos.z}`).toBe(true);
      for (const z of L.zones!) expect(free(z.pos.x, z.pos.z), `zone ${z.label}`).toBe(true);
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const a = gateArrival(L, g)!.pos;
        expect(free(a.x, a.z), `gate ${g} arrival`).toBe(true);
      }
    });
  }
});

describe("the gates join five districts", () => {
  it("each new district has its eight gates, numbered in the order the map reads them", () => {
    for (const id of NEW) {
      const L = levelById(id);
      expect(L.exits!.length, id).toBe(GATES_PER_DISTRICT);
      L.exits!.forEach((e, g) => expect(e.dir, `${id} gate ${g}`).toBe(gateSide(g)));
      expect(L.boxes.filter((b) => b.tag === "gate").length, id).toBe(GATES_PER_DISTRICT);
    }
  });

  it("every gate of every district pairs with one gate of a neighbour, both ways, and never with itself", () => {
    const seen = new Set<string>();
    for (const d of CITY_DISTRICTS) {
      for (let g = 0; g < GATES_PER_DISTRICT; g++) {
        const to = neighbourAt(d, g)!;
        expect(to, `${d} gate ${g}`).not.toBeNull();
        expect(to.district, `${d} gate ${g}`).not.toBe(d);
        expect(neighbourAt(to.district, to.gate), `${d} ${g} → ${to.district} ${to.gate}`).toEqual({ district: d, gate: g });
        // no two gates land at the same gate: the pairing is one to one
        const key = `${to.district}:${to.gate}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(CITY_DISTRICTS.length * GATES_PER_DISTRICT);
  });

  it("the map runs round all five: east from REPO DEPOT is the market, the heights are west of LEASE ROW, and every district reaches every other", () => {
    const go = (d: string, side: "n" | "s" | "w" | "e") => neighbourAt(d, ["n", "s", "w", "e"].indexOf(side))!.district;
    expect(go("repo_depot", "e")).toBe("night_market");
    expect(go("night_market", "e")).toBe("relay_heights");
    expect(go("relay_heights", "e")).toBe("lease_row");
    expect(go("lease_row", "w")).toBe("relay_heights");
    expect(go("lease_row", "n")).toBe("relay_heights");
    expect(go("night_market", "w")).toBe("repo_depot");
    // walking east visits every district once before it comes home
    const loop = [CITY_DISTRICTS[0]!];
    while (loop.length <= CITY_DISTRICTS.length) loop.push(go(loop[loop.length - 1]!, "e"));
    expect(new Set(loop.slice(0, -1)).size).toBe(CITY_DISTRICTS.length);
    expect(loop[loop.length - 1]).toBe(CITY_DISTRICTS[0]);
    for (const a of CITY_DISTRICTS) {
      const seen = new Set([a]);
      const todo = [a];
      while (todo.length) {
        const x = todo.pop()!;
        for (let g = 0; g < GATES_PER_DISTRICT; g++) {
          const y = neighbourAt(x, g)!.district;
          if (!seen.has(y)) {
            seen.add(y);
            todo.push(y);
          }
        }
      }
      expect([...seen].sort(), `from ${a}`).toEqual([...CITY_DISTRICTS].sort());
    }
  });
});

describe("the Deep Wake holds the new districts' nodes", () => {
  it("a fresh season has five nodes in each; a round played in one moves its graph", () => {
    const st = emptySeason(3);
    for (const id of NEW) expect(Object.keys(st.districts[id]!), id).toEqual([...NODE_LABELS]);
    applyRound(st, { level: "night_market", flips: [{ label: "C", house: "clockeaters", count: 2 }], winners: [] }, 3 * 28 * 86_400_000 + 1);
    expect(st.districts["night_market"]!["C"]!.pressure.clockeaters).toBe(2);
    expect(st.last).toMatch(/NIGHT MARKET/);
  });

  it("a season stored before the district existed opens its graph on the district's first round, and leaves the others as they were", () => {
    const st = emptySeason(3);
    delete st.districts["relay_heights"];
    st.districts["lease_row"]!["A"]!.house = "estate";
    const before = JSON.stringify(st.districts["lease_row"]);
    applyRound(st, { level: "relay_heights", flips: [{ label: "E", house: "cells", count: 1 }], winners: [] }, 3 * 28 * 86_400_000 + 1);
    expect(Object.keys(st.districts["relay_heights"]!)).toEqual([...NODE_LABELS]);
    expect(st.districts["relay_heights"]!["E"]!.pressure.cells).toBe(1);
    expect(JSON.stringify(st.districts["lease_row"])).toBe(before);
    // a level that is not a district still opens nothing
    expect(applyRound(st, { level: "drainage_yard", flips: [{ label: "A", house: "cells", count: 9 }], winners: [] }, 3 * 28 * 86_400_000 + 1)).toEqual([]);
    expect(st.districts["drainage_yard"]).toBeUndefined();
  });
});
