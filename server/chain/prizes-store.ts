/** Posted prize epochs (the leaves with proofs) so the host can serve claims: memory on the Node host, D1 on the Worker. */
import type { Hex } from "viem";
import { EPOCH_KIND, KIND_SPAN } from "../../shared/economy/schedule";

/** The emission channels that post an epoch. */
export type EpochKind = "audit" | "season" | "run";
/** Epoch ids are namespaced by channel so a week, a season and a day can never collide. */
export const EPOCH_BASE: Record<EpochKind, number> = { audit: EPOCH_KIND.audit * KIND_SPAN, season: EPOCH_KIND.season * KIND_SPAN, run: EPOCH_KIND.run * KIND_SPAN };

export interface StoredEpoch {
  epoch: number;
  kind: EpochKind;
  /** the week, season or day index the epoch pays */
  period: number;
  root: Hex;
  total: string;
  postedAt: number;
  /** when the unclaimed remainder was swept back to the treasury (Stage 57); a swept epoch is not asked again */
  sweptAt?: number;
  leaves: { account: Hex; file: string; amount: string; reason: string; proof: Hex[] }[];
}

export interface PrizeStore {
  list(): StoredEpoch[] | Promise<StoredEpoch[]>;
  get(epoch: number): StoredEpoch | null | Promise<StoredEpoch | null>;
  put(e: StoredEpoch): void | Promise<void>;
}

export class MemoryPrizeStore implements PrizeStore {
  readonly epochs = new Map<number, StoredEpoch>();
  list(): StoredEpoch[] {
    return [...this.epochs.values()].sort((a, b) => a.epoch - b.epoch);
  }
  get(epoch: number): StoredEpoch | null {
    return this.epochs.get(epoch) ?? null;
  }
  put(e: StoredEpoch): void {
    this.epochs.set(e.epoch, e);
  }
}
