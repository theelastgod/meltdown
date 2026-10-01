/**
 * The city's ledger desk (Stage 714): the plaza metro booth.
 *
 * Every district already builds that booth. Standing at its south face names the market, and
 * standing in its mouth for a second walks into THE RUN of this same district. The market is the
 * sink the city was missing. THE RUN is the existing PvP loop. Nothing here pays $CAPITAL for
 * walking, holding, or finishing a city event.
 *
 * This lives beside the gates, not under shared/city, so the street-run client can name the booth
 * without taking on the city's courses.
 */
import type { Box } from "../sim/box";

/** How close the booth's line has to be before the HUD names it. */
export const LEDGER_PROMPT_M = 7;
/** How close the file has to be before the hold into THE RUN starts. */
export const LEDGER_HOLD_M = 2.6;
/** The hold's gate id. Real city gates are 0–7, so this never collides with one. */
export const LEDGER_HOLD_GATE = -1;

export interface LedgerSpot {
  x: number;
  z: number;
}

/** The south face of the metro booth, a step out from the door. */
export function ledgerSpot(level: { boxes: readonly Box[] }): LedgerSpot | null {
  const b = level.boxes.find((x) => x.tag === "metro");
  if (!b) return null;
  return { x: (b.min.x + b.max.x) / 2, z: b.max.z + 1.4 };
}

export function ledgerDistance(pos: { x: number; z: number }, level: { boxes: readonly Box[] }): number | null {
  const s = ledgerSpot(level);
  if (!s) return null;
  return Math.hypot(pos.x - s.x, pos.z - s.z);
}

export const nearLedgerDesk = (pos: { x: number; z: number }, level: { boxes: readonly Box[] }): boolean => {
  const d = ledgerDistance(pos, level);
  return d !== null && d <= LEDGER_PROMPT_M;
};

export const inLedgerMouth = (pos: { x: number; z: number }, level: { boxes: readonly Box[] }): boolean => {
  const d = ledgerDistance(pos, level);
  return d !== null && d <= LEDGER_HOLD_M;
};

/**
 * What the gate line says at the booth. A phone is not told to press Tab. Holding shows the same
 * crossing bar a district gate uses.
 */
export function ledgerHudLine(progress: number, holding: boolean, touch: boolean): string {
  if (holding) {
    const n = 6;
    const done = Math.max(0, Math.min(n, Math.floor(progress * n)));
    return `LEDGER DESK · ENTERING THE RUN ${"▮".repeat(done)}${"▯".repeat(n - done)}`;
  }
  return touch ? "LEDGER DESK · TAP MARKET · TAP NAME · WALK IN TO ENTER THE RUN" : "LEDGER DESK · [TAB] MARKET · [N] NAME · WALK IN TO ENTER THE RUN";
}
