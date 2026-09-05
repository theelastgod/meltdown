/**
 * KERNEL PROTOCOLS — campaign-only vertical power. Real +damage / +health
 * co-op gear, rendered with blood-red Kernel filament so it can never be
 * mistaken for PvP-legal. This module is quarantined: the match room and
 * everything it imports must never reach it (tests/quarantine.test.ts
 * walks the import graph), and a loadout that carries a `protocols` field
 * is refused at join. Stage 10 fills the table.
 */
export interface KernelProtocol {
  id: string;
  name: string;
  damageMult: number;
  healthAdd: number;
  filament: "red";
}

export const KERNEL_PROTOCOLS: KernelProtocol[] = [
  { id: "kp_filament_01", name: "FILAMENT: BRAKE PAD", damageMult: 1.15, healthAdd: 40, filament: "red" },
  { id: "kp_filament_02", name: "FILAMENT: DEBT CEILING", damageMult: 1.0, healthAdd: 120, filament: "red" },
];

export const QUARANTINED_MODULE = "shared/campaign/kernelProtocols";
