import type { PlayerState } from "@shared/sim/player";
import { ledgered, stampTitle } from "./kill";
import { weaponDefOf } from "@shared/sim/player";
import { GRENADE_LIST, WEAPON_LIST } from "@shared/weapons/manifest";
import type { Dummy } from "@shared/sim/world";
import type { FileView } from "../file";
import { LEVEL_INFO, type  LevelDef } from "@shared/sim/level";
import { HIT_MAX, type HitMark } from "./damage";
import { ammoRead, chargeRead } from "./ammo";
import { CONE_MIN_PX } from "./spread";
import { rackLabel } from "./rack";
import { motionWord } from "./stance";
import { keysLine, learn, NOTHING_SEEN, type Seen } from "./keys";
import { SPRINT_READ } from "./stance";
import { roundCard, type RoundStats } from "./round";
import type { TargetRead } from "./target";
import { pingMarks, type Ping } from "./ping";
import { THREAT_MAX, type ThreatMark } from "./threat";
import { ALL_GROUPS, quietFor } from "./quiet";
import { footTag, footTagText } from "./footline";
import { alertTop, FLAG_GAP, flagTop, footRow, frameSeat, logClears, logLines, missionRow, nodeFootTop, phoneRowTop, rightBandWidth, stackShift, STATUS_GAP, STATUS_MIN, statusHead, statusLineFit, statusWidth } from "./layout";
import { terminalFooter, terminalSeat } from "./terminal";
import { closeHint, openHint } from "./keyhint";
import { linkLabel, linkTone, roomLabel } from "./room";
import type { NodeReadout } from "./node";
import { nodeColour, nodeMarks, spotMarks, SPOT_COLOURS, toMap, type RadarNode, type RadarSpot, mapFooter, mapFoot, mapFootText, MAP_FOOT_FORMS } from "./radar";

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
  private ammoState = "";
  private chargeOn = false;

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

  /**
   * A live charge near the file (Stage 93): an arrow at its bearing, brighter and closer in as the
   * blast owns more of the ground you are standing on, and amber until you are inside it.
   */
  setThreats(marks: readonly ThreatMark[]): void {
    const arrows = this.threatArrows;
    for (let i = 0; i < arrows.length; i++) {
      const m = marks[i];
      const a = arrows[i]!;
      if (!m) {
        if (a.style.opacity !== "0") a.style.opacity = "0";
        continue;
      }
      a.style.transform = `rotate(${m.bearing}rad) translateY(${-80 + m.urgency * 26}px)`;
      a.style.opacity = String(0.45 + m.urgency * 0.55);
      a.classList.toggle("in", m.inside);
    }
  }
  private readonly threatArrows: HTMLElement[] = [];

  /** the HUD root: state classes (`touch`, `safe`, the `q-` groups) live on it */
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="scan"></div>
      <div class="xh"><i></i><b class="rl"></b><u class="sp"></u><div class="tg"></div></div>
      <div class="hit"></div>
      <div class="dmg">${"<i></i>".repeat(HIT_MAX)}</div>
      <div class="thr">${"<i></i>".repeat(THREAT_MAX)}</div>
      <div class="stamp">KILL CONFIRMED</div>
      <div class="tear"></div>

      <div class="p status">
        <div class="line"><span class="glyph"></span>▲ <span class="handle">BLANK</span><span class="moniker"></span><span class="where"> · <span class="dim">DRAINAGE YARD</span><span class="house"> (MAGENTA)</span></span><span class="room"> · OFFLINE</span></div>
        <div class="line dim">LV <span class="depth">01</span><span class="xpseg"> · XP <span class="xp">0/100</span></span> · ¢ <span class="scrip">0</span> · ◆ <span class="wake">0</span></div>
        <div class="bars">
          <div class="bar cy shield"><i class="shbar" style="width:100%"></i></div>
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

      <div class="p cy map"><div class="t">AREA MAP</div><canvas width="54" height="42"></canvas><div class="f"></div></div>
      <div class="side"><div><span class="k">▸</span> <span class="roomband">OFFLINE</span><span class="linkms"></span></div><div class="perf"></div></div>

      <div class="log"></div>
      <div class="p cy travel" hidden><div class="t">▲ NEO-CHINA · DISTRICT SELECT <span class="x" data-travel="close"></span></div><div class="list"></div><div class="f">travel reloads the client; online, the room decides the district</div></div>
      <div class="p mg prompt">▲ CLICK TO WAKE · <span style="color:var(--cy)">WASD</span> MOVE · <span style="color:var(--cy)">SHIFT</span> SPRINT · <span style="color:var(--cy)">CTRL</span> SLIDE · <span style="color:var(--cy)">SPACE</span> JUMP</div>
      <div class="p mg prompt-touch">▲ TAP TO WAKE · <span style="color:var(--cy)">LEFT</span> STICK MOVES · PUSH TO <span style="color:var(--cy)">SPRINT</span> · <span style="color:var(--cy)">RIGHT</span> DRAG AIMS</div>

      <div class="ammo"><div class="w wname">LEASE-BREAKER</div><div class="big"><span class="ammon">30</span> <span class="w">/ <span class="mag">30</span></span></div><div class="hint">▼ RELOAD [R]</div><div class="rack"></div><div class="nades"></div></div>
      <div class="overlay flag">▲ FLAGGED — VANTAGE SEARCHLIGHT</div>
      <div class="overlay stun">STUNNED</div>
      <div class="emp"></div>

      <div class="bottom">
        <div class="slots"><div class="slot on">╪</div><div class="slot">▦</div><div class="slot">▦</div><div class="slot mg">◈</div></div>
        <div class="center"><b class="fileno">#—</b> · <span class="filenm">BLANK</span> · <span class="vel">0.0 m/s</span> · <span class="stance">STAND</span></div>
        <div class="tabs"><div class="tab">FILE<span class="n">·</span></div><div class="tab">GRAPH<span class="n">·</span></div><div class="tab">MAP<span class="n">·</span></div><div class="tab">MARKET<span class="n">·</span></div><div class="tab">CONTRACTS<span class="n">·</span></div></div>
      </div>
      <div class="keys">WASD · HOLD CLICK fire · R reload · SPACE jump · CTRL slide · SHIFT sprint</div>
    `;
    this.q = (s) => root.querySelector(s) as HTMLElement;
    this.radar = (root.querySelector(".map canvas") as HTMLCanvasElement).getContext("2d")!;
    this.dmgWedges.push(...Array.from(root.querySelectorAll<HTMLElement>(".dmg i")));
    this.threatArrows.push(...Array.from(root.querySelectorAll<HTMLElement>(".thr i")));
  }

  /** Zone label, mission title, radar scale, and the MAP tab's district list. */
  setLevel(level: LevelDef, onTravel: (id: string) => void): void {
    this.bounds = level.bounds ?? 32;
    this.zone = (level.displayName ?? level.name.replace(/_/g, " ")).toUpperCase();
    const cast = (level.district ?? "magenta").toUpperCase();
    this.q(".status .dim").textContent = this.zone;
    this.q(".status .house").textContent = ` (${cast})`;
    this.q(".mtitle").textContent = `◈ THE WAKE — ${this.zone}`;
    const kills = this.q(".mline");
    if (kills) kills.style.display = level.dummies.length ? "" : "none";
    const list = this.q(".travel .list");
    const rows = LEVEL_INFO;
    list.innerHTML = rows.map((r) => `<div class="row ${r.id === level.name ? "on" : ""} ${r.cast}" data-travel="${r.id}">${r.id === level.name ? "▣" : "▢"} ${r.displayName} <span class="cast">${r.cast.toUpperCase()}</span></div>`).join("");
    const panel = this.q(".travel");
    // Stage 145: the close marker names the key, or the gesture on a phone
    const travelX = panel.querySelector('[data-travel="close"]');
    if (travelX) travelX.textContent = closeHint("M", this.touch);
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

  /**
   * How many files are in the room, said the same way in both places that say it (Stage 149): the
   * file's header line and the right-hand band. Written only when the label changes.
   */
  setRoom(linked: boolean, files: number, rttMs = 0): void {
    const label = roomLabel(linked, files);
    if (label !== this.roomText) {
      this.roomText = label;
      this.q(".status .room").textContent = ` · ${label}`;
      this.q(".side .roomband").textContent = label;
    }
    // and what the link costs, which the client has always measured and never said (Stage 154)
    const ms = linkLabel(linked, rttMs);
    if (ms === this.linkText) return;
    this.linkText = ms;
    const el = this.q(".side .linkms");
    el.textContent = ms ? ` · ${ms}` : "";
    el.className = `linkms ${ms ? linkTone(rttMs) : ""}`.trim();
  }
  private roomText = "";
  private linkText = "";

  /** The local file's identity in the status line: glyph, what the city calls you, and the moniker. */
  setIdentity(glyphSvg: string, display: string, moniker: string | null, chapter: number): void {
    this.q(".glyph").innerHTML = glyphSvg;
    this.q(".handle").textContent = display;
    this.display = display; // the foot line under the crosshair says the same name (Stage 157)
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
    const bar = v.inSafe && v.carried > 0 ? `<span class="bar"><i style="width:${Math.round(v.banking * 100)}%"></i></span> BANKING` : v.inSafe ? `SAFE ZONE · <span class="zone">${openHint("TAB", "MARKET", this.touch)}</span>` : `<span class="pvp">PVP ZONE</span>`;
    el.innerHTML = `◈ CARRYING <b>${v.carried}</b> · BANKED <b>${v.banked}</b> · TODAY ${v.today}/${v.cap} · OWED <b>${v.owed}</b> UNITS · ${v.zone ? `<span class="zone">${v.zone}</span> ` : ""}${bar} · ${v.claims} CLAIMS OUT`;
  }

  /**
   * What my last round did to a VANTAGE body (Stage 103): its name, its health as blocks and a
   * fraction, under the reticle while the read holds. Null takes it down.
   */
  setTarget(r: TargetRead | null): void {
    const el = this.q(".xh .tg");
    const key = r ? `${r.label}|${r.blocks}|${Math.round(r.frac * 100)}` : "";
    if (key === this.targetKey) return;
    this.targetKey = key;
    el.classList.toggle("on", !!r);
    el.innerHTML = r ? `<b>${r.label}</b> <s>${r.blocks}</s> <em>${Math.round(r.frac * 100)}%</em>` : "";
  }
  private targetKey = "";

  /**
   * The cone the next round leaves in, as a ring around the reticle (Stage 108): `radiusPx` from
   * the pure rule, or anything under the drawing floor to take it down.
   */
  setSpread(radiusPx: number): void {
    const on = radiusPx >= CONE_MIN_PX;
    const r = on ? Math.round(radiusPx * 2) / 2 : 0;
    if (on === this.coneOn && r === this.coneR) return;
    this.coneOn = on;
    this.coneR = r;
    this.q(".xh").classList.toggle("cone", on);
    const ring = this.q(".xh .sp");
    ring.style.width = `${r * 2}px`;
    ring.style.height = `${r * 2}px`;
  }
  private coneOn = false;
  private coneR = 0;
  /** the HUD's own height in CSS px, for anything that projects an angle onto the screen */
  get viewHeight(): number {
    return this.root.clientHeight;
  }

  /** The shield bar says it is broken (Stage 102): a magenta frame on the bar until the shield is back. */
  setShieldBroken(broken: boolean): void {
    if (broken === this.shieldBroken) return;
    this.shieldBroken = broken;
    this.q(".bar.shield").classList.toggle("broken", broken);
  }
  private shieldBroken = false;

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
    this.q(".terminal .tf").textContent = terminalFooter(!!choices, this.root.classList.contains("touch"));
    this.applyQuiet();
  }

  /**
   * A tap or a click on the terminal (Stage 138): on a choice row, that choice's index; anywhere
   * else on it, −1, which reads on. The campaign wires this beside its keys.
   */
  onTerminalTap(fn: (choice: number) => void): void {
    this.q(".terminal").addEventListener("click", (e) => {
      const row = (e.target as HTMLElement).closest(".ch");
      const rows = [...this.q(".terminal .tc").children];
      fn(row ? rows.indexOf(row) : -1);
      e.preventDefault();
    });
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
    this.applyQuiet();
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
    this.applyQuiet();
  }

  /**
   * The chrome stays out of the play (Stage 97). The rack and its ammo may take the right band of
   * the screen and no more, so at 960 px the eight slots wrap into two rows on the right instead of
   * running across the file's own body; and the alert sits under wherever the mission panel
   * actually ends, not at a fixed height it was overlapping in every contract. Measured each frame
   * — one rectangle read — because the panel's height changes with what it says.
   */
  private layout(): void {
    const w = this.root.clientWidth;
    if (w > 0) this.q(".ammo").style.maxWidth = `${rightBandWidth(w, 14)}px`;
    const rootBox = this.root.getBoundingClientRect();
    const rootTop = rootBox.top;
    const mission = this.q(".mission");
    // the mission panel has a ceiling (Stage 110): centred, it may grow until it would meet the
    // status panel at its floor on the left or the map on the right; past that its lines wrap
    let below = false;
    if (w > 0) {
      const status0 = this.q(".status");
      const frame0 = status0.offsetWidth - status0.clientWidth + (status0.clientWidth - (parseFloat(getComputedStyle(status0).width) || status0.clientWidth));
      const map = this.q(".map").getBoundingClientRect();
      // and where the band cannot hold it beside the status panel at all (Stage 111), the panel
      // takes a second row under the status panel, bounded by the map alone
      const row = missionRow(w, status0.offsetLeft + STATUS_MIN + frame0, map.left - rootBox.left, status0.offsetLeft);
      below = row.row === "below";
      const cap = `${row.maxWidth}px`;
      if (mission.style.maxWidth !== cap) mission.style.maxWidth = cap;
      const top = below ? `${Math.ceil(status0.getBoundingClientRect().bottom - rootTop) + STATUS_GAP}px` : "";
      if (mission.style.top !== top) mission.style.top = top;
    }
    const panel = mission.getBoundingClientRect();
    this.missionBottom = panel.bottom - rootTop;
    this.stackUnder = null;
    // on the phone the node line, the warning and the alert stack under the slot-and-tab row, or
    // under the touch legend, which sits under the row while it is up (Stage 139)
    if (this.root.classList.contains("touch")) {
      // the row itself sits under the mission panel when the panel reaches lower than the row's
      // own seat (Stage 140): the wake's panel had ended over the tab strip
      const rowEl = this.q(".bottom");
      if (this.phoneRowBase === null) this.phoneRowBase = rowEl.getBoundingClientRect().top - rootTop;
      const rowSeat = `${phoneRowTop(this.phoneRowBase, mission.offsetParent !== null && panel.width > 0 ? this.missionBottom : null)}px`;
      if (rowEl.style.top !== rowSeat) rowEl.style.top = rowSeat;
      const rowBottom = rowEl.getBoundingClientRect().bottom - rootTop;
      const legend = this.q(".prompt-touch");
      const lc = getComputedStyle(legend);
      const legendShown = lc.display !== "none" && lc.visibility !== "hidden" && Number(lc.opacity) > 0.05;
      let under = rowBottom;
      if (legendShown) {
        const seat = `${Math.ceil(rowBottom) + FLAG_GAP}px`;
        if (legend.style.top !== seat) legend.style.top = seat;
        under = legend.getBoundingClientRect().bottom - rootTop;
      }
      this.stackShift = stackShift(under);
      // what the alert has above it on this device that the stack's top does not describe
      // (Stage 147): the row, or the legend under it
      this.stackUnder = under;
    }
    this.placeFlag();
    // the foot line between the slots and the tab strip, or above the row when they leave it no
    // room (Stage 118): the room is measured with the line out of the row so it cannot change it
    // the phone lays that row out itself, at the top left and wrapping, and seats the line in it
    // (Stage 132): the rule is the desktop's
    const center = this.q(".center");
    const slots = this.q(".slots").getBoundingClientRect();
    const tabs = this.q(".tabs").getBoundingClientRect();
    const above = !this.root.classList.contains("touch") && footRow(tabs.left - slots.right, center.scrollWidth) === "above";
    if (center.classList.contains("above") !== above) center.classList.toggle("above", above);
    // the reader frames — the ledger book, its graph, the contracts desk — begin under the file's
    // header rather than over it (Stage 119)
    // and end above the bottom row (Stage 136): its top, or the foot line's when the line is
    // lifted above the row; the phone lays its row out at the top left and passes none
    const rowTop = this.root.classList.contains("touch") ? null : Math.min(this.q(".bottom").getBoundingClientRect().top, above ? center.getBoundingClientRect().top : Infinity) - rootTop;
    const seat = frameSeat(this.q(".status").getBoundingClientRect().bottom - rootTop, this.root.clientHeight, rowTop);
    // the phone lays the reader frames out edge to edge in its own stylesheet (Stage 137): the
    // desktop's seat, written inline, had shifted the book half a view off the screen
    // and on the phone the terminal is seated under the row and short of the right-hand pads
    // (Stage 138), instead of the desktop's place at the foot of the screen
    if (this.root.classList.contains("touch")) {
      const term = this.q(".terminal");
      if (!term.hidden) {
        const rowBottom = this.q(".bottom").getBoundingClientRect().bottom - rootTop;
        const vw = this.root.clientWidth;
        let padsLeft: number | null = null;
        let leftPadsRight: number | null = null;
        for (const b of this.root.querySelectorAll<HTMLElement>(".thumbs .tc-b")) {
          const r = b.getBoundingClientRect();
          if (r.width === 0) continue;
          if ((r.left + r.right) / 2 > vw / 2) {
            if (padsLeft === null || r.left < padsLeft) padsLeft = r.left;
          } else if (leftPadsRight === null || r.right > leftPadsRight) leftPadsRight = r.right;
        }
        const seat = terminalSeat(rowBottom, leftPadsRight, padsLeft, vw, this.root.clientHeight);
        const top = `${seat.top}px`;
        if (term.style.top !== top) term.style.top = top;
        const left = `${seat.left}px`;
        if (term.style.left !== left) term.style.left = left;
        const right = `${seat.right}px`;
        if (term.style.right !== right) term.style.right = right;
        const max = `${seat.maxHeight}px`;
        if (term.style.maxHeight !== max) term.style.maxHeight = max;
      }
    }
    for (const sel of this.root.classList.contains("touch") ? [] : [".file", ".graph", ".contracts"]) {
      const frame = this.q(sel);
      const top = `${seat.top}px`;
      if (frame.style.top !== top) {
        frame.style.top = top;
        frame.style.maxHeight = `${seat.maxHeight}px`;
        frame.style.transform = "translateX(-50%)";
      } else if (frame.style.maxHeight !== `${seat.maxHeight}px`) frame.style.maxHeight = `${seat.maxHeight}px`;
    }
    // and the status panel ends before the mission panel begins (Stage 107): its content width
    // follows the panel's measured left edge; a hidden panel is nothing to keep clear of
    const status = this.q(".status");
    const frame = status.offsetWidth - status.clientWidth + (status.clientWidth - (parseFloat(getComputedStyle(status).width) || status.clientWidth));
    const inPlay = mission.offsetParent !== null && panel.width > 0 && !below;
    const want = statusWidth(inPlay ? panel.left - rootBox.left : null, status.offsetLeft, frame);
    const px = `${want}px`;
    if (status.style.width !== px) status.style.width = px;
    // Stage 135: at the panel's floor the second line lost its scrip to the ellipsis. Where the full
    // line will not fit its box the XP into the depth goes and the money stays; the full line is
    // measured only when its text changes, and only while the panel is drawn
    const l2 = status.querySelector(".line.dim") as HTMLElement;
    const text = l2.textContent ?? "";
    if (text !== this.line2Text && l2.clientWidth > 0) {
      status.classList.remove("tight");
      this.line2Text = text;
      this.line2Need = l2.scrollWidth;
    }
    status.classList.toggle("tight", statusLineFit(l2.clientWidth, this.line2Need) === "short");
    // Stage 150: and the header line above it sheds rather than cuts. What each form measures is
    // read once per change of what the line says, with the forms applied in turn; which form is
    // drawn is decided every pass, because the box moves with the window
    const l1 = status.querySelector(".line") as HTMLElement;
    const head = l1.textContent ?? "";
    if (head !== this.line1Text && l1.clientWidth > 0) {
      this.line1Text = head;
      const forms: ("head-1" | "head-2")[] = ["head-1", "head-2"];
      const had = forms.filter((f) => status.classList.contains(f));
      status.classList.remove("head-1", "head-2", "head-3");
      this.line1Full = l1.scrollWidth;
      status.classList.add("head-1");
      this.line1NoRoom = l1.scrollWidth;
      status.classList.remove("head-1");
      status.classList.add("head-2");
      this.line1NoHouse = l1.scrollWidth;
      status.classList.remove("head-2");
      for (const f of had) status.classList.add(f);
    }
    const form = statusHead(l1.clientWidth, this.line1Full, this.line1NoRoom, this.line1NoHouse);
    status.classList.toggle("head-1", form === "no-room");
    status.classList.toggle("head-2", form === "no-house");
    status.classList.toggle("head-3", form === "name");
  }

  /**
   * A frame silences the chrome that has no business on it (Stage 95): one class per group on the
   * root, decided by the pure rule from which modals are open right now. Called on every open and
   * every close, the timed ones included, so the gun comes back the moment the frame goes.
   */
  /** the ledger book or its graph is up: both live inside the HUD root but are toggled from file.ts */
  private ledgerOpen(): boolean {
    const book = this.root.querySelector(".file") as HTMLElement | null;
    const graph = this.root.querySelector(".graph") as HTMLElement | null;
    return !!(book && !book.hidden) || !!(graph && !graph.hidden);
  }
  private ledgerWas = false;

  /** the file is closed and waiting to be re-leased (Stage 128) */
  private dead = false;
  /** how far the phone moves the node line, the warning and the alert down (Stage 139) */
  private stackShift = 0;
  /** the phone row's own seat, read once before the layout moves it (Stage 140) */
  private phoneRowBase: number | null = null;
  /** the status panel's second line as last measured in full, and what it needed (Stage 135) */
  private line2Text = "";
  private line2Need = 0;
  /** what the tutorial line has seen the file do (Stage 130) */
  private seen: Seen = NOTHING_SEEN;

  private applyQuiet(): void {
    const open = { desk: !this.q(".contracts").hidden, terminal: !this.q(".terminal").hidden, card: !this.q(".card").hidden, ledger: this.ledgerOpen(), dead: this.dead };
    const quiet = new Set(quietFor(open, this.root.classList.contains("touch")));
    for (const g of ALL_GROUPS) this.root.classList.toggle(`q-${g}`, quiet.has(g));
  }

  /** the touch build (Stage 145): the words the chrome uses for its controls follow the device */
  get touch(): boolean {
    return this.root.classList.contains("touch");
  }

  /** which chrome a frame has silenced, for the probe: the classes on the root that begin with `q-` */
  get quieted(): string[] {
    return [...this.root.classList].filter((c) => c.startsWith("q-")).map((c) => c.slice(2)).sort();
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
    this.applyQuiet();
  }
  cardClose(): void {
    this.q(".card").hidden = true;
    this.applyQuiet();
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
    // the tutorial teaches only what the file has not yet done (Stage 130), read from the sim's own
    // running totals rather than this frame's speed: it is folded on drawn frames, and a sprint
    // that peaks between two of them is still a sprint the file performed (Stage 164)
    const seen = learn(this.seen, { topSpeed: p.stats.topSpeed, sprintSpeed: SPRINT_READ, shots: p.stats.shots, reloading: p.weapon.reloadTimer > 0, jumps: p.stats.jumps, slides: p.stats.slides });
    if (seen.moved !== this.seen.moved || seen.fired !== this.seen.fired || seen.reloaded !== this.seen.reloaded || seen.jumped !== this.seen.jumped || seen.slid !== this.seen.slid || seen.sprinted !== this.seen.sprinted) {
      this.seen = seen;
      const line = keysLine(seen);
      const keys = this.q(".keys");
      keys.textContent = line;
      keys.hidden = line === "";
    }
    // a dead file has no gun (Stage 128): the gun's chrome goes with the file and comes back with it
    if (this.dead !== !p.alive) {
      this.dead = !p.alive;
      this.applyQuiet();
    }
    this.tickRituals(dt);
    this.radarClock += dt;
    // the ledger opens and closes outside this class (Stage 112): read it on the frame it changes
    const ledger = this.ledgerOpen();
    if (ledger !== this.ledgerWas) {
      this.ledgerWas = ledger;
      this.applyQuiet();
    }
    this.layout();
    this.q(".hpbar").style.width = `${(100 * Math.max(0, p.health)) / Math.max(1, p.maxHealth)}%`;
    this.q(".shbar").style.width = p.maxShield > 0 ? `${(100 * Math.max(0, p.shield)) / p.maxShield}%` : "0%";
    const def = weaponDefOf(p);
    const ammo = p.weapon.ammo[p.weapon.slot] ?? 0;
    this.q(".ammobar").style.width = def.magSize ? `${(100 * ammo) / def.magSize}%` : "100%";
    this.q(".ammon").textContent = def.magSize === 0 ? "∞" : p.weapon.reloadTimer > 0 ? (p.weapon.reloadSeated ? String(ammo) : "--") : String(ammo);
    this.q(".mag").textContent = def.magSize === 0 ? "∞" : String(def.magSize);
    // the magazine says where it is (Stage 100): amber on the last quarter, magenta and a prompt
    // when it is empty, and the reload as a ring on the reticle rather than a dash in the corner
    const read = ammoRead(ammo, def.magSize, p.weapon.reloadTimer, p.weapon.reloadTotal, p.weapon.reloadSeated);
    if (read.state !== this.ammoState) {
      this.ammoState = read.state;
      const box = this.q(".ammo");
      box.classList.toggle("low", read.state === "low");
      box.classList.toggle("empty", read.state === "empty");
      box.classList.toggle("reloading", read.state === "reloading");
      this.q(".xh").classList.toggle("reloading", read.state === "reloading");
    }
    if (read.state === "reloading") {
      const ring = this.q(".xh .rl");
      ring.style.setProperty("--p", read.reloadFrac.toFixed(3));
      ring.classList.toggle("seated", read.seated);
    }
    // and the LONGWAVE's charge on the same ring (Stage 106): the sim never charges and reloads at
    // once, so the ring is one or the other
    const ch = chargeRead(p.weapon.charging, p.weapon.charge);
    if (ch.on !== this.chargeOn) {
      this.chargeOn = ch.on;
      this.q(".xh").classList.toggle("charging", ch.on);
    }
    if (ch.on) {
      const ring = this.q(".xh .rl");
      ring.style.setProperty("--p", ch.frac.toFixed(3));
      ring.classList.toggle("full", ch.full);
    }
    this.q(".wname").textContent = def.name + (p.weapon.altActive ? (def.alt.kind === "slug" ? " · CHOKED" : def.alt.kind === "ads" ? " · OPTIC" : " · BRACED") : "") + (p.weapon.charging ? ` · CHARGE ${Math.round(p.weapon.charge * 100)}%` : "");
    if (this.rackKey !== p.weapon.slot + ":" + p.weapon.ammo.join(",")) {
      this.rackKey = p.weapon.slot + ":" + p.weapon.ammo.join(",");
      this.q(".rack").innerHTML = WEAPON_LIST.map((w) => `<span class="${w.slot === p.weapon.slot ? "on" : ""}">${w.slot} ${rackLabel(w.name)}<i>${w.magSize ? p.weapon.ammo[w.slot] : "∞"}</i></span>`).join("");
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
    this.q(".stance").textContent = motionWord(p.stance, p.grounded, speed);
    // and who the line is about (Stage 157): the number the room gave this file and the name the
    // header's handle carries, written when either changes rather than on every frame
    const tag = footTag(p.id, this.display);
    const tagText = footTagText(tag);
    if (tagText !== this.footText) {
      this.footText = tagText;
      this.q(".fileno").textContent = tag.num;
      this.q(".filenm").textContent = tag.name;
    }
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
      if (this.flagTimer <= 0) {
        this.q(".flag").classList.remove("on");
        this.placeFlag();
      }
    }
  }

  private nodeKey = "";

  /** Wake strip under the mission title: phase, timer, scores, and a hex per node. */
  private roundCardKey = "";
  private roundCardShown = false;

  wake(w: { phase: string; timeLeft: number; score: [number, number, number]; winner: number; kernelIn: number | null; nodes: { id: number; label: string; owner: number; hold: number; contested: boolean; puller: number }[] }, myTeam: number, stats: RoundStats): void {
    // the results phase is a card (Stage 121): shown while the phase lasts, re-rendered as the
    // countdown ticks, taken down by the warm-up
    // the receipt is the ledger's own frame and comes at the same moment online (Stage 125): while
    // it is open the card stays down, and it returns once the receipt is signed
    const round = this.receiptState.open ? null : roundCard(w, myTeam, this.zone, stats);
    if (round) {
      if (round.key !== this.roundCardKey) {
        this.roundCardKey = round.key;
        this.roundCardShown = true;
        this.card(round.title, round.lines, round.color, 0);
      }
    } else if (this.roundCardShown) {
      this.roundCardShown = false;
      this.roundCardKey = "";
      this.cardClose();
    }
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
      if (!el.hidden) {
        el.hidden = true;
        this.placeFlag();
      }
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
    this.placeFlag();
  }
  private nodeFootKey = "";

  /** what the header line says, and what each of its forms measures (Stage 150) */
  /** what the city calls this file, as the header's handle was last written with (Stage 157) */
  private display = "";
  private footText = "";
  /** what each of the footer's forms measured, at the distance last drawn (Stage 160) */
  private mapFootWidths: number[] = [];
  private line1Text = "";
  private line1Full = 0;
  private line1NoRoom = 0;
  private line1NoHouse = 0;

  /** the mission panel's measured bottom from the last layout pass, the alert's first anchor */
  private missionBottom = 0;
  /** the phone's row (or the legend under it), which the alert also hangs under (Stage 147) */
  private stackUnder: number | null = null;
  /** the bottom of the stack, from the last layout pass: the log's ceiling (Stage 148) */
  private stackBottom = 0;

  /**
   * The centred stack under the mission panel: the node line a gap under the panel's own measured
   * bottom (Stage 146), the searchlight warning under the node line, or at its seat when the line
   * is hidden (Stage 116), and the alert under whichever of the two ends lower, or under the
   * mission panel when neither is up (Stage 120).
   */
  private placeFlag(): void {
    const foot = this.q(".nodefoot");
    const rootTop = this.root.getBoundingClientRect().top;
    // the node line is the stack's own first row (Stage 146): a gap under the mission panel
    // wherever the panel reaches lower than its seat. On the phone the shift carries it under the
    // slot-and-tab row, which Stage 140 already seats under the panel, so the gap is a no-op there
    const footSeat = `${nodeFootTop(this.missionBottom > 0 ? this.missionBottom : null, this.stackShift)}px`;
    if (foot.style.top !== footSeat) foot.style.top = footSeat;
    const bottom = foot.hidden ? null : foot.getBoundingClientRect().bottom - rootTop;
    const top = `${flagTop(bottom, this.stackShift)}px`;
    const flag = this.q(".flag");
    if (flag.style.top !== top) flag.style.top = top;
    const flagBottom = flag.classList.contains("on") ? flag.getBoundingClientRect().bottom - rootTop : null;
    const stack = [bottom, flagBottom, this.stackUnder].filter((v): v is number => v !== null);
    const under = stack.length === 0 ? null : Math.max(...stack);
    const alertSeat = `${alertTop(this.missionBottom, under)}px`;
    const alert = this.q(".alert");
    if (alert.style.top !== alertSeat) alert.style.top = alertSeat;
    // where the stack ends, which is the ceiling the event log keeps under (Stage 148)
    this.stackBottom = alert.getBoundingClientRect().bottom - rootTop;
  }

  /** The repo mech has you in its light. */
  flagged(): void {
    this.q(".flag").classList.add("on");
    this.flagTimer = 0.4;
    this.placeFlag();
  }

  /** the nodes the map draws, handed in by the game while a wake round is on (Stage 88) */
  setRadarNodes(nodes: readonly RadarNode[]): void {
    this.radarNodes = nodes;
  }
  private radarNodes: readonly RadarNode[] = [];

  /**
   * Where the contract wants you (Stage 92). The campaign has put its marker, its escort and its
   * targets in the world since Stage 10 and the map has never drawn any of them.
   */
  /** Shots heard, for the map (Stage 104): the muzzle positions, fading over a second and a half. */
  setRadarPings(pings: readonly Ping[]): void {
    this.radarPings = pings;
  }
  private radarPings: readonly Ping[] = [];
  /** the map's own clock for fading pings: the frame times the HUD is given, summed */
  private radarClock = 0;
  get mapClock(): number {
    return this.radarClock;
  }

  setRadarSpots(spots: readonly RadarSpot[]): void {
    this.radarSpots = spots;
  }
  private radarSpots: readonly RadarSpot[] = [];

  private mapFoot = "";
  /** the metres the map spans, for the probe */
  get mapAcross(): number {
    return this.bounds * 2 + 6;
  }
  private drawRadar(p: PlayerState, dummies: readonly Dummy[]): void {
    const g = this.radar;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(53,242,255,0.08)";
    for (let x = 0; x < w; x += 9) g.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 9) g.fillRect(0, y, w, 1);
    const across = this.bounds * 2 + 6;
    const scale = w / across;
    // the footer from the same scale (Stage 129): what the map is, not a tap it never handled.
    // It sheds rather than being cut (Stage 160): the full form wants more than the box has ever
    // had, so each form is measured once per change of distance and the longest that fits is drawn
    const el = this.q(".map .f");
    const touch = this.root.classList.contains("touch");
    const want = mapFooter(across, touch);
    if (want !== this.mapFoot && el.clientWidth > 0) {
      this.mapFoot = want;
      this.mapFootWidths = MAP_FOOT_FORMS.map((f) => {
        el.textContent = mapFootText(across, f);
        return el.scrollWidth;
      });
    }
    const form = touch ? "wide" : mapFoot(el.clientWidth, this.mapFootWidths);
    const shown = mapFootText(across, form);
    if (el.textContent !== shown) el.textContent = shown;
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
    // every gun heard going off, where it went off (Stage 104): magenta for a file's, amber for a
    // wasp's, fading as the sound does, pinned to the rim when it was off the map
    for (const m of pingMarks(this.radarPings, p.pos, p.yaw, scale, w, h, this.radarClock)) {
      // a faded ping draws nothing: a floor here would leave a ghost dot for as long as the ping
      // was remembered, too faint for the probe's pixel read and not too faint for a player
      if (m.alpha <= 0) continue;
      g.globalAlpha = Math.min(1, m.alpha);
      g.fillStyle = m.kind === "wasp" ? "#ffb02e" : "#ff3ec9";
      g.beginPath();
      g.arc(m.x, m.y, m.edge ? 1.5 : 2.5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    // the contract over the top of everything, because it is the one thing the player is being told
    // to go to: a ring for the goal, a dot for the escort and each target, and an arrowless rim mark
    // for whatever is off the map (Stage 92)
    for (const m of spotMarks(this.radarSpots, p.pos, p.yaw, scale, w, h)) {
      g.strokeStyle = SPOT_COLOURS[m.kind];
      g.fillStyle = SPOT_COLOURS[m.kind];
      if (m.kind === "goal") {
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(m.x, m.y, m.edge ? 2.5 : 4.5, 0, Math.PI * 2);
        g.stroke();
        if (!m.edge) g.fillRect(m.x - 1, m.y - 1, 2, 2);
      } else {
        g.beginPath();
        g.arc(m.x, m.y, m.edge ? 1.5 : 2.5, 0, Math.PI * 2);
        g.fill();
      }
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

  /**
   * The receipt for a close (Stage 91). `kind` decides what it is called and whether it goes on the
   * ledger at all — a target in the range is not a closed file and never was — and `detail` is what
   * closed it, when this client can honestly say.
   */
  killStamp(kind = "player", detail = ""): void {
    const st = this.q(".stamp");
    const title = stampTitle(kind);
    if (ledgered(kind)) {
      this.ledgerLine++;
      st.innerHTML = `${title} // LINE ${String(this.ledgerLine).padStart(4, "0")}${detail ? `<i>${detail}</i>` : ""}`;
    } else {
      st.innerHTML = `${title}${detail ? `<i>${detail}</i>` : ""}`;
    }
    st.classList.toggle("range", !ledgered(kind));
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
    while (this.lines.length > logLines(this.root.classList.contains("touch"))) this.lines.shift();
    const log = this.q(".log");
    log.innerHTML = this.lines.join("");
    // every entry reads in full now (Stage 148), so a long one is two or three rows rather than a
    // cut one, and the log grows upward from its anchor with what it says. It drops its oldest
    // rather than climb over the stack above it
    const rootTop = this.root.getBoundingClientRect().top;
    const held = this.lines.slice();
    while (this.lines.length > 1 && !logClears(log.getBoundingClientRect().top - rootTop, this.stackBottom)) {
      this.lines.shift();
      log.innerHTML = this.lines.join("");
    }
    // and where even one entry cannot clear the stack (Stage 151) — a 270 px tall window, where
    // the log's own anchor is above the alert's seat and the two cross whatever the log says —
    // trimming loses lines for nothing, so the log keeps what the entry cap gave it
    if (!logClears(log.getBoundingClientRect().top - rootTop, this.stackBottom)) {
      this.lines = held;
      log.innerHTML = this.lines.join("");
    }
  }
}
