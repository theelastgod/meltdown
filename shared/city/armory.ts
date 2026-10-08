/**
 * The street bag: forty named pieces bought with scrip.
 *
 * They are not ledger nodes and not weapon slots. Buying one does not change
 * a stat, a gun, or maximum health. A second buy of the same id does not spend.
 */
import type { Account } from "../progression/account";
import { campaignOf } from "../campaign/save";

export interface ArmoryPiece {
  id: string;
  name: string;
  district: string;
  scrip: number;
  line: string;
}

export const ARMORY: readonly ArmoryPiece[] = [
  { id: "row_slip", name: "ROW SLIP KNIFE", district: "lease_row", scrip: 40, line: "A SHORT BLADE FROM THE ESCROW DESK. IT STAYS IN THE BAG." },
  { id: "lease_stamp", name: "LEASE STAMP", district: "lease_row", scrip: 25, line: "A RUBBER STAMP THAT NO LONGER OPENS A DOOR." },
  { id: "dock_hook", name: "DOCK HOOK", district: "deadletter_docks", scrip: 55, line: "A CARGO HOOK. THE PHONE'S GUNS ARE UNCHANGED." },
  { id: "tide_coil", name: "TIDE COIL", district: "deadletter_docks", scrip: 35, line: "ROPE FROM A CRANE THAT DOES NOT FIRE." },
  { id: "wharf_pike", name: "WHARF PIKE", district: "paper_wharf", scrip: 70, line: "A LONG PIKE FOR BALES. NOT A WEAPON SLOT." },
  { id: "paper_wedge", name: "PAPER WEDGE", district: "paper_wharf", scrip: 20, line: "A BRASS WEDGE THE STEVEDORES COUNT WITH." },
  { id: "salt_censer", name: "SALT CENSER", district: "salt_stairs", scrip: 45, line: "A PILGRIM'S CENSER. IT HEALS NOTHING." },
  { id: "stair_bead", name: "STAIR BEAD", district: "salt_stairs", scrip: 15, line: "ONE BEAD OFF A STRING. CLOTH, NOT A STAT." },
  { id: "canal_pole", name: "CANAL POLE", district: "ash_canal", scrip: 50, line: "THE FERRYMAN'S POLE. IT DOES NOT RAISE HEALTH." },
  { id: "ash_lantern", name: "ASH LANTERN", district: "ash_canal", scrip: 30, line: "A DEAD LANTERN. THE STREET LAMPS STAY THEIRS." },
  { id: "audit_rod", name: "AUDIT ROD", district: "repo_depot", scrip: 80, line: "A MEASURING ROD. NO DAMAGE NUMBER MOVES." },
  { id: "impound_tag", name: "IMPOUND TAG", district: "repo_depot", scrip: 20, line: "A TAG FOR A CAR THAT IS ALREADY GONE." },
  { id: "vault_key", name: "VAULT BLANK", district: "cold_vault", scrip: 90, line: "A KEY THAT FITS NO LOCK IN THIS BUILD." },
  { id: "cold_folio", name: "COLD FOLIO", district: "cold_vault", scrip: 40, line: "PAPER THE ARCHIVIST WOULD NOT FILE." },
  { id: "mile_cane", name: "MILE CANE", district: "glass_mile", scrip: 65, line: "A BROKER'S CANE. IT IS NOT A SWORD SLOT." },
  { id: "glass_chip", name: "GLASS CHIP", district: "glass_mile", scrip: 35, line: "A SHARD FROM A SHOWROOM. IT CUTS NOTHING IN PLAY." },
  { id: "court_fan", name: "COURT FAN", district: "velvet_court", scrip: 55, line: "A FOLDING FAN. THE COMBAT ROW STAYS AS IT IS." },
  { id: "velvet_pin", name: "VELVET PIN", district: "velvet_court", scrip: 25, line: "A PIN FOR A COAT THE FILE ALREADY WEARS." },
  { id: "crown_hammer", name: "CROWN HAMMER", district: "rust_crown", scrip: 75, line: "A SMITH'S HAMMER. IT DOES NOT REPLACE THE REPO HAMMER." },
  { id: "rust_nail", name: "RUST NAIL", district: "rust_crown", scrip: 15, line: "ONE NAIL. SCRIP BOUGHT IT. A STAT DID NOT." },
  { id: "wire_spanner", name: "WIRE SPANNER", district: "relay_heights", scrip: 45, line: "A RIGGER'S SPANNER. THE GUNS DO NOT CHANGE." },
  { id: "height_clip", name: "HEIGHT CLIP", district: "relay_heights", scrip: 30, line: "A CARABINER. IT CLIPS TO THE BAG." },
  { id: "garden_shears", name: "GARDEN SHEARS", district: "wire_garden", scrip: 40, line: "SHEARS FOR WIRE VINES. NOT A MELEE UNLOCK." },
  { id: "seed_tin", name: "SEED TIN", district: "wire_garden", scrip: 20, line: "A TIN OF SEEDS. HEALTH STAYS WHERE IT WAS." },
  { id: "lamp_charm", name: "LAMP CHARM", district: "lamp_bazaar", scrip: 25, line: "A HAWKER'S CHARM. IT BUYS NO SKILL." },
  { id: "bazaar_scale", name: "BAZAAR SCALE", district: "lamp_bazaar", scrip: 50, line: "A POCKET SCALE. IT WEIGHS NOTHING IN THE SIM." },
  { id: "relay_tube", name: "RELAY TUBE", district: "black_relay", scrip: 35, line: "A MESSAGE TUBE. THE COURIER ALREADY DELIVERED IT." },
  { id: "black_stylus", name: "BLACK STYLUS", district: "black_relay", scrip: 30, line: "A STYLUS FOR A TERMINAL THIS BAG CANNOT OPEN." },
  { id: "chapel_bell", name: "CHAPEL BELL", district: "neon_chapel", scrip: 60, line: "A SMALL BELL. IT DOES NOT CHANGE THE PA." },
  { id: "neon_bead", name: "NEON BEAD", district: "neon_chapel", scrip: 20, line: "A BEAD THAT GLOWS AND DOES NOTHING ELSE." },
  { id: "stall_cleaver", name: "STALL CLEAVER", district: "night_market", scrip: 55, line: "A MARKET CLEAVER. IT IS NOT ON THE PHONE." },
  { id: "dusk_bowl", name: "DUSK BOWL", district: "night_market", scrip: 15, line: "A RICE BOWL. THE CLINIC IS STILL THE CLINIC." },
  { id: "bone_needle", name: "BONE NEEDLE", district: "bone_market", scrip: 45, line: "A NEEDLE. IT MENDS CLOTH, NOT HIT POINTS." },
  { id: "keeper_charm", name: "KEEPER CHARM", district: "bone_market", scrip: 35, line: "A CHARM THE BONEKEEPER SOLD TWICE." },
  { id: "slag_tongs", name: "SLAG TONGS", district: "slag_pit", scrip: 50, line: "TONGS FROM THE PIT. THEY DO NOT ADD DAMAGE." },
  { id: "crucible_chip", name: "CRUCIBLE CHIP", district: "slag_pit", scrip: 25, line: "A CHIP OF SLAG. A KEEPSAKE." },
  { id: "kiln_poker", name: "KILN POKER", district: "red_kiln", scrip: 40, line: "A POKER FOR A KILN THAT IS NOT A GUN." },
  { id: "red_tile", name: "RED TILE", district: "red_kiln", scrip: 20, line: "ONE TILE. IT DOES NOT DRESS THE STREET." },
  { id: "orchard_bill", name: "ORCHARD BILL", district: "debt_orchard", scrip: 65, line: "A BILLHOOK. THE WEAPON LIST DOES NOT GROW." },
  { id: "debt_pit", name: "DEBT PIT", district: "debt_orchard", scrip: 30, line: "A FRUIT PIT. SCRIP SPENT. NO DEPTH GAINED." },
];

/** Spend scrip on one bag piece. A second buy of the same id does not spend. */
export function buyArmory(a: Account, id: string): { ok: boolean; reason?: string } {
  const item = ARMORY.find((p) => p.id === id);
  if (!item) return { ok: false, reason: "UNKNOWN PIECE" };
  const c = campaignOf(a);
  if (c.armory.includes(id)) return { ok: false, reason: "ALREADY OWNED" };
  if (a.wallet.scrip < item.scrip) return { ok: false, reason: "NEEDS SCRIP" };
  a.wallet.scrip -= item.scrip;
  c.armory.push(id);
  return { ok: true };
}
