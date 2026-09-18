import type { PlayerState } from "@shared/sim/player";
import { weaponDefOf } from "@shared/sim/player";
import { GRENADE_LIST, WEAPON_LIST } from "@shared/weapons/manifest";
import type { Dummy } from "@shared/sim/world";
import type { FileView } from "../file";
import { LEVEL_INFO, type  LevelDef } from "@shared/sim/level";
import { HIT_MAX, type HitMark } from "./damage";
import type { NodeReadout } from "./node";
import { nodeColour, nodeMarks, toMap, type RadarNode } from "./radar";

/** Terminal chrome matched to the reference clip. Dry by default: no damage numbers, no hitmarker spam. */
export class Hud {
  private q: (s: string) => HTMLElement;
  private lines: string[] = [];
  private ledgerLine = 0;
  private alertTimer = 0;
  private dossierTimer = 0;
  private debtTimer = 0;
  private riteTimer = 0;
  /** the post-match receipt: lines to print, how many are printed, the print clock, and whether it was signed */
  readonly receiptState = { open: false, lines: [] as string[], printed: 0, timer: 0, stamped: false, signed: 0 };
  onPrint: (() => void) | null = null;
  onStamp: (() => void) | null = null;
  private radar: CanvasRenderingContext2D;
  private locked = false;
  private rackKey = "";
  private nadeKey = "";
  private flagTimer = 0;
  private bounds = 32;
  private zone = "DRAINAGE YARD";

  private reticleAt = { x: -1, y: -1 };
  private reticleArc = false;

  /**
   * The reticle goes where the renderer says the eye's ray lands (Stage 60): the screen's centre in
   * first person, and in third person wherever the shot would go — off-centre near a wall, on it at range.
   */
  setReticle(r: { x: number; y: number; visible: boolean; arc?: boolean }): void {
    const xh = this.q(".xh");
    // a round that falls gets a mark of its own: the same cross would say "the shot goes here" in
    // the same words for a thing that arrives a second later, on a curve (Stage 78)
    if (!!r.arc !== this.reticleArc) {
      this.reticleArc = !!r.arc;
      xh.classList.toggle("arc", this.reticleArc);
    }
    if (Math.abs(r.x - this.reticleAt.x) < 0.5 && Math.abs(r.y - this.reticleAt.y) < 0.5) return;
    this.reticleAt = { x: r.x, y: r.y };
    xh.style.left = `${r.x}px`;
    xh.style.top = `${r.y}px`;
    xh.style.opacity = r.visible ? "1" : "0";
  }

  /**
   * The wedges that say where a hit came from (Stage 74). Third person widened what is visible and
   * did nothing for what is not: half the street is still behind the camera, and a shot from it used
   * to be a sound and a number on a bar. Each wedge is rotated to its bearing and faded by its age;
   * the maths is `client/hud/damage.ts` and this only draws it.
   */
  setDamage(marks: readonly HitMark[]): void {
    const wedges = this.dmgWedges;
    for (let i = 0; i < wedges.length; i++) {
      const m = marks[i];
      const w = wedges[i]!;
      if (!m) {
        if (w.style.opacity !== "0") w.style.opacity = "0";
        continue;
      }
      // a heavier hit is a wider, brighter wedge; the rotation is the bearing, clockwise from ahead
      w.style.transform = `rotate(${m.angle}rad)`;
      w.style.opacity = String(Math.min(1, m.alpha * 0.9));
      w.style.setProperty("--w", `${Math.min(34, 12 + m.damage * 0.5)}deg`);
    }
  }
  private readonly dmgWedges: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="scan"></div>
      <div class="xh"><i></i></div>
      <div class="hit"></div>
      <div class="dmg">${"<i></i>".repeat(HIT_MAX)}</div>
      <div class="stamp">KILL CONFIRMED</div>
      <div class="tear"></div>

      <div class="p status">
        <div class="line"><span class="glyph"></span>▲ <span class="handle">BLANK</span><span class="moniker"></span> · <span class="dim">DRAINAGE YARD (MAGENTA)</span> · <span class="online">1 online</span></div>
        <div class="line dim">LV <span class="depth">01</span> · XP <span class="xp">0/100</span> · ¢ <span class="scrip">0</span> · ◆ <span class="wake">0</span></div>
        <div class="bars">
          <div class="bar cy"><i class="shbar" style="width:100%"></i></div>
          <div class="bar gr"><i class="hpbar" style="width:100%"></i></div>
          <div class="bar ye"><i class="ammobar" style="width:100%"></i></div>
        </div>
      </div>

      <div class="p nodefoot" hidden></div>
      <div class="p mg mission"><span class="mtitle">◈ THE WAKE — DRAINAGE YARD</span><div class="sub"><span class="mline">⌖ CONTRACT — DUMMIES <span class="kills">0</span>/5</span></div><div class="runstrip" hidden></div><div class="sub mscore"></div><div class="nodes"></div></div>
      <div class="alert"></div>
      <div class="debt"></div>
      <div class="dossier" hidden><div class="dt">▲ DOSSIER · BOTH CELLS · FILES AS THE CITY SEES THEM</div><div class="cells"></div></div>
      <div class="p am receipt" hidden><div class="rh">▲ LEDGER ENTRY · VANTAGE CLEARING HOUSE</div><div class="rl"></div><div class="rs">◆ <span class="rst">PRINTING…</span></div><div class="rf">[ENTER] SIGN</div></div>
      <div class="rite" hidden><div class="rn"></div><div class="rt"></div><div class="rlines"></div></div>
      <div class="p cy terminal" hidden><div class="th"><span class="sg"></span> <span class="sp"></span></div><div class="tl"></div><div class="tc"></div><div class="tf">[ENTER] CONTINUE · [1–4] CHOOSE</div></div>
      <div class="contracts" hidden></div>
      <div class="card" hidden><div class="ct"></div><div class="cl"></div></div>

      <div class="p cy map"><div class="t">AREA MAP</div><canvas width="54" height="42"></canvas><div class="f">tap to walk</div></div>
      <div class="side"><div><span class="k">▸</span> ONLINE (1)</div><div class="perf"></div></div>

      <div class="log"></div>
      <div class="p cy travel" hidden><div class="t">▲ NEO-CHINA · DISTRICT SELECT <span class="x" data-travel="close">[M] CLOSE</span></div><div class="list"></div><div class="f">travel reloads the client; online, the room decides the district</div></div>
      <div class="p mg prompt">▲ CLICK TO WAKE · <span style="color:var(--cy)">WASD</span> MOVE · <span style="color:var(--cy)">SHIFT</span> SPRINT · <span style="color:var(--cy)">CTRL</span> SLIDE · <span style="color:var(--cy)">SPACE</span> JUMP</div>
      <div class="p mg prompt-touch">▲ TAP TO WAKE · <span style="color:var(--cy)">LEFT</span> STICK MOVES · PUSH TO <span style="color:var(--cy)">SPRINT</span> · <span style="color:var(--cy)">RIGHT</span> DRAG AIMS</div>

      <div class="ammo"><div class="w wname">LEASE-BREAKER</div><div class="big"><span class="ammon">30</span> <span class="w">/ <span class="mag">30</span></span></div><div class="rack"></div><div class="nades"></div></div>
      <div class="overlay flag">▲ FLAGGED — VANTAGE SEARCHLIGHT</div>
      <div class="overlay stun">STUNNED</div>
      <div class="emp"></div>

      <div class="bottom">
        <div class="slots"><div class="slot on">╪</div><div class="slot">▦</div><div class="slot">▦</div><div class="slot mg">◈</div></div>
        <div class="center"><b>1</b> · BLANK · <span class="vel">0.0 m/s</span> · <span class="stance">STAND</span></div>
        <div class="tabs"><div class="tab">FILE<span class="n">·</span></div><div class="tab">GRAPH<span class="n">·</span></div><div class="tab">MAP<span class="n">·</span></div><div class="tab">MARKET<span class="n">·</span></div><div class="tab">CONTRACTS<span class="n">·</span></div></div>
      </div>
      <div class="keys">WASD · HOLD CLICK fire · R reload · SPACE jump · CTRL slide · SHIFT sprint</div>
    `;
    this.q = (s) => root.querySelector(s) as HTMLElement;
    this.radar = (root.querySelector(".map canvas") as HTMLCanvasElement).getContext("2d")!;
    this.dmgWedges.push(...Array.from(root.querySelectorAll<HTMLElement>(".dmg i")));
  }

  /** Zone label, mission title, radar scale, and the MAP tab's district list. */
  setLevel(level: LevelDef, onTravel: (id: string) => void): void {
    this.bounds = level.bounds ?? 32;
    this.zone = (level.displayName ?? level.name.replace(/_/g, " ")).toUpperCase();
    const cast = (level.district ?? "magenta").toUpperCase();
    this.q(".status .dim").textContent = `${this.zone} (${cast})`;
    this.q(".mtitle").textContent = `◈ THE WAKE — ${this.zone}`;
    const kills = this.q(".mline");
    if (kills) kills.style.display = level.dummies.length ? "" : "none";
    const list = this.q(".travel .list");
    const rows = LEVEL_INFO;
    list.innerHTML = rows.map((r) => `<div class="row ${r.id === level.name ? "on" : ""} ${r.cast}" data-travel="${r.id}">${r.id === level.name ? "▣" : "▢"} ${r.displayName} <span class="cast">${r.cast.toUpperCase()}</span></div>`).join("");
    const panel = this.q(".travel");
    panel.onclick = (e) => {
      const t = (e.target as HTMLElement).closest("[data-travel]") as HTMLElement | null;
      if (!t) return;
      if (t.dataset.travel === "close") panel.hidden = true;
      else onTravel(t.dataset.travel!);
    };
    const tabs = this.q(".tabs");
    tabs.onclick = (e) => {
      const t = (e.target as HTMLElement).closest(".tab") as HTMLElement | null;
      if (!t) return;
      if (/MAP/.test(t.textContent ?? "")) panel.hidden = !panel.hidden;
      else if (/FILE/.test(t.textContent ?? "")) document.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
      else if (/GRAPH/.test(t.textContent ?? "")) document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyG" }));
    };
    document.addEventListener("keydown", (e) => {
      if (e.code === "KeyM") {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) document.exitPointerLock?.();
      }
    });
  }

  /** Status line: Depth, XP into the depth, Scrip, Wakelight. */
  setFile(f: FileView): void {
    this.q(".depth").textContent = String(f.depth).padStart(2, "0");
    this.q(".xp").textContent = `${f.xpIntoDepth}/${f.xpForNext === Infinity ? "∞" : f.xpForNext}`;
    this.q(".scrip").textContent = String(f.scrip);
    this.q(".wake").textContent = String(f.wakelight);
    // the handle is what the city calls you (setIdentity); the file id stays in the FILE panel
    const tab = this.q(".tabs .tab .n");
    if (tab) tab.textContent = f.legal ? "·" : "!";
    const graphTab = this.q(".tabs .tab:nth-child(2) .n");
    if (graphTab) graphTab.textContent = String(f.owned.filter((id) => !id.includes(":")).length);
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.q(".prompt").classList.toggle("off", locked);
  }

  /** A CRT theme: swap the palette variables on the HUD root (null: the default). */
  setTheme(palette: { cy: string; gr: string; mg: string; ye: string; am: string } | null): void {
    const root = this.q(".status").parentElement as HTMLElement;
    for (const k of ["cy", "gr", "mg", "ye", "am"] as const) {
      if (palette) root.style.setProperty(`--${k}`, palette[k]);
      else root.style.removeProperty(`--${k}`);
    }
    root.dataset.theme = palette ? "custom" : "";
  }

  /** The Deep Wake on the MAP tab: per district, who holds each node, and the season's last lines. */
  setSeason(v: { season: number; week: number; held: Record<string, number>; districts: Record<string, { label: string; house: string; leader: string; pressure: number }[]>; history: string[] } | null): void {
    let el = this.q(".travel .season");
    if (!el) {
      el = document.createElement("div");
      el.className = "season";
      this.q(".travel").appendChild(el);
    }
    if (!v) {
      el.innerHTML = "";
      return;
    }
    const house = (h: string) => `<span class="h ${h}">${h === "unaligned" ? "—" : h.toUpperCase()}</span>`;
    el.innerHTML = `<div class="t">▲ DEEP WAKE · SEASON ${v.season} · WEEK ${v.week} <span class="dim">· ESTATE ${v.held["estate"] ?? 0} · CLOCKEATERS ${v.held["clockeaters"] ?? 0} · CELLS ${v.held["cells"] ?? 0}</span></div>${Object.entries(v.districts).map(([d, nodes]) => `<div class="dw"><b>${d.replace(/_/g, " ").toUpperCase()}</b> ${nodes.map((n) => `${n.label} ${house(n.house)}${n.pressure > 0 ? `<i>+${n.pressure.toFixed(0)} ${n.leader.slice(0, 3).toUpperCase()}</i>` : ""}`).join(" · ")}</div>`).join("")}<div class="hist">${v.history.slice(-4).map((l) => `<div>» ${l}</div>`).join("") || "<div class='dim'>no rounds have moved the graph yet</div>"}</div>`;
  }

  /** The local file's identity in the status line: glyph, what the city calls you, and the moniker. */
  setIdentity(glyphSvg: string, display: string, moniker: string | null, chapter: number): void {
    this.q(".glyph").innerHTML = glyphSvg;
    this.q(".handle").textContent = display;
    this.q(".moniker").textContent = moniker && moniker !== display ? ` · ${moniker}` : "";
    this.q(".status").classList.toggle("named", chapter >= 3);
  }

  /** 1.2 s pre-match dossier flash: both cells' files, identity only. */
  dossier(entries: { team: number; display: string; glyphSvg: string; chapter: number; moniker: string | null; stamps: number; debt: boolean; me: boolean }[], seconds: number): void {
    const cell = (t: number) => `<div class="cell c${t}"><div class="ch">CELL ${t === 1 ? "ONE" : "TWO"}</div>${entries.filter((e) => e.team === t).map((e) => `<div class="ent ${e.me ? "me" : ""} ${e.debt ? "debt" : ""}">${e.glyphSvg}<div><div class="nm">${e.display}${e.debt ? ' <span class="dbt">◆ DEBT</span>' : ""}</div><div class="sub">CH ${["—", "I", "II", "III"][e.chapter] ?? "—"}${e.moniker ? " · " + e.moniker : ""} · ${e.stamps} STAMPS</div></div></div>`).join("") || '<div class="ent dim">— EMPTY —</div>'}</div>`;
    this.q(".dossier .cells").innerHTML = cell(1) + cell(2);
    const d = this.q(".dossier");
    d.hidden = false;
    d.classList.remove("on");
    void d.offsetWidth;
    d.classList.add("on");
    this.dossierTimer = seconds;
    this.raised.dossier++;
  }

  /** DEBT OWED (someone has your number) / DEBT CLEARED (you settled it). */
  debt(event: "owed" | "cleared", display: string, extra = ""): void {
    const el = this.q(".debt");
    el.textContent = event === "cleared" ? `◆ DEBT CLEARED — ${display}${extra ? " · " + extra : ""}` : `◆ DEBT — ${display} HAS YOUR NUMBER${extra ? " · " + extra : ""}`;
    el.classList.toggle("cleared", event === "cleared");
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    this.debtTimer = event === "cleared" ? 3.5 : 4;
    this.raised.debt++;
  }

  /** The post-match Ledger Entry: the receipt prints line by line, the stamp thunks, the player signs. */
  receipt(lines: string[]): void {
    const r = this.receiptState;
    r.open = true;
    r.lines = lines.slice();
    r.printed = 0;
    r.timer = 0.4;
    r.stamped = false;
    this.q(".receipt .rl").innerHTML = "";
    this.q(".receipt .rst").textContent = "PRINTING…";
    this.q(".receipt").hidden = false;
    this.q(".receipt").classList.remove("stamped");
  }

  /** Sign the receipt (Enter). Returns false when there was nothing to sign or it is still printing. */
  sign(): boolean {
    const r = this.receiptState;
    if (!r.open || !r.stamped) return false;
    r.open = false;
    r.signed++;
    this.q(".receipt").hidden = true;
    return true;
  }

  /** A Chapter rite: the screen goes to the rite card for a few seconds. */
  rite(numeral: string, title: string, lines: string[], seconds = 5): void {
    this.q(".rite .rn").textContent = `CHAPTER ${numeral}`;
    this.q(".rite .rt").textContent = title;
    this.q(".rite .rlines").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
    const el = this.q(".rite");
    el.hidden = false;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    this.riteTimer = seconds;
    this.raised.rite++;
  }

  // ---- campaign: objective, terminal, contracts, cards ----

  /** THE RUN (Stage 14): the strip replaces the wake's while a run is on — carried, banked, the zone, the banking bar. */
  setRun(v: { carried: number; banked: number; banking: number; inSafe: boolean; zone: string | null; today: number; cap: number; owed: number; claims: number } | null): void {
    const el = this.q(".runstrip") as HTMLElement | null;
    if (!el) return;
    el.hidden = !v;
    document.getElementById("hud")?.classList.toggle("safe", !!v?.inSafe);
    if (!v) return;
    const bar = v.inSafe && v.carried > 0 ? `<span class="bar"><i style="width:${Math.round(v.banking * 100)}%"></i></span> BANKING` : v.inSafe ? `SAFE ZONE · <span class="zone">[TAB] MARKET</span>` : `<span class="pvp">PVP ZONE</span>`;
    el.innerHTML = `◈ CARRYING <b>${v.carried}</b> · BANKED <b>${v.banked}</b> · TODAY ${v.today}/${v.cap} · OWED <b>${v.owed}</b> UNITS · ${v.zone ? `<span class="zone">${v.zone}</span> ` : ""}${bar} · ${v.claims} CLAIMS OUT`;
  }

  /** Mission title and the current objective under it (replaces the wake strip while a contract runs). */
  setObjective(title: string, text: string, progress: string | null): void {
    this.q(".mtitle").textContent = title;
    const line = this.q(".mline");
    line.style.display = "";
    line.innerHTML = `⌖ ${text}${progress ? ` <span class="prog">${progress}</span>` : ""}`;
    this.q(".mscore").innerHTML = "";
    this.q(".nodes").innerHTML = "";
  }

  /** the CRT terminal: typed lines then choices */
  private term = { lines: [] as string[], shown: 0, chars: 0, ready: false, choices: null as string[] | null };
  get terminalReady(): boolean {
    return this.term.ready;
  }

  terminal(speaker: string, sigil: string, color: string, lines: string[], choices: string[] | null): void {
    const t = this.q(".terminal");
    t.hidden = false;
    t.className = `p terminal ${color}`;
    this.q(".terminal .sg").textContent = sigil;
    this.q(".terminal .sp").textContent = speaker;
    this.term = { lines: lines.slice(), shown: 0, chars: 0, ready: false, choices };
    this.q(".terminal .tl").innerHTML = "";
    this.q(".terminal .tc").innerHTML = "";
    this.q(".terminal .tf").textContent = choices ? "[1–4] CHOOSE" : "[ENTER] CONTINUE";
  }

  /** the mirror's footer (Stage 52): a guest's terminal says whose turn it is instead of offering keys */
  terminalFooter(text: string): void {
    this.q(".terminal .tf").textContent = text;
  }

  /** show everything now (a second Enter) */
  terminalSkip(): void {
    const t = this.term;
    t.shown = t.lines.length;
    t.chars = 0;
    this.q(".terminal .tl").innerHTML = t.lines.map((l) => `<div>${l}</div>`).join("");
    this.finishTerminal();
  }

  private finishTerminal(): void {
    const t = this.term;
    t.ready = true;
    if (t.choices) this.q(".terminal .tc").innerHTML = t.choices.map((c, i) => `<div class="ch"><b>${i + 1}</b> ${c}</div>`).join("");
  }

  terminalClose(): void {
    this.q(".terminal").hidden = true;
    this.term = { lines: [], shown: 0, chars: 0, ready: false, choices: null };
  }

  private tickTerminal(dt: number): void {
    const t = this.term;
    if (this.q(".terminal").hidden || t.ready) return;
    const speed = 55; // chars per second
    t.chars += dt * speed;
    const cur = t.lines[t.shown];
    if (cur === undefined) {
      this.finishTerminal();
      return;
    }
    const n = Math.min(cur.length, Math.floor(t.chars));
    const done = t.lines.slice(0, t.shown).map((l) => `<div>${l}</div>`).join("");
    this.q(".terminal .tl").innerHTML = done + `<div>${cur.slice(0, n)}<span class="cur">▮</span></div>`;
    if (n >= cur.length) {
      t.shown++;
      t.chars = -8; // a beat between lines
      if (t.shown >= t.lines.length) this.finishTerminal();
    }
  }

  contracts(open: boolean, html: string): void {
    const el = this.q(".contracts");
    el.hidden = !open;
    if (open) el.innerHTML = html;
  }

  /** a full-screen card (contract closed / failed / ending); seconds 0 = until the next card or contracts */
  private cardTimer = 0;
  card(title: string, lines: string[], color: "am" | "mg" | "ye" | "cy", seconds: number): void {
    const el = this.q(".card");
    el.hidden = false;
    el.className = `card ${color}`;
    this.q(".card .ct").textContent = title;
    this.q(".card .cl").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
    this.cardTimer = seconds;
  }
  cardClose(): void {
    this.q(".card").hidden = true;
  }
  get cardOpen(): boolean {
    return !this.q(".card").hidden;
  }

  /**
   * Hold the flash panels open. The dossier shows for 1.2 s, the Debt banner for 3.5 — of the HUD's
   * own clock, which on a machine that draws quickly is that many seconds of wall time. A probe
   * reaching in from outside spends 50 to 200 ms per round trip, so photographing one of them is a
   * race it keeps losing. Held, the panel stays up until the probe lets go: the panel and its text
   * are the real ones, only their expiry waits (Stage 72).
   */
  setFlashHold(on: boolean): void {
    this.flashHold = on;
  }

  private flashHold = false;
  /** how many times each flash panel has been raised, so a check cannot miss one between polls */
  readonly raised = { dossier: 0, debt: 0, rite: 0, card: 0 };

  private tickRituals(rawDt: number): void {
    const dt = this.flashHold ? 0 : rawDt;
    this.tickTerminal(rawDt);
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.cardClose();
    }
    if (this.dossierTimer > 0) {
      this.dossierTimer -= dt;
      if (this.dossierTimer <= 0) this.q(".dossier").hidden = true;
    }
    if (this.debtTimer > 0) {
      this.debtTimer -= dt;
      if (this.debtTimer <= 0) this.q(".debt").classList.remove("on");
    }
    if (this.riteTimer > 0) {
      this.riteTimer -= dt;
      if (this.riteTimer <= 0) this.q(".rite").hidden = true;
    }
    const r = this.receiptState;
    if (r.open && !r.stamped) {
      r.timer -= dt;
      if (r.timer <= 0) {
        if (r.printed < r.lines.length) {
          const line = r.lines[r.printed++]!;
          this.q(".receipt .rl").innerHTML += `<div>${line}</div>`;
          this.onPrint?.();
          r.timer = 0.32;
        } else {
          r.stamped = true;
          this.q(".receipt").classList.add("stamped");
          this.q(".receipt .rst").textContent = "SETTLED · VANTAGE CLEARING HOUSE";
          this.onStamp?.();
        }
      }
    }
  }

  update(p: PlayerState, speed: number, fps: number, tickHz: number, dummies: readonly Dummy[], dt = 1 / 60): void {
    this.tickRituals(dt);
    this.q(".hpbar").style.width = `${(100 * Math.max(0, p.health)) / Math.max(1, p.maxHealth)}%`;
    this.q(".shbar").style.width = p.maxShield > 0 ? `${(100 * Math.max(0, p.shield)) / p.maxShield}%` : "0%";
    const def = weaponDefOf(p);
    const ammo = p.weapon.ammo[p.weapon.slot] ?? 0;
    this.q(".ammobar").style.width = def.magSize ? `${(100 * ammo) / def.magSize}%` : "100%";
    this.q(".ammon").textContent = def.magSize === 0 ? "∞" : p.weapon.reloadTimer > 0 ? (p.weapon.reloadSeated ? String(ammo) : "--") : String(ammo);
    this.q(".mag").textContent = def.magSize === 0 ? "∞" : String(def.magSize);
    this.q(".wname").textContent = def.name + (p.weapon.altActive ? (def.alt.kind === "slug" ? " · CHOKED" : def.alt.kind === "ads" ? " · OPTIC" : " · BRACED") : "") + (p.weapon.charging ? ` · CHARGE ${Math.round(p.weapon.charge * 100)}%` : "");
    if (this.rackKey !== p.weapon.slot + ":" + p.weapon.ammo.join(",")) {
      this.rackKey = p.weapon.slot + ":" + p.weapon.ammo.join(",");
      this.q(".rack").innerHTML = WEAPON_LIST.map((w) => `<span class="${w.slot === p.weapon.slot ? "on" : ""}">${w.slot} ${w.name.split(" ")[0]}<i>${w.magSize ? p.weapon.ammo[w.slot] : "∞"}</i></span>`).join("");
    }
    const nk = p.weapon.grenadeSel + ":" + p.weapon.grenades.join(",");
    if (this.nadeKey !== nk) {
      this.nadeKey = nk;
      this.q(".nades").innerHTML = GRENADE_LIST.map((g, i) => `<span class="${i === p.weapon.grenadeSel ? "on" : ""}">${g.name} <i>${p.weapon.grenades[i]}</i></span>`).join("");
    }
    this.q(".stun").classList.toggle("on", p.weapon.stunTimer > 0);
    const emp = this.q(".emp");
    emp.classList.toggle("on", p.weapon.empTimer > 0);
    if (p.weapon.empTimer > 0) emp.style.opacity = String(Math.min(1, p.weapon.empTimer));
    this.q(".vel").textContent = `${speed.toFixed(1)} m/s`;
    this.q(".stance").textContent = p.stance.toUpperCase();
    const kills = document.querySelector("#hud .kills");
    if (kills) kills.textContent = String(Math.min(5, p.stats.kills)); // the strip is replaced by a contract's objective line
    this.q(".perf").textContent = `${fps.toFixed(0)} FPS · SIM ${tickHz.toFixed(0)} Hz`;
    this.drawRadar(p, dummies);
    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) this.q(".alert").classList.remove("on");
    }
    if (this.flagTimer > 0) {
      this.flagTimer -= dt;
      if (this.flagTimer <= 0) this.q(".flag").classList.remove("on");
    }
  }

  private nodeKey = "";

  /** Wake strip under the mission title: phase, timer, scores, and a hex per node. */
  wake(w: { phase: string; timeLeft: number; score: [number, number, number]; kernelIn: number | null; nodes: { id: number; label: string; owner: number; hold: number; contested: boolean; puller: number }[] }, myTeam: number): void {
    const mm = Math.floor(Math.max(0, w.timeLeft) / 60);
    const ss = Math.floor(Math.max(0, w.timeLeft) % 60);
    const t = `${mm}:${String(ss).padStart(2, "0")}`;
    const title = w.phase === "warmup" ? `◈ WARM-UP — WAKE IN ${t}` : w.phase === "results" ? `◈ ROUND OVER — ${w.score[1] > w.score[2] ? "CELL ONE" : w.score[2] > w.score[1] ? "CELL TWO" : "NO ONE"} WOKE ${this.zone}` : `◈ THE WAKE — ${t}`;
    this.q(".mtitle").textContent = title;
    // and when VANTAGE next brakes the wake (Stage 87): it takes half the hold off the weakest node
    // on a fixed cadence, and until now the game only said so afterwards
    const k = w.kernelIn;
    const kernel = k === null ? "" : ` · <span style="color:${k <= 10 ? "var(--am)" : "var(--violet, #8f4dff)"}">KERNEL ${Math.floor(k / 60)}:${String(Math.floor(k % 60)).padStart(2, "0")}${k <= 10 ? " ▲" : ""}</span>`;
    this.q(".mscore").innerHTML = `<span style="color:var(--gr)">CELL ONE ${Math.floor(w.score[1])}</span> · <span style="color:var(--cy)">CELL TWO ${Math.floor(w.score[2])}</span>${myTeam ? ` · YOU: ${myTeam === 1 ? "ONE" : "TWO"}` : ""}${kernel}`;
    const key = w.nodes.map((n) => `${n.owner}${n.contested ? "c" : ""}${n.puller}${Math.round(n.hold * 10)}`).join("");
    if (key !== this.nodeKey) {
      this.nodeKey = key;
      this.q(".nodes").innerHTML = w.nodes
        .map((n) => {
          const cls = n.contested ? "am" : n.owner === 1 ? "gr" : n.owner === 2 ? "cy" : "vi";
          const pull = n.puller && n.puller !== n.owner ? `<i style="width:${Math.round((1 - n.hold) * 100)}%"></i>` : n.owner ? `<i style="width:${Math.round(n.hold * 100)}%"></i>` : "";
          return `<span class="hex ${cls}">${n.label}${pull}</span>`;
        })
        .join("");
    }
  }

  /**
   * The node under your feet (Stage 85): the wake strip says who holds all eight; this says what is
   * happening to the one you are standing on, and how long it has left at the rate it is moving.
   */
  nodeFoot(r: NodeReadout | null, myTeam: number): void {
    const el = this.q(".nodefoot");
    if (!r) {
      if (!el.hidden) el.hidden = true;
      this.nodeFootKey = "";
      return;
    }
    const key = `${r.id}${r.owner}${r.puller}${r.contested ? "c" : ""}${r.on ? "o" : ""}${r.toward}${Math.round(r.hold * 50)}${Math.round(r.seconds * 2)}`;
    if (key === this.nodeFootKey) return;
    this.nodeFootKey = key;
    el.hidden = false;
    const cell = (t: number) => (t === 1 ? "CELL ONE" : t === 2 ? "CELL TWO" : "VANTAGE");
    const mine = r.puller && r.puller === myTeam;
    const who = r.contested ? "CONTESTED" : r.toward === "still" ? (r.on ? "PULL IT" : "NOBODY IS PULLING") : `${cell(r.puller || r.owner)} ${r.toward === "flip" ? "PULLING" : "SETTLING"}`;
    const clock = r.toward === "flip" || r.toward === "hold" ? ` · ${r.toward === "flip" ? "FLIP" : "LOCK"} IN ${r.seconds.toFixed(1)}s` : "";
    const tone = r.contested ? "am" : mine ? "gr" : r.puller ? "mg" : "cy";
    el.className = `p nodefoot ${tone}`;
    el.innerHTML = `<b>NODE ${r.label}</b> · ${cell(r.owner)} <span class="hold"><i style="width:${Math.round(r.hold * 100)}%"></i></span> ${who}${clock}${r.on ? "" : ` · ${r.distance.toFixed(0)} m`}`;
  }
  private nodeFootKey = "";

  /** The repo mech has you in its light. */
  flagged(): void {
    this.q(".flag").classList.add("on");
    this.flagTimer = 0.4;
  }

  /** the nodes the map draws, handed in by the game while a wake round is on (Stage 88) */
  setRadarNodes(nodes: readonly RadarNode[]): void {
    this.radarNodes = nodes;
  }
  private radarNodes: readonly RadarNode[] = [];

  private drawRadar(p: PlayerState, dummies: readonly Dummy[]): void {
    const g = this.radar;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(53,242,255,0.08)";
    for (let x = 0; x < w; x += 9) g.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 9) g.fillRect(0, y, w, 1);
    const scale = w / (this.bounds * 2 + 6);
    const cx = w / 2;
    const cy = h / 2;
    // the nodes first, under everything else: the mode's whole geography, which the map has never
    // drawn (Stage 88). A node off the map is pinned to the rim, because that is the one you need
    for (const m of nodeMarks(this.radarNodes, p.pos, p.yaw, scale, w, h)) {
      g.fillStyle = nodeColour(m);
      const r = m.edge ? 1.5 : 3;
      g.beginPath();
      g.arc(m.x, m.y, r, 0, Math.PI * 2);
      g.fill();
      if (!m.edge) {
        g.fillStyle = "rgba(4,6,10,0.85)";
        g.fillRect(m.x - 2, m.y - 2, 4, 4);
        g.fillStyle = nodeColour(m);
        g.font = "7px monospace";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(m.label, m.x, m.y + 0.5);
      }
      if (m.puller && !m.contested) {
        g.strokeStyle = nodeColour(m);
        g.lineWidth = 1;
        g.beginPath();
        g.arc(m.x, m.y, r + 2.5, 0, Math.PI * 2);
        g.stroke();
      }
    }
    for (const d of dummies) {
      if (!d.alive) continue;
      const m = toMap(d.pos.x - p.pos.x, d.pos.z - p.pos.z, p.yaw, scale, w, h);
      if (m.x < 1 || m.x >= w - 1 || m.y < 1 || m.y >= h - 1) continue;
      g.fillStyle = "#ffb02e";
      g.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2);
    }
    g.fillStyle = "#37ff8b";
    g.fillRect(cx - 1, cy - 1, 3, 3);
    g.fillStyle = "rgba(55,255,139,0.5)";
    g.fillRect(cx, cy - 5, 1, 4);
  }

  alert(text: string, amber = false, seconds = 3): void {
    const a = this.q(".alert");
    a.textContent = text;
    a.classList.toggle("am", amber);
    a.classList.add("on");
    this.alertTimer = seconds;
  }

  flashHit(): void {
    const el = this.q(".hit");
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
  }

  killStamp(): void {
    this.ledgerLine++;
    const st = this.q(".stamp");
    st.textContent = `KILL CONFIRMED // LINE ${String(this.ledgerLine).padStart(4, "0")}`;
    st.classList.remove("on");
    void st.offsetWidth;
    st.classList.add("on");
    const tear = this.q(".tear");
    tear.classList.remove("on");
    void tear.offsetWidth;
    tear.classList.add("on");
  }

  push(line: string, cls = ""): void {
    this.lines.push(`<div class="${cls}">» ${line}</div>`);
    if (this.lines.length > 5) this.lines.shift();
    this.q(".log").innerHTML = this.lines.join("");
  }
}
