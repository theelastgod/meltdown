import type { PlayerState } from "@shared/sim/player";
import { LEASE_BREAKER, PLAYER_MAX_HEALTH } from "@shared/sim/constants";
import type { Dummy } from "@shared/sim/world";

/** Terminal chrome matched to the reference clip. Dry by default: no damage numbers, no hitmarker spam. */
export class Hud {
  private q: (s: string) => HTMLElement;
  private lines: string[] = [];
  private ledgerLine = 0;
  private alertTimer = 0;
  private radar: CanvasRenderingContext2D;
  private locked = false;

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
          <div class="bar cy"><i class="xpbar" style="width:0%"></i></div>
          <div class="bar gr"><i class="hpbar" style="width:100%"></i></div>
          <div class="bar ye"><i class="ammobar" style="width:100%"></i></div>
        </div>
      </div>

      <div class="p mg mission">◈ THE WAKE — CLEAR THE YARD<div class="sub">⌖ CONTRACT — DUMMIES <span class="kills">0</span>/5</div></div>
      <div class="alert"></div>

      <div class="p cy map"><div class="t">AREA MAP</div><canvas width="54" height="42"></canvas><div class="f">click to walk</div></div>
      <div class="side"><div><span class="k">▸</span> ONLINE (1)</div><div class="perf"></div></div>

      <div class="log"></div>
      <div class="p mg prompt">▲ CLICK TO WAKE · <span style="color:var(--cy)">WASD</span> MOVE · <span style="color:var(--cy)">SHIFT</span> SPRINT · <span style="color:var(--cy)">CTRL</span> SLIDE · <span style="color:var(--cy)">SPACE</span> JUMP</div>

      <div class="ammo"><div class="w">LEASE-BREAKER</div><div class="big"><span class="ammon">30</span> <span class="w">/ 30</span></div></div>

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

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.q(".prompt").classList.toggle("off", locked);
  }

  update(p: PlayerState, speed: number, fps: number, tickHz: number, dummies: readonly Dummy[]): void {
    this.q(".hpbar").style.width = `${(100 * Math.max(0, p.health)) / PLAYER_MAX_HEALTH}%`;
    this.q(".ammobar").style.width = `${(100 * p.ammo) / LEASE_BREAKER.magSize}%`;
    this.q(".ammon").textContent = p.reloadTimer > 0 ? "--" : String(p.ammo);
    this.q(".vel").textContent = `${speed.toFixed(1)} m/s`;
    this.q(".stance").textContent = p.stance.toUpperCase();
    this.q(".kills").textContent = String(Math.min(5, p.stats.kills));
    this.q(".perf").textContent = `${fps.toFixed(0)} FPS · SIM ${tickHz.toFixed(0)} Hz`;
    this.drawRadar(p, dummies);
    if (this.alertTimer > 0) {
      this.alertTimer -= 1 / 60;
      if (this.alertTimer <= 0) this.q(".alert").classList.remove("on");
    }
  }

  private drawRadar(p: PlayerState, dummies: readonly Dummy[]): void {
    const g = this.radar;
    const w = g.canvas.width;
    const h = g.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(53,242,255,0.08)";
    for (let x = 0; x < w; x += 9) g.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 9) g.fillRect(0, y, w, 1);
    const scale = w / 70;
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
