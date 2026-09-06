/**
 * Endgame state behind the hosts: Audit leaderboards (per week) and the
 * Deep Wake season graph. The Node host keeps them in memory; the Workers
 * host keeps them in one Durable Object (`Endgame`). Rooms push into the
 * store at settlement; the file endpoints read it for the FILE panel.
 */
import { leaderboard, type AuditEntry } from "../shared/endgame/audits";
import { applyRound, emptySeason, rollSeason, seasonView, type RoundPush, type SeasonState } from "../shared/endgame/season";

export interface EndgameStore {
  audit(week: number): AuditEntry[] | Promise<AuditEntry[]>;
  submitAudit(week: number, entry: AuditEntry): void | Promise<void>;
  season(): SeasonState | Promise<SeasonState>;
  pushSeason(push: RoundPush): SeasonState | Promise<SeasonState>;
}

export class MemoryEndgameStore implements EndgameStore {
  readonly entries = new Map<number, AuditEntry[]>();
  private st: SeasonState = emptySeason();
  audit(week: number): AuditEntry[] {
    return leaderboard(this.entries.get(week) ?? []);
  }
  submitAudit(week: number, entry: AuditEntry): void {
    const list = this.entries.get(week) ?? [];
    list.push(entry);
    this.entries.set(week, list);
  }
  season(): SeasonState {
    rollSeason(this.st);
    return this.st;
  }
  pushSeason(push: RoundPush): SeasonState {
    applyRound(this.st, push);
    return this.st;
  }
}

export { seasonView };
