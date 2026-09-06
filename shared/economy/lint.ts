import { ALLOCATION, PROGRESSION_KINDS, CAPITAL, CAPITAL_KINDS, type EconomyItem } from "./manifest";

export interface Violation {
  itemId: string;
  rule: string;
  detail: string;
}

/**
 * The one rule, as code: $CAPITAL never touches a stat. Fails on paid power, paid
 * progression, any Kernel Protocol in the economy, and paid randomness other
 * than a wear seed. Stage 6 folds this into the full Fairness Lint.
 */
export function lintEconomy(items: readonly EconomyItem[]): Violation[] {
  const out: Violation[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) out.push({ itemId: it.id, rule: "unique-id", detail: "duplicate item id" });
    seen.add(it.id);
    const priced = it.market !== null && (it.market.capital !== null || it.market.onChain || it.market.tradable);

    if (it.kind === "kernel_protocol") {
      out.push({ itemId: it.id, rule: "kernel-protocol-quarantine", detail: "campaign-only power may not appear in the economy manifest at all" });
      continue;
    }
    if (priced && it.mechanical !== null) {
      out.push({ itemId: it.id, rule: "no-paid-power", detail: "item has a $CAPITAL price or on-chain binding and a mechanical block" });
    }
    if (PROGRESSION_KINDS.has(it.kind) && it.market !== null) {
      out.push({ itemId: it.id, rule: "no-paid-progression", detail: `${it.kind} may not have a market block (Scrip only, off-chain)` });
    }
    if (PROGRESSION_KINDS.has(it.kind) && it.mechanical !== null && it.mechanical.costs.length === 0) {
      out.push({ itemId: it.id, rule: "non-empty-costs", detail: "a PvP item must carry a cost (a trade-less buff cannot ship)" });
    }
    if (CAPITAL_KINDS.has(it.kind) && it.mechanical !== null) {
      out.push({ itemId: it.id, rule: "identity-is-cosmetic", detail: `${it.kind} may not carry a mechanical block` });
    }
    if (it.market !== null && it.market.randomness !== "none" && it.market.randomness !== "wear_seed") {
      out.push({ itemId: it.id, rule: "no-paid-randomness", detail: "purchasable items may only randomise a cosmetic wear seed" });
    }
    if (it.market !== null && it.market.capital !== null && it.market.capital <= 0) {
      out.push({ itemId: it.id, rule: "positive-price", detail: "$CAPITAL prices must be positive" });
    }
  }
  return out;
}

/** Static sanity checks on the token constants themselves. */
export function lintTokenConstants(): Violation[] {
  const out: Violation[] = [];
  const alloc = Object.values(ALLOCATION).reduce((a, b) => a + b, 0);
  if (alloc !== 10_000) out.push({ itemId: "ALLOCATION", rule: "allocation-sums-to-100", detail: `sums to ${alloc} bps` });
  const fee = CAPITAL.marketFeeSplit.burnBps + CAPITAL.marketFeeSplit.treasuryBps + CAPITAL.marketFeeSplit.creatorBps;
  if (fee !== CAPITAL.marketFeeBps) out.push({ itemId: "CAPITAL.marketFeeSplit", rule: "fee-split-sums-to-fee", detail: `${fee} != ${CAPITAL.marketFeeBps}` });
  const forge = CAPITAL.forgeSplit.creatorBps + CAPITAL.forgeSplit.treasuryBps + CAPITAL.forgeSplit.burnBps;
  if (forge !== 10_000) out.push({ itemId: "CAPITAL.forgeSplit", rule: "forge-split-sums-to-100", detail: `${forge} bps` });
  // total emissions over the schedule must fit the emissions allocation
  let total = 0n;
  let year = CAPITAL.emissions.year1;
  for (let y = 0; y < CAPITAL.emissions.years; y++) {
    total += year;
    year = (year * BigInt(Math.round(CAPITAL.emissions.decay * 1000))) / 1000n;
  }
  const budget = (CAPITAL.cap * BigInt(ALLOCATION.emissions)) / 10_000n;
  if (total > budget) out.push({ itemId: "CAPITAL.emissions", rule: "emissions-within-allocation", detail: `${total / 10n ** 18n} > ${budget / 10n ** 18n}` });
  return out;
}
