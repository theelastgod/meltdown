import { type Vec3, v3 } from "../math/vec3";
import { box, type Box } from "./box";
import type { HubDef } from "./hub";
import type { ClaimDef, ZoneDef } from "./run";

export { box, type Box };

export interface SpawnPoint {
  pos: Vec3;
  yaw: number;
}

export interface DummyDef {
  id: number;
  pos: Vec3;
  /** Optional patrol endpoint; dummy paces between pos and patrolTo. */
  patrolTo?: Vec3;
}

export type DistrictCast = "magenta" | "cyan" | "amber";

/** A flat emissive sign quad (text rendered client-side; the sim ignores it). */
export interface SignDef {
  text: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  w: number;
  h: number;
  fg: string;
  bg: string;
  border: string;
}

/** A point light in the district rig (the client caps how many it honours). */
export interface LightDef {
  x: number;
  y: number;
  z: number;
  color: "cyan" | "magenta" | "amber" | "violet" | "yellow" | "green";
  intensity: number;
  range: number;
}

/** A traffic lane beyond the perimeter: head/tail-light streaks move from → to (render only). */
export interface TrafficLane {
  from: Vec3;
  to: Vec3;
  speed: number;
  count: number;
}

/** A sidewalk loop citizens walk (render-only crowds). */
export interface WalkLoop {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** The monorail line over a street: axis it runs along, the fixed coordinate, the height of its running surface (the car's floor), and span. */
export interface TramLine {
  axis: "x" | "z";
  at: number;
  y: number;
  from: number;
  to: number;
  /** seconds between passes (each direction) */
  period: number;
}

/** A street exit through the perimeter: where the vista beyond starts and which way it runs. */
export interface StreetExit {
  x: number;
  z: number;
  dir: "n" | "s" | "e" | "w";
}

/** A holographic ad panel: a ticker of VANTAGE copy cycling colours (render only). */
export interface AdPanel {
  x: number;
  y: number;
  z: number;
  rotY: number;
  w: number;
  h: number;
}

export interface LevelDef {
  name: string;
  /** city life (render only): crowds, monorail, steam, exits, ads */
  walks?: WalkLoop[];
  pedestrians?: number;
  tram?: TramLine;
  vents?: Vec3[];
  exits?: StreetExit[];
  ads?: AdPanel[];
  /** Ledger-UI name, e.g. "LEASE ROW". */
  displayName?: string;
  /** District colour cast; drives fog, rig, and skyline. */
  district?: DistrictCast;
  /** Half extent of the playable area (radar scale, skyline inner radius). */
  bounds?: number;
  /** Render-only geometry (awnings, canopies): never collides. */
  decor?: Box[];
  signs?: SignDef[];
  lights?: LightDef[];
  traffic?: TrafficLane[];
  skylineSeed?: number;
  boxes: Box[];
  spawns: SpawnPoint[];
  dummies: DummyDef[];
  /** Kill plane: falling below this respawns the player. */
  killY: number;
  /** VANTAGE wasp patrols (waypoints in the air). */
  wasps: { waypoints: Vec3[] }[];
  /** Repo mechs walking a two-point path with a sweeping searchlight centred on `face` (yaw; default: path heading). */
  mechs: { path: Vec3[]; face?: number }[];
  /** Wake nodes (hex city nodes) and their district-graph links. */
  nodes: { id: number; label: string; pos: Vec3; links: number[] }[];
  /** The Deadletter Office: range course pads, trophy wall, renovation slots (Stage 8). */
  hub?: HubDef;
  /** THE RUN (Stage 14): safe zones (no damage, the markets, banking) — everything else is the PvP zone. */
  zones?: ZoneDef[];
  /** THE RUN: where $CAPITAL claims lie; deeper into the district is worth more. */
  claims?: ClaimDef[];
  /**
   * A room you can walk into off the street (Stage 940). The counter is where the clerk answers.
   * The shop sells nothing that changes a gun.
   */
  shop?: ShopSpot;
  /**
   * The south-west warehouse on LEASE ROW (Stage 942). The window takes cash and changes no gun.
   */
  pawn?: ShopSpot;
  /**
   * The south-east warehouse on LEASE ROW (Stage 944). The counter takes cash and changes no gun.
   */
  night?: ShopSpot;
  /**
   * A hole in the perimeter wall onto open ground (Stage 941). The street ends there.
   * Nothing out there pays a gun.
   */
  wild?: WildEdge;
  /**
   * The south wall of LEASE ROW (Stage 943). A second lot, clear of the gates and of the north opening.
   * Nothing out there pays a gun.
   */
  yard?: WildEdge;
  /**
   * The east wall of LEASE ROW (Stage 945). A slot at the north end, clear of the gates.
   * Nothing out there pays a gun.
   */
  east?: WildEdge;
  /**
   * The north warehouse on DEADLETTER DOCKS (Stage 946). The hatch takes cash and changes no gun.
   */
  cold?: ShopSpot;
  /**
   * The south-east warehouse on REPO DEPOT (Stage 947). The counter takes cash and changes no gun.
   */
  impound?: ShopSpot;
  /**
   * The east warehouse on RELAY HEIGHTS (Stage 949). The hatch takes cash and changes no gun.
   */
  rack?: ShopSpot;
  /**
   * The north-west wall of NIGHT MARKET (Stage 950). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  lane?: WildEdge;
  /**
   * The south-west wall of DEADLETTER DOCKS (Stage 952). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  berth?: WildEdge;
  /**
   * The west end of DEADLETTER DOCKS' south wall, past the pier (Stage 1031). A fenced lot.
   * Nothing out there pays a gun.
   */
  pintle?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' south pintle and the south pier (Stage 1035). A fenced lot.
   * Nothing out there pays a gun.
   */
  lanyard?: WildEdge;
  /**
   * The north end of DEADLETTER DOCKS' east wall, past the quay (Stage 1039). A fenced lot.
   * Nothing out there pays a gun.
   */
  bobstay?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' east bobstay and the east quay (Stage 1043). A fenced lot.
   * Nothing out there pays a gun.
   */
  throat?: WildEdge;
  /**
   * The west wall of REPO DEPOT (Stage 953). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  apron?: WildEdge;
  /**
   * The south run of REPO DEPOT's west wall, between the apron and the gate (Stage 1022).
   * A fenced lot. Nothing out there pays a gun.
   */
  clevis?: WildEdge;
  /**
   * The east wall of REPO DEPOT (Stage 954). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  ramp?: WildEdge;
  /**
   * The north end of REPO DEPOT's east wall, past the ramp (Stage 1042). A fenced lot.
   * Nothing out there pays a gun.
   */
  shackle?: WildEdge;
  /**
   * The slab between REPO DEPOT's east shackle and the east ramp (Stage 1046). A fenced lot.
   * Nothing out there pays a gun.
   */
  swivel?: WildEdge;
  /**
   * The east wall of DEADLETTER DOCKS (Stage 955). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  quay?: WildEdge;
  /**
   * The north-west wall of DEADLETTER DOCKS (Stage 956). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  slip?: WildEdge;
  /**
   * The south-east wall of NIGHT MARKET (Stage 957). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  stall?: WildEdge;
  /**
   * The south-west wall of RELAY HEIGHTS (Stage 958). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  span?: WildEdge;
  /**
   * The west end of RELAY HEIGHTS' south wall, past the span (Stage 1033). A fenced lot.
   * Nothing out there pays a gun.
   */
  outhaul?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' south outhaul and the south span (Stage 1037). A fenced lot.
   * Nothing out there pays a gun.
   */
  reef?: WildEdge;
  /**
   * The north end of RELAY HEIGHTS' east wall, past the mast (Stage 1041). A fenced lot.
   * Nothing out there pays a gun.
   */
  peak?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' east peak and the east mast (Stage 1045). A fenced lot.
   * Nothing out there pays a gun.
   */
  gaff?: WildEdge;
  /**
   * The south end of RELAY HEIGHTS' east wall, past the strut (Stage 1049). A fenced lot.
   * Nothing out there pays a gun.
   */
  boom?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' east boom and the east strut (Stage 1053). A fenced lot.
   * Nothing out there pays a gun.
   */
  preventer?: WildEdge;
  /**
   * The south-west wall of REPO DEPOT (Stage 959). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  bay?: WildEdge;
  /**
   * The west end of REPO DEPOT's south wall, past the bay (Stage 1034). A fenced lot.
   * Nothing out there pays a gun.
   */
  gudgeon?: WildEdge;
  /**
   * The slab between REPO DEPOT's south gudgeon and the south bay (Stage 1038). A fenced lot.
   * Nothing out there pays a gun.
   */
  tiller?: WildEdge;
  /**
   * The north-west wall of REPO DEPOT (Stage 960). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  crest?: WildEdge;
  /**
   * The south-west wall of DEADLETTER DOCKS (Stage 961). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  wharf?: WildEdge;
  /**
   * The south run of DEADLETTER DOCKS' west wall, between the wharf and the gate (Stage 1019).
   * A fenced lot. Nothing out there pays a gun.
   */
  painter?: WildEdge;
  /**
   * The north run of DEADLETTER DOCKS' west wall, between the bitt and the gate (Stage 1023).
   * A fenced lot. Nothing out there pays a gun.
   */
  fluke?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' west fluke and the west bitt (Stage 1071). A fenced lot.
   * Nothing out there pays a gun.
   */
  rode?: WildEdge;
  /**
   * The slab between NIGHT MARKET's west tuck and the west lantern (Stage 1072). A fenced lot.
   * Nothing out there pays a gun.
   */
  bias?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' west vang and the west pylon (Stage 1073). A fenced lot.
   * Nothing out there pays a gun.
   */
  jib?: WildEdge;
  /**
   * The slab between REPO DEPOT's west becket and the west skid (Stage 1074). A fenced lot.
   * Nothing out there pays a gun.
   */
  lizard?: WildEdge;
  /**
   * The slab between NIGHT MARKET's west pleat and the west booth (Stage 1075). A fenced lot.
   * Nothing out there pays a gun.
   */
  yoke?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' west tack and the west spire (Stage 1076). A fenced lot.
   * Nothing out there pays a gun.
   */
  sheet?: WildEdge;
  /**
   * The slab between REPO DEPOT's west clevis and the west apron (Stage 1077). A fenced lot.
   * Nothing out there pays a gun.
   */
  norman?: WildEdge;
  /**
   * The north-east wall of RELAY HEIGHTS (Stage 962). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  ledge?: WildEdge;
  /**
   * The north-east wall of NIGHT MARKET (Stage 963). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  aisle?: WildEdge;
  /**
   * The south-west wall of NIGHT MARKET (Stage 964). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  booth?: WildEdge;
  /**
   * The south run of NIGHT MARKET's west wall, between the booth and the gate (Stage 1020).
   * A fenced lot. Nothing out there pays a gun.
   */
  pleat?: WildEdge;
  /**
   * The north run of NIGHT MARKET's west wall, between the lantern and the gate (Stage 1024).
   * A fenced lot. Nothing out there pays a gun.
   */
  tuck?: WildEdge;
  /**
   * The north-east wall of RELAY HEIGHTS (Stage 965). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  mast?: WildEdge;
  /**
   * The north-east wall of DEADLETTER DOCKS (Stage 966). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  keel?: WildEdge;
  /**
   * The south-west wall of RELAY HEIGHTS (Stage 967). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  spire?: WildEdge;
  /**
   * The south run of RELAY HEIGHTS' west wall, between the spire and the gate (Stage 1021).
   * A fenced lot. Nothing out there pays a gun.
   */
  tack?: WildEdge;
  /**
   * The north run of RELAY HEIGHTS' west wall, between the pylon and the gate (Stage 1025).
   * A fenced lot. Nothing out there pays a gun.
   */
  vang?: WildEdge;
  /**
   * The south-east wall of DEADLETTER DOCKS (Stage 968). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  cleat?: WildEdge;
  /**
   * The south run of DEADLETTER DOCKS' east wall (Stage 969). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  bollard?: WildEdge;
  /**
   * The south end of DEADLETTER DOCKS' east wall, past the bollard (Stage 1047). A fenced lot.
   * Nothing out there pays a gun.
   */
  knight?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' east knight and the east bollard (Stage 1051). A fenced lot.
   * Nothing out there pays a gun.
   */
  keelson?: WildEdge;
  /**
   * The north run of RELAY HEIGHTS' west wall (Stage 970). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  pylon?: WildEdge;
  /**
   * The south run of NIGHT MARKET's east wall (Stage 971). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  crate?: WildEdge;
  /**
   * The east run of REPO DEPOT's north wall (Stage 972). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  hoist?: WildEdge;
  /**
   * The north run of DEADLETTER DOCKS' west wall (Stage 973). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  bitt?: WildEdge;
  /**
   * The south run of RELAY HEIGHTS' east wall (Stage 974). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  strut?: WildEdge;
  /**
   * The north run of NIGHT MARKET's west wall (Stage 975). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  lantern?: WildEdge;
  /**
   * The south run of REPO DEPOT's east wall (Stage 976). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  jack?: WildEdge;
  /**
   * The south end of REPO DEPOT's east wall, past the jack (Stage 1050). A fenced lot.
   * Nothing out there pays a gun.
   */
  fid?: WildEdge;
  /**
   * The slab between REPO DEPOT's east fid and the east jack (Stage 1054). A fenced lot.
   * Nothing out there pays a gun.
   */
  kevel?: WildEdge;
  /**
   * The north end of DEADLETTER DOCKS' west wall, past the bitt (Stage 1055). A fenced lot.
   * Nothing out there pays a gun.
   */
  cathead?: WildEdge;
  /**
   * The north end of NIGHT MARKET's west wall, past the lantern (Stage 1056). A fenced lot.
   * Nothing out there pays a gun.
   */
  piping?: WildEdge;
  /**
   * The slab between NIGHT MARKET's west piping and the west lantern (Stage 1060). A fenced lot.
   * Nothing out there pays a gun.
   */
  godet?: WildEdge;
  /**
   * The south end of NIGHT MARKET's west wall, past the booth (Stage 1064). A fenced lot.
   * Nothing out there pays a gun.
   */
  weft?: WildEdge;
  /**
   * The slab between NIGHT MARKET's west weft and the west booth (Stage 1068). A fenced lot.
   * Nothing out there pays a gun.
   */
  warp?: WildEdge;
  /**
   * The north end of RELAY HEIGHTS' west wall, past the pylon (Stage 1057). A fenced lot.
   * Nothing out there pays a gun.
   */
  topping?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' west topping and the west pylon (Stage 1061). A fenced lot.
   * Nothing out there pays a gun.
   */
  parrel?: WildEdge;
  /**
   * The south end of RELAY HEIGHTS' west wall, past the spire (Stage 1065). A fenced lot.
   * Nothing out there pays a gun.
   */
  brail?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' west brail and the west spire (Stage 1069). A fenced lot.
   * Nothing out there pays a gun.
   */
  bunt?: WildEdge;
  /**
   * The north end of REPO DEPOT's west wall, past the skid (Stage 1058). A fenced lot.
   * Nothing out there pays a gun.
   */
  coak?: WildEdge;
  /**
   * The slab between REPO DEPOT's west coak and the west skid (Stage 1062). A fenced lot.
   * Nothing out there pays a gun.
   */
  gammon?: WildEdge;
  /**
   * The south end of REPO DEPOT's west wall, past the apron (Stage 1066). A fenced lot.
   * Nothing out there pays a gun.
   */
  whelp?: WildEdge;
  /**
   * The slab between REPO DEPOT's west whelp and the west apron (Stage 1070). A fenced lot.
   * Nothing out there pays a gun.
   */
  swifter?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' west cathead and the west bitt (Stage 1059). A fenced lot.
   * Nothing out there pays a gun.
   */
  futtock?: WildEdge;
  /**
   * The south end of DEADLETTER DOCKS' west wall, past the wharf (Stage 1063). A fenced lot.
   * Nothing out there pays a gun.
   */
  bumkin?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' west bumkin and the west wharf (Stage 1067). A fenced lot.
   * Nothing out there pays a gun.
   */
  martingale?: WildEdge;
  /**
   * The east run of RELAY HEIGHTS' south wall (Stage 977). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  tie?: WildEdge;
  /**
   * The west run of NIGHT MARKET's south wall (Stage 978). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  hook?: WildEdge;
  /**
   * The west end of NIGHT MARKET's south wall, past the hook (Stage 1032). A fenced lot.
   * Nothing out there pays a gun.
   */
  eyelet?: WildEdge;
  /**
   * The slab between NIGHT MARKET's south eyelet and the south hook (Stage 1036). A fenced lot.
   * Nothing out there pays a gun.
   */
  downhaul?: WildEdge;
  /**
   * The north end of NIGHT MARKET's east wall, past the aisle (Stage 1040). A fenced lot.
   * Nothing out there pays a gun.
   */
  placket?: WildEdge;
  /**
   * The slab between NIGHT MARKET's east placket and the east aisle (Stage 1044). A fenced lot.
   * Nothing out there pays a gun.
   */
  basting?: WildEdge;
  /**
   * The south end of NIGHT MARKET's east wall, past the crate (Stage 1048). A fenced lot.
   * Nothing out there pays a gun.
   */
  binding?: WildEdge;
  /**
   * The slab between NIGHT MARKET's east binding and the east crate (Stage 1052). A fenced lot.
   * Nothing out there pays a gun.
   */
  selvage?: WildEdge;
  /**
   * The west run of RELAY HEIGHTS' north wall (Stage 979). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  spar?: WildEdge;
  /**
   * The east run of NIGHT MARKET's north wall (Stage 980). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  tarp?: WildEdge;
  /**
   * The east run of REPO DEPOT's south wall (Stage 981). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  chock?: WildEdge;
  /**
   * The north run of REPO DEPOT's west wall (Stage 982). A fenced lot, clear of the gates.
   * Nothing out there pays a gun.
   */
  skid?: WildEdge;
  /**
   * The north run of REPO DEPOT's west wall, between the skid and the gate (Stage 1026).
   * A fenced lot. Nothing out there pays a gun.
   */
  becket?: WildEdge;
  /**
   * The east run of DEADLETTER DOCKS' north wall, between the gate and the keel (Stage 983).
   * A fenced lot. Nothing out there pays a gun.
   */
  fender?: WildEdge;
  /**
   * The west end of DEADLETTER DOCKS' north wall, past the slip (Stage 984). A fenced lot.
   * Nothing out there pays a gun.
   */
  stem?: WildEdge;
  /**
   * The west run of DEADLETTER DOCKS' north wall, between the stem and the slip (Stage 1027).
   * A fenced lot. Nothing out there pays a gun.
   */
  thimble?: WildEdge;
  /**
   * The west end of NIGHT MARKET's north wall, past the lane (Stage 985). A fenced lot.
   * Nothing out there pays a gun.
   */
  awning?: WildEdge;
  /**
   * The west run of NIGHT MARKET's north wall, between the awning and the lane (Stage 1028).
   * A fenced lot. Nothing out there pays a gun.
   */
  grommet?: WildEdge;
  /**
   * The west end of RELAY HEIGHTS' north wall, past the spar (Stage 986). A fenced lot.
   * Nothing out there pays a gun.
   */
  vane?: WildEdge;
  /**
   * The west run of RELAY HEIGHTS' north wall, between the vane and the spar (Stage 1029).
   * A fenced lot. Nothing out there pays a gun.
   */
  cringle?: WildEdge;
  /**
   * The west end of REPO DEPOT's north wall, past the crest (Stage 987). A fenced lot.
   * Nothing out there pays a gun.
   */
  winch?: WildEdge;
  /**
   * The west run of REPO DEPOT's north wall, between the winch and the crest (Stage 1030).
   * A fenced lot. Nothing out there pays a gun.
   */
  deadeye?: WildEdge;
  /**
   * The east run of NIGHT MARKET's north wall, between the gate and the tarp (Stage 988).
   * A fenced lot. Nothing out there pays a gun.
   */
  valance?: WildEdge;
  /**
   * The east run of RELAY HEIGHTS' north wall, between the gate and the ledge (Stage 989).
   * A fenced lot. Nothing out there pays a gun.
   */
  stay?: WildEdge;
  /**
   * The east run of REPO DEPOT's north wall, between the gate and the hoist (Stage 990).
   * A fenced lot. Nothing out there pays a gun.
   */
  dolly?: WildEdge;
  /**
   * The west run of DEADLETTER DOCKS' north wall, between the gate and the slip (Stage 991).
   * A fenced lot. Nothing out there pays a gun.
   */
  hawse?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' north hawse and the north slip (Stage 1090). A fenced lot.
   * Nothing out there pays a gun.
   */
  nipper?: WildEdge;
  /**
   * The west run of NIGHT MARKET's north wall, between the gate and the lane (Stage 992).
   * A fenced lot. Nothing out there pays a gun.
   */
  fringe?: WildEdge;
  /**
   * The slab between NIGHT MARKET's north fringe and the north lot (Stage 1091). A fenced lot.
   * Nothing out there pays a gun.
   */
  shirr?: WildEdge;
  /**
   * The west run of RELAY HEIGHTS' north wall, between the gate and the spar (Stage 993).
   * A fenced lot. Nothing out there pays a gun.
   */
  halyard?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' north halyard and the north spar (Stage 1092). A fenced lot.
   * Nothing out there pays a gun.
   */
  gasket?: WildEdge;
  /**
   * The west run of REPO DEPOT's north wall, between the gate and the crest (Stage 994).
   * A fenced lot. Nothing out there pays a gun.
   */
  bolster?: WildEdge;
  /**
   * The slab between REPO DEPOT's north bolster and the north crest (Stage 1093). A fenced lot.
   * Nothing out there pays a gun.
   */
  stopper?: WildEdge;
  /**
   * The east run of DEADLETTER DOCKS' north wall, between the fender and the keel (Stage 995).
   * A fenced lot. Nothing out there pays a gun.
   */
  transom?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' north fender and the north transom (Stage 1094). A fenced lot.
   * Nothing out there pays a gun.
   */
  mouse?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' north transom and the north keel (Stage 1098). A fenced lot.
   * Nothing out there pays a gun.
   */
  skeg?: WildEdge;
  /**
   * The east run of NIGHT MARKET's north wall, between the valance and the tarp (Stage 996).
   * A fenced lot. Nothing out there pays a gun.
   */
  hem?: WildEdge;
  /**
   * The slab between NIGHT MARKET's north valance and the north hem (Stage 1095). A fenced lot.
   * Nothing out there pays a gun.
   */
  nap?: WildEdge;
  /**
   * The slab between NIGHT MARKET's north hem and the north tarp (Stage 1099). A fenced lot.
   * Nothing out there pays a gun.
   */
  ruche?: WildEdge;
  /**
   * The slab between NIGHT MARKET's south gore and the south row (Stage 1103). A fenced lot.
   * Nothing out there pays a gun.
   */
  pinking?: WildEdge;
  /**
   * The east run of RELAY HEIGHTS' north wall, between the stay and the ledge (Stage 997).
   * A fenced lot. Nothing out there pays a gun.
   */
  shroud?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' north stay and the north shroud (Stage 1096). A fenced lot.
   * Nothing out there pays a gun.
   */
  hank?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' north shroud and the north ledge (Stage 1100). A fenced lot.
   * Nothing out there pays a gun.
   */
  inhaul?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' south batten and the south tie (Stage 1104). A fenced lot.
   * Nothing out there pays a gun.
   */
  ratline?: WildEdge;
  /**
   * The east run of REPO DEPOT's north wall, between the dolly and the hoist (Stage 998).
   * A fenced lot. Nothing out there pays a gun.
   */
  cradle?: WildEdge;
  /**
   * The slab between REPO DEPOT's north dolly and the north cradle (Stage 1097). A fenced lot.
   * Nothing out there pays a gun.
   */
  strop?: WildEdge;
  /**
   * The slab between REPO DEPOT's north cradle and the north hoist (Stage 1101). A fenced lot.
   * Nothing out there pays a gun.
   */
  burton?: WildEdge;
  /**
   * The slab between REPO DEPOT's south capstan and the south chock (Stage 1105). A fenced lot.
   * Nothing out there pays a gun.
   */
  carling?: WildEdge;
  /**
   * The east run of DEADLETTER DOCKS' south wall, between the gate and the cleat (Stage 999).
   * A fenced lot. Nothing out there pays a gun.
   */
  gunwale?: WildEdge;
  /**
   * The east run of NIGHT MARKET's south wall, between the gate and the row (Stage 1000).
   * A fenced lot. Nothing out there pays a gun.
   */
  welt?: WildEdge;
  /**
   * The east run of RELAY HEIGHTS' south wall, between the gate and the tie (Stage 1001).
   * A fenced lot. Nothing out there pays a gun.
   */
  luff?: WildEdge;
  /**
   * The east run of REPO DEPOT's south wall, between the gate and the chock (Stage 1002).
   * A fenced lot. Nothing out there pays a gun.
   */
  derrick?: WildEdge;
  /**
   * The west run of DEADLETTER DOCKS' south wall, between the pier and the south-west gate (Stage 1003).
   * A fenced lot. Nothing out there pays a gun.
   */
  strake?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' south strake and the south pier (Stage 1086). A fenced lot.
   * Nothing out there pays a gun.
   */
  scupper?: WildEdge;
  /**
   * The west run of NIGHT MARKET's south wall, between the hook and the south-west gate (Stage 1004).
   * A fenced lot. Nothing out there pays a gun.
   */
  seam?: WildEdge;
  /**
   * The slab between NIGHT MARKET's south seam and the south hook (Stage 1087). A fenced lot.
   * Nothing out there pays a gun.
   */
  smock?: WildEdge;
  /**
   * The west run of RELAY HEIGHTS' south wall, between the span and the south-west gate (Stage 1005).
   * A fenced lot. Nothing out there pays a gun.
   */
  leech?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' south leech and the south span (Stage 1088). A fenced lot.
   * Nothing out there pays a gun.
   */
  foot?: WildEdge;
  /**
   * The west run of REPO DEPOT's south wall, between the bay and the south-west gate (Stage 1006).
   * A fenced lot. Nothing out there pays a gun.
   */
  davit?: WildEdge;
  /**
   * The slab between REPO DEPOT's south davit and the south bay (Stage 1089). A fenced lot.
   * Nothing out there pays a gun.
   */
  gripes?: WildEdge;
  /**
   * The east run of DEADLETTER DOCKS' south wall, between the gunwale and the cleat (Stage 1007).
   * A fenced lot. Nothing out there pays a gun.
   */
  garboard?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' south garboard and the south cleat (Stage 1102). A fenced lot.
   * Nothing out there pays a gun.
   */
  rudder?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' south gunwale and the south garboard (Stage 1106). A fenced lot.
   * Nothing out there pays a gun.
   */
  limber?: WildEdge;
  /**
   * The east run of NIGHT MARKET's south wall, between the welt and the row (Stage 1008).
   * A fenced lot. Nothing out there pays a gun.
   */
  gore?: WildEdge;
  /**
   * The east run of RELAY HEIGHTS' south wall, between the luff and the tie (Stage 1009).
   * A fenced lot. Nothing out there pays a gun.
   */
  batten?: WildEdge;
  /**
   * The east run of REPO DEPOT's south wall, between the derrick and the chock (Stage 1010).
   * A fenced lot. Nothing out there pays a gun.
   */
  capstan?: WildEdge;
  /**
   * The south run of DEADLETTER DOCKS' east wall, between the gate and the bollard (Stage 1011).
   * A fenced lot. Nothing out there pays a gun.
   */
  fairlead?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' east fairlead and the east bollard (Stage 1078). A fenced lot.
   * Nothing out there pays a gun.
   */
  kedge?: WildEdge;
  /**
   * The south run of NIGHT MARKET's east wall, between the gate and the crate (Stage 1012).
   * A fenced lot. Nothing out there pays a gun.
   */
  gusset?: WildEdge;
  /**
   * The slab between NIGHT MARKET's east gusset and the east crate (Stage 1079). A fenced lot.
   * Nothing out there pays a gun.
   */
  facing?: WildEdge;
  /**
   * The north run of NIGHT MARKET's east wall, between the aisle and the gate (Stage 1016).
   * A fenced lot. Nothing out there pays a gun.
   */
  dart?: WildEdge;
  /**
   * The slab between NIGHT MARKET's east dart and the east aisle (Stage 1083). A fenced lot.
   * Nothing out there pays a gun.
   */
  gather?: WildEdge;
  /**
   * The north run of RELAY HEIGHTS' east wall, between the mast and the gate (Stage 1017).
   * A fenced lot. Nothing out there pays a gun.
   */
  roach?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' east roach and the east mast (Stage 1084). A fenced lot.
   * Nothing out there pays a gun.
   */
  lacing?: WildEdge;
  /**
   * The south run of RELAY HEIGHTS' east wall, between the gate and the strut (Stage 1013).
   * A fenced lot. Nothing out there pays a gun.
   */
  clew?: WildEdge;
  /**
   * The slab between RELAY HEIGHTS' east clew and the east strut (Stage 1080). A fenced lot.
   * Nothing out there pays a gun.
   */
  earring?: WildEdge;
  /**
   * The south run of REPO DEPOT's east wall, between the gate and the jack (Stage 1014).
   * A fenced lot. Nothing out there pays a gun.
   */
  windlass?: WildEdge;
  /**
   * The slab between REPO DEPOT's east windlass and the east jack (Stage 1081). A fenced lot.
   * Nothing out there pays a gun.
   */
  messenger?: WildEdge;
  /**
   * The north run of REPO DEPOT's east wall, between the ramp and the gate (Stage 1018).
   * A fenced lot. Nothing out there pays a gun.
   */
  pawl?: WildEdge;
  /**
   * The slab between REPO DEPOT's east pawl and the east ramp (Stage 1085). A fenced lot.
   * Nothing out there pays a gun.
   */
  seizing?: WildEdge;
  /**
   * The north run of DEADLETTER DOCKS' east wall, between the gate and the quay (Stage 1015).
   * A fenced lot. Nothing out there pays a gun.
   */
  bulwark?: WildEdge;
  /**
   * The slab between DEADLETTER DOCKS' east bulwark and the east quay (Stage 1082). A fenced lot.
   * Nothing out there pays a gun.
   */
  breast?: WildEdge;
}

/** Feet positions for the one opening in the city wall. */
export interface WildEdge {
  /** on the street, city side of the opening */
  street: Vec3;
  /** in the passage through the wall */
  passage: Vec3;
  /** on the open ground outside */
  outside: Vec3;
  line: string;
}

/** Feet positions for the one walk-in shop, and the line the clerk gives. */
export interface ShopSpot {
  /** in the doorway, still on the apron */
  mouth: Vec3;
  /** on the open floor inside */
  inside: Vec3;
  /** in front of the counter */
  counter: Vec3;
  line: string;
}

/**
 * Stage 1 grey-box: "Drainage Yard". A 64x64 m arena with a sunken channel,
 * mantle ledges, crates for step-ups, a long sightline for the rifle, and a
 * raised gantry. Layout is authored so the probe can exercise sprint → slide →
 * slide-jump → mantle → kill on one straight-ish run.
 */
export function drainageYard(): LevelDef {
  const boxes: Box[] = [];
  const H = 32; // half extent
  // floor slab
  boxes.push(box(-H, -1, -H, H, 0, H, "floor"));
  // perimeter walls
  boxes.push(box(-H, 0, -H - 1, H, 6, -H, "wall"));
  boxes.push(box(-H, 0, H, H, 6, H + 1, "wall"));
  boxes.push(box(-H - 1, 0, -H, -H, 6, H, "wall"));
  boxes.push(box(H, 0, -H, H + 1, 6, H, "wall"));

  // --- probe lane (runs along -Z from spawn at z=+24) ---
  // low curb for step-up at z=12
  boxes.push(box(-3, 0, 11.6, 3, 0.3, 12.4, "curb"));
  // mantle ledge block (1.2 m) at z=-2..-8 : the landing deck
  boxes.push(box(-4, 0, -8, 4, 1.2, -2, "deck"));
  // second, taller mantle (1.55 m) on top of the deck's far end -> upper deck
  boxes.push(box(-4, 0, -14, 4, 2.7, -8, "upperdeck"));
  // stairs of crates down the west side of the deck
  boxes.push(box(-8, 0, -6, -4.5, 0.4, -3, "crate"));
  boxes.push(box(-8, 0, -9.5, -4.5, 0.8, -6.5, "crate"));

  // --- sunken channel cutting east-west at z = 2..6 (a slide-jump gap) ---
  // The floor is one slab, so model the channel as a pit: replace with rims
  // (we simply leave the floor and mark the channel with kerbs; the gap is
  // represented by the drop into the pit below.)
  boxes.push(box(-H, 0, 5.6, -6, 0.5, 6.4, "kerb"));
  boxes.push(box(6, 0, 5.6, H, 0.5, 6.4, "kerb"));

  // --- east arena: pillars and cover for future PvP ---
  for (let i = 0; i < 4; i++) {
    const x = 12 + i * 5;
    boxes.push(box(x - 0.6, 0, -0.6, x + 0.6, 4.5, 0.6, "pillar"));
  }
  boxes.push(box(10, 0, -18, 26, 1.0, -16, "lowwall"));
  boxes.push(box(14, 0, 14, 22, 2.2, 15, "highwall"));
  // gantry (raised walkway) along the east wall
  boxes.push(box(26, 3.2, -26, 30, 3.5, 26, "gantry"));
  boxes.push(box(26, 0, 22, 30, 3.2, 26, "gantrystair"));

  // --- west arena: warehouse blocks ---
  boxes.push(box(-28, 0, -26, -16, 5, -14, "block"));
  boxes.push(box(-28, 0, 10, -18, 3, 22, "block"));
  boxes.push(box(-14, 0, 18, -8, 1.6, 24, "crate"));
  boxes.push(box(-14, 1.6, 21, -11, 2.4, 24, "crate"));

  // --- dressing that also collides: light gantry over the lane, barrels, cones ---
  boxes.push(box(-6.3, 0, 13.7, -5.7, 4.6, 14.3, "post"));
  boxes.push(box(5.7, 0, 13.7, 6.3, 4.6, 14.3, "post"));
  boxes.push(box(-6.3, 4.4, 13.8, 6.3, 4.6, 14.2, "bar"));
  boxes.push(box(-15.5, 0, -15.3, -14.9, 0.9, -14.7, "barrel"));
  boxes.push(box(-14.8, 0, -15.9, -14.2, 0.9, -15.3, "barrel"));
  boxes.push(box(10.4, 0, -15.6, 11.0, 0.9, -15.0, "barrel"));
  boxes.push(box(23.2, 0, 12.6, 23.8, 0.9, 13.2, "barrel"));
  boxes.push(box(26.6, 0, 13.8, 27.2, 0.7, 14.4, "cone"));
  boxes.push(box(-9.5, 0, 25.0, -8.9, 0.7, 25.6, "cone"));

  const spawns: SpawnPoint[] = [
    { pos: v3(0, 0, 24), yaw: 0 },
    { pos: v3(20, 0, 20), yaw: Math.PI / 2 },
    { pos: v3(-20, 0, 0), yaw: -Math.PI / 2 },
    { pos: v3(0, 3.5, -24), yaw: Math.PI },
  ];

  const dummies: DummyDef[] = [
    { id: 1, pos: v3(0, 2.7, -12) }, // on the upper deck, the probe's target
    { id: 2, pos: v3(18, 0, -10), patrolTo: v3(18, 0, 8) },
    { id: 3, pos: v3(-12, 0, -4) },
    { id: 4, pos: v3(6, 0, 18), patrolTo: v3(-6, 0, 18) },
    { id: 5, pos: v3(28, 3.5, 0) },
  ];

  const wasps = [
    { waypoints: [v3(16, 3.5, -6), v3(24, 3.8, 6), v3(14, 3.2, 10)] },
    { waypoints: [v3(-12, 3.5, -10), v3(-20, 3.8, 4), v3(-10, 3.2, 8)] },
  ];
  const mechs = [{ path: [v3(13, 0, -22), v3(24, 0, -22)], face: Math.PI }]; // light sweeps the arena to the north
  const nodes = [
    { id: 1, label: "A", pos: v3(0, 1.2, -5), links: [2, 3, 4] },
    { id: 2, label: "B", pos: v3(18, 0, 0), links: [1, 4, 5] },
    { id: 3, label: "C", pos: v3(-14, 0, -2), links: [1, 4] },
    { id: 4, label: "D", pos: v3(0, 0, 17), links: [1, 2, 3] },
    { id: 5, label: "E", pos: v3(20, 0, -12), links: [2] },
  ];
  const lights: LightDef[] = [
    { x: 22, y: 9, z: 18, color: "magenta", intensity: 60, range: 80 },
    { x: -20, y: 9, z: -20, color: "cyan", intensity: 60, range: 80 },
    { x: 0, y: 4.5, z: -6, color: "cyan", intensity: 14, range: 22 },
    { x: 0, y: 4.3, z: 14, color: "cyan", intensity: 12, range: 20 },
    { x: -11, y: 2.5, z: 21, color: "amber", intensity: 8, range: 12 },
  ];
  const signs: SignDef[] = [
    { text: "DEADLETTER", fg: "#35f2ff", bg: "#07111a", border: "#35f2ff", w: 6, h: 1.5, x: -22, y: 3.8, z: -13.9, rotY: 0 },
    { text: "REPO DEPOT", fg: "#ff3ec9", bg: "#170714", border: "#ff3ec9", w: 5, h: 1.25, x: -23, y: 1.9, z: 22.06, rotY: 0 },
    { text: "再租 RE-LEASE", fg: "#ffe34a", bg: "#1a1206", border: "#ffe34a", w: 4.4, h: 1.1, x: 18, y: 1.7, z: 15.06, rotY: 0 },
    { text: "VANTAGE", fg: "#ffb02e", bg: "#160f04", border: "#ffb02e", w: 5, h: 1.25, x: 31.9, y: 4.6, z: 0, rotY: -Math.PI / 2 },
    { text: "CHILL UNDER", fg: "#35f2ff", bg: "#07111a", border: "#ff3ec9", w: 3.6, h: 0.9, x: 0, y: 3.2, z: -31.9, rotY: 0 },
    { text: "LEASE-BREAKER", fg: "#ff3ec9", bg: "#170714", border: "#35f2ff", w: 4.2, h: 1.0, x: -31.9, y: 3.4, z: -4, rotY: Math.PI / 2 },
  ];
  // the gate sits on the west spawn: you wake safe, and the street beyond is the PvP zone
  const zones: ZoneDef[] = [{ kind: "safe", label: "GATE", pos: v3(-20, 0, 0), radius: 5 }];
  // claims on the nodes and one deep in the far corner; none inside the gate or on a spawn (a respawn must not pick one up)
  const claims: ClaimDef[] = [...nodes.map((n, i) => ({ pos: v3(n.pos.x, n.pos.y, n.pos.z), value: 1 + (i % 3) })), { pos: v3(H - 8, 0, H - 8), value: 5 }].filter(
    (c) => !zones.some((z) => Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z) < z.radius + 2) && !spawns.some((sp) => Math.hypot(c.pos.x - sp.pos.x, c.pos.z - sp.pos.z) < 4),
  );
  return { name: "drainage_yard", displayName: "DRAINAGE YARD", district: "magenta", bounds: H, boxes, spawns, dummies, killY: -20, wasps, mechs, nodes, lights, signs, skylineSeed: 42, zones, claims };
}

// ---------------------------------------------------------------------------
// Registry: the range plus the districts of Neo-China (shared/sim/city.ts).
import { DISTRICT_SPECS, generateDistrict } from "./city";
import { deadletterOffice, HUB_LEVEL_ID } from "./hub";
import { whiteOffice, WHITE_LEVEL_ID } from "./white";

export const DEFAULT_LEVEL_ID = "lease_row";

export const LEVEL_IDS: readonly string[] = ["drainage_yard", ...DISTRICT_SPECS.map((d) => d.id), HUB_LEVEL_ID, WHITE_LEVEL_ID];

/** What the district select lists, without building the levels. */
export const LEVEL_INFO: readonly { id: string; displayName: string; cast: DistrictCast; kind: "range" | "district" | "hub" }[] = [
  { id: "drainage_yard", displayName: "DRAINAGE YARD (RANGE)", cast: "magenta", kind: "range" },
  ...DISTRICT_SPECS.map((d) => ({ id: d.id, displayName: d.displayName, cast: d.cast, kind: "district" as const })),
  { id: HUB_LEVEL_ID, displayName: "DEADLETTER OFFICE (HUB)", cast: "cyan", kind: "hub" },
];
/** Levels the district select does not list (reached by the campaign only). */
export const HIDDEN_LEVELS: readonly string[] = [WHITE_LEVEL_ID];

/** The city's name for a level id, without building the geometry. */
export function levelDisplayName(id: string): string {
  if (id === WHITE_LEVEL_ID) return "THE WHITE OFFICE";
  return (LEVEL_INFO.find((l) => l.id === id)?.displayName ?? id.replace(/_/g, " ")).toUpperCase();
}

/** Build a level by id; unknown ids fall back to the default district. */
export function levelById(id: string | null | undefined): LevelDef {
  if (id === "drainage_yard") return drainageYard();
  if (id === HUB_LEVEL_ID) return deadletterOffice();
  if (id === WHITE_LEVEL_ID) return whiteOffice();
  const spec = DISTRICT_SPECS.find((d) => d.id === id) ?? DISTRICT_SPECS.find((d) => d.id === DEFAULT_LEVEL_ID)!;
  return generateDistrict(spec);
}
