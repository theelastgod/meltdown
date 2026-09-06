/** Posted prize epochs (the leaves with proofs) so the host can serve claims: memory on the Node host, D1 on the Worker. */
import type { Hex } from "viem";

export interface StoredEpoch {
  epoch: number;
  kind: "audit" | "season";
  /** the week or season index the epoch pays */
  period: number;
  root: Hex;
  total: string;
  postedAt: number;
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
