/**
 * The claims fell without a sound (Stage 101).
 *
 * THE RUN has three money moments and the client borrowed or skipped all of them. Picking a claim
 * up played the wake's node-flip — the same sound that means a hex changed hands — and said
 * nothing; banking was a stamp and a line online and a stamp alone offline; and the drop, the
 * moment a file dies in the PvP zone and everything it carried falls to the street, was silent
 * everywhere. That is the loudest moment in the mode and the one the player most needs to hear.
 *
 * The wire does not carry the run's events (the room sends the run's state), so the moments are
 * read from two consecutive views of it, the same way both the offline and the online paths
 * already read the pickup. Pure, so the rule is unit-tested and both paths share it.
 */

export interface RunSnapshot {
  carried: number;
  banked: number;
}

export type RunMoment = { kind: "pickup"; value: number; carried: number } | { kind: "bank"; value: number; banked: number } | { kind: "drop"; value: number };

/**
 * What happened between two views of the run. Banking moves units from carried to banked, so a
 * fall in carried is a drop only for the part the bank does not account for; a rise is a pickup.
 */
export function runMoments(prev: RunSnapshot | null, next: RunSnapshot): RunMoment[] {
  if (!prev) return [];
  const out: RunMoment[] = [];
  const banked = Math.max(0, next.banked - prev.banked);
  if (banked > 0) out.push({ kind: "bank", value: banked, banked: next.banked });
  const fell = prev.carried - next.carried;
  if (fell < 0) out.push({ kind: "pickup", value: -fell, carried: next.carried });
  else if (fell - banked > 0) out.push({ kind: "drop", value: fell - banked });
  return out;
}

/** The log line for a moment; the zone is the safe zone's label, when there is one. */
export function momentLine(m: RunMoment, zone: string | null): string {
  switch (m.kind) {
    case "pickup":
      return `◈ CLAIM +${m.value} · CARRYING ${m.carried}`;
    case "bank":
      return `BANKED ${m.value} ◈ AT ${zone ?? "THE GATE"}`;
    case "drop":
      return `◈ ${m.value} UNIT${m.value === 1 ? "" : "S"} DROPPED WHERE YOU FELL`;
  }
}

/** One claim on the strip is CLAIM OUT, not CLAIMS OUT. */
export function claimsWord(n: number): string {
  return `${n} CLAIM${n === 1 ? "" : "S"} OUT`;
}

/** One owed unit is UNIT, not UNITS. */
export function unitsLabel(n: number): string {
  return n === 1 ? "UNIT" : "UNITS";
}
