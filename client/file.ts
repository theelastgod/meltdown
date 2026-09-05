/**
 * The client's view of its Ghostfile: an account id, the loadout it will
 * attest, and the last thing the server said about the file. Persisted in
 * localStorage; URL params override for probes (`?account=`, `?loadout=<json>`).
 * The FILE panel (Tab) edits the loadout. Legality is only advisory here —
 * the server refuses illegal loadouts at spawn, it never strips them.
 */
import { ALL_ITEMS, KEYSTONES, LEDGER_ITEMS, MAX_ATTESTED, type LedgerItem } from "@shared/manifest/items";
import { DEFAULT_LOADOUT, netDelta, validateLoadout, WEAPON_DEPTH, type Loadout } from "@shared/manifest/loadout";
import { BUDGET_PER_PERCENT, ADDITIVE, type StatMod } from "@shared/manifest/stats";
import { xpForDepth, totalXpToReach } from "@shared/progression/depth";
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";
import type { FileMsg } from "@shared/net/protocol";
import { sandboxAccount } from "@shared/progression/account";

const KEY = "meltdown.file";

export interface FileView {
  account: string;
  depth: number;
  xp: number;
  xpIntoDepth: number;
  xpForNext: number;
  scrip: number;
  wakelight: number;
  salvage: number;
  owned: string[];
  ledger: string[];
  /** Raw loadout the client will send (may be illegal on purpose in probes). */
  loadout: unknown;
  /** Local validation of that loadout against what we know of the file. */
  legal: boolean;
  errors: string[];
  netDelta: number;
  /** "offline" applies now; "linked" applies on the next link. */
  applies: "now" | "next-link";
}

export class GhostFile {
  account: string;
  /** Raw loadout as the client will send it. Kept raw so unknown fields reach the server untouched. */
  raw: Record<string, unknown>;
  depth = 1;
  xp = 0;
  scrip = 0;
  wakelight = 0;
  salvage = 0;
  owned: string[] = [];
  ledger: string[] = [];
  /** Server-admitted loadout (what we actually spawned with online). */
  admitted: Loadout | null = null;
  onChange: ((f: GhostFile) => void) | null = null;
  private panel: HTMLElement | null = null;
  private open = false;

  constructor(private online: () => boolean) {
    const q = new URLSearchParams(location.search);
    let stored: { account?: string; loadout?: Record<string, unknown> } = {};
    try {
      stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {
      stored = {};
    }
    this.account = q.get("account") ?? stored.account ?? `blank:${Math.random().toString(36).slice(2, 10)}`;
    const urlLoadout = q.get("loadout");
    if (urlLoadout) {
      try {
        this.raw = JSON.parse(urlLoadout);
      } catch {
        this.raw = { ...DEFAULT_LOADOUT };
      }
    } else this.raw = stored.loadout ?? { ...DEFAULT_LOADOUT, attested: [] };
    // offline the sandbox file is the reference: everything owned, Depth 50
    const sb = sandboxAccount(this.account);
    this.depth = sb.depth;
    this.xp = sb.xp;
    this.scrip = sb.wallet.scrip;
    this.owned = sb.owned.slice();
    this.persist();
  }

  loadoutJson(): string {
    return JSON.stringify(this.raw);
  }

  /** The loadout as the sim should apply it locally (validated against what we know). */
  localLoadout(): Loadout {
    return validateLoadout(this.raw, this.owned, this.depth).loadout;
  }

  applyServer(f: FileMsg): void {
    this.account = f.account;
    this.depth = f.depth;
    this.xp = f.xp;
    this.scrip = f.scrip;
    this.wakelight = f.wakelight;
    this.salvage = f.salvage;
    this.owned = f.owned.slice();
    this.admitted = f.loadout as Loadout;
    if (f.ledger.length) this.ledger.push(...f.ledger);
    this.render();
    this.onChange?.(this);
  }

  view(): FileView {
    const v = validateLoadout(this.raw, this.owned, this.depth);
    return {
      account: this.account,
      depth: this.depth,
      xp: this.xp,
      xpIntoDepth: this.xp - totalXpToReach(this.depth),
      xpForNext: xpForDepth(this.depth),
      scrip: this.scrip,
      wakelight: this.wakelight,
      salvage: this.salvage,
      owned: this.owned.slice(),
      ledger: this.ledger.slice(-12),
      loadout: JSON.parse(JSON.stringify(this.raw)),
      legal: v.ok,
      errors: v.errors.map((e) => `${e.rule}: ${e.detail}`),
      netDelta: netDelta(v.loadout),
      applies: this.online() ? "next-link" : "now",
    };
  }

  setRaw(raw: Record<string, unknown>): void {
    this.raw = raw;
    this.persist();
    this.render();
    this.onChange?.(this);
  }

  toggleAttest(id: string): void {
    const list = Array.isArray(this.raw.attested) ? (this.raw.attested as string[]).slice() : [];
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    this.setRaw({ ...this.raw, attested: list });
  }

  setKeystone(id: string | null): void {
    this.setRaw({ ...this.raw, keystone: this.raw.keystone === id ? null : id });
  }

  cycleWeapon(which: "primary" | "secondary"): void {
    const cur = this.raw[which] as WeaponId;
    const i = WEAPON_LIST.findIndex((w) => w.id === cur);
    const next = WEAPON_LIST[(i + 1) % WEAPON_LIST.length]!.id;
    this.setRaw({ ...this.raw, [which]: next });
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ account: this.account, loadout: this.raw }));
    } catch {
      /* private mode */
    }
  }

  // ---- FILE panel ----

  mount(root: HTMLElement): void {
    const el = document.createElement("div");
    el.className = "file";
    el.hidden = true;
    root.appendChild(el);
    this.panel = el;
    el.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act!;
      const id = t.dataset.id ?? "";
      if (act === "attest") this.toggleAttest(id);
      else if (act === "keystone") this.setKeystone(id);
      else if (act === "primary" || act === "secondary") this.cycleWeapon(act);
      else if (act === "close") this.toggle(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        this.toggle();
      }
      if (e.code === "Escape" && this.open) this.toggle(false);
    });
    this.render();
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(on = !this.open): void {
    this.open = on;
    if (this.panel) this.panel.hidden = !on;
    if (on) document.exitPointerLock?.();
    if (on) this.render();
  }

  render(): void {
    if (!this.panel || !this.open) return;
    const v = this.view();
    const attested = Array.isArray(this.raw.attested) ? (this.raw.attested as string[]) : [];
    const keystone = typeof this.raw.keystone === "string" ? this.raw.keystone : null;
    const fmt = (m: StatMod) => `${m.delta > 0 ? "+" : "−"}${ADDITIVE.has(m.stat) ? Math.abs(m.delta) : Math.round(Math.abs(m.delta) * 100) + "%"} ${m.stat}`;
    const row = (it: LedgerItem) => {
      const on = it.kind === "node" ? attested.includes(it.id) : keystone === it.id;
      const owned = this.owned.includes(it.id);
      const gated = it.requiresDepth > this.depth;
      const w = it.benefits.reduce((a, m) => a + Math.abs(m.delta) * (ADDITIVE.has(m.stat) ? 1 : 100) * BUDGET_PER_PERCENT[m.stat], 0).toFixed(1);
      return `<div class="it ${on ? "on" : ""} ${owned ? "" : "locked"}" data-act="${it.kind === "node" ? "attest" : "keystone"}" data-id="${it.id}">
        <span class="chk">${on ? "▣" : "▢"}</span><span class="nm">${it.name}</span><span class="ring">R${it.ring} · D${it.requiresDepth} · ${it.cost}¢ · ${w}</span>
        <div class="tr"><span class="b">${it.benefits.map(fmt).join(", ")}</span> / <span class="c">${it.costs.map(fmt).join(", ")}</span></div>
        ${gated ? `<div class="c">needs Depth ${it.requiresDepth}</div>` : ""}${!owned && !gated ? `<div class="c">not in your file</div>` : ""}
      </div>`;
    };
    const wname = (id: unknown) => WEAPON_LIST.find((w) => w.id === id)?.name ?? String(id);
    const delta = v.netDelta;
    // nodes reconcile exactly; a keystone may over-pay (the Auditor banks the difference) — only an overdraft is a flag
    const stamp = delta > 1.5 ? "OVERDRAWN" : "RECONCILED";
    this.panel.innerHTML = `
      <div class="hd">▲ GHOSTFILE · <span class="cy">${v.account}</span> <span class="x" data-act="close">[TAB] CLOSE</span></div>
      <div class="ln">DEPTH <b>${String(v.depth).padStart(2, "0")}</b> · XP <b>${v.xp}</b> (${v.xpIntoDepth}/${v.xpForNext === Infinity ? "∞" : v.xpForNext}) · SCRIP <b>${v.scrip}</b> · WAKELIGHT <b>${v.wakelight}</b> · SALVAGE <b>${v.salvage}</b></div>
      <div class="ln">PRIMARY <span class="wp" data-act="primary">[${wname(this.raw.primary)}]</span> · SECONDARY <span class="wp" data-act="secondary">[${wname(this.raw.secondary)}]</span> <span class="dim">(D${WEAPON_DEPTH[this.raw.primary as WeaponId] ?? "?"} / D${WEAPON_DEPTH[this.raw.secondary as WeaponId] ?? "?"})</span></div>
      <div class="cols">
        <div><div class="sh">LEDGER GRAPH · ATTEST ≤ ${MAX_ATTESTED} · CONNECTED</div>${LEDGER_ITEMS.map(row).join("")}</div>
        <div><div class="sh">KEYSTONE · ONE · LINKED</div>${KEYSTONES.map(row).join("")}
          <div class="sh">LEDGER</div><div class="ledger">${v.ledger.length ? v.ledger.map((l) => `<div>${l}</div>`).join("") : "<div class='dim'>no lines yet</div>"}</div>
        </div>
      </div>
      <div class="ft ${v.legal ? "" : "bad"}">NET DELTA: ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)} — ${stamp} · ${v.legal ? "ATTESTATION LEGAL" : "ILLEGAL: " + v.errors.join("; ")} · ${v.applies === "now" ? "APPLIED" : "APPLIES ON NEXT LINK"}</div>
    `;
  }
}

export const ITEM_COUNT = ALL_ITEMS.length;
