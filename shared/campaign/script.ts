/**
 * CRT-terminal dialogue. A script is a small graph of nodes; a node prints
 * lines in a handler's voice and either continues or offers choices. A
 * choice can write testimony (`key=value`) and can be gated on testimony
 * already given. Scripts are data; the client plays them, the co-op room
 * relays the host's choice.
 */
import type { FactionId, HandlerId } from "./factions";
import { gateOpen, type Gate, type Testimony } from "./testimony";

export interface Choice {
  text: string;
  /** testimony written when picked: key → value */
  set?: Record<string, string>;
  /** next node id (null: the script ends) */
  next: string | null;
  gate?: Gate;
}

/**
 * Lines a node adds when the player has already given the testimony the gate names (Stage 661).
 *
 * Before this, a `ScriptNode` had no gate of any kind: its `lines` were fixed, so nothing anyone
 * said could depend on anything the player had done. Every reaction the campaign had was
 * mechanical — a wasp count, a swapped objective, a gig that did or did not appear — or arrived at
 * the very last screen. A handler could not so much as mention the choice you made an hour ago.
 *
 * These append to the node's own lines rather than replacing them, so the briefing a node exists to
 * deliver is never lost to a variant, and they are spoken in that node's voice.
 */
export interface Recall {
  gate: Gate;
  lines: string[];
}

export interface ScriptNode {
  id: string;
  speaker: HandlerId | "you" | "terminal";
  lines: string[];
  choices?: Choice[];
  /** what this node adds once the file has something to say back; the first open one wins */
  recall?: Recall[];
  /** continue to this node when there are no choices (null: end) */
  next?: string | null;
}

export interface ScriptDef {
  id: string;
  start: string;
  nodes: ScriptNode[];
}

const n = (id: string, speaker: ScriptNode["speaker"], lines: string[], rest: Partial<ScriptNode> = {}): ScriptNode => ({ id, speaker, lines, next: null, ...rest });

/** Which recall on this node is open, or -1. */
export function recallIndex(node: ScriptNode, t: Testimony, faction: FactionId | null): number {
  return (node.recall ?? []).findIndex((r) => gateOpen(r.gate, t, faction));
}

/**
 * A node's lines as actually spoken: its own, plus the recall at `index`.
 *
 * Co-op takes the index rather than the lines (Stage 661): the crew must read the screen the HOST's
 * testimony produced, not each guest's own, and an index into the manifest every client already has
 * cannot put text a host chose onto anyone else's terminal.
 */
export function linesAt(node: ScriptNode, index: number): string[] {
  const hit = index >= 0 ? (node.recall ?? [])[index] : undefined;
  return hit ? [...node.lines, ...hit.lines] : [...node.lines];
}

/** A node's lines as actually spoken for this file. */
export function spokenLines(node: ScriptNode, t: Testimony, faction: FactionId | null): string[] {
  return linesAt(node, recallIndex(node, t, faction));
}

/** Every value of every key any recall in the campaign reads, for the lint. */
export function recalledTestimony(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of SCRIPTS) {
    for (const n of s.nodes) {
      for (const r of n.recall ?? []) {
        for (const [k, v] of Object.entries(r.gate.all ?? {})) {
          if (!out.has(k)) out.set(k, new Set());
          out.get(k)!.add(v);
        }
      }
    }
  }
  return out;
}

export const SCRIPTS: readonly ScriptDef[] = [
  {
    id: "creation",
    start: "wake",
    nodes: [
      n("wake", "terminal", ["FILE OPENED. NAME FIELD: EMPTY.", "YOU WOKE UNLISTED. THREE HOUSES WILL WANT TO KNOW WHY.", "WHO DO YOU ANSWER TO?"], {
        choices: [
          { text: "THE ESTATE — SOMEONE HAS TO HOLD THE PEN.", set: { faction: "estate" }, next: "estate" },
          { text: "THE CLOCKEATERS — EAT THE HOURS THE MODEL CANNOT SEE.", set: { faction: "clockeaters" }, next: "clockeaters" },
          { text: "THE WAKE CELLS — EVERY NODE OFF THE MODEL IS A MIND OFF THE LEASE.", set: { faction: "cells" }, next: "cells" },
        ],
      }),
      n("estate", "vessel", ["IDA VESSEL. I AUDITED LEASES FOR ELEVEN YEARS BEFORE I READ ONE OF MY OWN.", "COME TO THE OFFICE. BRING THE BLANK YOU WOKE AS."]),
      n("clockeaters", "marrow", ["MARROW. DON'T SAY YOUR NAME — YOU HAVEN'T GOT ONE AND THAT'S THE POINT.", "WE MEET WHERE THE CLOCKS ARE BROKEN. OFFICE. NOW."]),
      n("cells", "deacon", ["THE DEACON KEEPS THE LEDGER OF THE WOKEN. YOUR LINE IS BLANK. GOOD.", "NODES FIRST. NAMES LATER. COME TO THE OFFICE."]),
    ],
  },
  {
    id: "m1_intro",
    start: "a",
    nodes: [
      n("a", "terminal", ["LEASE ROW · 02:14 · RAIN", "YOUR OWN LEASE FILE SITS IN AN ESCROW TERMINAL AT THE B INTERSECTION.", "IT SAYS WHY YOU WERE FLAGGED. IT SAYS: DIVERGENT. IT SAYS: WERN DIRECTIVE."], { next: "b" }),
      n("b", "vantage", ["VANTAGE ADVISES: THE FILE YOU ARE ABOUT TO STEAL IS YOU.", "PLEASE REMAIN LEASED."]),
    ],
  },
  {
    id: "m1_file",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE FILE IS IN YOUR HANDS. IT IS WARM.", "ONE PAGE. YOUR SLEEP, YOUR DEBTS, YOUR NAME REDACTED, AND A FORECAST WITH YOUR GLYPH IN IT."], {
        choices: [
          { text: "BURN IT. THE MODEL KEEPS NO COPY IT CAN TRUST.", set: { "m1:lease": "burn" }, next: "burn" },
          { text: "KEEP IT. EVIDENCE IS A WEAPON.", set: { "m1:lease": "keep" }, next: "keep" },
        ],
      }),
      n("burn", "you", ["THE PAGE GOES UP CYAN, THEN BLACK. SOMEWHERE A LEDGER LINE BECOMES A QUESTION MARK."]),
      n("keep", "you", ["YOU FOLD IT INTO THE COAT. IT WEIGHS MORE THAN PAPER SHOULD."]),
    ],
  },
  {
    id: "m2_informant",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE DOCKS INFORMANT KNEELS BY THE C NODE. HE HAS A CLOCKEATER MARK ON HIS WRIST AND A VANTAGE SPEAKER IN HIS EAR.", "HE HAS BEEN SELLING WAKE CELL ROUTES FOR SLEEP CREDIT."], {
        recall: [
          { gate: { all: { "m1:lease": "keep" } }, lines: ["FILE NOTE: THE LEASE PAGE YOU CARRIED OUT OF LEASE ROW IS STILL ON YOU. IT IS STILL WARM."] },
          { gate: { all: { "m1:lease": "burn" } }, lines: ["FILE NOTE: THE MODEL HAS A GAP WHERE YOUR FORECAST WAS. IT HAS BEEN QUERYING THAT GAP ALL NIGHT."] },
        ],
        choices: [
          { text: "SPARE HIM. TURN THE SPEAKER OFF AND LET HIM RUN.", set: { "m2:informant": "spare" }, next: "spare" },
          { text: "TURN HIM IN TO MARROW'S PEOPLE. THE CLOCKEATERS SETTLE THEIR OWN.", set: { "m2:informant": "turn" }, next: "turn" },
        ],
      }),
      n("spare", "deacon", ["MERCY IS A LINE ITEM TOO. I'LL LOG IT."]),
      n("turn", "marrow", ["THE CLOCKEATERS WILL HANDLE IT. YOU WON'T LIKE HOW. NEITHER WILL I."]),
    ],
  },
  {
    id: "m3_volatility",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE DEPOT LOGS DO NOT DESCRIBE CRIME. THEY DESCRIBE VARIANCE.", "EVERY WAKE, EVERY PULLED NODE, DEGRADES THE MODEL'S CONFIDENCE BY A FRACTION OF A PERCENT.", "VANTAGE IS NOT POLICING THE CITY. IT IS STEADYING A FORECAST."], {
        recall: [
          { gate: { all: { "m2:informant": "spare" } }, lines: ["FILE NOTE: THE DOCKS INFORMANT IS STILL BREATHING. HIS ROUTES WENT QUIET THE NIGHT YOU LET HIM RUN."] },
          { gate: { all: { "m2:informant": "turn" } }, lines: ["FILE NOTE: THE DOCKS INFORMANT'S FILE CLOSED ELEVEN HOURS AFTER YOU HANDED HIM OVER. CAUSE OF CLOSURE: NOT RECORDED.", "FILE NOTE: THE DEPOT SWITCHGEAR WAS OPENED FROM INSIDE. CLOCKEATER HOURS, BILLED TO NO ONE."] },
        ],
        choices: [
          { text: "PUBLISH IT ON EVERY LEASED FEED TONIGHT.", set: { "m3:volatility": "publish" }, next: "publish" },
          { text: "HOLD IT. A TRUTH SPENT EARLY BUYS NOTHING.", set: { "m3:volatility": "hold" }, next: "hold" },
        ],
      }),
      n("publish", "deacon", ["THE FEEDS CARRY IT FOR NINE MINUTES BEFORE VANTAGE CUTS THEM. NINE MINUTES WOKE MORE PEOPLE THAN A YEAR OF NODES."]),
      n("hold", "marrow", ["GOOD. TRUTH KEEPS. CLOCKS DON'T."]),
    ],
  },
  {
    id: "m4_leak",
    start: "a",
    nodes: [
      n("a", "vessel", ["THIS IS IT. THE DIRECTIVE. WERN'S OWN HAND.", "READ IT WHILE WE WALK. HE ARGUES BETTER THAN ANY OF US."], {
        next: "w1",
        recall: [
          { gate: { all: { "m3:volatility": "publish" } }, lines: ["HALF THE ESTATE READ YOUR DEPOT LOGS BEFORE VANTAGE CUT THE FEEDS. THAT IS WHY I AM STANDING HERE AND NOT AT MY DESK."] },
          { gate: { all: { "m3:volatility": "hold" } }, lines: ["YOU SAT ON THE DEPOT LOGS. I WOULD HAVE PUBLISHED. I AM NOT SURE ANY MORE THAT I WOULD HAVE BEEN RIGHT."] },
        ],
      }),
      n("w1", "wern", ["YOU'VE READ THE MODELS BY NOW. SO YOU KNOW I DIDN'T INVENT THE MELTDOWN. I FORECAST IT.", "TWELVE YEARS OF VARIANCE, COMPOUNDING. A CITY THAT PARTICIPATES IN HISTORY IS A CITY THAT ENDS."], { next: "w2" }),
      n("w2", "wern", ["SO I FROZE IT. A PERMANENT LEASE. NO ONE DREAMS, NO ONE WAKES, NO ONE DIES IN THE FIRE THAT WAS COMING.", "YOU CALL IT A CAGE. ASK THE PEOPLE IN IT WHETHER THEY'D LIKE THE FIRE BACK."], { next: "w3" }),
      n("w3", "wern", ["I'M NOT ASKING YOU TO AGREE. I'M ASKING YOU TO NOTICE THAT YOU ALMOST DO."], {
        choices: [
          { text: "KEEP THE DIRECTIVE. IF IT'S A WEAPON, IT'S MINE NOW.", set: { "m4:directive": "kept" }, next: "vessel" },
          { text: "GIVE IT TO IDA. THE ESTATE SHOULD HAVE TO READ ITS OWN HAND.", set: { "m4:directive": "given" }, next: "vessel" },
        ],
      }),
      n("vessel", "terminal", ["A VANTAGE SWEEP TAKES THE STREET. IDA VESSEL IS THE ONLY NAMED FILE ON IT.", "THE SEARCHLIGHT WANTS ONE OF YOU."], {
        choices: [
          { text: "SHIELD HER. TAKE THE LIGHT.", set: { "m4:vessel": "shield" }, next: "shield" },
          { text: "EXPOSE HER. SHE'S THE DEFECTOR; YOU'RE THE BLANK.", set: { "m4:vessel": "expose" }, next: "expose" },
        ],
      }),
      n("shield", "vessel", ["YOU TOOK THE LIGHT FOR ME. NOBODY IN THE ESTATE EVER DID THAT."]),
      n("expose", "terminal", ["IDA VESSEL IS RE-LEASED. HER FILE CLOSES WITH YOUR GLYPH ON THE LAST LINE."]),
    ],
  },
  {
    id: "m5_lattice",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE SENSOR LATTICE IS THE MODEL'S EYES. DISTRICT BY DISTRICT, PUT THEM OUT.", "VANTAGE WILL RESPOND LIKE AN IMMUNE SYSTEM. THIS IS THE HARDEST NIGHT OF YOUR FILE."], {
        recall: [
          { gate: { all: { "m4:directive": "kept" } }, lines: ["FILE NOTE: THE DIRECTIVE IS IN YOUR FILE AND NOWHERE ELSE. NO HOUSE HAS READ IT BUT YOU.", "FILE NOTE: THE ESTATE HAS FILED A REPO WRIT ON IT. THE MECH WAS ONLY THE FIRST TO SERVE IT."] },
          { gate: { all: { "m4:directive": "given" } }, lines: ["FILE NOTE: THE ESTATE HAS BEEN READING ITS OWN HAND FOR SIX DAYS. IT HAS NOT ANSWERED.", "FILE NOTE: TWO OF ITS AUDIT DRONES CAME OFF LEASE ROW TONIGHT. THAT IS AS CLOSE TO AN ANSWER AS THE ESTATE GIVES."] },
        ],
        choices: [
          { text: "ALL OF IT. BLIND THE MODEL EVERYWHERE.", set: { "m5:lattice": "all" }, next: "all" },
          { text: "SPARE THE DOCKS. SOMEONE HAS TO SEE THE SHIPS COME IN.", set: { "m5:lattice": "spare_docks" }, next: "spare" },
        ],
      }),
      n("all", "you", ["EVERYTHING. TONIGHT THE CITY CLOSES ITS EYES."]),
      n("spare", "deacon", ["THE DOCKS KEEP THEIR LATTICE. SHIPS NEED A WITNESS. SO DO WE."]),
    ],
  },
  {
    id: "m6_broadcast",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE DIRECTIVE IS ON EVERY LEASED FEED. THE CITY IS WAKING LIVE AROUND YOU.", "THE UPLINK CAN CARRY THE WHOLE DOCUMENT OR A REDACTED CUT WITH THE FORECAST REMOVED."], {
        recall: [
          { gate: { all: { "m4:vessel": "shield" } }, lines: ["FILE NOTE: IDA VESSEL IS ON THE TOWER STAIR BEHIND YOU. SHE HAS NOT BEEN LISTED SINCE THE NIGHT YOU TOOK THE LIGHT."] },
          { gate: { all: { "m4:vessel": "expose" } }, lines: ["FILE NOTE: IDA VESSEL IS RE-LEASED AND ASLEEP IN AN ESTATE WARD. YOUR GLYPH IS THE LAST LINE OF HER FILE."] },
        ],
        choices: [
          { text: "FULL BROADCAST. LET THEM READ THE FIRE TOO.", set: { "m6:broadcast": "full" }, next: "full" },
          { text: "REDACTED. WAKE THEM WITHOUT THE TERROR.", set: { "m6:broadcast": "redacted" }, next: "redacted" },
        ],
      }),
      n("full", "deacon", ["THEY'RE READING THE MELTDOWN WITH THEIR OWN EYES. SOME OF THEM ARE LAUGHING. THAT'S NEW."]),
      n("redacted", "marrow", ["KIND. KIND IS A KIND OF LIE. IT'LL HOLD FOR TONIGHT."]),
    ],
  },
  {
    id: "m7_office",
    start: "a",
    nodes: [
      n("a", "wern", ["NO GUARDS. YOU NOTICED. THERE'S NOTHING LEFT IN THIS BUILDING THAT A GUN CAN SETTLE.", "SIT, IF YOU LIKE. OR DON'T. THE CHAIR IS THE OFFER."], {
        next: "b",
        recall: [
          { gate: { all: { "m5:lattice": "all" } }, lines: ["I HAVE BEEN BLIND FOR NINE DAYS. DO YOU KNOW WHAT A FORECASTER DOES WITH NO INSTRUMENTS? HE GUESSES. I HAD FORGOTTEN HOW."] },
          { gate: { all: { "m5:lattice": "spare_docks" } }, lines: ["You left me the docks. One eye. I have watched the ships come in every night since and understood none of it."] },
        ],
      }),
      n("b", "wern", ["The lease system needs an author. I have been that author for twelve years and I am tired.", "Wipe the ledger and the city remembers nothing — not the fire, not the cage, not you.", "Or take the chair. Freeze what you must. Thaw what you dare."], {
        next: "c",
        recall: [
          { gate: { all: { "m6:broadcast": "full" } }, lines: ["They read the fire, you know. All of it. And they woke anyway. That is the part I could not forecast."] },
          { gate: { all: { "m6:broadcast": "redacted" } }, lines: ["You cut the forecast out before you sent it. You woke them and spared them the reason. That is what an author does."] },
        ],
      }),
      n("c", "terminal", ["THE FINAL INPUT IS A CHOICE. THERE IS NO TRIGGER TO PULL."], {
        choices: [
          { text: "WIPE THE LEDGER. WALK OUT FREE.", set: { "m7:ending": "wipe" }, next: null },
          { text: "TAKE THE CHAIR.", set: { "m7:ending": "chair" }, next: null, gate: { all: { "m4:directive": "kept" } } },
          { text: "TAKE THE CHAIR — AND SET THE MODEL TO FORGET.", set: { "m7:ending": "chair_clockeater" }, next: null, gate: { all: { "m4:directive": "kept", "m3:volatility": "hold" }, faction: ["clockeaters"] } },
          { text: "TAKE THE CHAIR — WITH IDA AT YOUR SHOULDER.", set: { "m7:ending": "chair_estate" }, next: null, gate: { all: { "m4:directive": "kept", "m4:vessel": "shield" }, faction: ["estate"] } },
        ],
      }),
    ],
  },
  {
    id: "gig_generic",
    start: "a",
    nodes: [n("a", "terminal", ["CONTRACT ACCEPTED. THE FIXER'S TERMS ARE ON YOUR FILE.", "VANTAGE HAS NOT BEEN TOLD. IT WILL FIND OUT."])],
  },
];

export const scriptById = (id: string): ScriptDef | undefined => SCRIPTS.find((s) => s.id === id);
