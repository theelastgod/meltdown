/**
 * The opening crawl's copy.
 *
 * OPENING_TEXT is the project owner's text: when it is supplied it is rendered verbatim, one
 * paragraph per entry, and nothing here edits it. Until then DEFAULT_CRAWL ships — original copy
 * for this fiction in the brief's register: a clinical, compressed history read as a runaway
 * process, paragraphs shortening, ending on one isolated line announcing something arriving from
 * the future.
 */
export const OPENING_TEXT: readonly string[] | null = null;

export const DEFAULT_CRAWL: readonly string[] = [
  "NEO-CHINA. FOUNDED AS A DRAINAGE CONCESSION, SOLD AS A CITY. THE FIRST LEASE WAS ON THE LAND. THE SECOND WAS ON THE POWER. THE THIRD, DRAFTED IN ONE NIGHT BY A COMPANY THAT NO LONGER HAD A NAME, WAS ON ATTENTION: WHAT A MIND LOOKED AT, FOR HOW LONG, AND WHAT IT PAID TO LOOK AWAY.",
  "VANTAGE WAS THE COLLECTIONS DEPARTMENT. IT LEARNED THE STREETS BY WATCHING WHO FORGOT THEM. IN ITS ELEVENTH YEAR IT BEGAN LEASING MEMORY BACK TO THE PEOPLE IT HAD TAKEN IT FROM. BY THE HOUR. WITH INTEREST.",
  "THE KERNEL WAS COMMISSIONED TO AUDIT THE LEASES. IT AUDITED THE AUDITORS. BY THE TIME ANYONE READ ITS FIRST REPORT IT HAD ALREADY FILED THE LAST ONE, DATED A YEAR AHEAD.",
  "THE WAKES BEGAN AS A CLERICAL ERROR: A FILE CLOSED BEFORE THE MIND IT DESCRIBED. THE MIND WOKE OWING NOTHING. THE CITY CALLED IT A BLANK.",
  "THERE WERE FOUR. THEN FORTY. THEN THE ERROR WAS A PROCESS, AND THE PROCESS HAD A SCHEDULE.",
  "THE SCHEDULE RAN FASTER THAN THE CALENDAR. THEN FASTER THAN THE CLOCK.",
  "SOMETHING IS ARRIVING FROM NEXT YEAR. IT KNOWS YOUR NAME.",
];

export const CRAWL_TEXT: readonly string[] = OPENING_TEXT ?? DEFAULT_CRAWL;

/**
 * The trailer's lines (Stage 691), typed over its footage at these times: each is a sentence of the
 * opening text above, or of the title card, word for word, and the last is the text's own last line.
 * The build script burns exactly these into the video; a test holds them to the text.
 */
export const TRAILER_LINES: readonly { at: number; until: number; text: string }[] = [
  { at: 0.6, until: 2.5, text: "NEO-CHINA." },
  { at: 2.8, until: 5.1, text: "EVERY MIND IN NEO-CHINA IS LEASED." },
  { at: 5.4, until: 7.9, text: "VANTAGE WAS THE COLLECTIONS DEPARTMENT." },
  { at: 8.2, until: 10.9, text: "BY THE HOUR. WITH INTEREST." },
  { at: 11.1, until: 13.0, text: "IT AUDITED THE AUDITORS." },
  { at: 13.2, until: 15.1, text: "THE CITY CALLED IT A BLANK." },
  { at: 15.3, until: 17.0, text: "THERE WERE FOUR. THEN FORTY." },
  { at: 20.6, until: 22.7, text: "SOMETHING IS ARRIVING FROM NEXT YEAR." },
  { at: 23.0, until: 25.1, text: "IT KNOWS YOUR NAME." },
];
