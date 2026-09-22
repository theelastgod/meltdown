/**
 * The round ended with a line (Stage 121). For fifteen seconds of results the wake said
 * "ROUND OVER" in the mission panel's title and once in the alert, and nothing else: no score
 * laid out, nothing about what you did, no word on when the next round starts. This is the card
 * for those fifteen seconds, pure so it is unit-tested; the HUD shows it while the phase is
 * `results` and takes it down when the warm-up begins.
 */

export interface RoundView {
  phase: string;
  timeLeft: number;
  score: [number, number, number];
  /** the cell that woke the district in full, or 0 when the clock decided */
  winner: number;
}

export interface RoundStats {
  kills: number;
  deaths: number;
  flips: number;
  nodeSeconds: number;
}

export interface RoundCard {
  title: string;
  lines: string[];
  color: "am" | "mg" | "ye" | "cy";
  /** changes when the card's text would: the HUD re-renders on it */
  key: string;
}

const cell = (t: number): string => (t === 1 ? "CELL ONE" : "CELL TWO");

/** The results-card countdown: CRT, not `NEXT ROUND IN 13s`. */
export function nextRoundLine(left: number): string {
  return `NEXT ROUND IN ${left}S`;
}

/** Seconds on nodes, CRT: `41 S ON NODES`, not `41 s ON NODES`. */
export function nodeSecondsLine(seconds: number): string {
  return `${Math.round(seconds)} S ON NODES`;
}

/** One death is DEATH, not DEATHS. */
export function deathsWord(n: number): string {
  return `${n} DEATH${n === 1 ? "" : "S"}`;
}

/** which cell the round went to: the full wake's winner, else the score, else nobody */
export function roundWinner(w: RoundView): number {
  if (w.winner === 1 || w.winner === 2) return w.winner;
  return w.score[1] > w.score[2] ? 1 : w.score[2] > w.score[1] ? 2 : 0;
}

export function roundCard(w: RoundView, myTeam: number, zone: string, stats: RoundStats): RoundCard | null {
  if (w.phase !== "results") return null;
  const winner = roundWinner(w);
  const left = Math.max(0, Math.ceil(w.timeLeft));
  const s1 = Math.floor(w.score[1]);
  const s2 = Math.floor(w.score[2]);
  const lines = [
    winner ? `${cell(winner)} WOKE ${zone}` : `NO ONE WOKE ${zone}`,
    `CELL ONE ${s1} · CELL TWO ${s2}`,
  ];
  if (myTeam === 1 || myTeam === 2) lines.push(`YOU · ${cell(myTeam)} · ${stats.kills} KILLS · ${deathsWord(stats.deaths)} · ${stats.flips} PULLS · ${nodeSecondsLine(stats.nodeSeconds)}`);
  lines.push(nextRoundLine(left));
  const color = !winner || !(myTeam === 1 || myTeam === 2) ? "am" : winner === myTeam ? "cy" : "mg";
  return { title: "ROUND OVER", lines, color, key: `${winner}|${s1}|${s2}|${myTeam}|${stats.kills}|${stats.deaths}|${stats.flips}|${Math.round(stats.nodeSeconds)}|${left}` };
}
