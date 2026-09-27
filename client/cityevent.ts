/**
 * The city's public event on the HUD (Stage 699): the words and the places, from the room's message.
 * No DOM and no renderer here, so the lines are tested as lines; `Campaign.onCityEventMsg` puts them
 * on the objective line, the banner, the card, the beam and the map, all of which the HUD already had.
 */
import type { CityEventMsg } from "@shared/net/protocol";

type Ev = NonNullable<CityEventMsg["event"]>;

/** 95 → "1:35"; the clock on a running event */
export function eventClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 40 → "IN ~1 MIN"; the quiet before the next one, rounded up to the minute a player can plan by */
export function nextEventLine(seconds: number): string {
  if (seconds < 0) return "";
  return `NEXT PUBLIC EVENT IN ~${Math.max(1, Math.ceil(seconds / 60))} MIN`;
}

/** how far along it is, in the event's own unit: seconds held, wasps downed, the cell's walk */
export function eventProgress(ev: Ev): string {
  if (ev.kind === "hold") return `${Math.floor(ev.progress)}S / ${ev.need}S`;
  if (ev.kind === "intercept") return `${ev.progress}/${ev.need} DOWN`;
  return `${Math.round(ev.progress * 100)}%`;
}

/** where the beam stands: the post; the convoy (its first living wasp); the cell's destination */
export function eventMarker(ev: Ev): { x: number; y: number; z: number } {
  if (ev.kind === "intercept" && ev.targets.length) return { x: ev.targets[0]!.x, y: 0, z: ev.targets[0]!.z };
  return { x: ev.x, y: 0, z: ev.z };
}

/** The objective line while an event runs: its title, what to do, and how it stands (with the distance when known). */
export function eventObjective(ev: Ev, from: { x: number; z: number } | null): { title: string; text: string; progress: string } {
  const m = eventMarker(ev);
  const away = from ? ` · ${Math.round(Math.hypot(m.x - from.x, m.z - from.z))} M` : "";
  const waiting = ev.kind === "escort" && ev.escort?.waiting ? " · THE CELL IS WAITING" : "";
  return { title: `◈ PUBLIC EVENT · ${ev.title}`, text: `${ev.text}${waiting}`, progress: `${eventProgress(ev)} · ${eventClock(ev.left)}${away}` };
}

/** The banner when an event starts. */
export function eventBanner(ev: Ev): string {
  return `◆ PUBLIC EVENT · ${ev.title}`;
}

/**
 * The card when an event ends, for this client: what it was paid, or why nothing. A failed event pays
 * nobody; a completed one pays the files that took part and says so to the ones that did not.
 */
export function eventCard(m: CityEventMsg): { title: string; lines: string[]; color: "am" | "mg" } | null {
  const ev = m.event;
  if (!ev || ev.status === "running") return null;
  const next = nextEventLine(m.next);
  if (ev.status === "failed") return { title: `EVENT FAILED · ${ev.title}`, lines: [ev.reason, "A FAILED EVENT PAYS NO ONE", next].filter(Boolean), color: "mg" };
  const took = `${ev.participants} TOOK PART`;
  const mine = m.reward?.length ? ["SETTLED ON YOUR FILE", ...m.reward] : m.you ? ["YOU TOOK PART · NO FILE TO SETTLE IT ON"] : ["YOU WERE NOT THERE · NOTHING SETTLED ON YOUR FILE"];
  return { title: `EVENT CLOSED · ${ev.title}`, lines: [took, ...mine, next].filter(Boolean), color: "am" };
}
