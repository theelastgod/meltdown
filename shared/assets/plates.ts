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
 * budget is the same whichever member comes up. Rig plates from seam through teardrop
 * (tokens 58–162) are appended. A pool stays at most nine long, so the deal still reaches every
 * member. The awning pool stays four long and keeps its first two entries, so seed 4404 still
 * wears `skin_awning_plate`.
 *
 * Pure data: ids only, no renderer types, so the lint and the client can both read it.
 */

/** Surface families, each a pool one plate is picked from per district. Index 0 is the plate the
 *  surface wore before it had a pool, so a district that seeds to 0 looks exactly as it did. */
export const PLATE_POOLS = {
  /** the road deck itself: wet asphalt, worn and puddled */
  road: ["tex_asphalt_2", "tex_var_028", "tex_var_039", "skin_puddle_plate", "skin_canal_plate", "skin_oil_plate", "skin_membrane_plate", "skin_mastic_plate", "skin_resin_plate"],
  /** kerbs and walkways: laid stone, wet */
  cobble: ["tex_wet_cobble", "tex_var_057", "tex_var_026", "tex_plaza_hexstone", "skin_hex_plate", "skin_kerb_plate", "skin_nosing_plate", "skin_slate_plate", "skin_gravel_plate"],
  /** drain covers and inspection plates set into the deck */
  drain: ["tex_grate", "tex_var_025", "tex_var_062", "tex_var_076", "skin_gutter_plate", "skin_grate_plate", "skin_scupper_plate", "skin_manhole_plate", "skin_coaming_plate"],
  /** the flat pads a player actually stands on between the kerbs */
  paving: ["tex_wet_asphalt", "tex_var_071", "tex_var_077", "tex_var_027", "skin_grout_plate", "skin_tactile_plate", "skin_landing_plate", "skin_coping_plate", "skin_riser_plate"],
  /** walkable metal: tread plate and mesh decking */
  tread: ["tex_metal", "tex_var_049", "tex_var_081", "tex_plaza_tread", "skin_rail_plate", "skin_tread_plate", "skin_chequer_plate", "skin_teardrop_plate", "skin_grating_plate"],
  /** extract fans and wall vents */
  vent: ["tex_vent", "tex_var_050", "skin_vent_plate", "skin_foam_plate", "skin_perf_plate", "skin_louver_plate", "skin_louvre_plate", "skin_frost_plate", "skin_gasket_plate"],
  /** painted hazard, at the edges a player is not meant to cross */
  hazard: ["tex_vantage_hazard", "tex_var_041", "skin_bollard_plate", "skin_diamond_plate", "skin_scratch_plate", "skin_fender_plate", "skin_flashing_plate", "skin_cleat_plate", "skin_pier_plate"],
  /** roller shutters and corrugated sheet */
  shutter: ["tex_shutter", "tex_var_090", "tex_wall_shutter", "skin_shutter_plate", "skin_corrugate_plate", "skin_foil_plate", "skin_lead_plate", "skin_patina_plate", "skin_weld_plate"],
  /**
   * The plaza deck — the surface that fills most of a street camera.
   *
   * Stage 632 measured that binding the kerbs and gratings changed almost nothing about how a
   * street reads, because this is what the player is actually looking at and it was still the one
   * flat plate it shipped with. These are the tiles generated for it (Stage 634).
   */
  plaza: ["tex_pavement", "tex_plaza_terrazzo", "tex_plaza_slab", "tex_plaza_asphalt", "skin_terrazzo_plate", "skin_slag_plate", "skin_glass_plate", "skin_spandrel_plate", "skin_porthole_plate"],
  /** poured walls and the mass behind the dressing */
  concrete: ["tex_concrete", "tex_wall_boardform", "skin_ash_plate", "skin_gantry_plate", "skin_crack_plate", "skin_lintel_plate", "skin_plinth_plate", "skin_parapet_plate", "skin_cornice_plate"],
  /** the dark bulkhead behind the neon: pipework, looms, conduit */
  bulkhead: ["tex_bulkhead", "tex_wall_conduit", "skin_bulkhead_plate", "skin_conduit_plate", "skin_duct_plate", "skin_pipe_plate", "skin_seam_plate", "skin_rivet_plate", "skin_bolts_plate"],
  /** stacked containers in the yards */
  container: ["tex_container", "tex_wall_container", "skin_crate_plate", "skin_pallet_plate", "skin_hullplate_plate", "skin_keel_plate", "skin_foamblock_plate", "skin_piling_plate", "skin_strap_plate"],
  /** a magenta district's brick; the amber and cyan casts keep their own */
  brick: ["tex_neon_brick", "tex_wall_neonbrick", "skin_brick_plate", "skin_sill_plate", "skin_mullion_plate", "skin_copper_plate", "skin_insulator_plate", "skin_meter_plate", "skin_felt_plate"],
  /** what the Deadletter Office and the hub are floored with */
  officefloor: ["tex_white_office", "tex_office_tile", "tex_office_carpet", "skin_switch_plate", "skin_fuse_plate", "skin_relay_plate", "skin_junction_plate", "skin_transformer_plate", "skin_busbar_plate"],
  /** and walled with */
  officewall: ["tex_white_office", "tex_office_acoustic", "tex_office_steel", "skin_rib_plate"],
  /** THE KERNEL on the horizon, and the filament that runs through it */
  kernel: ["tex_kernel_hull", "tex_kernel_filament", "skin_antenna_plate", "skin_dish_plate", "skin_radome_plate", "skin_gantry2_plate", "skin_cranehook_plate", "skin_sheave_plate", "skin_counterweight_plate"],
  /** market canvas: the flat colour the awning wore, then the cloth plate. Length 4 keeps seed 4404 on skin_awning_plate. */
  awning: ["tex_awning_mg", "skin_awning_plate", "skin_tarp_plate", "skin_cloth_plate"],
  /** the other stall colour */
  awningAlt: ["tex_awning_cy", "skin_lantern_plate", "skin_tube_plate"],
  /** chain-link yards */
  chain: ["tex_chainlink", "skin_chain_plate", "skin_netting_plate", "skin_cage_plate", "skin_mesh_plate"],
  /** scaffold poles */
  scaffold: ["tex_scaffold", "skin_scaffold_plate", "skin_handrail_plate", "skin_baluster_plate", "skin_joist_plate", "skin_ladder_plate", "skin_outrigger_plate", "skin_davit_plate", "skin_catwalk_plate"],
  /** drums in the yards */
  barrel: ["tex_barrel", "skin_drum_plate", "skin_winch_plate"],
  /** traffic cones */
  cone: ["tex_cone", "skin_cone_plate"],
  /** parked cars */
  car: ["tex_car", "skin_carpaint_plate"],
  /** loose crates and stall fronts */
  crate: ["tex_crate", "skin_crate_plate"],
  /** cable looms on the rails */
  cable: ["tex_cable", "skin_cable_plate", "skin_spool_plate", "skin_catenary_plate", "skin_hose_plate", "skin_splice_plate", "skin_clamp_plate", "skin_tray_plate", "skin_conduit2_plate"],
  /** the plaza metro booth, which is also the ledger desk */
  metro: ["tex_tile_metro", "skin_rack_plate", "skin_metro_plate", "skin_thirdrail_plate", "skin_fishplate_plate", "skin_sleeper_plate", "skin_ballast_plate", "skin_platform_plate", "skin_hatch_plate"],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type PlateFamily = keyof typeof PLATE_POOLS;

/**
 * The plate this district wears for this surface. Deterministic in the seed, so a district looks
 * the same every time it is built and two districts rarely look the same as each other.
 */
export function platePick(family: PlateFamily, seed: number): string {
  const pool = PLATE_POOLS[family] as readonly string[];
  // A deal, not a draw. Dealing by the district's place in the shipped list means N districts show
  // min(N, pool) distinct plates rather than however many a hash happens to land on. A pool longer
  // than the shipped seed list leaves a plate no district wears. The family
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
 * The skyline seeds of every place that ships: the hand-built rooms, every generated district,
 * and `dressLevel`'s fallback for a level that names no seed. A pooled plate no
 * seed here can reach is not in the game, whatever the pool says — `lintPlatesAreDrawn` checks it.
 */
export const SHIPPED_DISTRICT_SEEDS: readonly number[] = [3, 5, 42, 77, 1101, 2202, 3303, 4404, 5505];

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
