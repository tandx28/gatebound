import type { EnemyKind, Rank } from "./config";

/** Equipment, potions and titles: fixed definitions and bonus maths. */

export type Slot = "weapon" | "armour" | "accessory";
export const SLOTS: Slot[] = ["weapon", "armour", "accessory"];

/** Flat and percentage bonuses applied on top of stats. */
export interface Bonus {
  damage?: number;
  hp?: number;
  mana?: number;
  /** Added crit chance, 0.05 = five points. */
  crit?: number;
  /** Fractional increases, 0.06 = six percent. */
  speedPct?: number;
  damagePct?: number;
}

export type Rarity = "common" | "uncommon" | "rare" | "epic";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic"];

/** How likely each rarity is to fill a shop slot. */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 50, uncommon: 30, rare: 15, epic: 5 };
/** A higher hunter rank is shown better stock. */
export const RANK_WEIGHT: Record<Rank, Record<Rarity, number>> = {
  E: RARITY_WEIGHT,
  D: { common: 35, uncommon: 35, rare: 22, epic: 8 },
  C: { common: 20, uncommon: 35, rare: 30, epic: 15 },
};
const PRICE: Record<Rarity, number> = { common: 60, uncommon: 180, rare: 450, epic: 1000 };

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Shop price. Selling returns half. */
  price: number;
  bonus: Bonus;
  /** Boss and trial drops are never sold in the shop. */
  unique?: boolean;
}

const shop = (id: string, name: string, slot: Slot, rarity: Rarity, bonus: Bonus): ItemDef => ({
  id,
  name,
  slot,
  rarity,
  price: PRICE[rarity],
  bonus,
});

const list: ItemDef[] = [
  shop("iron_fang", "Iron Fang", "weapon", "common", { damage: 3 }),
  shop("bone_shiv", "Bone Shiv", "weapon", "common", { damage: 2, crit: 0.02 }),
  shop("hunters_kris", "Hunter's Kris", "weapon", "uncommon", { damage: 7, crit: 0.03 }),
  shop("gale_knife", "Gale Knife", "weapon", "uncommon", { damage: 5, speedPct: 0.04 }),
  shop("voltaic_edge", "Voltaic Edge", "weapon", "rare", { damage: 13, crit: 0.05 }),
  shop("nightglass", "Nightglass Dagger", "weapon", "epic", { damage: 20, crit: 0.08 }),
  shop("padded_coat", "Padded Coat", "armour", "common", { hp: 20 }),
  shop("leather_wraps", "Leather Wraps", "armour", "common", { hp: 12, speedPct: 0.02 }),
  shop("scale_vest", "Scale Vest", "armour", "uncommon", { hp: 50 }),
  shop("warded_cloak", "Warded Cloak", "armour", "uncommon", { hp: 30, mana: 10 }),
  shop("gatehide_mail", "Gatehide Mail", "armour", "rare", { hp: 100 }),
  shop("bastion_plate", "Bastion Plate", "armour", "epic", { hp: 160 }),
  shop("runners_band", "Runner's Band", "accessory", "common", { speedPct: 0.06 }),
  shop("copper_charm", "Copper Charm", "accessory", "common", { hp: 10, mana: 6 }),
  shop("focus_ring", "Focus Ring", "accessory", "uncommon", { mana: 12 }),
  shop("hawk_pendant", "Hawk Pendant", "accessory", "uncommon", { crit: 0.04, speedPct: 0.03 }),
  shop("keen_charm", "Keen Eye Charm", "accessory", "rare", { crit: 0.08 }),
  shop("ledger_seal", "Ledger Seal", "accessory", "epic", { damagePct: 0.1, mana: 20 }),
  { id: "wardens_knuckle", name: "Warden's Knuckle", slot: "accessory", rarity: "rare", price: 300, bonus: { hp: 30, damage: 4 }, unique: true },
  { id: "choir_baton", name: "Choir Baton", slot: "weapon", rarity: "rare", price: 600, bonus: { damage: 10, mana: 18 }, unique: true },
  { id: "mirror_edge", name: "Mirror Edge", slot: "weapon", rarity: "epic", price: 1200, bonus: { damage: 18, speedPct: 0.08 }, unique: true },
  { id: "trial_sigil", name: "Trial Sigil", slot: "accessory", rarity: "epic", price: 1600, bonus: { damagePct: 0.1, hp: 40 }, unique: true },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
/** Everything the shop can ever stock. */
export const SHOP_POOL: string[] = list.filter((i) => !i.unique).map((i) => i.id);
export const SHOP_SLOTS = 6;
export const BOSS_DROP: Partial<Record<EnemyKind, string>> = {
  warden: "wardens_knuckle",
  summoner: "choir_baton",
  duellist: "mirror_edge",
};
export const TRIAL_DROP = "trial_sigil";

/**
 * Pick the day's shop stock: distinct items, weighted by rarity, skipping
 * anything in `exclude`. The same generator state always gives the same stock.
 */
export function rollStock(
  rng: () => number,
  exclude: string[] = [],
  weights: Record<Rarity, number> = RARITY_WEIGHT,
): string[] {
  const pool = SHOP_POOL.filter((id) => !exclude.includes(id));
  const out: string[] = [];
  while (out.length < SHOP_SLOTS && pool.length > 0) {
    const total = pool.reduce((sum, id) => sum + weights[ITEMS[id].rarity], 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[ITEMS[pool[i]].rarity];
      if (roll < 0) {
        index = i;
        break;
      }
    }
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

export const POTION = { price: 40, max: 3, heal: 0.5 };
/** A Return Stone leaves a gate at once with its loot. Useless in a sealed gate. */
export const STONE = { price: 80, max: 2 };

export interface TitleDef {
  id: string;
  name: string;
  /** How it is earned, shown before and after. */
  how: string;
  bonus: Bonus;
}

export const TITLES: TitleDef[] = [
  { id: "first_gate", name: "Gate Walker", how: "Clear your first gate", bonus: { damagePct: 0.05 } },
  { id: "untouched", name: "Untouched", how: "Clear a gate without being hit", bonus: { speedPct: 0.05 } },
  { id: "giant_feller", name: "Giant Feller", how: "Defeat the Stone Warden", bonus: { hp: 10 } },
  { id: "overreacher", name: "Overreacher", how: "Clear a gate above your level", bonus: { crit: 0.03 } },
];

export function sellValue(id: string): number {
  return Math.floor(ITEMS[id].price / 2);
}

export function sumBonus(parts: Bonus[]): Required<Bonus> {
  const total = { damage: 0, hp: 0, mana: 0, crit: 0, speedPct: 0, damagePct: 0 };
  for (const b of parts) {
    for (const k of Object.keys(total) as (keyof Bonus)[]) total[k] += b[k] ?? 0;
  }
  return total;
}

/** Combined bonus from equipped items and the active title. */
export function gearBonus(equipped: Partial<Record<Slot, string>>, title: string | null): Required<Bonus> {
  const parts: Bonus[] = [];
  for (const slot of SLOTS) {
    const id = equipped[slot];
    if (id && ITEMS[id]) parts.push(ITEMS[id].bonus);
  }
  const t = TITLES.find((x) => x.id === title);
  if (t) parts.push(t.bonus);
  return sumBonus(parts);
}

export function describeBonus(b: Bonus): string {
  const out: string[] = [];
  if (b.damage) out.push(`+${b.damage} damage`);
  if (b.damagePct) out.push(`+${Math.round(b.damagePct * 100)}% damage`);
  if (b.hp) out.push(`+${b.hp} health`);
  if (b.mana) out.push(`+${b.mana} mana`);
  if (b.crit) out.push(`+${Math.round(b.crit * 100)}% crit`);
  if (b.speedPct) out.push(`+${Math.round(b.speedPct * 100)}% speed`);
  return out.join(", ");
}
