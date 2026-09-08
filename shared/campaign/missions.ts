/**
 * The main arc (seven missions) and the side gigs (twelve), as data the
 * mission runtime steps. Objectives are typed; positions are explicit or a
 * wake node's label resolved against the level. Variants keyed on testimony
 * change layouts: extra sensor nodes, extra patrols, a spared district.
 */
import type { HandlerId } from "./factions";
import type { Gate } from "./testimony";

export type Spot = { x: number; z: number } | { node: string };

export type Objective =
  | { kind: "dialogue"; script: string; text: string }
  | { kind: "reach"; at: Spot; radius: number; text: string }
  | { kind: "kill"; target: "wasp" | "mech" | "dummy" | "any"; count: number; text: string }
  | { kind: "destroy"; text: string; spots: Spot[]; label: string }
  | { kind: "survive"; seconds: number; at?: Spot; radius?: number; text: string; waves?: number }
  | { kind: "escort"; path: Spot[]; speed: number; text: string; leash: number }
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
  /** objectives replaced wholesale when the gate opens */
  objectives?: Objective[];
  extraWasps?: number;
  extraMechs?: number;
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
    brief: "Steal your own lease file from the escrow terminal at the B intersection. Find out why you were flagged.",
    objectives: [D("m1_intro", "READ THE STREET"), reach({ node: "B" }, "REACH THE ESCROW TERMINAL AT B"), { kind: "survive", seconds: 20, text: "HOLD THE TERMINAL WHILE THE FILE DECRYPTS", waves: 1 }, reach({ node: "E" }, "TAKE THE FILE FROM THE CABINET AT E"), D("m1_file", "THE FILE"), reach({ node: "A" }, "GET OUT THROUGH THE PLAZA")],
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
    brief: "Work the docks. Clear the drone patrols off the wake cell's routes and find the informant at C.",
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
    brief: "Pull the depot's logs. Hold the plaza while they copy, and disable the mech VANTAGE sends to stop you.",
    objectives: [{ kind: "hold", at: { node: "A" }, radius: 7, seconds: 30, text: "HOLD THE PLAZA WHILE THE LOGS COPY", waves: 2 }, { kind: "kill", target: "mech", count: 1, text: "DISABLE THE REPO MECH" }, D("m3_volatility", "THE LOGS")],
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
    brief: "An Estate defector hands you the Directive. Walk her from B to D under a VANTAGE sweep while Wern argues his case.",
    objectives: [D("m4_leak", "THE DIRECTIVE"), { kind: "escort", path: [{ node: "B" }, { node: "A" }, { node: "D" }], speed: 2.2, leash: 8, text: "WALK IDA VESSEL FROM B TO D" }, { kind: "kill", target: "wasp", count: 3, text: "CLEAR THE SWEEP" }],
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
    brief: "Destroy the sensor lattice district by district. VANTAGE responds like an immune system — the hardest combat in the arc.",
    objectives: [D("m5_lattice", "THE LATTICE"), { kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }, { x: 0, z: -30 }, { x: 0, z: 30 }], label: "LATTICE NODE", text: "PUT OUT THE SIX LATTICE NODES" }, { kind: "survive", seconds: 40, at: { node: "A" }, radius: 12, text: "SURVIVE THE IMMUNE RESPONSE AT THE PLAZA", waves: 3 }],
    variants: [{ gate: { all: { "m3:volatility": "publish" } }, objectives: [D("m5_lattice", "THE LATTICE"), { kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }], label: "LATTICE NODE", text: "PUT OUT THE FOUR LATTICE NODES (THE FEEDS ALREADY TOOK TWO)" }, { kind: "survive", seconds: 40, at: { node: "A" }, radius: 12, text: "SURVIVE THE IMMUNE RESPONSE AT THE PLAZA", waves: 3 }] }],
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
    brief: "Hold the broadcast tower on the plaza while the Directive goes out on every leased feed and the city wakes live around you.",
    objectives: [{ kind: "hold", at: { node: "A" }, radius: 8, seconds: 45, text: "HOLD THE TOWER — THE DIRECTIVE IS BROADCASTING", waves: 3 }, D("m6_broadcast", "THE UPLINK"), { kind: "hold", at: { node: "A" }, radius: 8, seconds: 30, text: "HOLD UNTIL THE UPLINK CLOSES", waves: 2 }],
    // "Evidence is a weapon" — m1's kept lease file is the proof the broadcast can attach, and a city
    // that is shown the paper believes faster than one that is only told. Half the closing hold.
    variants: [{ gate: { all: { "m1:lease": "keep" } }, objectives: [{ kind: "hold", at: { node: "A" }, radius: 8, seconds: 45, text: "HOLD THE TOWER — THE DIRECTIVE IS BROADCASTING", waves: 3 }, D("m6_broadcast", "THE UPLINK"), { kind: "hold", at: { node: "A" }, radius: 8, seconds: 15, text: "HOLD UNTIL THE UPLINK CLOSES — THE LEASE FILE IS GOING OUT WITH IT", waves: 1 }] }],
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
    brief: "Wern doesn't fight. He offers you the lease system itself. The final input is a choice.",
    objectives: [reach({ x: 0, z: -4 }, "APPROACH THE DESK", 2.5), D("m7_office", "THE OFFER")],
    reward: { scrip: 0, xp: 3000, protocol: "directive_optic", stamp: "arc:complete" },
    wasps: 0,
    mechs: 0,
    noThreat: true,
  },
  // ---- gigs ----
  { id: "g_escrow_row", kind: "gig", order: 0, title: "ESCROW HEIST · LEASE ROW", level: "lease_row", fixer: "marrow", brief: "Crack the escrow terminal at D and get the sleep credit out before the patrol turns.", objectives: [reach({ node: "D" }, "CRACK THE ESCROW AT D"), { kind: "survive", seconds: 15, at: { node: "D" }, radius: 6, text: "HOLD WHILE IT DUMPS", waves: 1 }, reach({ node: "A" }, "OUT THROUGH THE PLAZA")], reward: { scrip: 250, xp: 500, stamp: "gig:first" }, wasps: 2, mechs: 0 },
  { id: "g_convoy_docks", kind: "gig", order: 0, title: "DRONE CONVOY · DOCKS", level: "deadletter_docks", fixer: "deacon", brief: "A wasp convoy crosses the docks at height. Ambush it from the walkway.", objectives: [reach({ node: "B" }, "TAKE THE WALKWAY OVER B"), { kind: "kill", target: "wasp", count: 3, text: "DOWN THE CONVOY" }], reward: { scrip: 300, xp: 600 }, wasps: 3, mechs: 0 },
  { id: "g_rescue_depot", kind: "gig", order: 0, title: "WAKE-CELL RESCUE · DEPOT", level: "repo_depot", fixer: "deacon", brief: "A cell is pinned under the impound searchlight at C. Get them out.", objectives: [reach({ node: "C" }, "REACH THE PINNED CELL AT C"), { kind: "escort", path: [{ node: "C" }, { node: "A" }], speed: 2.4, leash: 8, text: "WALK THEM TO THE PLAZA" }], reward: { scrip: 350, xp: 700, protocol: "red_lease" }, wasps: 3, mechs: 1, requires: { threat: 1 } },
  { id: "g_lattice_row", kind: "gig", order: 0, title: "SENSOR SABOTAGE · LEASE ROW", level: "lease_row", fixer: "vessel", brief: "Two lattice posts on the walkway street. The Estate wants them dark before the audit.", objectives: [{ kind: "destroy", spots: [{ node: "B" }, { node: "C" }], label: "SENSOR POST", text: "BREAK THE TWO SENSOR POSTS" }], reward: { scrip: 300, xp: 600 }, wasps: 2, mechs: 0, requires: { gate: { not: { "m4:vessel": "expose" } } } },
  { id: "g_escrow_depot", kind: "gig", order: 0, title: "ESCROW HEIST · DEPOT", level: "repo_depot", fixer: "marrow", brief: "The impound lot keeps a second escrow. Take it while the mech is at the far fence.", objectives: [reach({ node: "E" }, "REACH THE LOT ESCROW AT E"), { kind: "survive", seconds: 20, at: { node: "E" }, radius: 6, text: "HOLD THE DUMP", waves: 1 }, reach({ node: "B" }, "OUT THROUGH B")], reward: { scrip: 400, xp: 800, weapon: "clockeater" }, wasps: 3, mechs: 1, requires: { threat: 2, gate: { not: { "m2:informant": "turn" } } } },
  { id: "g_convoy_row", kind: "gig", order: 0, title: "DRONE CONVOY · LEASE ROW", level: "lease_row", fixer: "marrow", brief: "Four wasps run the plaza loop every night. Break the loop.", objectives: [{ kind: "kill", target: "wasp", count: 4, text: "BREAK THE LOOP" }], reward: { scrip: 350, xp: 700 }, wasps: 4, mechs: 0, requires: { threat: 2 } },
  { id: "g_rescue_docks", kind: "gig", order: 0, title: "WAKE-CELL RESCUE · DOCKS", level: "deadletter_docks", fixer: "deacon", brief: "A cell went dark at E. Bring whoever is left to the plaza.", objectives: [reach({ node: "E" }, "REACH E"), { kind: "escort", path: [{ node: "E" }, { node: "A" }], speed: 2.2, leash: 8, text: "WALK THEM HOME" }, { kind: "kill", target: "wasp", count: 2, text: "COVER THE WALK" }], reward: { scrip: 400, xp: 800, protocol: "blood_ledger" }, wasps: 4, mechs: 0, requires: { threat: 3 }, variants: [{ gate: { all: { "m5:lattice": "spare_docks" } }, extraWasps: 2 }] },
  { id: "g_lattice_docks", kind: "gig", order: 0, title: "SENSOR SABOTAGE · DOCKS", level: "deadletter_docks", fixer: "vessel", brief: "Three lattice posts along the crane line.", objectives: [{ kind: "destroy", spots: [{ node: "B" }, { node: "D" }, { node: "E" }], label: "SENSOR POST", text: "BREAK THE THREE POSTS" }], reward: { scrip: 450, xp: 900, protocol: "filament_core" }, wasps: 3, mechs: 1, requires: { threat: 3, gate: { not: { "m4:vessel": "expose", "m5:lattice": "all" } } } },
  { id: "g_escrow_docks", kind: "gig", order: 0, title: "ESCROW HEIST · DOCKS", level: "deadletter_docks", fixer: "marrow", brief: "The harbour escrow at C pays in Clockeater time.", objectives: [reach({ node: "C" }, "CRACK THE HARBOUR ESCROW"), { kind: "survive", seconds: 25, at: { node: "C" }, radius: 6, text: "HOLD THE DUMP", waves: 2 }], reward: { scrip: 500, xp: 1000 }, wasps: 4, mechs: 1, requires: { threat: 4, gate: { not: { "m2:informant": "turn" } } } },
  { id: "g_convoy_depot", kind: "gig", order: 0, title: "DRONE CONVOY · DEPOT", level: "repo_depot", fixer: "deacon", brief: "The depot convoy flies with a mech escort.", objectives: [{ kind: "kill", target: "wasp", count: 4, text: "DOWN THE CONVOY" }, { kind: "kill", target: "mech", count: 1, text: "DISABLE THE ESCORT" }], reward: { scrip: 600, xp: 1200, protocol: "wern_pulse" }, wasps: 4, mechs: 1, requires: { threat: 5 } },
  { id: "g_rescue_row", kind: "gig", order: 0, title: "WAKE-CELL RESCUE · LEASE ROW", level: "lease_row", fixer: "deacon", brief: "The last cell on the Row is pinned at D with a mech on them.", objectives: [reach({ node: "D" }, "REACH D"), { kind: "kill", target: "mech", count: 1, text: "DISABLE THE MECH" }, { kind: "escort", path: [{ node: "D" }, { node: "A" }], speed: 2.4, leash: 8, text: "WALK THEM TO THE PLAZA" }], reward: { scrip: 700, xp: 1400 }, wasps: 4, mechs: 1, requires: { threat: 6 } },
  { id: "g_lattice_depot", kind: "gig", order: 0, title: "SENSOR SABOTAGE · DEPOT", level: "repo_depot", fixer: "vessel", brief: "The depot lattice is the last one the Estate audit can see through.", objectives: [{ kind: "destroy", spots: [{ node: "B" }, { node: "C" }, { node: "D" }, { node: "E" }], label: "SENSOR POST", text: "BREAK ALL FOUR POSTS" }, { kind: "survive", seconds: 30, at: { node: "A" }, radius: 10, text: "SURVIVE THE RESPONSE", waves: 2 }], reward: { scrip: 800, xp: 1600, protocol: "directive_optic" }, wasps: 5, mechs: 2, requires: { threat: 7, gate: { not: { "m4:vessel": "expose" } } } },
];

export const missionById = (id: string): MissionDef | undefined => MISSIONS.find((m) => m.id === id);
export const MAIN_ARC: readonly MissionDef[] = MISSIONS.filter((m) => m.kind === "mission").sort((a, b) => a.order - b.order);
export const GIGS: readonly MissionDef[] = MISSIONS.filter((m) => m.kind === "gig");
