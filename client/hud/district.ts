/**
 * Every district was the yard (Stage 131). The wake's lines — the round over, the full wake, a file
 * entering — had said THE YARD in every district since the first wake was the drainage yard: in
 * Lease Row, in the Deadletter Docks, a file "ENTERED THE YARD" and a cell "WOKE THE YARD". The
 * lines name the district they are in, from the level, the way the HUD's own title does.
 */

/** the district's name as the HUD prints it: the display name, or the level's id spelt out */
export function districtName(level: { displayName?: string; name: string }): string {
  return (level.displayName ?? level.name.replace(/_/g, " ")).toUpperCase();
}

const cell = (t: number): string => (t === 1 ? "CELL ONE" : "CELL TWO");

export function wakeBeginsLine(): string {
  return "◆ THE WAKE BEGINS — PULL THE NODES OFF THE MODEL";
}

export function roundOverLine(winner: number, zone: string): string {
  return `◆ ROUND OVER — ${winner === 1 || winner === 2 ? `${cell(winner)} WOKE ${zone}` : `NO ONE WOKE ${zone}`}`;
}

export function fullWakeLine(zone: string): string {
  return `◆ FULL WAKE — ${zone} IS OFF THE MODEL`;
}

export function enteredLine(id: number, name: string, zone: string): string {
  return `FILE #${id} (${name}) ENTERED ${zone}`;
}
