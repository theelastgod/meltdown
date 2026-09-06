/**
 * The `/file/:id/counter` request handled the same way by both hosts. Ops that touch the chain
 * go through the CounterLedger the host passes in; `wear` is cache-only, so it works with the
 * chain down. Never a stat: the answer is the counter record and nothing else of the file.
 */
import type { Account, CounterRecord } from "../progression/account";
import { counterView, wearSkin } from "./counter";

export interface CounterOps {
  reconcile(a: Account): Promise<{ ok: boolean; reason?: string }>;
  attestStamps(a: Account): Promise<{ ok: boolean; reason?: string; attested: string[] }>;
  nameVoucher(a: Account, name: string): Promise<{ ok: boolean; reason?: string; voucher?: unknown }>;
  payout(a: Account): Promise<{ ok: boolean; reason?: string; paid?: number }>;
}

export async function counterRequest(a: Account, body: unknown, ops: CounterOps): Promise<{ ok: boolean; reason?: string; counter: CounterRecord | null; view: ReturnType<typeof counterView>; voucher?: unknown; attested?: string[]; paid?: number }> {
  const b = (body ?? {}) as { op?: string; token?: unknown; name?: unknown };
  // the payout is a chain write: the host passes the ledger, which has it
  let r: { ok: boolean; reason?: string; voucher?: unknown; attested?: string[]; paid?: number };
  switch (b.op) {
    case "wear":
      r = wearSkin(a, Number(b.token ?? 0) || 0);
      break;
    case "reconcile":
      r = await ops.reconcile(a);
      break;
    case "stamps":
      r = await ops.attestStamps(a);
      break;
    case "name":
      r = await ops.nameVoucher(a, String(b.name ?? ""));
      break;
    case "payout":
      r = await ops.payout(a);
      break;
    case "view":
      r = { ok: true };
      break;
    default:
      r = { ok: false, reason: "unknown op" };
  }
  return { ...r, counter: a.counter ?? null, view: counterView(a) };
}
