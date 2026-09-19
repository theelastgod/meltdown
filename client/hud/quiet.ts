/**
 * The desk was not a frame (Stage 95).
 *
 * The contracts desk, the fixer's terminal and the closing card are the campaign's frames — the
 * places the game stops being a firefight and becomes a conversation. Since Stage 10 the combat
 * chrome has gone on drawing straight through them: the CLICK TO WAKE banner across the crew
 * invite, the weapon rack along the desk's foot, LEASE-BREAKER 30/30 over the EXPLORE line, and the
 * reticle in the middle of a fixer's testimony. A frame with a gun's ammo count printed over it is
 * not a frame.
 *
 * This is the rule for what each modal silences, pure so it is unit-tested; the HUD toggles one
 * class per group and the stylesheet does the hiding. The status line is never silenced — who you
 * are and what you are worth is the one thing every frame keeps — and the mission line survives
 * the terminal, because a terminal is usually the objective.
 */

export interface Modals {
  desk: boolean;
  terminal: boolean;
  card: boolean;
  /** the ledger book (FILE) or its graph (GRAPH), the file's own frames (Stage 112) */
  ledger: boolean;
  /** the file is closed and waiting to be re-leased (Stage 128): a dead file has no gun */
  dead?: boolean;
}

/** the chrome the rule can silence, each a class on the HUD root: `q-<group>` */
export type ChromeGroup = "prompt" | "reticle" | "rack" | "ammo" | "nades" | "arrows" | "log" | "map" | "mission" | "nodefoot" | "diag" | "alert" | "thumbs";

/**
 * every group; `diag` is the ONLINE / FPS readout, which sat over the desk's right-hand column, and
 * `alert` is the line under the mission panel (Stage 113): with the panel silenced it had hung six
 * pixels from the top of the screen, and re-anchored it hung over the ledger. A frame that covers
 * the screen silences it; a terminal, which is usually the objective, keeps it. `thumbs` is the
 * phone's thumb pads (Stage 137): drawn over a desk they took the taps meant for it, and a frame
 * that covers the screen has nothing for them to drive; a terminal keeps them
 */
export const ALL_GROUPS: readonly ChromeGroup[] = ["prompt", "reticle", "rack", "ammo", "nades", "arrows", "log", "map", "mission", "nodefoot", "diag", "alert", "thumbs"];

/** what a fixer's terminal takes off the screen: the gun and the tutorial, not the objective or the map */
const TERMINAL: readonly ChromeGroup[] = ["prompt", "reticle", "rack", "ammo", "nades", "arrows", "nodefoot"];

/**
 * what a closed file takes off the screen while it waits to be re-leased (Stage 128): the gun's
 * chrome — the reticle, the rack, the ammo, the grenades, the hit arrows, the tutorial and the node
 * line. The closed-by line, the log, the map and the mission stay: that is what a dead file reads
 */
const DEAD: readonly ChromeGroup[] = ["prompt", "reticle", "rack", "ammo", "nades", "arrows", "nodefoot"];

/**
 * The groups to silence for the modals that are open. Nothing open silences nothing. On the phone
 * (`touch`) a terminal silences the event log as well (Stage 138): the phone's terminal is seated
 * where the log is drawn, and the log's lines had printed across its first choice.
 */
export function quietFor(open: Modals, touch = false): ChromeGroup[] {
  // the desk, a card and the ledger cover the screen: everything but the status line goes. The
  // ledger and its graph are opened from the tab bar and by Tab and G, from any mode (Stage 112)
  if (open.desk || open.card || open.ledger) return [...ALL_GROUPS];
  const quiet = new Set<ChromeGroup>();
  if (open.terminal) for (const g of TERMINAL) quiet.add(g);
  if (open.terminal && touch) quiet.add("log");
  if (open.dead) for (const g of DEAD) quiet.add(g);
  return ALL_GROUPS.filter((g) => quiet.has(g));
}
