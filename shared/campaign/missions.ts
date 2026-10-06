/**
 * The main arc (seven missions) and the side gigs (twenty-two), as data the
 * mission runtime steps. Objectives are typed; positions are explicit or a
 * wake node's label resolved against the level. Variants keyed on testimony
 * change layouts: extra sensor nodes, extra patrols, a spared district.
 */
import type { HandlerId } from "./factions";
import type { Gate } from "./testimony";

/**
 * Where an objective sends you: metres, a wake node by label, or a place found from the nodes (Stage 692).
 *
 * `past` walks from the plaza's node A through the named node and on, `times` the A→node distance in
 * all (2: as far again, which from a corner intersection is the centre of the diagonal block beyond it),
 * then `dx`/`dz` metres. The district generator puts the four outer nodes on the plaza's corner
 * intersections in a district of any size, so a spot written this way is the same place on the same
 * block whether the district is three blocks across or five; metres typed against one size are not.
 */
export type Spot = { x: number; z: number } | { node: string } | { past: string; times: number; dx: number; dz: number };

/**
 * Who an escort is walking (Stage 677). Until this every escort was Ida Vessel: the three wake-cell
 * rescues walked a capsule tagged IDA VESSEL home, and the feed said IDA IS MOVING.
 */
export type EscortWho = "vessel" | "cell";
/** how the feed names them when they move or stop */
export const ESCORT_NAME: Record<EscortWho, string> = { vessel: "IDA", cell: "THE CELL" };

export type Objective =
  | { kind: "dialogue"; script: string; text: string }
  | { kind: "reach"; at: Spot; radius: number; text: string }
  | { kind: "kill"; target: "wasp" | "mech" | "dummy" | "any"; count: number; text: string }
  | { kind: "destroy"; text: string; spots: Spot[]; label: string }
  | { kind: "survive"; seconds: number; at?: Spot; radius?: number; text: string; waves?: number }
  | { kind: "escort"; path: Spot[]; speed: number; text: string; leash: number; who: EscortWho }
  | { kind: "hold"; at: Spot; radius: number; seconds: number; text: string; waves?: number };

export interface Reward {
  scrip?: number;
  xp?: number;
  protocol?: string;
  weapon?: "directive" | "clockeater";
  stamp?: string;
}

export interface Variant {
  gate: Gate;
  /** objectives replaced wholesale when the gate opens (the last open variant's win) */
  objectives?: Objective[];
  /**
   * objectives placed before whichever list wins (Stage 676). These compose: a variant that only
   * prepends never overwrites another variant's objectives, so two choices can both change a mission
   */
  prepend?: Objective[];
  extraWasps?: number;
  extraMechs?: number;
}

/** every objective a variant can put in front of the player: what it prepends, then what it replaces */
export function variantObjectives(v: Variant): Objective[] {
  return [...(v.prepend ?? []), ...(v.objectives ?? [])];
}

export interface MissionDef {
  id: string;
  kind: "mission" | "gig";
  /** arc order for missions; 0 for gigs */
  order: number;
  title: string;
  level: string;
  fixer: HandlerId;
  brief: string;
  objectives: Objective[];
  variants?: Variant[];
  reward: Reward;
  /** gigs: needed Threat Rating and testimony */
  requires?: { threat?: number; gate?: Gate; after?: string };
  /** VANTAGE presence on top of the district's own (before Threat) */
  wasps: number;
  mechs: number;
  /** cleared by killing the whole lattice / surviving; the mission fails when every Blank is down for this long */
  failAfterDownSeconds?: number;
  /** no Threat patrols on top (the white office has no guards) */
  noThreat?: boolean;
}

const D = (script: string, text: string): Objective => ({ kind: "dialogue", script, text });
const reach = (at: Spot, text: string, radius = 3): Objective => ({ kind: "reach", at, radius, text });

export const MISSIONS: readonly MissionDef[] = [
  {
    id: "m1_wake_unlisted",
    kind: "mission",
    order: 1,
    title: "WAKE UNLISTED",
    level: "lease_row",
    fixer: "deacon",
    brief: "STEAL YOUR OWN LEASE FILE FROM THE ESCROW TERMINAL AT THE B INTERSECTION. FIND OUT WHY YOU WERE FLAGGED.",
    objectives: [D("m1_intro", "READ THE STREET"), reach({ node: "B" }, "REACH THE ESCROW TERMINAL AT B"), { kind: "survive", seconds: 20, at: { node: "B" }, radius: 6, text: "HOLD THE TERMINAL WHILE THE FILE DECRYPTS", waves: 1 }, reach({ node: "E" }, "TAKE THE FILE FROM THE CABINET AT E"), D("m1_file", "THE FILE"), reach({ node: "A" }, "GET OUT THROUGH THE PLAZA")],
    reward: { scrip: 300, xp: 900, stamp: "mission:first" },
    wasps: 2,
    mechs: 0,
  },
  {
    id: "m2_deadletter_run",
    kind: "mission",
    order: 2,
    title: "DEADLETTER RUN",
    level: "deadletter_docks",
    fixer: "deacon",
    brief: "WORK THE DOCKS. CLEAR THE DRONE PATROLS OFF THE WAKE CELL'S ROUTES AND FIND THE INFORMANT AT C.",
    objectives: [{ kind: "kill", target: "wasp", count: 4, text: "DOWN 4 WASPS ON THE DOCK ROUTES" }, reach({ node: "C" }, "FIND THE INFORMANT AT C"), D("m2_informant", "THE INFORMANT"), { kind: "destroy", spots: [{ node: "D" }, { node: "B" }], label: "RELAY", text: "BREAK THE TWO VANTAGE RELAYS" }],
    // the cost of keeping the lease file in m1: the model knows a copy walked out of Lease Row and
    // it is looking for whoever is carrying it. Burning it is the quiet run.
    variants: [{ gate: { all: { "m1:lease": "keep" } }, extraWasps: 2 }],
    reward: { scrip: 400, xp: 1100, protocol: "red_lease" },
    wasps: 4,
    mechs: 0,
  },
  {
    id: "m3_repo_volatility",
    kind: "mission",
    order: 3,
    title: "VARIANCE",
    level: "repo_depot",
    fixer: "marrow",
    brief: "PULL THE DEPOT'S LOGS. HOLD THE PLAZA WHILE THEY COPY, AND DISABLE THE MECH VANTAGE SENDS TO STOP YOU.",
    objectives: [{ kind: "hold", at: { node: "A" }, radius: 7, seconds: 30, text: "HOLD THE PLAZA WHILE THE LOGS COPY", waves: 2 }, { kind: "kill", target: "mech", count: 1, text: "DISABLE THE REPO MECH" }, D("m3_volatility", "THE LOGS")],
    // Marrow's debt (Stage 671). Hand the docks informant to the Clockeaters in mission 2 and this is
    // their job: the Clockeaters settle their accounts, and they leave the depot's switchgear open.
    // Cut the yard lights first and the logs copy in the dark — a walk before the fight, and half the
    // hold. The spared informant pays you back on his own docks in mission 4; this is the other
    // choice's payment, one mission sooner. Before this stage mission 3 was the same for every file.
    variants: [
      {
        gate: { all: { "m2:informant": "turn" } },
        objectives: [
          reach({ node: "D" }, "MARROW'S PEOPLE LEFT THE DEPOT SWITCHGEAR OPEN AT D. CUT THE YARD LIGHTS"),
          { kind: "hold", at: { node: "A" }, radius: 7, seconds: 15, text: "HOLD THE PLAZA IN THE DARK WHILE THE LOGS COPY", waves: 1 },
          { kind: "kill", target: "mech", count: 1, text: "DISABLE THE REPO MECH" },
          D("m3_volatility", "THE LOGS"),
        ],
      },
    ],
    reward: { scrip: 500, xp: 1300, protocol: "filament_core" },
    wasps: 3,
    mechs: 1,
  },
  {
    id: "m4_the_leak",
    kind: "mission",
    order: 4,
    title: "THE LEAK",
    level: "deadletter_docks",
    fixer: "vessel",
    brief: "AN ESTATE DEFECTOR HANDS YOU THE DIRECTIVE. WALK HER FROM B TO D UNDER A VANTAGE SWEEP WHILE WERN ARGUES HIS CASE.",
    objectives: [D("m4_leak", "THE DIRECTIVE"), { kind: "escort", path: [{ node: "B" }, { node: "A" }, { node: "D" }], speed: 2.2, leash: 8, who: "vessel", text: "WALK IDA VESSEL FROM B TO D" }, { kind: "kill", target: "wasp", count: 3, text: "CLEAR THE SWEEP" }],
    // The docks informant's two endings, played out on his own docks (Stage 663). Before this the
    // choice in mission 2 was read by nothing in the arc — one optional gig — so mercy and betrayal
    // produced the same mission. Now they produce different ones: spared, he repays it with the
    // sweep's ears; handed over, the routes he had already sold are still live.
    variants: [
      {
        gate: { all: { "m2:informant": "spare" } },
        objectives: [
          D("m4_leak", "THE DIRECTIVE"),
          { kind: "destroy", spots: [{ node: "C" }], label: "VANTAGE SPEAKER", text: "THE INFORMANT LEFT HIS SPEAKER AT C. KILL IT AND THE SWEEP GOES DEAF" },
          { kind: "escort", path: [{ node: "B" }, { node: "A" }, { node: "D" }], speed: 2.2, leash: 8, who: "vessel", text: "WALK IDA VESSEL FROM B TO D WHILE THE SWEEP IS DEAF" },
          { kind: "kill", target: "wasp", count: 1, text: "CLEAR WHAT IS LEFT OF THE SWEEP" },
        ],
      },
      {
        gate: { all: { "m2:informant": "turn" } },
        extraWasps: 2,
        objectives: [
          D("m4_leak", "THE DIRECTIVE"),
          { kind: "escort", path: [{ node: "B" }, { node: "A" }, { node: "D" }], speed: 2.2, leash: 8, who: "vessel", text: "WALK IDA VESSEL FROM B TO D" },
          { kind: "kill", target: "wasp", count: 5, text: "CLEAR THE SWEEP — IT IS RUNNING THE ROUTES HE SOLD" },
        ],
      },
    ],
    reward: { scrip: 600, xp: 1600, weapon: "directive" },
    wasps: 4,
    mechs: 1,
  },
  {
    id: "m5_blind_the_model",
    kind: "mission",
    order: 5,
    title: "BLIND THE MODEL",
    level: "lease_row",
    fixer: "deacon",
    brief: "DESTROY THE SENSOR LATTICE DISTRICT BY DISTRICT. VANTAGE RESPONDS LIKE AN IMMUNE SYSTEM — THE HARDEST COMBAT IN THE ARC.",
    // The four inner nodes are the district generator's own, which are always on open ground. The
    // two outer posts were written as (0, ±30) and both landed inside a 4.2 m building on LEASE
    // ROW, sealing a 1.8 m lattice node in concrete where nothing could shoot it (Stage 175).
    // These two were found by scanning the level rather than typed: 4.4 m of clearance each — the
    // generator gives its own nodes 4.2 — on opposite outer diagonals, so the six spread across
    // the district the brief says to blind. They were (32, -32) and (-34, 34): the courtyards of the
    // blocks diagonally beyond nodes D and C. Since Stage 692 they are written from those nodes, so
    // they stay in those courtyards when LEASE ROW is five blocks across instead of three.
    objectives: [D("m5_lattice", "THE LATTICE"), { kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }, { past: "D", times: 2, dx: -1, dz: 1 }, { past: "C", times: 2, dx: -1, dz: 1 }], label: "LATTICE NODE", text: "PUT OUT THE SIX LATTICE NODES" }, { kind: "survive", seconds: 40, at: { node: "A" }, radius: 12, text: "SURVIVE THE IMMUNE RESPONSE AT THE PLAZA", waves: 3 }],
    variants: [
      { gate: { all: { "m3:volatility": "publish" } }, objectives: [D("m5_lattice", "THE LATTICE"), { kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }], label: "LATTICE NODE", text: "PUT OUT THE FOUR LATTICE NODES (THE FEEDS ALREADY TOOK TWO)" }, { kind: "survive", seconds: 40, at: { node: "A" }, radius: 12, text: "SURVIVE THE IMMUNE RESPONSE AT THE PLAZA", waves: 3 }] },
      // The Directive in mission 4. Until this, keeping it or giving it to Ida changed
      // nothing you played: the endings read it and a file note mentioned it. Kept, it is the one
      // copy outside the Estate, and the Estate wants it back — it writes a repo writ and VANTAGE
      // sends a mech to serve it before the lattice can be touched. Given, the Estate is reading its
      // own hand and pulls its audit drones off the row it would have been hunting you on. Both carry
      // no objectives of their own to replace, so they compose with the publish variant above.
      { gate: { all: { "m4:directive": "kept" } }, extraMechs: 1, prepend: [{ kind: "kill", target: "mech", count: 1, text: "THE ESTATE WROTE A REPO WRIT FOR THE DIRECTIVE. PUT DOWN THE MECH SERVING IT" }] },
      { gate: { all: { "m4:directive": "given" } }, extraWasps: -2 },
    ],
    reward: { scrip: 800, xp: 2000, protocol: "wern_pulse" },
    wasps: 6,
    mechs: 1,
  },
  {
    id: "m6_trial_by_data",
    kind: "mission",
    order: 6,
    title: "TRIAL BY DATA",
    level: "repo_depot",
    fixer: "deacon",
    brief: "HOLD THE BROADCAST TOWER ON THE PLAZA WHILE THE DIRECTIVE GOES OUT ON EVERY LEASED FEED AND THE CITY WAKES LIVE AROUND YOU.",
    objectives: [{ kind: "hold", at: { node: "A" }, radius: 8, seconds: 45, text: "HOLD THE TOWER — THE DIRECTIVE IS BROADCASTING", waves: 3 }, D("m6_broadcast", "THE UPLINK"), { kind: "hold", at: { node: "A" }, radius: 8, seconds: 30, text: "HOLD UNTIL THE UPLINK CLOSES", waves: 2 }],
    // "Evidence is a weapon" — m1's kept lease file is the proof the broadcast can attach, and a city
    // that is shown the paper believes faster than one that is only told. Half the closing hold.
    variants: [
      { gate: { all: { "m1:lease": "keep" } }, objectives: [{ kind: "hold", at: { node: "A" }, radius: 8, seconds: 45, text: "HOLD THE TOWER — THE DIRECTIVE IS BROADCASTING", waves: 3 }, D("m6_broadcast", "THE UPLINK"), { kind: "hold", at: { node: "A" }, radius: 8, seconds: 15, text: "HOLD UNTIL THE UPLINK CLOSES — THE LEASE FILE IS GOING OUT WITH IT", waves: 1 }] },
      // Blinding the whole lattice in mission 5 left the model with nothing to route a response
      // by, so the tower draws two fewer drones (Stage 663). Wasps only, never objectives, so this
      // composes with the lease variant above instead of overwriting it; Wern names the cost of the
      // same blindness in the white office.
      { gate: { all: { "m5:lattice": "all" } }, extraWasps: -2 },
      // Sparing the docks in mission 5 left the model one eye, and it is looking at the depot: the
      // harbour lattice relays the tower to VANTAGE, and it has to be cut before the broadcast can go
      // out (Stage 676). Prepended, so it composes with the lease variant's closing hold.
      { gate: { all: { "m5:lattice": "spare_docks" } }, prepend: [{ kind: "destroy", spots: [{ node: "E" }], label: "HARBOUR RELAY", text: "YOU LEFT THE DOCKS THEIR EYE. CUT ITS RELAY AT E BEFORE IT CALLS THE TOWER IN" }] },
    ],
    reward: { scrip: 1000, xp: 2400, protocol: "blood_ledger", stamp: "mission:trial" },
    wasps: 6,
    mechs: 2,
  },
  {
    id: "m7_white_office",
    kind: "mission",
    order: 7,
    title: "THE WHITE OFFICE",
    level: "white_office",
    fixer: "wern",
    brief: "WERN DOESN'T FIGHT. HE OFFERS YOU THE LEASE SYSTEM ITSELF. THE FINAL INPUT IS A CHOICE.",
    objectives: [reach({ x: 0, z: -4 }, "APPROACH THE DESK", 2.5), D("m7_office", "THE OFFER")],
    reward: { scrip: 0, xp: 3000, protocol: "directive_optic", stamp: "arc:complete" },
    wasps: 0,
    mechs: 0,
    noThreat: true,
  },
  // ---- gigs ----
  { id: "g_escrow_row", kind: "gig", order: 0, title: "ESCROW HEIST · LEASE ROW", level: "lease_row", fixer: "marrow", brief: "CRACK THE ESCROW TERMINAL AT D AND GET THE SLEEP CREDIT OUT BEFORE THE PATROL TURNS.", objectives: [reach({ node: "D" }, "CRACK THE ESCROW AT D"), { kind: "survive", seconds: 15, at: { node: "D" }, radius: 6, text: "HOLD WHILE IT DUMPS", waves: 1 }, reach({ node: "A" }, "OUT THROUGH THE PLAZA")], reward: { scrip: 250, xp: 500, stamp: "gig:first" }, wasps: 2, mechs: 0 },
  { id: "g_convoy_docks", kind: "gig", order: 0, title: "DRONE CONVOY · DOCKS", level: "deadletter_docks", fixer: "deacon", brief: "A WASP CONVOY CROSSES THE DOCKS AT HEIGHT. AMBUSH IT FROM THE WALKWAY.", objectives: [reach({ node: "B" }, "TAKE THE WALKWAY OVER B"), { kind: "kill", target: "wasp", count: 3, text: "DOWN THE CONVOY" }], reward: { scrip: 300, xp: 600 }, wasps: 3, mechs: 0 },
  { id: "g_rescue_depot", kind: "gig", order: 0, title: "WAKE-CELL RESCUE · DEPOT", level: "repo_depot", fixer: "deacon", brief: "A CELL IS PINNED UNDER THE IMPOUND SEARCHLIGHT AT C. GET THEM OUT.", objectives: [reach({ node: "C" }, "REACH THE PINNED CELL AT C"), { kind: "escort", path: [{ node: "C" }, { node: "A" }], speed: 2.4, leash: 8, who: "cell", text: "WALK THEM TO THE PLAZA" }], reward: { scrip: 350, xp: 700, protocol: "red_lease" }, wasps: 3, mechs: 1, requires: { threat: 1 } },
  { id: "g_lattice_row", kind: "gig", order: 0, title: "SENSOR SABOTAGE · LEASE ROW", level: "lease_row", fixer: "vessel", brief: "TWO LATTICE POSTS ON THE WALKWAY STREET. THE ESTATE WANTS THEM DARK BEFORE THE AUDIT.", objectives: [{ kind: "destroy", spots: [{ node: "B" }, { node: "C" }], label: "SENSOR POST", text: "BREAK THE TWO SENSOR POSTS" }], reward: { scrip: 300, xp: 600 }, wasps: 2, mechs: 0, requires: { gate: { not: { "m4:vessel": "expose" } } } },
  { id: "g_escrow_depot", kind: "gig", order: 0, title: "ESCROW HEIST · DEPOT", level: "repo_depot", fixer: "marrow", brief: "THE IMPOUND LOT KEEPS A SECOND ESCROW. TAKE IT WHILE THE MECH IS AT THE FAR FENCE.", objectives: [reach({ node: "E" }, "REACH THE LOT ESCROW AT E"), { kind: "survive", seconds: 20, at: { node: "E" }, radius: 6, text: "HOLD THE DUMP", waves: 1 }, reach({ node: "B" }, "OUT THROUGH B")], reward: { scrip: 400, xp: 800, weapon: "clockeater" }, wasps: 3, mechs: 1, requires: { threat: 2 } },
  { id: "g_convoy_row", kind: "gig", order: 0, title: "DRONE CONVOY · LEASE ROW", level: "lease_row", fixer: "marrow", brief: "FOUR WASPS RUN THE PLAZA LOOP EVERY NIGHT. BREAK THE LOOP.", objectives: [{ kind: "kill", target: "wasp", count: 4, text: "BREAK THE LOOP" }], reward: { scrip: 350, xp: 700 }, wasps: 4, mechs: 0, requires: { threat: 2 } },
  { id: "g_rescue_docks", kind: "gig", order: 0, title: "WAKE-CELL RESCUE · DOCKS", level: "deadletter_docks", fixer: "deacon", brief: "A CELL WENT DARK AT E. BRING WHOEVER IS LEFT TO THE PLAZA.", objectives: [reach({ node: "E" }, "REACH E"), { kind: "escort", path: [{ node: "E" }, { node: "A" }], speed: 2.2, leash: 8, who: "cell", text: "WALK THEM HOME" }, { kind: "kill", target: "wasp", count: 2, text: "COVER THE WALK" }], reward: { scrip: 400, xp: 800, protocol: "blood_ledger" }, wasps: 4, mechs: 0, requires: { threat: 3 }, variants: [{ gate: { all: { "m5:lattice": "spare_docks" } }, extraWasps: 2 }] },
  { id: "g_lattice_docks", kind: "gig", order: 0, title: "SENSOR SABOTAGE · DOCKS", level: "deadletter_docks", fixer: "vessel", brief: "THREE LATTICE POSTS ALONG THE CRANE LINE.", objectives: [{ kind: "destroy", spots: [{ node: "B" }, { node: "D" }, { node: "E" }], label: "SENSOR POST", text: "BREAK THE THREE POSTS" }], reward: { scrip: 450, xp: 900, protocol: "filament_core" }, wasps: 3, mechs: 1, requires: { threat: 3, gate: { not: { "m4:vessel": "expose", "m5:lattice": "all" } } } },
  { id: "g_escrow_docks", kind: "gig", order: 0, title: "ESCROW HEIST · DOCKS", level: "deadletter_docks", fixer: "marrow", brief: "THE HARBOUR ESCROW AT C PAYS IN CLOCKEATER TIME.", objectives: [reach({ node: "C" }, "CRACK THE HARBOUR ESCROW"), { kind: "survive", seconds: 25, at: { node: "C" }, radius: 6, text: "HOLD THE DUMP", waves: 2 }], reward: { scrip: 500, xp: 1000 }, wasps: 4, mechs: 1, requires: { threat: 4, gate: { not: { "m2:informant": "turn" } } } },
  { id: "g_convoy_depot", kind: "gig", order: 0, title: "DRONE CONVOY · DEPOT", level: "repo_depot", fixer: "deacon", brief: "THE DEPOT CONVOY FLIES WITH A MECH ESCORT.", objectives: [{ kind: "kill", target: "wasp", count: 4, text: "DOWN THE CONVOY" }, { kind: "kill", target: "mech", count: 1, text: "DISABLE THE ESCORT" }], reward: { scrip: 600, xp: 1200, protocol: "wern_pulse" }, wasps: 4, mechs: 1, requires: { threat: 5 } },
  { id: "g_rescue_row", kind: "gig", order: 0, title: "WAKE-CELL RESCUE · LEASE ROW", level: "lease_row", fixer: "deacon", brief: "THE LAST CELL ON THE ROW IS PINNED AT D WITH A MECH ON THEM.", objectives: [reach({ node: "D" }, "REACH D"), { kind: "kill", target: "mech", count: 1, text: "DISABLE THE MECH" }, { kind: "escort", path: [{ node: "D" }, { node: "A" }], speed: 2.4, leash: 8, who: "cell", text: "WALK THEM TO THE PLAZA" }], reward: { scrip: 700, xp: 1400 }, wasps: 4, mechs: 1, requires: { threat: 6 } },
  { id: "g_lattice_depot", kind: "gig", order: 0, title: "SENSOR SABOTAGE · DEPOT", level: "repo_depot", fixer: "vessel", brief: "THE DEPOT LATTICE IS THE LAST ONE THE ESTATE AUDIT CAN SEE THROUGH.", objectives: [{ kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }], label: "SENSOR POST", text: "BREAK ALL FOUR POSTS" }, { kind: "survive", seconds: 30, at: { node: "A" }, radius: 10, text: "SURVIVE THE RESPONSE", waves: 2 }], reward: { scrip: 800, xp: 1600, protocol: "directive_optic" }, wasps: 5, mechs: 2, requires: { threat: 7, gate: { not: { "m4:vessel": "expose" } } } },
  {
    id: "g_awning_cell",
    kind: "gig",
    order: 0,
    title: "AWNING EXTRACTION · NIGHT MARKET",
    level: "night_market",
    fixer: "deacon",
    brief: "A WAKE CELL IS HIDING UNDER THE AWNINGS AT C, AND THE STALLS WILL NOT COVER THEM PAST THE NEXT SWEEP. WALK THEM TO THE PLAZA BEFORE THE PATROL READS THE CROWD.",
    objectives: [
      reach({ node: "C" }, "FIND THE CELL UNDER THE AWNINGS AT C"),
      { kind: "escort", path: [{ node: "C" }, { node: "A" }], speed: 2.2, leash: 8, who: "cell", text: "WALK THEM TO THE PLAZA" },
      { kind: "kill", target: "wasp", count: 2, text: "CLEAR THE SWEEP OFF THE STALLS" },
    ],
    reward: { scrip: 320, xp: 640 },
    wasps: 3,
    mechs: 0,
  },
  {
    id: "g_uplink_skim",
    kind: "gig",
    order: 0,
    title: "UPLINK SKIM · RELAY HEIGHTS",
    level: "relay_heights",
    fixer: "marrow",
    brief: "THE UPLINK AT B IS LEASING CYCLES THE CLOCKEATERS NEVER SIGNED FOR. HOLD THE RACK WHILE THE DUMP RUNS, THEN CUT THE SENSOR ON THE FAR TOWER.",
    objectives: [
      reach({ node: "B" }, "REACH THE UPLINK RACK AT B"),
      { kind: "survive", seconds: 18, at: { node: "B" }, radius: 6, text: "HOLD THE RACK WHILE IT DUMPS", waves: 1 },
      { kind: "destroy", spots: [{ node: "E" }], label: "SENSOR POST", text: "CUT THE SENSOR ON THE FAR TOWER" },
      reach({ node: "A" }, "OUT THROUGH THE PLAZA"),
    ],
    reward: { scrip: 380, xp: 760 },
    wasps: 3,
    mechs: 1,
  },
  {
    id: "g_sluice_dark",
    kind: "gig",
    order: 0,
    title: "SLUICE DARK · ASH CANAL",
    level: "ash_canal",
    fixer: "vessel",
    brief: "THREE LATTICE POSTS WATCH THE SLUICE, AND THE ESTATE AUDIT IS DUE BEFORE DAWN. BREAK THEM AND HOLD THE LOCK UNTIL THE WATER GOES DARK.",
    objectives: [
      { kind: "destroy", spots: [{ node: "B" }, { node: "D" }, { node: "E" }], label: "SENSOR POST", text: "BREAK THE THREE SLUICE POSTS" },
      { kind: "hold", at: { node: "A" }, radius: 8, seconds: 20, text: "HOLD THE LOCK WHILE THE WATER GOES DARK", waves: 1 },
      { kind: "kill", target: "wasp", count: 2, text: "CLEAR THE AUDIT DRONES" },
    ],
    reward: { scrip: 420, xp: 840 },
    wasps: 2,
    mechs: 1,
    requires: { gate: { not: { "m4:vessel": "expose" } } },
  },
  {
    id: "g_showroom_heat",
    kind: "gig",
    order: 0,
    title: "SHOWROOM HEAT · GLASS MILE",
    level: "glass_mile",
    fixer: "deacon",
    brief: "A CELL TOOK THE SHOWROOM STAIRS AT E AND THE GLASS WILL NOT HIDE A HEAT SIGNATURE. BRING THEM DOWN TO THE PLAZA, AND CLEAR THE WASPS THAT FOLLOW THE REFLECTION.",
    objectives: [
      reach({ node: "E" }, "REACH THE CELL ON THE SHOWROOM STAIRS AT E"),
      { kind: "escort", path: [{ node: "E" }, { node: "A" }], speed: 2.3, leash: 8, who: "cell", text: "WALK THEM DOWN TO THE PLAZA" },
      { kind: "kill", target: "wasp", count: 3, text: "CLEAR THE WASPS ON THE REFLECTION" },
    ],
    reward: { scrip: 360, xp: 720 },
    wasps: 3,
    mechs: 0,
  },
  {
    id: "g_clinic_ledger",
    kind: "gig",
    order: 0,
    title: "CLINIC LEDGER · BONE MARKET",
    level: "bone_market",
    fixer: "marrow",
    brief: "THE BACK CLINIC AT D IS SELLING SLEEP CREDIT UNDER THE TABLE, AND MARROW WANTS THE LEDGER BEFORE IT CLOSES. CRACK THE TERMINAL, HOLD THE DUMP, AND WALK OUT THROUGH B.",
    objectives: [
      reach({ node: "D" }, "CRACK THE CLINIC TERMINAL AT D"),
      { kind: "survive", seconds: 16, at: { node: "D" }, radius: 6, text: "HOLD THE DUMP", waves: 1 },
      reach({ node: "B" }, "OUT THROUGH B"),
    ],
    reward: { scrip: 400, xp: 800 },
    wasps: 2,
    mechs: 1,
  },
  {
    id: "g_bonded_cold",
    kind: "gig",
    order: 0,
    title: "BONDED COLD · COLD VAULT",
    level: "cold_vault",
    fixer: "vessel",
    brief: "A COLD CONVOY IS MOVING BONDED CRATES THE ESTATE DID NOT DECLARE. DOWN THE WASPS AT THE LOCKERS, DISABLE THE MECH ON THE DOOR, AND BREAK THE TWO SENSOR POSTS THAT CALL IT IN.",
    objectives: [
      { kind: "kill", target: "wasp", count: 3, text: "DOWN THE WASPS AT THE LOCKERS" },
      { kind: "kill", target: "mech", count: 1, text: "DISABLE THE MECH ON THE DOOR" },
      { kind: "destroy", spots: [{ node: "B" }, { node: "C" }], label: "SENSOR POST", text: "BREAK THE TWO POSTS THAT CALL THE CONVOY IN" },
    ],
    reward: { scrip: 480, xp: 960 },
    wasps: 3,
    mechs: 1,
    requires: { gate: { not: { "m4:vessel": "expose" } } },
  },
  {
    id: "g_vespers",
    kind: "gig",
    order: 0,
    title: "VESPERS · NEON CHAPEL",
    level: "neon_chapel",
    fixer: "deacon",
    brief: "VESPERS AT THE NAVE IS A WAKE MEETING THE MODEL HAS ALREADY PRICED. HOLD THE PLAZA THROUGH THE SERVICE, THEN WALK THE CELL FROM C OUT BEFORE THE LAST LIGHT.",
    objectives: [
      { kind: "hold", at: { node: "A" }, radius: 8, seconds: 22, text: "HOLD THE NAVE THROUGH VESPERS", waves: 1 },
      reach({ node: "C" }, "FIND THE CELL AT C"),
      { kind: "escort", path: [{ node: "C" }, { node: "A" }], speed: 2.2, leash: 8, who: "cell", text: "WALK THEM OUT BEFORE THE LAST LIGHT" },
    ],
    reward: { scrip: 440, xp: 880 },
    wasps: 2,
    mechs: 0,
  },
  {
    id: "g_hot_pour",
    kind: "gig",
    order: 0,
    title: "HOT POUR · SLAG PIT",
    level: "slag_pit",
    fixer: "marrow",
    brief: "THE POUR AT E IS RUNNING HOT AND THE IMPOUND MECH IS READING THE SCALE. REACH THE PIT, SURVIVE THE SHIFT WHILE THE CLOCKEATERS SKIM THE LOG, AND GET OUT THROUGH THE PLAZA.",
    objectives: [
      reach({ node: "E" }, "REACH THE POUR AT E"),
      { kind: "survive", seconds: 20, at: { node: "E" }, radius: 6, text: "HOLD THE PIT WHILE THE LOG SKIMS", waves: 1 },
      { kind: "kill", target: "mech", count: 1, text: "DISABLE THE MECH ON THE SCALE" },
      reach({ node: "A" }, "OUT THROUGH THE PLAZA"),
    ],
    reward: { scrip: 520, xp: 1040 },
    wasps: 2,
    mechs: 2,
  },
  {
    id: "g_live_cable",
    kind: "gig",
    order: 0,
    title: "LIVE CABLE · WIRE GARDEN",
    level: "wire_garden",
    fixer: "vessel",
    brief: "LIVE CABLE CROSSES THE GARDEN ON POSTS THE ESTATE STILL TRUSTS. CUT THE THREE TAPS, HOLD THE PLAZA WHILE THE GRID DROPS, AND CLEAR THE WASPS THAT COME TO REPAIR IT.",
    objectives: [
      { kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }], label: "CABLE TAP", text: "CUT THE THREE TAPS" },
      { kind: "hold", at: { node: "A" }, radius: 8, seconds: 18, text: "HOLD THE PLAZA WHILE THE GRID DROPS", waves: 1 },
      { kind: "kill", target: "wasp", count: 2, text: "CLEAR THE REPAIR WASPS" },
    ],
    reward: { scrip: 460, xp: 920 },
    wasps: 3,
    mechs: 1,
    requires: { gate: { not: { "m4:vessel": "expose" } } },
  },
  {
    id: "g_dark_fiber",
    kind: "gig",
    order: 0,
    title: "DARK FIBER · BLACK RELAY",
    level: "black_relay",
    fixer: "marrow",
    brief: "DARK FIBER AT C IS CARRYING A LEASE THE CLOCKEATERS WANT ERASED BEFORE IT PINGS. CRACK THE DISH, HOLD WHILE THE SILENCE WRITES, AND WALK A CELL OUT FROM E.",
    objectives: [
      reach({ node: "C" }, "CRACK THE DISH AT C"),
      { kind: "survive", seconds: 18, at: { node: "C" }, radius: 6, text: "HOLD WHILE THE SILENCE WRITES", waves: 1 },
      reach({ node: "E" }, "REACH THE CELL AT E"),
      { kind: "escort", path: [{ node: "E" }, { node: "A" }], speed: 2.2, leash: 8, who: "cell", text: "WALK THE CELL OUT THROUGH THE PLAZA" },
    ],
    reward: { scrip: 540, xp: 1080 },
    wasps: 4,
    mechs: 1,
  },
];

export const missionById = (id: string): MissionDef | undefined => MISSIONS.find((m) => m.id === id);
export const MAIN_ARC: readonly MissionDef[] = MISSIONS.filter((m) => m.kind === "mission").sort((a, b) => a.order - b.order);
export const GIGS: readonly MissionDef[] = MISSIONS.filter((m) => m.kind === "gig");
