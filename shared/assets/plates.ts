/**
 * Which generated plate goes on which surface (Stage 632).
 *
 * The art mill produced 143 plates. Most were bound one-to-one to a material and the rest — 81 of
 * them — shipped in every download and were drawn on nothing: a player paid for 12 MB of texture
 * they could never see. This table is the other half of the pipeline the asset lint was missing.
 *
 * A family is a surface that can take more than one look: a road is a road whichever plate is on
 * it. Each district picks from its family's pool by its own skyline seed, so Lease Row's cobble and
 * the Depot's cobble are different stone rather than the same tile twice. Picking never changes how
 * many textures a material holds — `bindPlate` swaps `mat.map`, it does not add one — so the frame
 * budget is the same whichever member comes up.
 *
 * Pure data: ids only, no renderer types, so the lint and the client can both read it.
 */

/** Surface families, each a pool one plate is picked from per district. Index 0 is the plate the
 *  surface wore before it had a pool, so a district that seeds to 0 looks exactly as it did. */
export const PLATE_POOLS = {
  /** the road deck itself: wet asphalt, worn and puddled */
  road: ["tex_asphalt_2", "tex_var_028", "tex_var_039"],
  /** kerbs and walkways: laid stone, wet */
  cobble: ["tex_wet_cobble", "tex_var_057", "tex_var_026", "tex_plaza_hexstone"],
  /** drain covers and inspection plates set into the deck */
  drain: ["tex_grate", "tex_var_025", "tex_var_062", "tex_var_076"],
  /** the flat pads a player actually stands on between the kerbs */
  paving: ["tex_wet_asphalt", "tex_var_071", "tex_var_077", "tex_var_027"],
  /** walkable metal: tread plate and mesh decking */
  tread: ["tex_metal", "tex_var_049", "tex_var_081", "tex_plaza_tread"],
  /** extract fans and wall vents */
  vent: ["tex_vent", "tex_var_050"],
  /** painted hazard, at the edges a player is not meant to cross */
  hazard: ["tex_vantage_hazard", "tex_var_041"],
  /** roller shutters and corrugated sheet */
  shutter: ["tex_shutter", "tex_var_090", "tex_wall_shutter"],
  /**
   * The plaza deck — the surface that fills most of a street camera.
   *
   * Stage 632 measured that binding the kerbs and gratings changed almost nothing about how a
   * street reads, because this is what the player is actually looking at and it was still the one
   * flat plate it shipped with. These are the tiles generated for it (Stage 634).
   */
  plaza: ["tex_pavement", "tex_plaza_terrazzo", "tex_plaza_slab", "tex_plaza_asphalt"],
  /** poured walls and the mass behind the dressing */
  concrete: ["tex_concrete", "tex_wall_boardform"],
  /** the dark bulkhead behind the neon: pipework, looms, conduit */
  bulkhead: ["tex_bulkhead", "tex_wall_conduit"],
  /** stacked containers in the yards */
  container: ["tex_container", "tex_wall_container"],
  /** a magenta district's brick; the amber and cyan casts keep their own */
  brick: ["tex_neon_brick", "tex_wall_neonbrick"],
  /** what the Deadletter Office and the hub are floored with */
  officefloor: ["tex_white_office", "tex_office_tile", "tex_office_carpet"],
  /** and walled with */
  officewall: ["tex_white_office", "tex_office_acoustic", "tex_office_steel"],
  /** THE KERNEL on the horizon, and the filament that runs through it */
  kernel: ["tex_kernel_hull", "tex_kernel_filament"],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type PlateFamily = keyof typeof PLATE_POOLS;

/**
 * The plate this district wears for this surface. Deterministic in the seed, so a district looks
 * the same every time it is built and two districts rarely look the same as each other.
 */
export function platePick(family: PlateFamily, seed: number): string {
  const pool = PLATE_POOLS[family] as readonly string[];
  // A deal, not a draw. Dealing by the district's place in the shipped list means N districts show
  // min(N, pool) distinct plates rather than however many a hash happens to land on — with seven
  // districts and pools of at most four, every pooled plate is on a surface somewhere. The family
  // offsets the deal so a district does not turn every one of its surfaces the same way.
  const rank = SHIPPED_DISTRICT_SEEDS.indexOf(seed);
  if (rank >= 0) {
    let off = 0;
    for (let i = 0; i < family.length; i++) off = (off * 31 + family.charCodeAt(i)) >>> 0;
    return pool[(rank + off) % pool.length]!;
  }
  // a level that is not one of the shipped districts still has to pick something stable
  let h = seed >>> 0;
  for (let i = 0; i < family.length; i++) h = (Math.imul(h ^ family.charCodeAt(i), 16777619) + 1013904223) >>> 0;
  return pool[((Math.imul(h, 1664525) + 1013904223) >>> 0) % pool.length]!;
}

/**
 * The skyline seeds of every district that ships: the three hand-built levels and the three
 * generated ones, plus `dressLevel`'s fallback for a level that names no seed. A pooled plate no
 * seed here can reach is not in the game, whatever the pool says — `lintPlatesAreDrawn` checks it.
 */
export const SHIPPED_DISTRICT_SEEDS: readonly number[] = [3, 5, 42, 77, 1101, 2202, 3303];

/** Every plate a shipped district can actually put on a surface. */
export function reachablePlates(): readonly string[] {
  const out = new Set<string>();
  for (const family of Object.keys(PLATE_POOLS) as PlateFamily[]) for (const seed of SHIPPED_DISTRICT_SEEDS) out.add(platePick(family, seed));
  return [...out];
}

/** Every plate any family can put on a surface. */
export function pooledPlates(): readonly string[] {
  return Object.values(PLATE_POOLS).flat();
}

/**
 * Plates that still ship and are still drawn on nothing, recorded so the lint can hold the line.
 *
 * This list is a debt, not a target: `lintPlatesAreDrawn` fails when a plate outside it goes
 * undrawn, and fails again when a plate inside it turns out to be drawn after all. It may only
 * shrink. Do not add to it — a new plate arrives with the surface it belongs on, or it does not
 * ship.
 */
export const UNDRAWN_PLATES: readonly string[] = [
  "tex_var_012", "tex_var_013", "tex_var_014", "tex_var_015", "tex_var_016", "tex_var_017",
  "tex_var_018", "tex_var_019", "tex_var_020", "tex_var_021", "tex_var_022", "tex_var_023",
  "tex_var_024", "tex_var_029", "tex_var_030", "tex_var_031", "tex_var_032", "tex_var_033",
  "tex_var_034", "tex_var_035", "tex_var_036", "tex_var_037", "tex_var_038", "tex_var_040",
  "tex_var_042", "tex_var_043", "tex_var_044", "tex_var_045", "tex_var_046", "tex_var_047",
  "tex_var_048", "tex_var_051", "tex_var_052", "tex_var_053", "tex_var_054", "tex_var_055",
  "tex_var_056", "tex_var_058", "tex_var_059", "tex_var_060", "tex_var_061", "tex_var_063",
  "tex_var_064", "tex_var_065", "tex_var_066", "tex_var_067", "tex_var_068", "tex_var_069",
  "tex_var_070", "tex_var_072", "tex_var_073", "tex_var_074", "tex_var_075", "tex_var_078",
  "tex_var_080", "tex_var_082", "tex_var_083", "tex_var_084", "tex_var_085", "tex_var_086",
  "tex_var_087", "tex_var_088", "tex_var_089", "tex_var_091", "tex_var_093", "tex_var_094",
];
