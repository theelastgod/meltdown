/**
 * The WORLD MAP (Stage 705): the MAP tab (M) when the page is walking the city.
 *
 * Outside the city the MAP tab is what it always was, the district select (client/hud/hud.ts). In the
 * city it is the city: the five districts drawn where the gates put them (`worldMapLayout`, a real
 * window of the tiling), the joins between them, each district's count of files online, a pulsing
 * mark where a public event is running, and the district this page is in lit. Choosing a district
 * shows who is there, its event and its course records, where its gates lead, and TRAVEL — a trip to
 * that district's city room (`cityMapTravelUrl`: the same campaign host, behind the loading card),
 * never the old offline level travel.
 *
 * The counts come from the city's presence feed (GET /city, shared/city/presence.ts), read when the
 * map opens and every few seconds while it stays open, never while it is shut. The feed being down
 * costs the counts, not the map: the layout and TRAVEL work without it.
 *
 * DOM and CSS only: no canvas, no scene, no draw call.
 */
import { cityPresenceUrl, fetchPresence, type CityPresence, type DistrictPresence } from "@shared/city/presence";
import { gateSummary, worldMapLayout, type WorldMapLayout } from "@shared/city/worldmap";
import { cityMapTravelUrl, cityWsBase } from "@shared/net/citygates";
import { levelDisplayName } from "@shared/sim/level";
import { closeHint, crewButton, runButton } from "./hud/keyhint";
import { runPageUrl } from "./runpage";

/** how often an open map reads the feed again (ms): a little over the feed's own cache */
export const WORLD_MAP_POLL_MS = 3000;

export type WorldMapStatus = "loading" | "live" | "unreachable";

export interface WorldMapState {
  /** the district this page is walking */
  here: string;
  /** the district whose details are showing */
  selected: string;
  presence: CityPresence | null;
  status: WorldMapStatus;
  touch: boolean;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const SIDE_WORD: Record<string, string> = { n: "N", e: "E", s: "S", w: "W" };
const SIDE_MARK: Record<string, string> = { n: "▲", e: "▶", s: "▼", w: "◀" };

/** a district's count as the tile says it: a number when the feed answered, a dash when it did not */
export function tileCount(d: DistrictPresence | undefined, status: WorldMapStatus): string {
  if (!d || status !== "live") return "—";
  return `${d.players} ONLINE`;
}

/** The map's markup, from its state: pure, so the tests read what a player would. */
export function worldMapHtml(layout: WorldMapLayout, v: WorldMapState): string {
  const line = (id: string) => v.presence?.districts.find((d) => d.district === id);
  const cells: string[] = [];
  for (const t of layout.tiles) {
    const p = line(t.district);
    const ev = !!p?.event;
    const stubs = layout.stubs.filter((s) => s.district === t.district).map((s) => `<i class="ws ${s.side}" title="${esc(`${SIDE_WORD[s.side]} → ${levelDisplayName(s.to)}`)}">${SIDE_MARK[s.side]}</i>`).join("");
    cells.push(
      `<div class="wt ${t.cast}${t.district === v.here ? " here" : ""}${t.district === v.selected ? " sel" : ""}${ev ? " ev" : ""}" data-wm="${t.district}" style="grid-column:${t.x * 2 + 1};grid-row:${t.z * 2 + 1}">` +
        `<b class="nm">${esc(t.name)}</b><span class="ct">${tileCount(p, v.status)}</span>${t.district === v.here ? '<span class="you">YOU ARE HERE</span>' : ""}${ev ? '<i class="pulse" title="PUBLIC EVENT"></i>' : ""}${stubs}</div>`,
    );
  }
  for (const l of layout.links) {
    const a = layout.tiles.find((t) => t.district === l.a)!;
    const col = l.side === "e" ? a.x * 2 + 2 : a.x * 2 + 1;
    const row = l.side === "e" ? a.z * 2 + 1 : a.z * 2 + 2;
    cells.push(`<div class="wl ${l.side === "e" ? "h" : "v"}" data-link="${l.a}|${l.b}" style="grid-column:${col};grid-row:${row}"></div>`);
  }
  // tiles in the odd tracks, the joins in the narrow even ones between them
  const tracks = (n: number, cell: string, gap: string) => Array.from({ length: Math.max(1, n) }, () => cell).join(` ${gap} `);
  const grid = `<div class="wg" style="grid-template-columns:${tracks(layout.cols, "minmax(0,1fr)", "14px")};grid-template-rows:${tracks(layout.rows, "auto", "12px")}">${cells.join("")}</div>`;
  return `<div class="t">▲ THE CITY · WORLD MAP <span class="x" data-wm="close">${closeHint("M", v.touch)}</span></div>${grid}${worldMapDetails(v)}<div class="f">${statusLine(v)}</div>`;
}

/** what the foot of the map says about the feed */
function statusLine(v: WorldMapState): string {
  if (v.status === "unreachable") return "PRESENCE FEED UNREACHABLE · THE MAP AND TRAVEL STILL WORK";
  if (v.status === "loading" || !v.presence) return "READING THE CITY…";
  const total = v.presence.districts.reduce((n, d) => n + d.players, 0);
  return `${total} ONLINE ACROSS THE CITY · EVERY TRIP IS A RELOAD`;
}

/** The chosen district's details: who is there, its event, its records, its gates, and TRAVEL. */
export function worldMapDetails(v: WorldMapState): string {
  const id = v.selected;
  const p = v.presence?.districts.find((d) => d.district === id);
  const live = v.status === "live" && !!p;
  const who = !live ? "—" : p!.names.length ? `${p!.names.map(esc).join(" · ")}${p!.players > p!.names.length ? ` · +${p!.players - p!.names.length}` : ""}` : p!.players ? `${p!.players} FILE${p!.players === 1 ? "" : "S"}` : "NOBODY ON THE STREET";
  const ev = !live ? "" : p!.event ? `<div class="de">◉ ${esc(p!.event.title)} · ${p!.event.kind.toUpperCase()} · ${p!.event.left}S LEFT</div>` : '<div class="de dim">NO PUBLIC EVENT RUNNING</div>';
  const contest = live && p!.contest ? `<div class="de">▣ CONTEST BLOCK IS UP</div>` : "";
  const recs = !live ? "" : p!.records.length ? p!.records.map((r) => `<div class="dr">⏱ ${esc(r.course)} · ${r.time.toFixed(1)}S · ${esc(r.holder)}</div>`).join("") : '<div class="dr dim">NO STREET-RUN RECORDS YET</div>';
  const gates = gateSummary(id).map((g) => `${g.sides.map((s) => SIDE_WORD[s]).join(" · ")} → ${levelDisplayName(g.to)}`).join(" &nbsp; ");
  const go = id === v.here ? '<div class="go here">YOU ARE HERE</div>' : `<div class="go" data-wm-go="${id}">${crewButton(`TRAVEL TO ${esc(levelDisplayName(id))}`, v.touch)}</div>`;
  // The metro booth is on every plaza. The market spends $CAPITAL. THE RUN is where it is paid.
  const run = `<div class="dg">LEDGER DESK AT THE METRO · MARKET SPENDS · THE NAME DESK BURNS · THE RUN PAYS</div><div class="go" data-wm-run="${id}">${runButton(v.touch)}</div>`;
  return `<div class="wd"><div class="dh"><b>${esc(levelDisplayName(id))}</b> · ${live ? `${p!.players} ONLINE` : "—"}</div><div class="dn">${who}</div>${ev}${contest}${recs}<div class="dg">GATES ${gates}</div>${go}${run}</div>`;
}

/** The panel in the HUD: opened and shut by the MAP tab, reading the feed while open. */
export class WorldMap {
  readonly el: HTMLDivElement;
  readonly layout = worldMapLayout();
  private state: WorldMapState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  /** where TRAVEL sent this page (the probe reads it under `?nonav=1`) */
  target: string | null = null;
  /** how many times the feed has been read (the probe checks it is only read while open) */
  reads = 0;

  constructor(root: HTMLElement, here: string, touch: boolean, private go: (url: string, district: string) => void, private feed: string | null = feedUrl(location.href), private onRun: ((url: string) => void) | null = null) {
    this.state = { here, selected: here, presence: null, status: "loading", touch };
    const el = document.createElement("div");
    el.className = "p cy worldmap";
    el.hidden = true;
    root.appendChild(el);
    this.el = el;
    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const run = t.closest("[data-wm-run]") as HTMLElement | null;
      if (run?.dataset.wmRun) return void this.enterRun(run.dataset.wmRun);
      const go = t.closest("[data-wm-go]") as HTMLElement | null;
      if (go) return void this.travel(go.dataset.wmGo!);
      const pick = t.closest("[data-wm]") as HTMLElement | null;
      if (!pick) return;
      if (pick.dataset.wm === "close") this.toggle(false);
      else this.select(pick.dataset.wm!);
    });
    this.render();
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(on = !this.open): void {
    this.el.hidden = !on;
    if (on) {
      document.exitPointerLock?.();
      this.state.selected = this.state.here;
      this.render();
      void this.read();
      if (!this.timer) this.timer = setInterval(() => void this.read(), WORLD_MAP_POLL_MS);
    } else if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  select(district: string): void {
    if (!this.layout.tiles.some((t) => t.district === district)) return;
    this.state.selected = district;
    this.render();
  }

  /** ENTER THE RUN: this district's PvP loop, behind the loading card. Null when the district is not one. */
  runTarget: string | null = null;
  enterRun(district: string): string | null {
    const url = runPageUrl(location.href, district);
    if (!url) return null;
    this.runTarget = url;
    this.onRun?.(url);
    return url;
  }

  /** TRAVEL: the chosen district's city, behind the loading card. Null when there is nowhere to go. */
  travel(district: string): string | null {
    const url = cityMapTravelUrl(location.href, district);
    if (!url) return null;
    this.target = url;
    this.go(url, district);
    return url;
  }

  private async read(): Promise<void> {
    if (this.reading || !this.feed) {
      if (!this.feed) {
        this.state.status = "unreachable";
        this.render();
      }
      return;
    }
    this.reading = true;
    this.reads++;
    const p = await fetchPresence(this.feed);
    this.reading = false;
    if (p) {
      this.state.presence = p;
      this.state.status = "live";
    } else this.state.status = this.state.presence ? "live" : "unreachable";
    if (this.open) this.render();
  }

  private render(): void {
    this.el.innerHTML = worldMapHtml(this.layout, this.state);
  }

  /** for the probes: what the map shows */
  view(): { open: boolean; here: string; selected: string; status: WorldMapStatus; counts: Record<string, number>; events: string[]; links: string[]; target: string | null; reads: number } {
    const counts: Record<string, number> = {};
    for (const d of this.state.presence?.districts ?? []) counts[d.district] = d.players;
    return { open: this.open, here: this.state.here, selected: this.state.selected, status: this.state.status, counts, events: (this.state.presence?.districts ?? []).filter((d) => d.event).map((d) => d.district), links: this.layout.links.map((l) => `${l.a}|${l.b}`), target: this.target, reads: this.reads };
  }
}

/** the feed on the campaign host this city page's socket is on, or null when the page is not a city */
export function feedUrl(href: string): string | null {
  try {
    const ws = cityWsBase(new URL(href).searchParams.get("net"));
    return ws ? cityPresenceUrl(ws) : null;
  } catch {
    return null;
  }
}
