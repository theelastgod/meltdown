/**
 * Testimony: every choice the player makes at a CRT terminal, keyed and
 * kept on the file. Later missions read it — layouts change, handlers
 * survive or don't, endings open or close. Conditions are tiny data so
 * missions and gigs can declare what they need without code.
 */
import type { FactionId } from "./factions";

export type Testimony = Record<string, string>;

/** A condition over testimony: every key must equal its value; `not` keys must not. */
export interface Gate {
  all?: Record<string, string>;
  not?: Record<string, string>;
  faction?: FactionId[];
}

export function gateOpen(g: Gate | undefined, t: Testimony, faction: FactionId | null): boolean {
  if (!g) return true;
  if (g.all) for (const [k, v] of Object.entries(g.all)) if (t[k] !== v) return false;
  if (g.not) for (const [k, v] of Object.entries(g.not)) if (t[k] === v) return false;
  if (g.faction && (!faction || !g.faction.includes(faction))) return false;
  return true;
}

/**
 * Which handlers are alive, read from testimony.
 *
 * The leak can cost Ida (`m4:vessel` expose has a death line). Turning the docks informant in
 * does not kill Marrow (Stage 181): she answers that choice in person and nothing in the scene
 * harms her. Until this, `marrow: t["m2:informant"] !== "turn"` re-leased her silently, dropped
 * four gigs, and locked CLOCKEATER — a death the scripts never wrote.
 */
export function handlersAlive(t: Testimony): Record<"vessel" | "marrow" | "deacon", boolean> {
  return { vessel: t["m4:vessel"] !== "expose", marrow: true, deacon: true };
}

export type EndingId = "wipe" | "chair" | "chair_clockeater" | "chair_estate" | "wipe_fire" | "wipe_quiet";

export interface EndingDef {
  id: EndingId;
  title: string;
  hidden: boolean;
  gate: Gate;
  lines: string[];
  /**
   * This ending is a sharper reading of another one, and the office reaches it through that one
   * (Stage 174). The white office asks a question and writes the answer to `m7:ending`; an ending
   * with no choice of its own is delivered only if it refines the answer the player did give and
   * its own gate is open. Endings the office asks for directly — the two chairs — do not refine
   * anything, because taking the plain chair while a sharper one is open is a choice, not a
   * shortfall.
   */
  refines?: EndingId;
}

export const ENDINGS: readonly EndingDef[] = [
  { id: "wipe", title: "WIPE THE LEDGER", hidden: false, gate: {}, lines: ["THE LEASE SYSTEM HAS NO AUTHOR NOW.", "THE CITY REMEMBERS NOTHING OF YOU. THAT WAS THE POINT.", "YOU WALK OUT OF THE WHITE OFFICE INTO RAIN THAT DOES NOT KNOW YOUR NAME."] },
  { id: "chair", title: "TAKE THE CHAIR", hidden: false, gate: { all: { "m4:directive": "kept" } }, lines: ["THE DIRECTIVE IS YOURS TO SIGN OR BURN.", "YOU SIGN. THE CITY STAYS FROZEN, BUT IT IS YOUR ICE.", "WERN LEAVES THE PEN ON THE DESK AND DOES NOT LOOK BACK."] },
  { id: "chair_clockeater", title: "THE CLOCKEATER'S CHAIR", hidden: true, gate: { all: { "m4:directive": "kept", "m3:volatility": "hold" }, faction: ["clockeaters"] }, lines: ["YOU TAKE THE CHAIR AND SET THE MODEL TO FORGET.", "EVERY LEASE EXPIRES AT THE HOUR IT CANNOT SEE.", "MARROW SAYS THE CITY WILL EAT WELL TONIGHT."] },
  { id: "chair_estate", title: "THE ESTATE'S CHAIR", hidden: true, gate: { all: { "m4:directive": "kept", "m4:vessel": "shield" }, faction: ["estate"] }, lines: ["IDA VESSEL STANDS AT YOUR SHOULDER AS YOU SIGN.", "THE LEASE STAYS. THE PEN CHANGES HANDS. THAT IS ALL THE ESTATE EVER WANTED.", "THE MELTDOWN IS FORECAST FOR NEVER."] },
  // The last choice before the office is what the city was told, so the last choice is where it
  // lands. m6:broadcast wrote "full" or "redacted" and nothing read either until now: the arc could
  // be finished twice, having answered its final question differently each time, and end the same
  // way both times. These two are mutually exclusive by construction — every run opens exactly one.
  { id: "wipe_fire", title: "THE CITY THAT READ THE FIRE", hidden: true, refines: "wipe", gate: { all: { "m6:broadcast": "full" } }, lines: ["YOU SENT THE FIRE OUT WITH THE PAPERWORK.", "THEY WOKE ALL AT ONCE, AND THEY WOKE FRIGHTENED, AND THEY DID NOT GO BACK.", "NEO-CHINA BURNS DOWN ITS OWN LEDGER BY MORNING. NOBODY ASKS WHO SIGNED THE ORDER."] },
  { id: "wipe_quiet", title: "THE QUIET WAKING", hidden: true, refines: "wipe", gate: { all: { "m6:broadcast": "redacted" } }, lines: ["YOU CUT THE TERROR OUT AND SENT THEM ONLY THE TERMS.", "THEY WAKE SLOWLY, ONE LEASE AT A TIME, AND MOST OF THEM KEEP GOING TO WORK.", "IT TAKES A DECADE INSTEAD OF A NIGHT. EVERYONE LIVES THROUGH IT."] },
];

export function endingsFor(t: Testimony, faction: FactionId | null): EndingDef[] {
  return ENDINGS.filter((e) => gateOpen(e.gate, t, faction));
}

/** What the contracts panel prints when the arc is done: the title, not CHAIR CLOCKEATER. */
export function endingTitle(id: string | null | undefined): string {
  return ENDINGS.find((e) => e.id === id)?.title ?? (id ?? "").replace(/_/g, " ").toUpperCase();
}

/** Strip the mission prefix the file stores. The panel was using `/^m\\d:/`, which never matches `m1:`. */
export function testimonyKey(k: string): string {
  return k.replace(/^m\d+:/, "");
}

/** CRT line for one testimony pair: LEASE=BURN, not lease=burn. Ending values are titles. */
export function testimonyLine(k: string, v: string): string {
  const stripped = testimonyKey(k);
  const key = stripped.replace(/_/g, " ").toUpperCase();
  const val = stripped === "ending" ? endingTitle(v) : v.replace(/_/g, " ").toUpperCase();
  return `${key}=${val}`;
}

/**
 * The ending the white office actually delivers (Stage 174).
 *
 * `m7:ending` holds the answer the player gave, and until now it was looked up by id and shown.
 * Two of the six endings are written by no choice at all — THE CITY THAT READ THE FIRE and THE
 * QUIET WAKING, the two readings of wiping the ledger, told apart by what the m6 broadcast said.
 * Both were listed on the CONTRACTS panel as open and both delivered WIPE THE LEDGER instead: the
 * arc could be finished twice, having answered its last question differently, and end the same way
 * both times — the exact thing the comment above ENDINGS says must not happen.
 *
 * So the answer is resolved rather than read: the chosen ending, unless one of its refinements has
 * its gate open, in which case that. The refinements of an ending are mutually exclusive by
 * construction, and the first open one wins if that is ever not true.
 */
/**
 * The file's own footnote.
 *
 * An ending is named by `m7:ending` and sharpened by at most one gate, which leaves choices the
 * last screen never mentions. Measured against the ending gates themselves rather than by reading
 * the file: of the seven questions the campaign asks, `m1:lease`, `m2:informant` and `m5:lattice`
 * reached the white office and were not answered there. They are the three carrying the most
 * weight — whether you kept the evidence of your own leasing, whether you gave up the woman who
 * fed you the docks, whether you put the lattice out over the heads of the people living under it.
 * A player could burn their own file in the first hour and finish the game without the ending ever
 * noticing.
 *
 * So the office answers them, a line each, after the ending's own lines. The coda changes no
 * ending and opens no gate; it is the record reading itself back (Stage 656).
 */
export const ENDING_CODA: Record<string, Record<string, string>> = {
  "m1:lease": {
    keep: "YOUR OWN LEASE FILE IS STILL IN YOUR COAT — THE ONE COPY THE MODEL NEVER GOT BACK.",
    burn: "YOUR OWN LEASE FILE BURNED IN LEASE ROW. NOTHING ON RECORD SAYS WHAT YOU WERE LEASED FOR.",
  },
  "m2:informant": {
    spare: "MARROW IS STILL WORKING THE DOCKS. SHE NEVER ASKS WHAT YOU WERE OFFERED FOR HER.",
    turn: "THE DOCK ROUTES WENT QUIET THE WEEK AFTER YOU GAVE HER UP. THEY STAYED QUIET.",
  },
  "m5:lattice": {
    all: "ALL SIX LATTICE NODES ARE DARK. THE DOCKS WENT DARK UNDER THEM.",
    spare_docks: "YOU LEFT THE DOCKS NODE LIT. A FEW THOUSAND FILES SLEPT THROUGH THE WHOLE NIGHT.",
  },
};

/** The coda for a file's testimony, in the order the campaign asked the questions. */
export function endingCoda(t: Testimony): string[] {
  const out: string[] = [];
  for (const key of Object.keys(ENDING_CODA).sort()) {
    const line = ENDING_CODA[key]![t[key] ?? ""];
    if (line) out.push(line);
  }
  return out;
}

/** Every testimony key any ending gate reads — the keys the last screen already answers. */
export function endingGateKeys(): Set<string> {
  const keys = new Set<string>();
  for (const e of ENDINGS) {
    for (const k of Object.keys(e.gate.all ?? {})) keys.add(k);
    for (const k of Object.keys(e.gate.not ?? {})) keys.add(k);
  }
  return keys;
}

export function resolveEnding(t: Testimony, faction: FactionId | null): EndingDef {
  const chosen = ENDINGS.find((e) => e.id === t["m7:ending"]) ?? ENDINGS[0]!;
  return ENDINGS.find((e) => e.refines === chosen.id && gateOpen(e.gate, t, faction)) ?? chosen;
}
