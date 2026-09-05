import type { PlayerState } from "@shared/sim/player";
import { LEASE_BREAKER, PLAYER_MAX_HEALTH } from "@shared/sim/constants";

/** Stage 1 HUD: CRT ledger chrome. Dry by default — no damage numbers, no hitmarker spam. */
export class Hud {
  private root: HTMLElement;
  private health: HTMLElement;
  private healthBar: HTMLElement;
  private ammo: HTMLElement;
  private speed: HTMLElement;
  private stance: HTMLElement;
  private weapon: HTMLElement;
  private stats: HTMLElement;
  private stamp: HTMLElement;
  private hit: HTMLElement;
  private log: HTMLElement;
  private hint: HTMLElement;
  private tear: HTMLElement;
  private lines: string[] = [];
  private ledgerLine = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="scan"></div>
      <div class="vig"></div>
      <div class="xh"><i></i></div>
      <div class="hit"></div>
      <div class="stamp">KILL CONFIRMED</div>
      <div class="tear"></div>
      <div class="panel tl"><span class="k">LETHE // DRAINAGE YARD</span><br><span class="k">FILE:</span> BLANK <span class="k">// DEPTH</span> 01</div>
      <div class="panel tr"><div class="stats"></div></div>
      <div class="log"></div>
      <div class="panel bl">
        <div class="row"><span class="k">INTEGRITY</span><span class="health big">100</span></div>
        <div class="bar"><i class="healthbar" style="width:100%"></i></div>
        <div class="row" style="margin-top:8px"><span class="k">VEL</span><span class="speed">0.0 m/s</span></div>
        <div class="row"><span class="k">STANCE</span><span class="stance">STAND</span></div>
      </div>
      <div class="panel br">
        <div class="weapon k">LEASE-BREAKER</div>
        <div class="ammo big">30 <span class="k" style="font-size:13px">/ 30</span></div>
      </div>
      <div class="hint">CLICK TO WAKE\nWASD MOVE · SHIFT SPRINT · SPACE JUMP · CTRL SLIDE · LMB FIRE · R RELOAD</div>
    `;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.health = q(".health");
    this.healthBar = q(".healthbar");
    this.ammo = q(".ammo");
    this.speed = q(".speed");
    this.stance = q(".stance");
    this.weapon = q(".weapon");
    this.stats = q(".stats");
    this.stamp = q(".stamp");
    this.hit = q(".hit");
    this.log = q(".log");
    this.hint = q(".hint");
    this.tear = q(".tear");
  }

  setLocked(locked: boolean): void {
    this.hint.classList.toggle("off", locked);
  }

  update(p: PlayerState, speed: number, fps: number, tickHz: number): void {
    this.health.textContent = String(Math.max(0, Math.round(p.health)));
    this.healthBar.style.width = `${(100 * Math.max(0, p.health)) / PLAYER_MAX_HEALTH}%`;
    this.ammo.innerHTML = p.reloadTimer > 0 ? `<span class="k">RELOADING</span>` : `${p.ammo} <span class="k" style="font-size:13px">/ ${LEASE_BREAKER.magSize}</span>`;
    this.speed.textContent = `${speed.toFixed(1)} m/s`;
    this.stance.textContent = p.stance.toUpperCase();
    this.weapon.textContent = LEASE_BREAKER.name;
    this.stats.textContent = `${fps.toFixed(0)} FPS · SIM ${tickHz.toFixed(0)} Hz · K ${p.stats.kills} · S ${p.stats.slides} · M ${p.stats.mantles}`;
  }

  flashHit(): void {
    this.hit.classList.remove("on");
    void this.hit.offsetWidth;
    this.hit.classList.add("on");
  }

  killStamp(): void {
    this.ledgerLine++;
    this.stamp.textContent = `KILL CONFIRMED // LINE ${String(this.ledgerLine).padStart(4, "0")}`;
    this.stamp.classList.remove("on");
    void this.stamp.offsetWidth;
    this.stamp.classList.add("on");
    this.tear.classList.remove("on");
    void this.tear.offsetWidth;
    this.tear.classList.add("on");
  }

  push(line: string, cls = ""): void {
    this.lines.push(`<div class="${cls}">${line}</div>`);
    if (this.lines.length > 6) this.lines.shift();
    this.log.innerHTML = this.lines.join("");
  }
}
