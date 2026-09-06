/**
 * DEEP WAKE: a seasonal, persistent district graph. Every wake node in
 * Neo-China has a holding house; each settled round pushes pressure toward the
 * houses of the files that flipped it, and enough pressure turns the node.
 * A season is 28 days; at its end a history log is written from the real
 * data (who held what, the swings) and pressures reset. No wagering, no
 * staking, nothing to buy — the graph is moved by matches only.
 */
import { seasonIndex, seasonWeek } from "./clock";

export type House = "estate" | "clockeaters" | "cells" | "unaligned";
export const HOUSES: readonly House[] = ["estate", "clockeaters", "cells"];
export const DISTRICTS: readonly string[] = ["lease_row", "deadletter_docks", "repo_depot"];
export const NODE_LABELS: readonly string[] = ["A", "B", "C", "D", "E"];
/** pressure needed to turn a node */
export const TURN_AT = 6;
/** the Deep Wake's prize channel pays from this Depth: the room records contributions only at it */
export const SEASON_DEPTH = 15;

export interface NodeState {
  house: House;
  /** pressure toward each house this season */
  pressure: Record<House, number>;
  turns: number;
}

export interface SeasonState {
  season: number;
  districts: Record<string, Record<string, NodeState>>;
  /** settled rounds that moved the graph this season */
  rounds: number;
  history: string[];
  /** last round's summary line (probe-readable) */
  last: string | null;
  /** flips this season per file (Depth ≥ SEASON_DEPTH only; the room decides): the Deep Wake's prize channel */
  contributors: Record<string, number>;
}

const emptyNode = (): NodeState => ({ house: "unaligned", pressure: { estate: 0, clockeaters: 0, cells: 0, unaligned: 0 }, turns: 0 });

export function emptySeason(season = seasonIndex()): SeasonState {
  const districts: SeasonState["districts"] = {};
  for (const d of DISTRICTS) {
    districts[d] = {};
    for (const n of NODE_LABELS) districts[d]![n] = emptyNode();
  }
  return { season, districts, rounds: 0, history: [], last: null, contributors: {} };
}

export interface RoundPush {
  level: string;
  /** flips per node label per house, from the files that made them */
  flips: { label: string; house: House; count: number }[];
  /** the winning cell's houses (each gets +1 on every node it holds at round end) */
  winners: House[];
  /** flips per file this round, for the season's prize channel (the room gates by Depth) */
  contributors?: Record<string, number>;
}

/** Roll the season over when the index moved: write the log from the real data, then reset. */
export function rollSeason(st: SeasonState, now = Date.now()): boolean {
  const idx = seasonIndex(now);
  if (st.season === idx) return false;
  const lines: string[] = [`SEASON ${st.season} CLOSED · ${st.rounds} ROUNDS MOVED THE GRAPH`];
  for (const d of DISTRICTS) {
    const nodes = st.districts[d] ?? {};
    const held: Record<string, number> = {};
    let turns = 0;
    for (const n of Object.values(nodes)) {
      held[n.house] = (held[n.house] ?? 0) + 1;
      turns += n.turns;
    }
    const top = Object.entries(held).sort((a, b) => b[1] - a[1])[0];
    lines.push(`${d.toUpperCase().replace(/_/g, " ")} · ${top && top[0] !== "unaligned" ? `${top[0].toUpperCase()} HELD ${top[1]}/5` : "NO HOUSE HELD IT"} · ${turns} TURNS`);
  }
  st.history.push(...lines);
  if (st.history.length > 60) st.history.splice(0, st.history.length - 60);
  const fresh = emptySeason(idx);
  // holdings carry into the new season; pressure and turns reset
  for (const d of DISTRICTS) for (const n of NODE_LABELS) fresh.districts[d]![n]!.house = st.districts[d]?.[n]?.house ?? "unaligned";
  fresh.history = st.history;
  Object.assign(st, fresh);
  return true;
}

/** Apply a settled round. Returns the nodes that turned. */
export function applyRound(st: SeasonState, push: RoundPush, now = Date.now()): { label: string; from: House; to: House }[] {
  rollSeason(st, now);
  const nodes = st.districts[push.level];
  if (!nodes) return [];
  const turned: { label: string; from: House; to: House }[] = [];
  for (const f of push.flips) {
    const n = nodes[f.label];
    if (!n || f.house === "unaligned") continue;
    n.pressure[f.house] += f.count;
  }
  for (const n of Object.values(nodes)) for (const h of push.winners) if (h !== "unaligned" && n.house === h) n.pressure[h] += 1;
  if (!st.contributors) st.contributors = {};
  for (const [account, flips] of Object.entries(push.contributors ?? {})) if (flips > 0) st.contributors[account] = (st.contributors[account] ?? 0) + flips;
  for (const [label, n] of Object.entries(nodes)) {
    const [h, p] = (Object.entries(n.pressure) as [House, number][]).filter(([k]) => k !== "unaligned").sort((a, b) => b[1] - a[1])[0]!;
    // the holding house defends: a challenger needs TURN_AT and strictly more pressure than the holder has
    if (p >= TURN_AT && h !== n.house && p > (n.house === "unaligned" ? 0 : n.pressure[n.house])) {
      turned.push({ label, from: n.house, to: h });
      n.house = h;
      n.turns++;
      n.pressure = { estate: 0, clockeaters: 0, cells: 0, unaligned: 0 };
    }
  }
  st.rounds++;
  const w = seasonWeek(now);
  st.last = `S${st.season} W${w} · ${push.level.toUpperCase().replace(/_/g, " ")} · ${push.flips.reduce((a, f) => a + f.count, 0)} FLIPS${turned.length ? " · " + turned.map((t) => `${t.label} → ${t.to.toUpperCase()}`).join(", ") : ""}`;
  if (turned.length) st.history.push(`S${st.season} W${w} · ${turned.map((t) => `${push.level.toUpperCase().replace(/_/g, " ")} ${t.label} TURNED ${t.to.toUpperCase()}${t.from !== "unaligned" ? ` (FROM ${t.from.toUpperCase()})` : ""}`).join(" · ")}`);
  if (st.history.length > 60) st.history.splice(0, st.history.length - 60);
  return turned;
}

/** A compact view: per district, the holders and the pressure leader per node. */
export function seasonView(st: SeasonState) {
  const districts: Record<string, { label: string; house: House; pressure: number; leader: House }[]> = {};
  for (const [d, nodes] of Object.entries(st.districts)) {
    districts[d] = Object.entries(nodes).map(([label, n]) => {
      const lead = (Object.entries(n.pressure) as [House, number][]).filter(([k]) => k !== "unaligned").sort((a, b) => b[1] - a[1])[0]!;
      return { label, house: n.house, pressure: lead[1], leader: lead[1] > 0 ? lead[0] : "unaligned" };
    });
  }
  const held: Record<House, number> = { estate: 0, clockeaters: 0, cells: 0, unaligned: 0 };
  for (const nodes of Object.values(st.districts)) for (const n of Object.values(nodes)) held[n.house]++;
  const top = Object.entries(st.contributors ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { season: st.season, week: seasonWeek(), rounds: st.rounds, held, districts, history: st.history.slice(-8), last: st.last, contributors: top };
}
