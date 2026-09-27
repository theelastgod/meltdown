/**
 * The campaign's kit has pictures (Stage 685). The contracts desk listed the Kernel Protocols and
 * the two campaign weapons as text. Each protocol now carries its emblem, drawn in Higgsfield in the
 * Kernel's blood-red filament, and each campaign weapon a render of the gun the game draws. Keyed
 * by id, so a new protocol or campaign weapon fails the test until it has its art.
 */
import type { WeaponId } from "@shared/weapons/manifest";

export const PROTOCOL_ART: Readonly<Record<string, string>> = {
  filament_core: "/kit/p_filament_core.jpg",
  red_lease: "/kit/p_red_lease.jpg",
  wern_pulse: "/kit/p_wern_pulse.jpg",
  blood_ledger: "/kit/p_blood_ledger.jpg",
  directive_optic: "/kit/p_directive_optic.jpg",
};

export const WEAPON_ART: Readonly<Partial<Record<WeaponId, string>>> = {
  directive: "/kit/w_directive.jpg",
  clockeater: "/kit/w_clockeater.jpg",
};

/** a protocol's emblem at the head of its row, or nothing for an id without one */
export function protocolIcon(id: string): string {
  const src = PROTOCOL_ART[id];
  return src ? `<img class="pi" src="${src}" alt="">` : "";
}

/** a campaign weapon's card: its render over its name, dimmed until the file owns it */
export function weaponCard(id: WeaponId, name: string, owned: boolean): string {
  const src = WEAPON_ART[id];
  return `<span class="cw${owned ? "" : " off"}" data-weapon="${id}">${src ? `<img class="wi" src="${src}" alt="">` : ""}<span>${owned ? "▣" : "▢"} ${name}</span></span>`;
}
