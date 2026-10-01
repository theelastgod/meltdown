/**
 * The full economy manifest: every item the game has, in the one shape the lint understands.
 * Progression items (nodes, keystones, chips, firmwares) carry their mechanical trades and no
 * market. Wakelight cosmetics (Stage 11) carry neither a stat nor a market — they are off-chain
 * prestige. The $CAPITAL items below are the only things that touch the chain, and none of them has
 * a mechanical block: `lintEconomy(economyManifest())` runs in CI.
 */
import { ALL_ITEMS } from "../manifest/items";
import { CHIPS } from "../manifest/chips";
import { FIRMWARES } from "../manifest/firmwares";
import { COSMETICS } from "../endgame/rewrite";
import type { EconomyItem, MarketBlock } from "./manifest";
import { ROOM_HOUR_PRICE, SEASON_PASS_PRICE } from "./sinks";
import type { Account } from "../progression/account";

/** An on-chain cosmetic: an ERC-1155 token id, a $CAPITAL price, a wear seed, and a palette the renderer tints with. Nothing else. */
export interface SkinDef {
  /** ERC-1155 token id (the only thing that travels in a match snapshot) */
  token: number;
  id: string;
  name: string;
  line: string;
  capital: number;
  /** the deterministic wear seed the metadata carries */
  wearSeed: number;
  /** tint for the rig: remote body emissive + the local viewmodel strip */
  tint: string;
  /**
   * An optional asset id for the rig's plate (Stage 43). Cosmetic like the tint beside it: the
   * renderer looks it up, the sim never sees it, and a skin with no texture — or one whose file
   * fails to load — falls back to the tint alone, which is what every skin did before this existed.
   */
  texture?: string;
}

const skin = (token: number, id: string, name: string, line: string, capital: number, wearSeed: number, tint: string, texture?: string): SkinDef => ({ token, id, name, line, capital, wearSeed, tint, ...(texture ? { texture } : {}) });

export const SKINS: readonly SkinDef[] = [
  skin(1, "skin_rust", "RUST LEASE", "A RIG THAT HAS BEEN RAINED ON SINCE THE ESTATE STOPPED COUNTING", 40, 0x5a17, "#d86a2a", "skin_rust_plate"),
  skin(2, "skin_phosphor", "PHOSPHOR TRIM", "THE FIRST CRT'S GREEN ON EVERY EDGE", 60, 0x1b3f, "#5cff9a", "skin_phosphor_plate"),
  skin(3, "skin_kernel", "KERNEL PLATE", "RED FILAMENT WITHOUT THE FILAMENT", 120, 0x77e1, "#ff2a4a", "skin_kernel_plate"),
  skin(4, "skin_deadletter", "DEADLETTER WHITE", "THE OFFICE'S OWN PAINT, CUT FROM A SEALED DOOR", 200, 0x0c02, "#f2f4ff", "skin_deadletter_plate"),
  skin(5, "skin_wake", "WAKE TRIM", "GREEN EDGE-LIGHT ON WET STEEL, THE COLOUR A NODE GOES WHEN IT FLIPS", 50, 0x3e91, "#37ff8b", "skin_wake_plate"),
  skin(6, "skin_estate", "ESTATE PLATE", "CYAN ANODIZED LEDGER-GRID, THE CONTRACTOR'S OWN PAINT", 70, 0x11d8, "#35f2ff", "skin_estate_plate"),
  skin(7, "skin_clockeater", "CLOCKEATER BRASS", "GEARS THAT RUN FASTER THAN THE CITY CAN COUNT", 90, 0xa2c4, "#ffd27a", "skin_clockeater_plate"),
  skin(8, "skin_ledger", "LEDGER BREAK", "MAGENTA STAMP OVER A CRT THAT STILL SAYS PENDING", 110, 0x6f0b, "#ff3ec9", "skin_ledger_plate"),
  skin(9, "skin_vantage", "VANTAGE AMBER", "CONTRACTOR CHEVRONS, THE COLOUR OF A SEARCHLIGHT", 80, 0x4c2a, "#ffb02e", "skin_vantage_plate"),
  skin(10, "skin_blank", "UNLISTED BLACK", "NEAR-BLACK, ONE PINHOLE OF CYAN", 45, 0x90e1, "#35f2ff", "skin_blank_plate"),
  skin(11, "skin_rain", "RAIN LEASE", "ANODIZED BLACK THAT NEVER DRIED", 55, 0x2b17, "#8fd8ff", "skin_rain_plate"),
  skin(12, "skin_metro", "METRO PLATE", "GREY-GREEN TUNNEL TILE, CYAN BARS", 75, 0x71a0, "#37ff8b", "skin_metro_plate"),
  skin(13, "skin_violet", "ECHO VIOLET", "GHOSTING PLATE, SHORT-RANGE WALLSENSE LOOK", 95, 0x5d33, "#8f4dff", "skin_violet_plate"),
  skin(14, "skin_forged", "FORGED TRIM", "AMBER SERVO LIGHT ON WET STEEL", 85, 0x18c4, "#ffb02e", "skin_amber_trim"),
  skin(15, "skin_grid", "ESTATE GRID", "CYAN MONITOR GRID", 65, 0x0e91, "#35f2ff", "skin_cyan_grid"),
  skin(16, "skin_black_lease", "BLACK LEASE", "CRT PHOSPHOR ON A SEALED FILE", 100, 0x6a0b, "#7dffb0", "skin_black_lease"),
  skin(17, "skin_phage", "PHAGE PLATE", "GREEN-BLACK CONTAGION PAINT, THE LAUNCHER'S OWN STAIN", 88, 0x4e2c, "#37ff8b", "skin_phage_plate"),
  skin(18, "skin_longwave", "LONGWAVE ICE", "COLD CYAN RAIL, THE COLOUR A CHARGE HOWLS", 105, 0x7b19, "#8fd8ff", "skin_longwave_plate"),
  skin(19, "skin_hammer", "HAMMER RUST", "SHOTGUN STEEL THAT NEVER LEFT THE RAIN", 72, 0x2c80, "#e0561e", "skin_hammer_plate"),
  skin(20, "skin_baton", "BATON VIOLET", "SHOCK-VIOLET TRIM ON A CLOSE-IN STICK", 68, 0x91d4, "#8f4dff", "skin_baton_plate"),
  skin(21, "skin_stack", "STACK PLATE", "STACKED POLYMER, THE SMG'S OWN RAIN", 58, 0x3a55, "#37ff8b", "tex_smg_stack"),
  skin(22, "skin_directive", "DIRECTIVE CORE", "RED FILAMENT ON THE OPTIC, THE LEASE THAT NEVER MISSED", 130, 0x8c12, "#ff2a4a", "tex_directive_core"),
  skin(23, "skin_breaker", "LEASE STEEL", "ANODIZED SHOTGUN STEEL, AMBER CHEVRONS IN THE RAIN", 78, 0x1f70, "#ffb02e", "tex_lease_steel"),
  skin(24, "skin_arc", "ARC VIOLET", "SHOCK-ARC PLATE, THE BATON'S OWN LIGHT", 82, 0x62aa, "#8f4dff", "tex_shock_arc"),
  skin(25, "skin_chevron", "REPO CHEVRON", "CONTRACTOR HAZARD STRIPES, THE SHOTGUN'S OWN RAIN", 76, 0x51c8, "#ffb02e", "tex_repo_chevron"),
  skin(26, "skin_filament", "LONGWAVE FILAMENT", "CYAN WAVE-TRACES ON BLACK ALLOY, THE RAIL'S OWN HOWL", 108, 0x0af3, "#35f2ff", "tex_longwave_filament"),
  skin(27, "skin_vein", "PHAGE VEIN", "IRIDESCENT SPORE-VEIN POLYMER, THE LAUNCHER'S OWN STAIN", 92, 0x7e46, "#37ff8b", "tex_phage_vein"),
  skin(28, "skin_gear", "CLOCK GEAR", "BRASS GEARS ON WET STEEL, FASTER THAN THE CITY CAN COUNT", 98, 0x2d9b, "#ffd27a", "tex_clock_gear"),
  skin(29, "skin_conduit", "CONDUIT TRACE", "CYAN CABLE WOVEN THROUGH WET BLACK STEEL", 66, 0xc0d1, "#35f2ff", "skin_conduit_plate"),
  skin(30, "skin_shutter", "SHUTTER", "CLOSED METAL SHUTTER SLATS, NEAR-BLACK, THIN MAGENTA LIGHT IN THE GAPS", 48, 45342, "#35f2ff", "skin_shutter_plate"),
  skin(31, "skin_canal", "CANAL", "WET DARK CONCRETE WITH LONG CYAN PUDDLE REFLECTIONS", 62, 45343, "#ff3ec9", "skin_canal_plate"),
  skin(32, "skin_gantry", "GANTRY", "DARK CRANE STEEL PANELS WITH THIN CYAN STRIP-LIGHTS ALONG SEAMS", 74, 45344, "#ffb02e", "skin_gantry_plate"),
  skin(33, "skin_lantern", "LANTERN", "WARM-NOT-AMBER PAPER LANTERN CLOTH, MOSTLY BLACK, THIN MAGENTA GLOW IN", 88, 45345, "#37ff8b", "skin_lantern_plate"),
  skin(34, "skin_uplink", "UPLINK", "DARK ALLOY WITH A FAINT CYAN DISH-GRID, NO READABLE MARKS", 96, 45346, "#8f4dff", "skin_uplink_plate"),
  skin(35, "skin_bulkhead", "BULKHEAD", "DARK RIBBED STEEL WITH A THIN GREEN CIRCULAR SEAM", 110, 45347, "#ffd27a", "skin_bulkhead_plate"),
  skin(36, "skin_static", "STATIC", "NEAR-BLACK CRT PHOSPHOR NOISE, SPARSE GREEN SPECKS, NO LETTERS", 58, 45348, "#8fd8ff", "skin_static_plate"),
  skin(37, "skin_ash", "ASH", "SOOT-BLACK BRUSHED METAL, ALMOST NO COLOR, ONE FAINT CYAN SCRATCH", 82, 45349, "#f2f4ff", "skin_ash_plate"),
  skin(38, "skin_chain", "CHAIN", "DARK CHAINLINK OVER BLACK, A THIN AMBER WIRE ONLY AT THE KNOTS", 48, 0xc226, "#35f2ff", "skin_chain_plate"),
  skin(39, "skin_puddle", "PUDDLE", "BLACK GLASS WITH STRETCHED CYAN AND MAGENTA REFLECTIONS", 62, 0xc227, "#ff3ec9", "skin_puddle_plate"),
  skin(40, "skin_brick", "BRICK", "NEAR-BLACK BRICK WITH A SINGLE CYAN MORTAR LINE", 74, 0xc228, "#ffb02e", "skin_brick_plate"),
  skin(41, "skin_scaffold", "SCAFFOLD", "DARK RUSTED SCAFFOLD POLES, COOL, NO ORANGE FIRE", 88, 0xc229, "#37ff8b", "skin_scaffold_plate"),
  skin(42, "skin_rack", "RACK", "DARK SERVER-RACK METAL, TINY CYAN PIN LIGHTS, NO DIGITS", 48, 0xc22a, "#35f2ff", "skin_rack_plate"),
  skin(43, "skin_vent", "VENT", "DARK VENT GRILLE, CYAN EDGE ON EVERY OTHER SLAT", 62, 0xc22b, "#ff3ec9", "skin_vent_plate"),
  skin(44, "skin_cable", "CABLE", "BUNDLED BLACK CABLES WITH ONE CYAN TRACER STRAND", 74, 0xc22c, "#ffb02e", "skin_cable_plate"),
  skin(45, "skin_hex", "HEX", "DARK HEX STONE PAVEMENT, WET, CYAN IN THE CRACKS", 88, 0xc22d, "#37ff8b", "skin_hex_plate"),
  skin(46, "skin_terrazzo", "TERRAZZO", "DARK TERRAZZO CHIPS, MAGENTA FLECKS, NO PATTERN TEXT", 96, 0xc22e, "#8f4dff", "skin_terrazzo_plate"),
  skin(47, "skin_rib", "RIB", "DARK ACOUSTIC RIBBED WALL, COOL GREY, ONE CYAN BAR", 110, 0xc22f, "#ffd27a", "skin_rib_plate"),
  skin(48, "skin_rail", "RAIL", "COLD CYAN RAIL METAL, BLACK GAPS, NO MARKINGS", 58, 0xc230, "#8fd8ff", "skin_rail_plate"),
  skin(49, "skin_oil", "OIL", "BLACK OIL-SLICK METAL, THIN CYAN AND MAGENTA INTERFERENCE", 82, 0xc231, "#f2f4ff", "skin_oil_plate"),
  skin(50, "skin_spore", "SPORE", "DARK POLYMER WITH THIN GREEN VEIN LINES, NO GORE", 48, 0xc232, "#35f2ff", "skin_spore_plate"),
  skin(51, "skin_cloak", "CLOAK", "NEUTRAL DARK WOVEN CLOTH, NO SCENERY, NO FACE", 62, 0xc233, "#ff3ec9", "skin_cloak_plate"),
  skin(52, "skin_hood", "HOOD", "MATTE BLACK HOOD FABRIC WITH ONE CYAN STITCH", 74, 0xc234, "#ffb02e", "skin_hood_plate"),
  skin(53, "skin_crate", "CRATE", "DARK SHIPPING CRATE PANELS, CYAN CORNER, NO STENCILS", 88, 0xc235, "#37ff8b", "skin_crate_plate"),
  skin(54, "skin_cone", "CONE", "DARK RUBBER WITH ONE AMBER BAND, NO TEXT", 96, 0xc236, "#8f4dff", "skin_cone_plate"),
  skin(55, "skin_drum", "DRUM", "DARK BARREL METAL, MAGENTA RIM", 110, 0xc237, "#ffd27a", "skin_drum_plate"),
  skin(56, "skin_carpaint", "CARPAINT", "DARK FACETED CAR PAINT, ONE CYAN HIGHLIGHT LINE", 58, 0xc238, "#8fd8ff", "skin_carpaint_plate"),
  skin(57, "skin_awning", "AWNING", "DARK CANVAS, MAGENTA UNDERSIDE, CYAN STITCH", 82, 0xc239, "#f2f4ff", "skin_awning_plate"),
  skin(58, "skin_seam", "SEAM", "DARK PANEL SEAMS, A CYAN GASKET LINE", 48, 0xc23a, "#35f2ff", "skin_seam_plate"),
  skin(59, "skin_tarp", "TARP", "DARK TARP FOLDS, MAGENTA UNDERSIDE, NO MARKS", 62, 0xc23b, "#ff3ec9", "skin_tarp_plate"),
  skin(60, "skin_mesh", "MESH", "DARK WIRE MESH, CYAN ONLY AT THE CROSSINGS", 74, 0xc23c, "#ffb02e", "skin_mesh_plate"),
  skin(61, "skin_rivet", "RIVET", "DARK RIVETED PLATE, SPARSE CYAN HEADS", 88, 0xc23d, "#37ff8b", "skin_rivet_plate"),
  skin(62, "skin_hose", "HOSE", "COILED BLACK HOSE, ONE CYAN STRIPE", 96, 0xc23e, "#8f4dff", "skin_hose_plate"),
  skin(63, "skin_duct", "DUCT", "DARK SQUARE DUCT, A MAGENTA CORNER", 110, 0xc23f, "#ffd27a", "skin_duct_plate"),
  skin(64, "skin_crack", "CRACK", "NEAR-BLACK CONCRETE, THIN GREEN IN THE CRACKS", 58, 0xc240, "#8fd8ff", "skin_crack_plate"),
  skin(65, "skin_nosing", "NOSING", "DARK STAIR NOSING, ONE CYAN WEAR LINE", 82, 0xc241, "#f2f4ff", "skin_nosing_plate"),
  skin(66, "skin_kerb", "KERB", "DARK KERB STONE, WET, A CYAN EDGE", 48, 0xc242, "#35f2ff", "skin_kerb_plate"),
  skin(67, "skin_gutter", "GUTTER", "DARK STREET GUTTER, A THIN LINE OF CYAN WATER", 62, 0xc243, "#ff3ec9", "skin_gutter_plate"),
  skin(68, "skin_grate", "GRATE", "DARK STORM GRATE, CYAN LIGHT IN THE SLOTS", 74, 0xc244, "#ffb02e", "skin_grate_plate"),
  skin(69, "skin_pipe", "PIPE", "BUNDLED BLACK PIPES, ONE CYAN BAND, NO LABELS", 88, 0xc245, "#37ff8b", "skin_pipe_plate"),
  skin(70, "skin_patina", "PATINA", "DARK STEEL WITH A COOL DULL PATINA, NO BRIGHT RUST", 96, 0xc246, "#8f4dff", "skin_patina_plate"),
  skin(71, "skin_glass", "GLASS", "BLACK GLASS, A THIN MAGENTA EDGE", 110, 0xc247, "#ffd27a", "skin_glass_plate"),
  skin(72, "skin_cloth", "CLOTH", "DARK HANGING CLOTH, MAGENTA HEM, NO LETTERS", 58, 0xc248, "#8fd8ff", "skin_cloth_plate"),
  skin(73, "skin_tube", "TUBE", "DARK WALL, ONE THIN CYAN TUBE, NO SIGN", 82, 0xc249, "#f2f4ff", "skin_tube_plate"),
  skin(74, "skin_foam", "FOAM", "DARK ACOUSTIC FOAM, ONE CYAN PIT", 48, 0xc24a, "#35f2ff", "skin_foam_plate"),
  skin(75, "skin_grout", "GROUT", "DARK CERAMIC TILE, CYAN GROUT, NO PATTERN", 62, 0xc24b, "#ff3ec9", "skin_grout_plate"),
  skin(76, "skin_diamond", "DIAMOND", "DARK DIAMOND RUBBER, NO TEXT", 74, 0xc24c, "#ffb02e", "skin_diamond_plate"),
  skin(77, "skin_slag", "SLAG", "DARK SLAG GLASS, MAGENTA FLECKS", 88, 0xc24d, "#37ff8b", "skin_slag_plate"),
  skin(78, "skin_frost", "FROST", "DARK METAL, A THIN CYAN FROST", 96, 0xc24e, "#8f4dff", "skin_frost_plate"),
  skin(79, "skin_scratch", "SCRATCH", "SOOT ON STEEL, ONE AMBER SCRATCH", 110, 0xc24f, "#ffd27a", "skin_scratch_plate"),
  skin(80, "skin_louver", "LOUVER", "DARK LOUVERS, CYAN ON EVERY THIRD SLAT", 58, 0xc250, "#8fd8ff", "skin_louver_plate"),
  skin(81, "skin_bolts", "BOLTS", "DARK BOLT HEADS IN A GRID, NO STAMPS", 82, 0xc251, "#f2f4ff", "skin_bolts_plate"),
  skin(82, "skin_weld", "WELD", "DARK WELD BEADS, A CYAN HEAT TINT", 48, 0xc252, "#35f2ff", "skin_weld_plate"),
  skin(83, "skin_foil", "FOIL", "DARK CRUMPLED FOIL, A CYAN EDGE", 62, 0xc253, "#ff3ec9", "skin_foil_plate"),
  skin(84, "skin_gasket", "GASKET", "DARK RUBBER GASKET, A MAGENTA RING", 74, 0xc254, "#ffb02e", "skin_gasket_plate"),
  skin(85, "skin_tread", "TREAD", "DARK METAL TREAD, CYAN IN THE GROOVES", 88, 0xc255, "#37ff8b", "skin_tread_plate"),
  skin(86, "skin_splice", "SPLICE", "DARK CABLE SPLICE, CYAN TAPE, NO LABELS", 96, 0xc256, "#8f4dff", "skin_splice_plate"),
  skin(87, "skin_hatch", "HATCH", "DARK HATCH PLATE, A CYAN RIM", 110, 0xc257, "#ffd27a", "skin_hatch_plate"),
  skin(88, "skin_perf", "PERF", "DARK PERFORATED SCREEN, MAGENTA DOTS", 58, 0xc258, "#8fd8ff", "skin_perf_plate"),
  skin(89, "skin_felt", "FELT", "DARK ROOFING FELT, ONE CYAN NAIL LINE", 82, 0xc259, "#f2f4ff", "skin_felt_plate"),
  skin(90, "skin_resin", "RESIN", "DARK POURED RESIN, CYAN INCLUSIONS", 48, 0xc25a, "#35f2ff", "skin_resin_plate"),
  skin(91, "skin_slate", "SLATE", "DARK WET SLATE, A CYAN DRIP", 62, 0xc25b, "#ff3ec9", "skin_slate_plate"),
  skin(92, "skin_copper", "COPPER", "DARK OXIDISED COPPER, NO BRIGHT ORANGE", 74, 0xc25c, "#ffb02e", "skin_copper_plate"),
  skin(93, "skin_gravel", "GRAVEL", "DARK WET GRAVEL, CYAN IN THE GAPS", 88, 0xc25d, "#37ff8b", "skin_gravel_plate"),
  skin(94, "skin_lead", "LEAD", "DARK LEAD SHEET, ONE CYAN SCRATCH", 96, 0xc25e, "#8f4dff", "skin_lead_plate"),
  skin(95, "skin_mastic", "MASTIC", "DARK ROOF MASTIC, A MAGENTA BEAD", 110, 0xc25f, "#ffd27a", "skin_mastic_plate"),
  skin(96, "skin_clamp", "CLAMP", "DARK HOSE CLAMPS IN A ROW, NO TEXT", 58, 0xc260, "#8fd8ff", "skin_clamp_plate"),
  skin(97, "skin_corrugate", "CORRUGATE", "DARK CORRUGATED SHEET, CYAN IN THE VALLEY", 82, 0xc261, "#f2f4ff", "skin_corrugate_plate"),
  skin(98, "skin_membrane", "MEMBRANE", "DARK ROOF MEMBRANE, ONE CYAN SEAM", 48, 0xc262, "#35f2ff", "skin_membrane_plate"),
  skin(99, "skin_insulator", "INSULATOR", "DARK CERAMIC INSULATOR, A CYAN GLAZE CRACK", 62, 0xc263, "#ff3ec9", "skin_insulator_plate"),
  skin(100, "skin_manhole", "MANHOLE", "DARK MANHOLE TREAD, NO LETTERS, CYAN IN THE CAST", 74, 0xc264, "#ffb02e", "skin_manhole_plate"),
  skin(101, "skin_catwalk", "CATWALK", "DARK CATWALK GRATING, MAGENTA AT THE FAR EDGE", 88, 0xc265, "#37ff8b", "skin_catwalk_plate"),
  skin(102, "skin_joist", "JOIST", "DARK JOIST STEEL, ONE CYAN FLANGE", 96, 0xc266, "#8f4dff", "skin_joist_plate"),
  skin(103, "skin_flashing", "FLASHING", "DARK METAL FLASHING, A CYAN DRIP EDGE", 110, 0xc267, "#ffd27a", "skin_flashing_plate"),
  skin(104, "skin_lintel", "LINTEL", "DARK LINTEL CONCRETE, A THIN CYAN STREAK", 58, 0xc268, "#8fd8ff", "skin_lintel_plate"),
  skin(105, "skin_sill", "SILL", "DARK WINDOW SILL STONE, WET, MAGENTA REFLECTION", 82, 0xc269, "#f2f4ff", "skin_sill_plate"),
  skin(106, "skin_pier", "PIER", "DARK PIER TIMBER, NEARLY BLACK, ONE CYAN BOLT", 48, 0xc26a, "#35f2ff", "skin_pier_plate"),
  skin(107, "skin_fender", "FENDER", "DARK RUBBER FENDER, MAGENTA WEAR", 62, 0xc26b, "#ff3ec9", "skin_fender_plate"),
  skin(108, "skin_cleat", "CLEAT", "DARK MOORING CLEAT METAL, CYAN AT THE HORN", 74, 0xc26c, "#ffb02e", "skin_cleat_plate"),
  skin(109, "skin_bollard", "BOLLARD", "DARK BOLLARD STEEL, ONE AMBER BAND, NO TEXT", 88, 0xc26d, "#37ff8b", "skin_bollard_plate"),
  skin(110, "skin_scupper", "SCUPPER", "DARK DECK SCUPPER, A CYAN TRICKLE", 96, 0xc26e, "#8f4dff", "skin_scupper_plate"),
  skin(111, "skin_coaming", "COAMING", "DARK HATCH COAMING, CYAN ALONG THE LIP", 110, 0xc26f, "#ffd27a", "skin_coaming_plate"),
  skin(112, "skin_davit", "DAVIT", "DARK DAVIT STEEL, MAGENTA AT THE PIN", 58, 0xc270, "#8fd8ff", "skin_davit_plate"),
  skin(113, "skin_winch", "WINCH", "DARK WINCH DRUM, CYAN ON THE GROOVE", 82, 0xc271, "#f2f4ff", "skin_winch_plate"),
  skin(114, "skin_pallet", "PALLET", "DARK PALLET WOOD, NEARLY BLACK, CYAN AT A NAIL", 48, 0xc272, "#35f2ff", "skin_pallet_plate"),
  skin(115, "skin_strap", "STRAP", "DARK WEBBING STRAP, ONE CYAN STITCH, NO WORDS", 62, 0xc273, "#ff3ec9", "skin_strap_plate"),
  skin(116, "skin_netting", "NETTING", "DARK CARGO NET, MAGENTA AT A KNOT", 74, 0xc274, "#ffb02e", "skin_netting_plate"),
  skin(117, "skin_foamblock", "FOAMBLOCK", "DARK DOCK FOAM, A CYAN SPLIT", 88, 0xc275, "#37ff8b", "skin_foamblock_plate"),
  skin(118, "skin_keel", "KEEL", "DARK KEEL PLATE, ONE CYAN WELD", 96, 0xc276, "#8f4dff", "skin_keel_plate"),
  skin(119, "skin_piling", "PILING", "DARK WET PILING, GREEN ONLY IN THE GRAIN", 110, 0xc277, "#ffd27a", "skin_piling_plate"),
  skin(120, "skin_hullplate", "HULLPLATE", "DARK HULL PLATE, MAGENTA AT A SEAM", 58, 0xc278, "#8fd8ff", "skin_hullplate_plate"),
  skin(121, "skin_ladder", "LADDER", "DARK LADDER RUNGS, CYAN ON THE TOP EDGE", 82, 0xc279, "#f2f4ff", "skin_ladder_plate"),
  skin(122, "skin_porthole", "PORTHOLE", "DARK PORTHOLE GLASS, A CYAN RIM, NO ROOM INSIDE", 48, 0xc27a, "#35f2ff", "skin_porthole_plate"),
  skin(123, "skin_cage", "CAGE", "DARK SAFETY CAGE MESH, NO FIGURE, MAGENTA WIRE", 62, 0xc27b, "#ff3ec9", "skin_cage_plate"),
  skin(124, "skin_transformer", "TRANSFORMER", "DARK TRANSFORMER FINS, CYAN BETWEEN THEM, NO LABELS", 74, 0xc27c, "#ffb02e", "skin_transformer_plate"),
  skin(125, "skin_busbar", "BUSBAR", "DARK BUS BAR, ONE CYAN INSULATOR", 88, 0xc27d, "#37ff8b", "skin_busbar_plate"),
  skin(126, "skin_spool", "SPOOL", "DARK CABLE SPOOL, MAGENTA FLANGE, NO TEXT", 96, 0xc27e, "#8f4dff", "skin_spool_plate"),
  skin(127, "skin_junction", "JUNCTION", "DARK JUNCTION BOX, CYAN AT THE KNOCKOUT, NO WRITING", 110, 0xc27f, "#ffd27a", "skin_junction_plate"),
  skin(128, "skin_tray", "TRAY", "DARK CABLE TRAY, CYAN ON THE RUNG", 58, 0xc280, "#8fd8ff", "skin_tray_plate"),
  skin(129, "skin_conduit2", "CONDUIT BEND", "DARK CONDUIT BEND, A CYAN COUPLER, NO MARKS", 82, 0xc281, "#f2f4ff", "skin_conduit2_plate"),
  skin(130, "skin_switch", "SWITCH", "DARK SWITCH PLATE, ONE CYAN SCREW, NO SYMBOLS", 48, 0xc282, "#35f2ff", "skin_switch_plate"),
  skin(131, "skin_meter", "METER", "DARK METER GLASS, NO DIGITS, A MAGENTA REFLECTION", 62, 0xc283, "#ff3ec9", "skin_meter_plate"),
  skin(132, "skin_fuse", "FUSE", "DARK FUSE BLOCK, CYAN AT THE CLIP, NO NUMBERS", 74, 0xc284, "#ffb02e", "skin_fuse_plate"),
  skin(133, "skin_relay", "RELAY", "DARK RELAY HOUSING, A THIN CYAN SEAM", 88, 0xc285, "#37ff8b", "skin_relay_plate"),
  skin(134, "skin_antenna", "ANTENNA", "DARK ANTENNA MAST METAL, MAGENTA AT A CLAMP", 96, 0xc286, "#8f4dff", "skin_antenna_plate"),
  skin(135, "skin_dish", "DISH", "DARK DISH MESH, CYAN AT THE RIM, NO LOGO", 110, 0xc287, "#ffd27a", "skin_dish_plate"),
  skin(136, "skin_radome", "RADOME", "DARK RADOME SKIN, ONE CYAN PANEL LINE", 58, 0xc288, "#8fd8ff", "skin_radome_plate"),
  skin(137, "skin_gantry2", "GANTRY WEB", "DARK GANTRY WEB STEEL, CYAN AT A BOLT", 82, 0xc289, "#f2f4ff", "skin_gantry2_plate"),
  skin(138, "skin_cranehook", "HOOK", "DARK CRANE HOOK STEEL, MAGENTA AT THE TIP", 48, 0xc28a, "#35f2ff", "skin_cranehook_plate"),
  skin(139, "skin_sheave", "SHEAVE", "DARK SHEAVE GROOVE, CYAN IN THE CUT", 62, 0xc28b, "#ff3ec9", "skin_sheave_plate"),
  skin(140, "skin_counterweight", "COUNTERWEIGHT", "DARK COUNTERWEIGHT BLOCKS, ONE CYAN EDGE", 74, 0xc28c, "#ffb02e", "skin_counterweight_plate"),
  skin(141, "skin_outrigger", "OUTRIGGER", "DARK OUTRIGGER BEAM, MAGENTA AT THE PIN", 88, 0xc28d, "#37ff8b", "skin_outrigger_plate"),
  skin(142, "skin_sleeper", "SLEEPER", "DARK RAIL SLEEPER, WET, CYAN BETWEEN THE GRAIN", 96, 0xc28e, "#8f4dff", "skin_sleeper_plate"),
  skin(143, "skin_ballast", "BALLAST", "DARK TRACK BALLAST, CYAN IN THE GAPS", 110, 0xc28f, "#ffd27a", "skin_ballast_plate"),
  skin(144, "skin_fishplate", "FISHPLATE", "DARK RAIL FISHPLATE, NO STAMPS, A CYAN BOLT", 58, 0xc290, "#8fd8ff", "skin_fishplate_plate"),
  skin(145, "skin_thirdrail", "THIRD RAIL", "DARK COVERED RAIL, A THIN CYAN GAP", 82, 0xc291, "#f2f4ff", "skin_thirdrail_plate"),
  skin(146, "skin_catenary", "CATENARY", "DARK CATENARY WIRE, MAGENTA AT A HANGER", 48, 0xc292, "#35f2ff", "skin_catenary_plate"),
  skin(147, "skin_platform", "PLATFORM", "DARK PLATFORM EDGE, A CYAN NOSING, NO TEXT", 62, 0xc293, "#ff3ec9", "skin_platform_plate"),
  skin(148, "skin_tactile", "TACTILE", "DARK TACTILE PAVING, CYAN IN THE DOMES, NO ARROWS", 74, 0xc294, "#ffb02e", "skin_tactile_plate"),
  skin(149, "skin_coping", "COPING", "DARK COPING STONE, WET, A MAGENTA DRIP", 88, 0xc295, "#37ff8b", "skin_coping_plate"),
  skin(150, "skin_parapet", "PARAPET", "DARK PARAPET CONCRETE, ONE CYAN STREAK", 96, 0xc296, "#8f4dff", "skin_parapet_plate"),
  skin(151, "skin_cornice", "CORNICE", "DARK CORNICE, MAGENTA IN THE SHADOW GAP", 110, 0xc297, "#ffd27a", "skin_cornice_plate"),
  skin(152, "skin_mullion", "MULLION", "DARK WINDOW MULLION, A CYAN GASKET", 58, 0xc298, "#8fd8ff", "skin_mullion_plate"),
  skin(153, "skin_spandrel", "SPANDREL", "DARK SPANDREL GLASS, ONE MAGENTA REFLECTION", 82, 0xc299, "#f2f4ff", "skin_spandrel_plate"),
  skin(154, "skin_louvre", "LOUVRE", "DARK LOUVRE BANK, CYAN ON THE FRAME", 48, 0xc29a, "#35f2ff", "skin_louvre_plate"),
  skin(155, "skin_plinth", "PLINTH", "DARK PLINTH STONE, A CYAN DAMP LINE", 62, 0xc29b, "#ff3ec9", "skin_plinth_plate"),
  skin(156, "skin_riser", "RISER", "DARK STAIR RISER, MAGENTA AT THE NOSING", 74, 0xc29c, "#ffb02e", "skin_riser_plate"),
  skin(157, "skin_landing", "LANDING", "DARK LANDING CONCRETE, CYAN IN A JOINT", 88, 0xc29d, "#37ff8b", "skin_landing_plate"),
];

/**
 * What a Deep Wake pass grants (Stage 19). Off-chain on purpose: the pass is burned, and what it
 * hands back is not resellable — a season pass that minted a tradable token would turn the game's
 * biggest sink into a trading vehicle, and "no wagering or staking mechanics of any kind" is a rule
 * the brief states first. They are a theme and two slots: no stat, no token, nothing the sim reads.
 * The lint's `identity-is-cosmetic` rule refuses a mechanical block on any of them.
 */
export const SEASON_PASS_COSMETICS: readonly {
  id: string;
  kind: "theme" | "alias" | "preset";
  name: string;
  line: string;
  palette?: { cy: string; gr: string; mg: string; ye: string; am: string };
}[] = [
  { id: "theme_deep_wake", kind: "theme", name: "DEEP WAKE", line: "THE COLOUR THE GRAPH GOES WHEN A SEASON ENDS AND NOBODY WINS", palette: { cy: "#7ad4ff", gr: "#4aa8a0", mg: "#b070e8", ye: "#d4dde8", am: "#7c90b0" } },
  { id: "alias_4", kind: "alias", name: "ALIAS SLOT IV", line: "A FOURTH SAVED NAME, FOR THE SEASON YOU PAID TO SIT OUT OF" },
  { id: "preset_6", kind: "preset", name: "PRESET SLOT VI", line: "A SIXTH SAVED LOADOUT" },
] as const;

export const SEASON_PASS_GRANTS: readonly string[] = SEASON_PASS_COSMETICS.map((c) => c.id);

/** HUD palette for a pass theme. Shop themes live on COSMETICS; this is the 400 $CAPITAL grant. */
export function passThemePalette(id: string | null | undefined): { cy: string; gr: string; mg: string; ye: string; am: string } | null {
  if (!id) return null;
  const c = SEASON_PASS_COSMETICS.find((x) => x.id === id);
  return c?.kind === "theme" ? c.palette ?? null : null;
}

export const skinByToken = (token: number): SkinDef | undefined => SKINS.find((s) => s.token === token);
export const skinById = (id: string): SkinDef | undefined => SKINS.find((s) => s.id === id);

const onChain = (capital: number, tradable: boolean, randomness: MarketBlock["randomness"] = "none"): MarketBlock => ({ capital, onChain: true, tradable, randomness });

/** Everything, in one list. */
export function economyManifest(): EconomyItem[] {
  const out: EconomyItem[] = [];
  for (const it of ALL_ITEMS) out.push({ id: it.id, kind: it.kind, mechanical: { benefits: it.benefits, costs: it.costs }, market: null, scrip: it.cost });
  for (const c of CHIPS) out.push({ id: c.id, kind: "chip", mechanical: { benefits: c.benefits, costs: c.costs }, market: null });
  // a firmware is a sidegrade certified in band by the Fairness Lint; its trade is the patch itself, recorded here as the band
  for (const f of FIRMWARES) out.push({ id: f.id, kind: "firmware", mechanical: { benefits: [{ stat: "firmware", delta: 1 }], costs: [{ stat: "firmware", delta: -1 }] }, market: null });
  // Wakelight prestige: off-chain, never priced in $CAPITAL, never a stat
  for (const c of COSMETICS) out.push({ id: c.id, kind: c.kind === "theme" ? "theme" : "cosmetic", mechanical: null, market: null });
  for (const s of SKINS) out.push({ id: s.id, kind: "cosmetic", mechanical: null, market: onChain(s.capital, true, "wear_seed") });
  out.push({ id: "name_registry", kind: "name", mechanical: null, market: onChain(150, false) });
  out.push({ id: "room_hour", kind: "room_credit", mechanical: null, market: onChain(ROOM_HOUR_PRICE, false) });
  out.push({ id: "lease_buyout", kind: "season_buyout", mechanical: null, market: onChain(SEASON_PASS_PRICE, false) });
  // what the pass hands back: cosmetics only, and not on chain, so the pass cannot be resold
  for (const c of SEASON_PASS_COSMETICS) out.push({ id: c.id, kind: c.kind === "theme" ? "theme" : "cosmetic", mechanical: null, market: null });
  out.push({ id: "rewrite_certificate", kind: "rewrite_certificate", mechanical: null, market: { capital: null, onChain: true, tradable: false, randomness: "none" } });
  return out;
}

/**
 * Put a held Deep Wake pass's grants on the file (Stage 176).
 *
 * The pass is the game's largest sink: 400 $CAPITAL, burned, for a theme and two slots. Until this
 * existed the counter-ledger wrote those three ids to `a.owned` — the progression list for nodes,
 * chips and weapons — and every consumer of them reads `a.cosmetics`. The theme would not apply
 * and both slots stayed locked. Idempotent, because a reconcile runs on every counter refresh.
 */
export function grantSeasonPass(a: Account): string[] {
  a.cosmetics = a.cosmetics ?? [];
  const added: string[] = [];
  for (const c of SEASON_PASS_COSMETICS) if (!a.cosmetics.includes(c.id)) { a.cosmetics.push(c.id); added.push(c.id); }
  return added;
}
