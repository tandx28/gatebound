import type { EnemyKind } from "./config";

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

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  /** Shop price. Selling returns half. */
  price: number;
  bonus: Bonus;
  /** Boss drops are never sold in the shop. */
  unique?: boolean;
}

const list: ItemDef[] = [
  { id: "iron_fang", name: "Iron Fang", slot: "weapon", price: 60, bonus: { damage: 3 } },
  { id: "hunters_kris", name: "Hunter's Kris", slot: "weapon", price: 180, bonus: { damage: 7, crit: 0.03 } },
  { id: "voltaic_edge", name: "Voltaic Edge", slot: "weapon", price: 450, bonus: { damage: 13, crit: 0.05 } },
  { id: "padded_coat", name: "Padded Coat", slot: "armour", price: 60, bonus: { hp: 20 } },
  { id: "scale_vest", name: "Scale Vest", slot: "armour", price: 180, bonus: { hp: 50 } },
  { id: "gatehide_mail", name: "Gatehide Mail", slot: "armour", price: 450, bonus: { hp: 100 } },
  { id: "runners_band", name: "Runner's Band", slot: "accessory", price: 60, bonus: { speedPct: 0.06 } },
  { id: "focus_ring", name: "Focus Ring", slot: "accessory", price: 180, bonus: { mana: 12 } },
  { id: "keen_charm", name: "Keen Eye Charm", slot: "accessory", price: 450, bonus: { crit: 0.08 } },
  { id: "wardens_knuckle", name: "Warden's Knuckle", slot: "accessory", price: 300, bonus: { hp: 30, damage: 4 }, unique: true },
  { id: "choir_baton", name: "Choir Baton", slot: "weapon", price: 600, bonus: { damage: 10, mana: 18 }, unique: true },
  { id: "mirror_edge", name: "Mirror Edge", slot: "weapon", price: 1200, bonus: { damage: 18, speedPct: 0.08 }, unique: true },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
export const SHOP_STOCK: string[] = list.filter((i) => !i.unique).map((i) => i.id);
export const BOSS_DROP: Partial<Record<EnemyKind, string>> = {
  warden: "wardens_knuckle",
  summoner: "choir_baton",
  duellist: "mirror_edge",
};

export const POTION = { price: 40, max: 3, heal: 0.5 };

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
