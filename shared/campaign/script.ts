/**
 * CRT-terminal dialogue. A script is a small graph of nodes; a node prints
 * lines in a handler's voice and either continues or offers choices. A
 * choice can write testimony (`key=value`) and can be gated on testimony
 * already given. Scripts are data; the client plays them, the co-op room
 * relays the host's choice.
 */
import type { HandlerId } from "./factions";
import type { Gate } from "./testimony";

export interface Choice {
  text: string;
  /** testimony written when picked: key → value */
  set?: Record<string, string>;
  /** next node id (null: the script ends) */
  next: string | null;
  gate?: Gate;
}

export interface ScriptNode {
  id: string;
  speaker: HandlerId | "you" | "terminal";
  lines: string[];
  choices?: Choice[];
  /** continue to this node when there are no choices (null: end) */
  next?: string | null;
}

export interface ScriptDef {
  id: string;
  start: string;
  nodes: ScriptNode[];
}

const n = (id: string, speaker: ScriptNode["speaker"], lines: string[], rest: Partial<ScriptNode> = {}): ScriptNode => ({ id, speaker, lines, next: null, ...rest });

export const SCRIPTS: readonly ScriptDef[] = [
  {
    id: "creation",
    start: "wake",
    nodes: [
      n("wake", "terminal", ["FILE OPENED. NAME FIELD: EMPTY.", "YOU WOKE UNLISTED. THREE HOUSES WILL WANT TO KNOW WHY.", "WHO DO YOU ANSWER TO?"], {
        choices: [
          { text: "THE ESTATE — someone has to hold the pen.", set: { faction: "estate" }, next: "estate" },
          { text: "THE CLOCKEATERS — eat the hours the model cannot see.", set: { faction: "clockeaters" }, next: "clockeaters" },
          { text: "THE WAKE CELLS — every node off the model is a mind off the lease.", set: { faction: "cells" }, next: "cells" },
        ],
      }),
      n("estate", "vessel", ["Ida Vessel. I audited leases for eleven years before I read one of my own.", "Come to the Office. Bring the Blank you woke as."]),
      n("clockeaters", "marrow", ["Marrow. Don't say your name — you haven't got one and that's the point.", "We meet where the clocks are broken. Office. Now."]),
      n("cells", "deacon", ["The Deacon keeps the ledger of the woken. Your line is blank. Good.", "Nodes first. Names later. Come to the Office."]),
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
          { text: "BURN IT. The model keeps no copy it can trust.", set: { "m1:lease": "burn" }, next: "burn" },
          { text: "KEEP IT. Evidence is a weapon.", set: { "m1:lease": "keep" }, next: "keep" },
        ],
      }),
      n("burn", "you", ["The page goes up cyan, then black. Somewhere a ledger line becomes a question mark."]),
      n("keep", "you", ["You fold it into the coat. It weighs more than paper should."]),
    ],
  },
  {
    id: "m2_informant",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE DOCKS INFORMANT KNEELS BY THE C NODE. HE HAS A CLOCKEATER MARK ON HIS WRIST AND A VANTAGE SPEAKER IN HIS EAR.", "HE HAS BEEN SELLING WAKE CELL ROUTES FOR SLEEP CREDIT."], {
        choices: [
          { text: "SPARE HIM. Turn the speaker off and let him run.", set: { "m2:informant": "spare" }, next: "spare" },
          { text: "TURN HIM IN to Marrow's people. The Clockeaters settle their own.", set: { "m2:informant": "turn" }, next: "turn" },
        ],
      }),
      n("spare", "deacon", ["Mercy is a line item too. I'll log it."]),
      n("turn", "marrow", ["The Clockeaters will handle it. You won't like how. Neither will I."]),
    ],
  },
  {
    id: "m3_volatility",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE DEPOT LOGS DO NOT DESCRIBE CRIME. THEY DESCRIBE VARIANCE.", "EVERY WAKE, EVERY PULLED NODE, DEGRADES THE MODEL'S CONFIDENCE BY A FRACTION OF A PERCENT.", "VANTAGE IS NOT POLICING THE CITY. IT IS STEADYING A FORECAST."], {
        choices: [
          { text: "PUBLISH IT on every leased feed tonight.", set: { "m3:volatility": "publish" }, next: "publish" },
          { text: "HOLD IT. A truth spent early buys nothing.", set: { "m3:volatility": "hold" }, next: "hold" },
        ],
      }),
      n("publish", "deacon", ["The feeds carry it for nine minutes before VANTAGE cuts them. Nine minutes woke more people than a year of nodes."]),
      n("hold", "marrow", ["Good. Truth keeps. Clocks don't."]),
    ],
  },
  {
    id: "m4_leak",
    start: "a",
    nodes: [
      n("a", "vessel", ["This is it. The Directive. Wern's own hand.", "Read it while we walk. He argues better than any of us."], { next: "w1" }),
      n("w1", "wern", ["You've read the models by now. So you know I didn't invent the Meltdown. I forecast it.", "Twelve years of variance, compounding. A city that participates in history is a city that ends."], { next: "w2" }),
      n("w2", "wern", ["So I froze it. A permanent lease. No one dreams, no one wakes, no one dies in the fire that was coming.", "You call it a cage. Ask the people in it whether they'd like the fire back."], { next: "w3" }),
      n("w3", "wern", ["I'm not asking you to agree. I'm asking you to notice that you almost do."], {
        choices: [
          { text: "KEEP THE DIRECTIVE. If it's a weapon, it's mine now.", set: { "m4:directive": "kept" }, next: "vessel" },
          { text: "GIVE IT TO IDA. The Estate should have to read its own hand.", set: { "m4:directive": "given" }, next: "vessel" },
        ],
      }),
      n("vessel", "terminal", ["A VANTAGE SWEEP TAKES THE STREET. IDA VESSEL IS THE ONLY NAMED FILE ON IT.", "THE SEARCHLIGHT WANTS ONE OF YOU."], {
        choices: [
          { text: "SHIELD HER. Take the light.", set: { "m4:vessel": "shield" }, next: "shield" },
          { text: "EXPOSE HER. She's the defector; you're the Blank.", set: { "m4:vessel": "expose" }, next: "expose" },
        ],
      }),
      n("shield", "vessel", ["You took the light for me. Nobody in the Estate ever did that."]),
      n("expose", "terminal", ["IDA VESSEL IS RE-LEASED. HER FILE CLOSES WITH YOUR GLYPH ON THE LAST LINE."]),
    ],
  },
  {
    id: "m5_lattice",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE SENSOR LATTICE IS THE MODEL'S EYES. DISTRICT BY DISTRICT, PUT THEM OUT.", "VANTAGE WILL RESPOND LIKE AN IMMUNE SYSTEM. THIS IS THE HARDEST NIGHT OF YOUR FILE."], {
        choices: [
          { text: "ALL OF IT. Blind the model everywhere.", set: { "m5:lattice": "all" }, next: "all" },
          { text: "SPARE THE DOCKS. Someone has to see the ships come in.", set: { "m5:lattice": "spare_docks" }, next: "spare" },
        ],
      }),
      n("all", "you", ["Everything. Tonight the city closes its eyes."]),
      n("spare", "deacon", ["The docks keep their lattice. Ships need a witness. So do we."]),
    ],
  },
  {
    id: "m6_broadcast",
    start: "a",
    nodes: [
      n("a", "terminal", ["THE DIRECTIVE IS ON EVERY LEASED FEED. THE CITY IS WAKING LIVE AROUND YOU.", "THE UPLINK CAN CARRY THE WHOLE DOCUMENT OR A REDACTED CUT WITH THE FORECAST REMOVED."], {
        choices: [
          { text: "FULL BROADCAST. Let them read the fire too.", set: { "m6:broadcast": "full" }, next: "full" },
          { text: "REDACTED. Wake them without the terror.", set: { "m6:broadcast": "redacted" }, next: "redacted" },
        ],
      }),
      n("full", "deacon", ["They're reading the Meltdown with their own eyes. Some of them are laughing. That's new."]),
      n("redacted", "marrow", ["Kind. Kind is a kind of lie. It'll hold for tonight."]),
    ],
  },
  {
    id: "m7_office",
    start: "a",
    nodes: [
      n("a", "wern", ["No guards. You noticed. There's nothing left in this building that a gun can settle.", "Sit, if you like. Or don't. The chair is the offer."], { next: "b" }),
      n("b", "wern", ["The lease system needs an author. I have been that author for twelve years and I am tired.", "Wipe the ledger and the city remembers nothing — not the fire, not the cage, not you.", "Or take the chair. Freeze what you must. Thaw what you dare."], { next: "c" }),
      n("c", "terminal", ["THE FINAL INPUT IS A CHOICE. THERE IS NO TRIGGER TO PULL."], {
        choices: [
          { text: "WIPE THE LEDGER. Walk out free.", set: { "m7:ending": "wipe" }, next: null },
          { text: "TAKE THE CHAIR.", set: { "m7:ending": "chair" }, next: null, gate: { all: { "m4:directive": "kept" } } },
          { text: "TAKE THE CHAIR — and set the model to forget.", set: { "m7:ending": "chair_clockeater" }, next: null, gate: { all: { "m4:directive": "kept", "m3:volatility": "hold" }, faction: ["clockeaters"] } },
          { text: "TAKE THE CHAIR — with Ida at your shoulder.", set: { "m7:ending": "chair_estate" }, next: null, gate: { all: { "m4:directive": "kept", "m4:vessel": "shield" }, faction: ["estate"] } },
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
