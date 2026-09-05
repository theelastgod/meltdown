/**
 * Attestation stamps: server-verified mechanical firsts, rendered as
 * REDACTED lines in the Ghostfile that un-redact when you do the thing.
 * The character sheet is a to-do list of skills; it replaces tutorials.
 * ~120 at launch, generated from a matrix of weapons, movement, the wake,
 * support, grenades, matches and the file itself.
 */
import { WEAPON_LIST, type WeaponId } from "../weapons/manifest";

export type StampCounter =
  | `kills:${WeaponId}`
  | `headshotKills:${WeaponId}`
  | `matchKills:${WeaponId}`
  | `longKills:${WeaponId}`
  | `slideKills:${WeaponId}`
  | `airKills:${WeaponId}`
  | `rank:${WeaponId}`
  | "slideJumpKills" | "mantleKills" | "slidMetres" | "sprintKills" | "crouchKills" | "fallKills"
  | "flips" | "matchFlips" | "fullWakes" | "contestSeconds" | "boostFlips" | "pulseRecovers" | "nodeSeconds"
  | "waspKills" | "mechKills" | "empDoubles" | "smokeBreaks" | "assists" | "supportPoints"
  | "fragKills" | "fragDoubles" | "stickyKills" | "proximityKills" | "empKills"
  | "depth" | "nodesOwned" | "attested" | "keystones" | "chips" | "firmwares" | "crafts" | "ring2" | "ring3"
  | "wins" | "fullWakeWins" | "noDeathRounds" | "matchKillsAny" | "topScores" | "matches"
  | "rejoins" | "districts" | "kills";

export interface StampDef {
  id: string;
  /** the line as it reads once un-redacted */
  line: string;
  counter: StampCounter;
  need: number;
  group: "weapon" | "movement" | "wake" | "support" | "grenade" | "file" | "match" | "city";
}

const st = (id: string, group: StampDef["group"], counter: StampCounter, need: number, line: string): StampDef => ({ id, group, counter, need, line });

const perWeapon: StampDef[] = WEAPON_LIST.flatMap((w) => {
  const n = w.name.split(" ")[0]!;
  return [
    st(`first_kill:${w.id}`, "weapon", `kills:${w.id}`, 1, `FIRST FILE CLOSED · ${n}`),
    st(`first_head:${w.id}`, "weapon", `headshotKills:${w.id}`, 1, `FIRST HEADSHOT · ${n}`),
    st(`five_match:${w.id}`, "weapon", `matchKills:${w.id}`, 5, `FIVE IN ONE ROUND · ${n}`),
    st(`long:${w.id}`, "weapon", `longKills:${w.id}`, 1, `KILL BEYOND ${Math.round(w.range.ideal * 1.5)} M · ${n}`),
    st(`slide:${w.id}`, "weapon", `slideKills:${w.id}`, 1, `KILL MID-SLIDE · ${n}`),
    st(`air:${w.id}`, "weapon", `airKills:${w.id}`, 1, `KILL MID-AIR · ${n}`),
    st(`r10:${w.id}`, "weapon", `rank:${w.id}`, 10, `MASTERY X · ${n}`),
    st(`r20:${w.id}`, "weapon", `rank:${w.id}`, 20, `MASTERY XX · ${n}`),
    st(`r30:${w.id}`, "weapon", `rank:${w.id}`, 30, `MASTERY XXX · ${n}`),
    st(`hundred:${w.id}`, "weapon", `kills:${w.id}`, 100, `ONE HUNDRED FILES · ${n}`),
  ];
});

export const STAMPS: StampDef[] = [
  ...perWeapon,
  // movement
  st("slide_jump_kill", "movement", "slideJumpKills", 1, "FIRST SLIDE-JUMP KILL"),
  st("mantle_kill", "movement", "mantleKills", 1, "KILL OFF A MANTLE"),
  st("slid_100", "movement", "slidMetres", 100, "ONE HUNDRED METRES SLID"),
  st("slid_1000", "movement", "slidMetres", 1000, "ONE KILOMETRE SLID"),
  st("sprint_kill", "movement", "sprintKills", 1, "KILL AT A SPRINT"),
  st("crouch_kill", "movement", "crouchKills", 1, "KILL FROM A CROUCH"),
  // the wake
  st("first_flip", "wake", "flips", 1, "FIRST NODE OFF THE MODEL"),
  st("three_node_round", "wake", "matchFlips", 3, "THREE NODES IN ONE ROUND"),
  st("five_node_round", "wake", "matchFlips", 5, "FIVE NODES IN ONE ROUND"),
  st("full_wake", "wake", "fullWakes", 1, "FULL WAKE"),
  st("contest_30", "wake", "contestSeconds", 30, "THIRTY SECONDS CONTESTED"),
  st("boost_flip", "wake", "boostFlips", 1, "PHAGE-BOOSTED FLIP"),
  st("flips_10", "wake", "flips", 10, "TEN NODES OFF THE MODEL"),
  st("flips_100", "wake", "flips", 100, "ONE HUNDRED NODES OFF THE MODEL"),
  st("node_hour", "wake", "nodeSeconds", 3600, "AN HOUR ON THE NODES"),
  // support
  st("first_wasp", "support", "waspKills", 1, "FIRST WASP DOWNED"),
  st("first_mech", "support", "mechKills", 1, "FIRST REPO MECH DISABLED"),
  st("emp_double", "support", "empDoubles", 1, "EMP DOUBLE"),
  st("wasps_10", "support", "waspKills", 10, "TEN WASPS DOWNED"),
  st("mechs_5", "support", "mechKills", 5, "FIVE MECHS DISABLED"),
  st("support_100", "support", "supportPoints", 100, "ONE HUNDRED SUPPORT POINTS"),
  // grenades
  st("frag_kill", "grenade", "fragKills", 1, "FIRST FRAG KILL"),
  st("frag_double", "grenade", "fragDoubles", 1, "FRAG DOUBLE"),
  st("sticky_kill", "grenade", "stickyKills", 1, "FIRST STICKY KILL"),
  st("proximity_kill", "grenade", "proximityKills", 1, "PROXIMITY KILL"),
  st("emp_kill", "grenade", "empKills", 1, "KILL UNDER YOUR OWN EMP"),
  // the file
  st("depth_5", "file", "depth", 5, "DEPTH V"),
  st("depth_10", "file", "depth", 10, "DEPTH X — CHAPTER ONE"),
  st("depth_25", "file", "depth", 25, "DEPTH XXV — CHAPTER TWO"),
  st("depth_50", "file", "depth", 50, "DEPTH L — THE NAME"),
  st("first_node", "file", "nodesOwned", 1, "FIRST LINE OF THE LEDGER GRAPH"),
  st("nodes_12", "file", "nodesOwned", 12, "TWELVE NODES OWNED"),
  st("nodes_24", "file", "nodesOwned", 24, "TWENTY-FOUR NODES OWNED"),
  st("nodes_48", "file", "nodesOwned", 48, "THE WHOLE GRAPH"),
  st("attest_7", "file", "attested", 7, "SEVEN ATTESTED"),
  st("first_keystone", "file", "keystones", 1, "FIRST KEYSTONE"),
  st("first_chip", "file", "chips", 1, "FIRST CHIP SOCKETED"),
  st("first_firmware", "file", "firmwares", 1, "FIRST FIRMWARE FLASHED"),
  st("first_craft", "file", "crafts", 1, "FIRST CRAFT"),
  st("ring2", "file", "ring2", 1, "SECOND RING OPENED"),
  st("ring3", "file", "ring3", 1, "THIRD RING OPENED"),
  // matches
  st("first_win", "match", "wins", 1, "FIRST ROUND WOKE"),
  st("wins_10", "match", "wins", 10, "TEN ROUNDS WOKE"),
  st("wins_100", "match", "wins", 100, "ONE HUNDRED ROUNDS WOKE"),
  st("full_wake_win", "match", "fullWakeWins", 1, "WON BY FULL WAKE"),
  st("no_death", "match", "noDeathRounds", 1, "A ROUND WITHOUT DYING"),
  st("kills_10_round", "match", "matchKillsAny", 10, "TEN FILES IN ONE ROUND"),
  st("kills_20_round", "match", "matchKillsAny", 20, "TWENTY FILES IN ONE ROUND"),
  st("top_score", "match", "topScores", 1, "TOP OF THE ROUND"),
  st("matches_10", "match", "matches", 10, "TEN ROUNDS PLAYED"),
  st("matches_100", "match", "matches", 100, "ONE HUNDRED ROUNDS PLAYED"),
  st("kills_100", "match", "kills", 100, "ONE HUNDRED FILES CLOSED"),
  st("kills_1000", "match", "kills", 1000, "ONE THOUSAND FILES CLOSED"),
  // the city
  st("first_rejoin", "city", "rejoins", 1, "CAME BACK FROM A DROPPED LINK"),
  st("districts_3", "city", "districts", 3, "ALL THREE DISTRICTS WALKED"),
];

export const stampById = (id: string): StampDef | undefined => STAMPS.find((s) => s.id === id);

/** Redacted rendering: the line's letters become blocks, its spacing kept. */
export function redact(line: string): string {
  return line.replace(/[A-Z0-9]/g, "█");
}
