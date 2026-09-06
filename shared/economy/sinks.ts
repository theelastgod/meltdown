/**
 * The burn side of the economy.
 *
 * `docs/TOKENOMICS.md` §4.4 makes burn-versus-emission the headline discipline: sinks must burn at
 * least 60% of the month's emissions by month 12. Stage 17 made the emission side real and
 * checkable. This is the other half — and the reason it needed a stage of its own is that the
 * published ratio counted sinks that did not exist. The season buyout alone was 79% of the burn in
 * a table whose contract had never been written.
 *
 * So every sink here carries `built`. The model counts what is built when it reports the ratio the
 * doc publishes, and reports the rest separately as what the specification would add. A burn target
 * met by unwritten contracts is not a target, it is a wish.
 *
 * Prices are the doc's starting numbers. On chain they are steward-settable (`setPrice`), because
 * §4.4 retunes them quarterly against the target; these constants are what the game deploys with
 * and what the client quotes.
 */

export interface Sink {
  id: string;
  label: string;
  /** does the contract exist and does anything call it? */
  built: boolean;
  /** share of the fee that is burned, in basis points */
  burnBps: number;
  note: string;
}

/** A season of the Deep Wake, in whole $CAPITAL. 100% burned. */
export const SEASON_PASS_PRICE = 400;
/** One private room-hour, in whole $CAPITAL. 100% burned. */
export const ROOM_HOUR_PRICE = 5;

export const SINKS: readonly Sink[] = [
  { id: "buyout", label: "Deep Wake season pass", built: true, burnBps: 10_000, note: "SeasonBuyout.sol — cosmetic track only; holding one changes no number in the sim" },
  { id: "names", label: "Name registry", built: true, burnBps: 10_000, note: "Names.sol — length-priced, Depth 50" },
  { id: "market", label: "Ledger Market fees", built: true, burnBps: 200, note: "LedgerMarket.sol — 2% of volume of the 5% fee" },
  { id: "rooms", label: "Private room-hours", built: true, burnBps: 10_000, note: "RoomCredits.sol — sells a server, never a stat" },
  { id: "forge", label: "Forge listing bonds and primary burns", built: false, burnBps: 1_000, note: "specified in docs/TOKENOMICS.md §7; needs a creator asset pipeline first" },
] as const;

export const sinkById = (id: string): Sink | undefined => SINKS.find((s) => s.id === id);
export const isBuilt = (id: string): boolean => sinkById(id)?.built === true;

