/**
 * The client's view of its Ghostfile: an account id, the loadout it will
 * attest, and the last thing the server said about the file. Persisted in
 * localStorage; URL params override for probes (`?account=`, `?loadout=<json>`).
 * The FILE panel (Tab) edits the loadout. Legality is only advisory here —
 * the server refuses illegal loadouts at spawn, it never strips them.
 */
import { ALL_ITEMS, KEYSTONES, LEDGER_ITEMS, MAX_ATTESTED, itemById, type LedgerItem } from "@shared/manifest/items";
import { DEFAULT_LOADOUT, netDelta, validateLoadout, WEAPON_DEPTH, type Loadout, type Ranks } from "@shared/manifest/loadout";
import { BUDGET_PER_PERCENT, ADDITIVE, type StatMod } from "@shared/manifest/stats";
import { xpForDepth, totalXpToReach } from "@shared/progression/depth";
import { WEAPON_LIST, type WeaponId } from "@shared/weapons/manifest";
import type { FileMsg } from "@shared/net/protocol";
import { sandboxAccount } from "@shared/progression/account";
import { CHIPS, chipById, type Socket } from "@shared/manifest/chips";
import { FIRMWARES, firmwareById } from "@shared/manifest/firmwares";
import { CURRICULA, gateFor, MAX_RANK, xpForRank, type Mastery } from "@shared/progression/mastery";
import { redact, STAMPS } from "@shared/progression/stamps";

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
  mastery: Record<string, { xp: number; rank: number; done: string[]; gate: string | null }>;
  stamps: string[];
  stampCount: number;
  /** the host that serves the ledger shop (null offline: everything is already in the sandbox file) */
  shop: string | null;
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
  mastery: Record<string, Mastery> = {};
  stamps: string[] = [];
  /** Ledger shop base URL (derived from the room URL); null offline. */
  shop: string | null = null;
  onChange: ((f: GhostFile) => void) | null = null;
  onStamp: ((lines: string[], ranks: string[], challenges: string[]) => void) | null = null;
  private panel: HTMLElement | null = null;
  private graph: HTMLElement | null = null;
  private open = false;
  private graphOpen = false;
  private busy = "";

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
    // offline the sandbox file is the reference: everything owned, Depth 50, mastery 30
    const sb = sandboxAccount(this.account);
    this.depth = sb.depth;
    this.xp = sb.xp;
    this.scrip = sb.wallet.scrip;
    this.owned = sb.owned.slice();
    this.mastery = sb.mastery;
    const net = q.get("net");
    if (net) {
      try {
        const u = new URL(net);
        this.shop = `${u.protocol === "wss:" ? "https:" : "http:"}//${u.host}`;
      } catch {
        this.shop = null;
      }
    }
    this.persist();
  }

  ranks(): Ranks {
    const out: Ranks = {};
    for (const [w, m] of Object.entries(this.mastery)) out[w as WeaponId] = m.rank;
    return out;
  }

  loadoutJson(): string {
    return JSON.stringify(this.raw);
  }

  /** The loadout as the sim should apply it locally (validated against what we know). */
  localLoadout(): Loadout {
    return validateLoadout(this.raw, this.owned, this.depth, this.ranks()).loadout;
  }

  applyServer(f: FileMsg): void {
    this.account = f.account;
    this.depth = f.depth;
    this.xp = f.xp;
    this.scrip = f.scrip;
    this.wakelight = f.wakelight;
    this.salvage = f.salvage;
    this.owned = f.owned.slice();
    if (f.reason === "join") this.admitted = f.loadout as Loadout;
    if (f.mastery) {
      for (const [w, m] of Object.entries(f.mastery)) this.mastery[w] = { xp: m.xp, rank: m.rank, done: m.done.slice(), counters: { ...m.counters } };
    }
    if (f.stamps) this.stamps = f.stamps.slice();
    if (f.ledger.length) this.ledger.push(...f.ledger);
    if ((f.newStamps?.length || f.ranks?.length || f.challenges?.length) && f.reason === "stamp") {
      this.onStamp?.(f.newStamps?.map((id) => STAMPS.find((s) => s.id === id)?.line ?? id) ?? [], f.ranks ?? [], f.challenges ?? []);
    }
    this.render();
    this.onChange?.(this);
  }

  /** Buy a node through the ledger shop (Scrip); the host answers with the whole file. */
  async buy(nodeId: string, refund = false): Promise<{ ok: boolean; reason?: string }> {
    if (!this.shop) return { ok: false, reason: "offline: the sandbox file already owns everything" };
    this.busy = nodeId;
    this.renderGraph();
    try {
      const res = await fetch(`${this.shop}/file/${encodeURIComponent(this.account)}/${refund ? "refund" : "buy"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ node: nodeId }) });
      const r = (await res.json()) as { ok: boolean; reason?: string; account?: { owned: string[]; wallet: { scrip: number; wakelight: number; salvage: number }; depth: number; xp: number; ledger: string[] } };
      if (r.account) {
        this.owned = r.account.owned.slice();
        this.scrip = r.account.wallet.scrip;
        this.wakelight = r.account.wallet.wakelight;
        this.salvage = r.account.wallet.salvage;
        this.depth = r.account.depth;
        this.xp = r.account.xp;
        const tail = r.account.ledger.slice(-1);
        if (tail.length && this.ledger[this.ledger.length - 1] !== tail[0]) this.ledger.push(...tail);
      }
      this.onChange?.(this);
      return { ok: r.ok, reason: r.reason };
    } catch (e) {
      return { ok: false, reason: String(e) };
    } finally {
      this.busy = "";
      this.renderGraph();
      this.render();
    }
  }

  setChip(weapon: WeaponId, socket: Socket, id: string | null): void {
    const chips = { ...((this.raw.chips as Record<string, Record<string, string | null>>) ?? {}) };
    const slots = { ...(chips[weapon] ?? {}) };
    if (id) slots[socket] = id;
    else delete slots[socket];
    chips[weapon] = slots;
    this.setRaw({ ...this.raw, chips });
  }

  setFirmware(weapon: WeaponId, id: string | null): void {
    const fw = { ...((this.raw.firmware as Record<string, string>) ?? {}) };
    if (id) fw[weapon] = id;
    else delete fw[weapon];
    this.setRaw({ ...this.raw, firmware: fw });
  }

  view(): FileView {
    const v = validateLoadout(this.raw, this.owned, this.depth, this.ranks());
    const mastery: FileView["mastery"] = {};
    for (const w of WEAPON_LIST) {
      const m = this.mastery[w.id];
      if (m) mastery[w.id] = { xp: m.xp, rank: m.rank, done: m.done.slice(), gate: gateFor(w.id, m)?.text ?? null };
    }
    return {
      mastery,
      stamps: this.stamps.slice(),
      stampCount: STAMPS.length,
      shop: this.shop,
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
    this.renderGraph();
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
    el.addEventListener("change", (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.chip) this.setChip(t.dataset.chip as WeaponId, t.dataset.socket as Socket, t.value || null);
      else if (t.dataset.fw) this.setFirmware(t.dataset.fw as WeaponId, t.value || null);
    });
    document.addEventListener("keydown", (e) => {
      if (e.code === "Tab") {
        e.preventDefault();
        this.toggle();
      }
      if (e.code === "KeyG") this.toggleGraph();
      if (e.code === "Escape") {
        if (this.open) this.toggle(false);
        if (this.graphOpen) this.toggleGraph(false);
      }
    });
    const g = document.createElement("div");
    g.className = "graph";
    g.hidden = true;
    root.appendChild(g);
    this.graph = g;
    g.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act!;
      const id = t.dataset.id ?? "";
      if (act === "attest") this.toggleAttest(id);
      else if (act === "keystone") this.setKeystone(id);
      else if (act === "buy") void this.buy(id);
      else if (act === "refund") void this.buy(id, true);
      else if (act === "closeGraph") this.toggleGraph(false);
    });
    this.render();
  }

  get isGraphOpen(): boolean {
    return this.graphOpen;
  }

  toggleGraph(on = !this.graphOpen): void {
    this.graphOpen = on;
    if (this.graph) this.graph.hidden = !on;
    if (on) {
      document.exitPointerLock?.();
      this.renderGraph();
    }
  }

  /** The Ledger Graph as a forged district map: three rings of hexes, owned in green, leased in violet. */
  renderGraph(): void {
    if (!this.graph || !this.graphOpen) return;
    const attested = Array.isArray(this.raw.attested) ? (this.raw.attested as string[]) : [];
    const keystone = typeof this.raw.keystone === "string" ? this.raw.keystone : null;
    const W = 720;
    const H = 560;
    const cx = W / 2;
    const cy = H / 2 + 6;
    const pos = new Map<string, { x: number; y: number }>();
    const radii = [92, 172, 252];
    for (const r of [1, 2, 3]) {
      const ring = LEDGER_ITEMS.filter((n) => n.ring === r);
      ring.forEach((n, k) => {
        const a = (k / ring.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, { x: cx + Math.cos(a) * radii[r - 1]!, y: cy + Math.sin(a) * radii[r - 1]! });
      });
    }
    KEYSTONES.forEach((k, i) => pos.set(k.id, { x: cx + Math.cos(((i / 3) * Math.PI * 2) - Math.PI / 2 + 0.5) * 40, y: cy + Math.sin(((i / 3) * Math.PI * 2) - Math.PI / 2 + 0.5) * 40 }));
    const hex = (x: number, y: number, r: number) => Array.from({ length: 6 }, (_, i) => `${(x + r * Math.cos((i * Math.PI) / 3 + Math.PI / 6)).toFixed(1)},${(y + r * Math.sin((i * Math.PI) / 3 + Math.PI / 6)).toFixed(1)}`).join(" ");
    let links = "";
    const drawn = new Set<string>();
    for (const n of ALL_ITEMS) {
      const a = pos.get(n.id)!;
      for (const l of n.links) {
        const key = [n.id, l].sort().join("+");
        if (drawn.has(key)) continue;
        drawn.add(key);
        const b = pos.get(l);
        if (!b) continue;
        const lit = (attested.includes(n.id) || keystone === n.id) && (attested.includes(l) || keystone === l);
        links += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${lit ? "lit" : this.owned.includes(n.id) && this.owned.includes(l) ? "own" : ""}"/>`;
      }
    }
    let nodes = "";
    for (const n of ALL_ITEMS) {
      const p = pos.get(n.id)!;
      const owned = this.owned.includes(n.id);
      const on = n.kind === "node" ? attested.includes(n.id) : keystone === n.id;
      const gated = n.requiresDepth > this.depth;
      const cls = `${n.kind} ${owned ? "own" : gated ? "gated" : "lease"} ${on ? "on" : ""} ${this.busy === n.id ? "busy" : ""}`;
      const act = owned ? (n.kind === "node" ? "attest" : "keystone") : "buy";
      nodes += `<g class="${cls}" data-act="${act}" data-id="${n.id}"><polygon points="${hex(p.x, p.y, n.kind === "keystone" ? 20 : 15)}"/><text x="${p.x}" y="${p.y + 3}">${n.kind === "keystone" ? "◆" : owned ? (on ? "▣" : "▢") : gated ? "D" + n.requiresDepth : n.cost}</text><title>${n.name} · ${n.line}${owned ? "" : ` · ${n.cost} SCRIP · needs Depth ${n.requiresDepth}`}</title></g>`;
    }
    const ownedCount = this.owned.filter((id) => itemById(id)?.kind === "node").length;
    const v = validateLoadout(this.raw, this.owned, this.depth, this.ranks());
    this.graph.innerHTML = `
      <div class="hd">▲ LEDGER GRAPH · <span class="cy">${ownedCount}/48 OWNED</span> · ATTESTED ${attested.length}/${MAX_ATTESTED} · SCRIP <b>${this.scrip}</b> · DEPTH <b>${String(this.depth).padStart(2, "0")}</b> <span class="x" data-act="closeGraph">[G] CLOSE</span></div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <circle cx="${cx}" cy="${cy}" r="${radii[0]}" class="ring"/><circle cx="${cx}" cy="${cy}" r="${radii[1]}" class="ring"/><circle cx="${cx}" cy="${cy}" r="${radii[2]}" class="ring"/>
        <text x="${cx}" y="${cy - radii[0]! - 24}" class="lbl">RING I · DEPTH 1–4</text><text x="${cx}" y="${cy - radii[1]! - 24}" class="lbl">RING II · DEPTH 6–14</text><text x="${cx}" y="${cy - radii[2]! - 16}" class="lbl">RING III · DEPTH 16–30</text>
        ${links}${nodes}
      </svg>
      <div class="ft ${v.ok ? "" : "bad"}">${this.shop ? "click a leased node to buy it with Scrip (violet → green); click an owned node to attest it" : "sandbox: every node is in the file — click to attest"} · ${v.ok ? "ATTESTATION LEGAL" : "ILLEGAL: " + v.errors.map((e) => e.detail).join("; ")}</div>`;
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
    const chipsRaw = (this.raw.chips as Record<string, Record<string, string>>) ?? {};
    const fwRaw = (this.raw.firmware as Record<string, string>) ?? {};
    const kit = WEAPON_LIST.map((w) => {
      const m = this.mastery[w.id];
      const rank = m?.rank ?? 1;
      const gate = m ? gateFor(w.id, m) : null;
      const into = m ? m.xp - Array.from({ length: rank - 1 }, (_, i) => xpForRank(i + 1)).reduce((a, b) => a + b, 0) : 0;
      const need = xpForRank(rank);
      const sockets = (["muzzle", "kinetic", "protocol"] as Socket[]).map((sock) => {
        const cur = chipsRaw[w.id]?.[sock] ?? "";
        const opts = CHIPS.filter((c) => c.weapon === w.id && c.socket === sock).map((c) => `<option value="${c.id}" ${c.id === cur ? "selected" : ""} ${c.rank > rank ? "disabled" : ""}>${c.name.replace(/^\S+ /, "")} · r${c.rank}${c.rank > rank ? " (locked)" : ""}</option>`).join("");
        return `<label class="sock">${sock.toUpperCase()} <select data-chip="${w.id}" data-socket="${sock}"><option value="">— none —</option>${opts}</select></label>`;
      }).join("");
      const fws = FIRMWARES.filter((f) => f.weapon === w.id).map((f) => `<option value="${f.id}" ${fwRaw[w.id] === f.id ? "selected" : ""} ${f.rank > rank ? "disabled" : ""}>${f.name} · r${f.rank}${f.rank > rank ? " (locked)" : ""}</option>`).join("");
      const chipLines = Object.values(chipsRaw[w.id] ?? {}).map((id) => chipById(id)?.line).filter(Boolean).join(" · ");
      const fwLine = fwRaw[w.id] ? firmwareById(fwRaw[w.id]!)?.line ?? "" : "";
      const gateText = gate ? `<span class="c">GATE r${gate.gate}: ${gate.text} (${m?.counters[gate.counter] ?? 0}/${gate.need})</span>` : rank >= MAX_RANK ? `<span class="b">MASTERED</span>` : `<span class="dim">${into}/${need} xp</span>`;
      return `<div class="wk"><div class="nm">${w.name} <span class="ring">MASTERY ${String(rank).padStart(2, "0")}/${MAX_RANK}</span></div><div class="tr">${gateText}</div><div class="socks">${sockets}<label class="sock">FIRMWARE <select data-fw="${w.id}"><option value="">STOCK</option>${fws}</select></label></div>${chipLines || fwLine ? `<div class="tr">${[fwLine, chipLines].filter(Boolean).join(" · ")}</div>` : ""}</div>`;
    }).join("");
    const stampRows = STAMPS.map((st) => `<div class="st ${this.stamps.includes(st.id) ? "on" : ""}">${this.stamps.includes(st.id) ? "▣ " + st.line : "▢ " + redact(st.line)}</div>`).join("");
    const delta = v.netDelta;
    // nodes reconcile exactly; a keystone may over-pay (the Auditor banks the difference) — only an overdraft is a flag
    const stamp = delta > 1.5 ? "OVERDRAWN" : "RECONCILED";
    this.panel.innerHTML = `
      <div class="hd">▲ GHOSTFILE · <span class="cy">${v.account}</span> <span class="x" data-act="close">[TAB] CLOSE</span></div>
      <div class="ln">DEPTH <b>${String(v.depth).padStart(2, "0")}</b> · XP <b>${v.xp}</b> (${v.xpIntoDepth}/${v.xpForNext === Infinity ? "∞" : v.xpForNext}) · SCRIP <b>${v.scrip}</b> · WAKELIGHT <b>${v.wakelight}</b> · SALVAGE <b>${v.salvage}</b></div>
      <div class="ln">PRIMARY <span class="wp" data-act="primary">[${wname(this.raw.primary)}]</span> · SECONDARY <span class="wp" data-act="secondary">[${wname(this.raw.secondary)}]</span> <span class="dim">(D${WEAPON_DEPTH[this.raw.primary as WeaponId] ?? "?"} / D${WEAPON_DEPTH[this.raw.secondary as WeaponId] ?? "?"})</span></div>
      <div class="cols">
        <div><div class="sh">ATTESTED NODES · ≤ ${MAX_ATTESTED} · CONNECTED <span class="dim">(G opens the whole graph)</span></div>${LEDGER_ITEMS.filter((n) => this.owned.includes(n.id) && (attested.includes(n.id) || n.ring === 1)).map(row).join("")}
          <div class="sh">KEYSTONE · ONE · LINKED</div>${KEYSTONES.map(row).join("")}</div>
        <div><div class="sh">WEAPON MASTERY · CHIPS · FIRMWARE</div><div class="kit">${kit}</div>
          <div class="sh">ATTESTATION STAMPS · ${this.stamps.length}/${STAMPS.length}</div><div class="stamps">${stampRows}</div>
          <div class="sh">LEDGER</div><div class="ledger">${v.ledger.length ? v.ledger.map((l) => `<div>${l}</div>`).join("") : "<div class='dim'>no lines yet</div>"}</div>
        </div>
      </div>
      <div class="ft ${v.legal ? "" : "bad"}">NET DELTA: ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)} — ${stamp} · ${v.legal ? "ATTESTATION LEGAL" : "ILLEGAL: " + v.errors.join("; ")} · ${v.applies === "now" ? "APPLIED" : "APPLIES ON NEXT LINK"}</div>
    `;
  }
}

export const ITEM_COUNT = ALL_ITEMS.length;
export const CURRICULUM_COUNT = Object.values(CURRICULA).reduce((n, c) => n + c.length, 0);
