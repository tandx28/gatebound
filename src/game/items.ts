import type { EnemyKind, Rank } from "./config";

/**
 * Equipment, consumables and titles: fixed definitions and the maths on them.
 *
 * An owned item is a string: its base id, then any perks it rolled, joined
 * by "+". So "iron_fang" is a plain Iron Fang and "iron_fang+poison+chain"
 * one that poisons and chains. A string keeps saves simple and old saves valid.
 */

export type Slot = "weapon" | "armour" | "accessory";
export const SLOTS: Slot[] = ["weapon", "armour", "accessory"];

/** Where an item can be worn. There are two weapon slots; one is in hand at a time. */
export type EquipSlot = "weapon" | "weapon2" | "armour" | "accessory";
export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "weapon2", "armour", "accessory"];

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

export type WeaponType = "dagger" | "sword" | "spear" | "bow";

export interface WeaponDef {
  name: string;
  /** Seconds between attacks, before Agility. */
  cooldown: number;
  /** Multiplier on a basic attack's damage. */
  damage: number;
  range: number;
  /** Half the width of the swing, in radians. */
  halfAngle: number;
  /** Added crit chance for the type. */
  crit: number;
  /** Fires an arrow instead of swinging. */
  ranged: boolean;
}

/** How each weapon type fights. Bare hands fight like a dagger without its crit. */
export const WEAPONS: Record<WeaponType, WeaponDef> = {
  dagger: { name: "Dagger", cooldown: 0.36, damage: 1, range: 62, halfAngle: Math.PI * 0.3, crit: 0.1, ranged: false },
  sword: { name: "Sword", cooldown: 0.55, damage: 1.6, range: 80, halfAngle: Math.PI * 0.46, crit: 0, ranged: false },
  spear: { name: "Spear", cooldown: 0.7, damage: 2, range: 150, halfAngle: Math.PI * 0.08, crit: 0, ranged: false },
  bow: { name: "Bow", cooldown: 0.6, damage: 1.2, range: 900, halfAngle: 0, crit: 0, ranged: true },
};
export const BOW = { arrowSpeed: 900, drawSpeed: 0.7 };

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
/** The four tiers the shop always carries. */
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic"];
export const ALL_RARITIES: Rarity[] = [...RARITIES, "legendary", "mythic"];

/** How many perks an item of each rarity rolls. */
export const PERK_COUNT: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 4 };

/** How likely each rarity is to fill a shop slot. */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 50, uncommon: 30, rare: 15, epic: 5, legendary: 0, mythic: 0 };
/** A higher hunter rank is shown better stock. Legendaries reach the shop only on a rare day. */
export const RANK_WEIGHT: Record<Rank, Record<Rarity, number>> = {
  E: RARITY_WEIGHT,
  D: { common: 35, uncommon: 35, rare: 22, epic: 8, legendary: 0, mythic: 0 },
  C: { common: 20, uncommon: 35, rare: 30, epic: 15, legendary: 0, mythic: 0 },
  B: { common: 12, uncommon: 30, rare: 36, epic: 22, legendary: 0, mythic: 0 },
  A: { common: 6, uncommon: 24, rare: 40, epic: 30, legendary: 0, mythic: 0 },
  S: { common: 2, uncommon: 16, rare: 42, epic: 40, legendary: 0, mythic: 0 },
};
/** What falls from enemies. Legendaries drop only in Rank A and S gates. */
export const DROP_WEIGHT: Record<Rank, Record<Rarity, number>> = {
  E: { common: 70, uncommon: 26, rare: 4, epic: 0, legendary: 0, mythic: 0 },
  D: { common: 50, uncommon: 36, rare: 12, epic: 2, legendary: 0, mythic: 0 },
  C: { common: 30, uncommon: 40, rare: 24, epic: 6, legendary: 0, mythic: 0 },
  B: { common: 14, uncommon: 36, rare: 36, epic: 14, legendary: 0, mythic: 0 },
  A: { common: 6, uncommon: 26, rare: 40, epic: 24, legendary: 4, mythic: 0 },
  S: { common: 2, uncommon: 16, rare: 40, epic: 32, legendary: 10, mythic: 0 },
};
export const DROPS = { chance: 0.04, bagSize: 40, legendaryDayEvery: 5 };

const PRICE: Record<Rarity, number> = { common: 60, uncommon: 180, rare: 450, epic: 1000, legendary: 6000, mythic: 0 };

export type PerkId = "poison" | "burn" | "lifesteal" | "frost" | "chain" | "bleed" | "thorns" | "dodge" | "siphon" | "gilded";

export interface PerkDef {
  name: string;
  /** Goes in front of the item's name. */
  prefix: string;
  about: string;
  slots: Slot[];
}

export const PERKS: Record<PerkId, PerkDef> = {
  poison: { name: "Poison", prefix: "Venomous", about: "hits poison for 30% more over 3s", slots: ["weapon"] },
  burn: { name: "Burn", prefix: "Burning", about: "hits scorch nearby enemies for 25%", slots: ["weapon"] },
  lifesteal: { name: "Vampire", prefix: "Vampiric", about: "heal 4% of damage dealt", slots: ["weapon", "accessory"] },
  frost: { name: "Frost", prefix: "Frozen", about: "hits slow the enemy for 2s", slots: ["weapon"] },
  chain: { name: "Chain", prefix: "Storm", about: "hits arc to 2 more enemies for 30%", slots: ["weapon"] },
  bleed: { name: "Bleed", prefix: "Serrated", about: "crits bleed for 50% more over 3s", slots: ["weapon", "accessory"] },
  thorns: { name: "Thorns", prefix: "Thorned", about: "being hit hurts enemies around you", slots: ["armour"] },
  dodge: { name: "Dodge", prefix: "Elusive", about: "10% chance to avoid a hit", slots: ["armour", "accessory"] },
  siphon: { name: "Siphon", prefix: "Siphoning", about: "+3 mana on a kill", slots: ["armour", "accessory"] },
  gilded: { name: "Gold find", prefix: "Gilded", about: "+25% gold from kills", slots: ["armour", "accessory"] },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** Numbers behind the perks. Each stacks if worn more than once. */
export const PERK = {
  poison: { share: 0.3, time: 3 },
  burn: { share: 0.25, radius: 70 },
  lifesteal: 0.04,
  frost: { time: 2, speed: 0.7 },
  chain: { share: 0.3, targets: 2, radius: 160 },
  bleed: { share: 0.5, time: 3 },
  thorns: { radius: 120 },
  dodge: 0.1,
  siphon: 3,
  gilded: 0.25,
};

/** What a mythic does that nothing else can. */
export type PowerId =
  | "ashen_wake"
  | "twin_fang"
  | "trials_end"
  | "hollow_crown"
  | "seal_breaker"
  | "untouched_mantle"
  | "breakwater"
  | "ledgers_favour";

export const POWERS: Record<PowerId, string> = {
  ashen_wake: "Your dash cuts every enemy it passes through",
  twin_fang: "Every fifth hit strikes twice",
  trials_end: "A kill makes Pierce ready again",
  hollow_crown: "Your echoes cannot be turned, and hit 25% harder",
  seal_breaker: "Poison, burn and slow cannot touch you",
  untouched_mantle: "The first hit in each room does nothing",
  breakwater: "Below 30% health you deal double damage, but cannot be healed",
  ledgers_favour: "Your flask regains a charge whenever a room is cleared",
};

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Shop price. Selling returns half. 0 means it cannot be sold. */
  price: number;
  bonus: Bonus;
  weapon?: WeaponType;
  /** Boss and trial drops with fixed stats and no perks. Never sold in the shop. */
  unique?: boolean;
  /** A mythic's power. */
  power?: PowerId;
}

function item(id: string, name: string, slot: Slot, rarity: Rarity, bonus: Bonus, weapon?: WeaponType): ItemDef {
  return { id, name, slot, rarity, price: PRICE[rarity], bonus, weapon };
}
const dagger = (id: string, name: string, r: Rarity, b: Bonus) => item(id, name, "weapon", r, b, "dagger");
const sword = (id: string, name: string, r: Rarity, b: Bonus) => item(id, name, "weapon", r, b, "sword");
const spear = (id: string, name: string, r: Rarity, b: Bonus) => item(id, name, "weapon", r, b, "spear");
const bow = (id: string, name: string, r: Rarity, b: Bonus) => item(id, name, "weapon", r, b, "bow");
const mythic = (id: string, name: string, slot: Slot, bonus: Bonus, power: PowerId, weapon?: WeaponType): ItemDef => ({
  ...item(id, name, slot, "mythic", bonus, weapon),
  power,
});

const list: ItemDef[] = [
  dagger("iron_fang", "Iron Fang", "common", { damage: 3 }),
  dagger("bone_shiv", "Bone Shiv", "common", { damage: 2, crit: 0.02 }),
  dagger("hunters_kris", "Hunter's Kris", "uncommon", { damage: 7, crit: 0.03 }),
  dagger("gale_knife", "Gale Knife", "uncommon", { damage: 5, speedPct: 0.04 }),
  dagger("voltaic_edge", "Voltaic Edge", "rare", { damage: 13, crit: 0.05 }),
  dagger("nightglass", "Nightglass Dagger", "epic", { damage: 20, crit: 0.08 }),
  dagger("kingfisher", "Kingfisher", "legendary", { damage: 30, crit: 0.08 }),
  sword("militia_sword", "Militia Sword", "common", { damage: 3 }),
  sword("falchion", "Falchion", "uncommon", { damage: 7 }),
  sword("gatecleaver", "Gatecleaver", "rare", { damage: 13, hp: 20 }),
  sword("dusk_blade", "Dusk Blade", "epic", { damage: 20, hp: 40 }),
  sword("oathkeeper", "Oathkeeper", "legendary", { damage: 30, hp: 60 }),
  spear("ash_spear", "Ash Spear", "common", { damage: 3 }),
  spear("pike", "Watchman's Pike", "uncommon", { damage: 7 }),
  spear("glaive", "Glaive", "rare", { damage: 13, speedPct: 0.03 }),
  spear("stormlance", "Stormlance", "epic", { damage: 20, speedPct: 0.05 }),
  spear("horizon", "Horizon", "legendary", { damage: 30, speedPct: 0.05 }),
  bow("short_bow", "Short Bow", "common", { damage: 3 }),
  bow("hunters_bow", "Hunter's Bow", "uncommon", { damage: 7 }),
  bow("recurve", "Recurve", "rare", { damage: 13, crit: 0.04 }),
  bow("gale_bow", "Gale Bow", "epic", { damage: 20, crit: 0.06 }),
  bow("last_light", "Last Light", "legendary", { damage: 30, crit: 0.1 }),
  item("padded_coat", "Padded Coat", "armour", "common", { hp: 20 }),
  item("leather_wraps", "Leather Wraps", "armour", "common", { hp: 12, speedPct: 0.02 }),
  item("scale_vest", "Scale Vest", "armour", "uncommon", { hp: 50 }),
  item("warded_cloak", "Warded Cloak", "armour", "uncommon", { hp: 30, mana: 10 }),
  item("gatehide_mail", "Gatehide Mail", "armour", "rare", { hp: 100 }),
  item("bastion_plate", "Bastion Plate", "armour", "epic", { hp: 160 }),
  item("aegis_of_veyra", "Aegis of Veyra", "armour", "legendary", { hp: 240 }),
  item("runners_band", "Runner's Band", "accessory", "common", { speedPct: 0.06 }),
  item("copper_charm", "Copper Charm", "accessory", "common", { hp: 10, mana: 6 }),
  item("focus_ring", "Focus Ring", "accessory", "uncommon", { mana: 12 }),
  item("hawk_pendant", "Hawk Pendant", "accessory", "uncommon", { crit: 0.04, speedPct: 0.03 }),
  item("keen_charm", "Keen Eye Charm", "accessory", "rare", { crit: 0.08 }),
  item("ledger_seal", "Ledger Seal", "accessory", "epic", { damagePct: 0.1, mana: 20 }),
  item("ledger_page", "Torn Ledger Page", "accessory", "legendary", { damagePct: 0.15, mana: 30 }),
  { id: "wardens_knuckle", name: "Warden's Knuckle", slot: "accessory", rarity: "rare", price: 300, bonus: { hp: 30, damage: 4 }, unique: true },
  { id: "choir_baton", name: "Choir Baton", slot: "weapon", rarity: "rare", price: 600, bonus: { damage: 10, mana: 18 }, unique: true, weapon: "dagger" },
  { id: "mirror_edge", name: "Mirror Edge", slot: "weapon", rarity: "epic", price: 1200, bonus: { damage: 18, speedPct: 0.08 }, unique: true, weapon: "dagger" },
  { id: "trial_sigil", name: "Trial Sigil", slot: "accessory", rarity: "epic", price: 1600, bonus: { damagePct: 0.1, hp: 40 }, unique: true },
  mythic("ashen_wake", "Ashen Wake", "weapon", { damage: 38, crit: 0.1 }, "ashen_wake", "dagger"),
  mythic("twin_fang", "Twin Fang", "weapon", { damage: 38, hp: 60 }, "twin_fang", "sword"),
  mythic("trials_end", "Trial's End", "weapon", { damage: 38, speedPct: 0.06 }, "trials_end", "spear"),
  mythic("hollow_crown", "Crown of the Hollow", "accessory", { damagePct: 0.15 }, "hollow_crown"),
  mythic("seal_breaker", "Seal-Breaker", "armour", { hp: 300 }, "seal_breaker"),
  mythic("untouched_mantle", "Untouched Mantle", "armour", { hp: 260, speedPct: 0.08 }, "untouched_mantle"),
  mythic("breakwater", "Breakwater", "accessory", { crit: 0.1, hp: 60 }, "breakwater"),
  mythic("ledgers_favour", "The Ledger's Favour", "accessory", { mana: 40, hp: 60 }, "ledgers_favour"),
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
/** Everything the shop or a drop can ever be: no uniques, no mythics. */
export const SHOP_POOL: string[] = list.filter((i) => !i.unique && i.rarity !== "mythic").map((i) => i.id);
export const SHOP_SLOTS = 6;
export const BOSS_DROP: Partial<Record<EnemyKind, string>> = {
  warden: "wardens_knuckle",
  summoner: "choir_baton",
  duellist: "mirror_edge",
};
export const TRIAL_DROP = "trial_sigil";

/** The eight mythics, each earned once by one feat. */
export const MYTHICS: { id: PowerId; how: string }[] = [
  { id: "ashen_wake", how: "Defeat the Brood Queen (10% a kill, certain on the fifth)" },
  { id: "twin_fang", how: "Defeat the Knight Commander (10% a kill, certain on the fifth)" },
  { id: "hollow_crown", how: "Defeat the Hollow Monarch (10% a kill, certain on the fifth)" },
  { id: "seal_breaker", how: "Clear a sealed gate of Rank A or higher" },
  { id: "trials_end", how: "Beat the hidden trial in a Rank S gate" },
  { id: "untouched_mantle", how: "Clear a gate of Rank B or higher without being hit" },
  { id: "breakwater", how: "Hold a gate break at Rank S" },
  { id: "ledgers_favour", how: "Complete 30 daily quests" },
];
/** Which mythic each of the three late bosses can drop. */
export const BOSS_MYTHIC: Partial<Record<EnemyKind, PowerId>> = { queen: "ashen_wake", commander: "twin_fang", monarch: "hollow_crown" };
export const MYTHIC_ODDS = { chance: 0.1, pity: 5 };

export const POTION = { price: 40, max: 3, heal: 0.5 };
/** A Return Stone leaves a gate at once with its loot. Useless in a sealed gate. */
export const STONE = { price: 80, max: 2 };

/** Consumables beyond the health potion and the stone, used from the belt. */
export type BagId = "greater" | "mana" | "fury" | "antidote";
export interface BagDef {
  name: string;
  about: string;
  price: number;
  max: number;
  /** Lowest hunter rank the shop sells it to. */
  rank?: Rank;
}
export const BAG: Record<BagId, BagDef> = {
  greater: { name: "Greater Health Potion", about: "restores all health", price: 220, max: 1, rank: "B" },
  mana: { name: "Mana Potion", about: "restores all mana", price: 50, max: 3 },
  fury: { name: "Elixir of Fury", about: "+30% damage for 20 seconds", price: 150, max: 2 },
  antidote: { name: "Antidote", about: "cures ailments and wards them off for 10s", price: 90, max: 2 },
};
export const BAG_IDS = Object.keys(BAG) as BagId[];
export const FURY = { time: 20, damage: 1.3 };
export const ANTIDOTE = { immune: 10 };

/** A flask is owned for good: a few sips of health, refilled free at the board. */
export const FLASK = { heal: 0.3, start: 2, max: 5, cost: [500, 1500, 4000] };

/** Everything that auto-buy can keep topped up. */
export type SupplyId = "potion" | "stone" | BagId;
export const SUPPLY_IDS: SupplyId[] = ["potion", "mana", "antidote", "stone", "fury", "greater"];

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
  { id: "keeper", name: "Keeper of the Ledger", how: "Sign the last page", bonus: { hp: 40 } },
  { id: "unwritten", name: "The Unwritten", how: "Burn the last page", bonus: { damagePct: 0.1 } },
];

/** The base id of an owned item, without its perks. */
export function baseOf(owned: string): string {
  const i = owned.indexOf("+");
  return i < 0 ? owned : owned.slice(0, i);
}

/** The perks an owned item rolled. */
export function perksOf(owned: string): PerkId[] {
  return owned
    .split("+")
    .slice(1)
    .filter((p): p is PerkId => p in PERKS);
}

export function itemDef(owned: string): ItemDef | undefined {
  return ITEMS[baseOf(owned)];
}

export function makeItem(base: string, perks: PerkId[]): string {
  return [base, ...perks].join("+");
}

/** Roll the perks an item of this base gets: distinct, and fitting its slot. */
export function rollPerks(base: string, rng: () => number): PerkId[] {
  const def = ITEMS[base];
  if (!def || def.unique) return [];
  const pool = PERK_IDS.filter((p) => PERKS[p].slots.includes(def.slot));
  const out: PerkId[] = [];
  const want = Math.min(PERK_COUNT[def.rarity], pool.length);
  while (out.length < want) {
    const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** An item's display name: its first perk in front, as in "Venomous Iron Fang". */
export function itemName(owned: string): string {
  const def = itemDef(owned);
  if (!def) return owned;
  const perks = perksOf(owned);
  return perks.length ? `${PERKS[perks[0]].prefix} ${def.name}` : def.name;
}

/** The tier shown to the player: boss items read as "unique". */
export function tierOf(owned: string): string {
  const def = itemDef(owned);
  return !def ? "" : def.unique ? "unique" : def.rarity;
}

export function sellValue(owned: string): number {
  const def = itemDef(owned);
  // A perk adds a fifth to what the base is worth.
  return def ? Math.floor((def.price / 2) * (1 + 0.2 * perksOf(owned).length)) : 0;
}

export function sumBonus(parts: Bonus[]): Required<Bonus> {
  const total = { damage: 0, hp: 0, mana: 0, crit: 0, speedPct: 0, damagePct: 0 };
  for (const b of parts) {
    for (const k of Object.keys(total) as (keyof Bonus)[]) total[k] += b[k] ?? 0;
  }
  return total;
}

/** The slots that count right now: armour, accessory, and the weapon in hand. */
export function wornSlots(active: number): EquipSlot[] {
  return [active === 1 ? "weapon2" : "weapon", "armour", "accessory"];
}

/** Combined bonus from the worn items and the active title. */
export function gearBonus(equipped: Partial<Record<EquipSlot, string>>, title: string | null, active = 0): Required<Bonus> {
  const parts: Bonus[] = [];
  for (const slot of wornSlots(active)) {
    const def = equipped[slot] ? itemDef(equipped[slot]!) : undefined;
    if (def) parts.push(def.bonus);
  }
  const t = TITLES.find((x) => x.id === title);
  if (t) parts.push(t.bonus);
  return sumBonus(parts);
}

/** How many of each perk the worn items carry. */
export function gearPerks(equipped: Partial<Record<EquipSlot, string>>, active = 0): Record<PerkId, number> {
  const out = Object.fromEntries(PERK_IDS.map((p) => [p, 0])) as Record<PerkId, number>;
  for (const slot of wornSlots(active)) {
    if (equipped[slot]) for (const p of perksOf(equipped[slot]!)) out[p] += 1;
  }
  return out;
}

/** The mythic powers the worn items grant. */
export function gearPowers(equipped: Partial<Record<EquipSlot, string>>, active = 0): PowerId[] {
  const out: PowerId[] = [];
  for (const slot of wornSlots(active)) {
    const def = equipped[slot] ? itemDef(equipped[slot]!) : undefined;
    if (def?.power) out.push(def.power);
  }
  return out;
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

/** One line on an owned item: its tier, type, numbers and perks. */
export function describeItem(owned: string): string {
  const def = itemDef(owned);
  if (!def) return "";
  const parts = [tierOf(owned)];
  if (def.weapon) parts.push(WEAPONS[def.weapon].name.toLowerCase());
  parts.push(describeBonus(def.bonus));
  const perks = perksOf(owned);
  if (perks.length) parts.push(perks.map((p) => PERKS[p].name.toLowerCase()).join(", "));
  return parts.join(" · ");
}

function weighted(pool: string[], weights: Record<Rarity, number>, rng: () => number): number {
  const total = pool.reduce((sum, id) => sum + weights[ITEMS[id].rarity], 0);
  if (total <= 0) return -1;
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[ITEMS[pool[i]].rarity];
    if (roll < 0) return i;
  }
  return pool.length - 1;
}

/**
 * Pick the day's shop stock: distinct base items, weighted by rarity, skipping
 * anything in `exclude`. The same generator state always gives the same stock.
 */
export function rollStock(
  rng: () => number,
  exclude: string[] = [],
  weights: Record<Rarity, number> = RARITY_WEIGHT,
): string[] {
  const pool = SHOP_POOL.filter((id) => !exclude.includes(id));
  const out: string[] = [];
  while (out.length < SHOP_SLOTS) {
    const i = weighted(pool, weights, rng);
    if (i < 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** One dropped item for a gate of this rank, perks rolled. */
export function rollDrop(rank: Rank, rng: () => number, weights: Record<Rarity, number> = DROP_WEIGHT[rank]): string {
  const i = weighted(SHOP_POOL, weights, rng);
  const base = SHOP_POOL[Math.max(0, i)];
  return makeItem(base, rollPerks(base, rng));
}
