import type { PlayerState } from "@shared/sim/player";
import { weaponDefOf } from "@shared/sim/player";
import { GRENADE_LIST, WEAPON_LIST } from "@shared/weapons/manifest";
import type { Dummy } from "@shared/sim/world";
import type { FileView } from "../file";
import type { LevelDef } from "@shared/sim/level";
import { DISTRICT_SPECS } from "@shared/sim/city";

/** Terminal chrome matched to the reference clip. Dry by default: no damage numbers, no hitmarker spam. */
export class Hud {
  private q: (s: string) => HTMLElement;
  private lines: string[] = [];
  private ledgerLine = 0;
  private alertTimer = 0;
  private radar: CanvasRenderingContext2D;
  private locked = false;
  private rackKey = "";
  private nadeKey = "";
  private flagTimer = 0;
  private bounds = 32;
  private zone = "DRAINAGE YARD";

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="scan"></div>
      <div class="xh"><i></i></div>
      <div class="hit"></div>
      <div class="stamp">KILL CONFIRMED</div>
      <div class="tear"></div>

      <div class="p status">
        <div class="line">▲ <span class="handle">BLANK</span> · <span class="dim">DRAINAGE YARD (MAGENTA)</span> · <span class="online">1 online</span></div>
        <div class="line dim">LV <span class="depth">01</span> · XP <span class="xp">0/100</span> · ¢ <span class="scrip">0</span> · ◆ <span class="wake">0</span></div>
        <div class="bars">
          <div class="bar cy"><i class="shbar" style="width:100%"></i></div>
          <div class="bar gr"><i class="hpbar" style="width:100%"></i></div>
          <div class="bar ye"><i class="ammobar" style="width:100%"></i></div>
        </div>
      </div>

      <div class="p mg mission"><span class="mtitle">◈ THE WAKE — DRAINAGE YARD</span><div class="sub"><span class="mline">⌖ CONTRACT — DUMMIES <span class="kills">0</span>/5</span></div><div class="sub mscore"></div><div class="nodes"></div></div>
      <div class="alert"></div>

      <div class="p cy map"><div class="t">AREA MAP</div><canvas width="54" height="42"></canvas><div class="f">click to walk</div></div>
      <div class="side"><div><span class="k">▸</span> ONLINE (1)</div><div class="perf"></div></div>

      <div class="log"></div>
      <div class="p cy travel" hidden><div class="t">▲ LETHE · DISTRICT SELECT <span class="x" data-travel="close">[M] CLOSE</span></div><div class="list"></div><div class="f">travel reloads the client; online, the room decides the district</div></div>
      <div class="p mg prompt">▲ CLICK TO WAKE · <span style="color:var(--cy)">WASD</span> MOVE · <span style="color:var(--cy)">SHIFT</span> SPRINT · <span style="color:var(--cy)">CTRL</span> SLIDE · <span style="color:var(--cy)">SPACE</span> JUMP</div>

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
    const rows = [{ id: "drainage_yard", displayName: "DRAINAGE YARD (RANGE)", cast: "magenta" }, ...DISTRICT_SPECS.map((d) => ({ id: d.id, displayName: d.displayName, cast: d.cast }))];
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
    this.q(".handle").textContent = f.account.slice(0, 18).toUpperCase();
    const tab = this.q(".tabs .tab .n");
    if (tab) tab.textContent = f.legal ? "·" : "!";
    const graphTab = this.q(".tabs .tab:nth-child(2) .n");
    if (graphTab) graphTab.textContent = String(f.owned.filter((id) => !id.includes(":")).length);
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.q(".prompt").classList.toggle("off", locked);
  }

  update(p: PlayerState, speed: number, fps: number, tickHz: number, dummies: readonly Dummy[]): void {
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
    this.q(".kills").textContent = String(Math.min(5, p.stats.kills));
    this.q(".perf").textContent = `${fps.toFixed(0)} FPS · SIM ${tickHz.toFixed(0)} Hz`;
    this.drawRadar(p, dummies);
    if (this.alertTimer > 0) {
      this.alertTimer -= 1 / 60;
      if (this.alertTimer <= 0) this.q(".alert").classList.remove("on");
    }
    if (this.flagTimer > 0) {
      this.flagTimer -= 1 / 60;
      if (this.flagTimer <= 0) this.q(".flag").classList.remove("on");
    }
  }

  private nodeKey = "";

  /** Wake strip under the mission title: phase, timer, scores, and a hex per node. */
  wake(w: { phase: string; timeLeft: number; score: [number, number, number]; nodes: { id: number; label: string; owner: number; hold: number; contested: boolean; puller: number }[] }, myTeam: number): void {
    const mm = Math.floor(Math.max(0, w.timeLeft) / 60);
    const ss = Math.floor(Math.max(0, w.timeLeft) % 60);
    const t = `${mm}:${String(ss).padStart(2, "0")}`;
    const title = w.phase === "warmup" ? `◈ WARM-UP — WAKE IN ${t}` : w.phase === "results" ? `◈ ROUND OVER — ${w.score[1] > w.score[2] ? "CELL ONE" : w.score[2] > w.score[1] ? "CELL TWO" : "NO ONE"} WOKE ${this.zone}` : `◈ THE WAKE — ${t}`;
    this.q(".mtitle").textContent = title;
    this.q(".mscore").innerHTML = `<span style="color:var(--gr)">CELL ONE ${Math.floor(w.score[1])}</span> · <span style="color:var(--cy)">CELL TWO ${Math.floor(w.score[2])}</span>${myTeam ? ` · YOU: ${myTeam === 1 ? "ONE" : "TWO"}` : ""}`;
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

  /** The repo mech has you in its light. */
  flagged(): void {
    this.q(".flag").classList.add("on");
    this.flagTimer = 0.4;
  }

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
    const c = Math.cos(-p.yaw);
    const s = Math.sin(-p.yaw);
    for (const d of dummies) {
      if (!d.alive) continue;
      const dx = d.pos.x - p.pos.x;
      const dz = d.pos.z - p.pos.z;
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      const px = cx + rx * scale;
      const py = cy + rz * scale;
      if (px < 1 || px >= w - 1 || py < 1 || py >= h - 1) continue;
      g.fillStyle = "#ffb02e";
      g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
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
