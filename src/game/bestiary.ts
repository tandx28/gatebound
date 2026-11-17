import { BESTIARY, KINDS, type EnemyKind } from "./config";
import type { Profile } from "./state";

/**
 * The bestiary: every kind of enemy the hunter has killed, how many, what is
 * known of it, and how much harder the hunter hits it for knowing. Lore opens
 * at ten kills; the damage bonus comes in three tiers. Bosses need a tenth.
 */

/** One line of lore per kind, shown once enough of them have fallen. */
export const LORE: Record<EnemyKind, string> = {
  swarmer: "Gate vermin. They hunt in packs and lunge the moment you look away.",
  charger: "Built like a battering ram, and about as quick to change its mind.",
  shooter: "Bone archers. They keep their distance and never miss a still target.",
  brute: "Shield first, everything else later. Hit it from the side.",
  exploder: "It carries its own funeral. Its fuse is short; be shorter.",
  healer: "Kill it first. Everything it stands near refuses to stay dead.",
  warden: "The first master of the low gates. Slow, stone-skinned, patient.",
  summoner: "The Choirmaster sings, and the gate answers with more mouths.",
  duellist: "A blade that waits for your swing, then answers it.",
  leaper: "It falls on you from across the room. Watch the shadow, not the beast.",
  pyro: "It throws fire where you will be, not where you are.",
  warder: "Its aura hardens every enemy near it. Break the warder, break the wall.",
  assassin: "It vanishes, and reappears behind you. Always behind you.",
  knight: "Guard up, lance ready. Break the guard and it is only armour.",
  totem: "A carved stake that makes everything near it angrier. Pull it up.",
  warper: "It trades places with you. Never stand where it wants you.",
  colossus: "Each step sets the floor alight. Do not stay where it has walked.",
  egg: "Left alone, it hatches. Left alone long enough, they all hatch.",
  queen: "The Brood Queen fills the room with children and loves every one.",
  commander: "The Knight Commander leads from the front, and charges the same way.",
  monarch: "The Hollow Monarch rules what the gates leave behind. It wants you too.",
  redactor: "It was the Ledger's own hand once. Now it strikes out hunters instead of lines.",
};

/** Kills needed for each tier, for this kind: a boss needs a tenth. */
export function tierKills(kind: EnemyKind): { lore: number; tiers: number[] } {
  const share = KINDS[kind].boss ? BESTIARY.bossShare : 1;
  return { lore: Math.max(1, Math.round(BESTIARY.lore * share)), tiers: BESTIARY.tiers.map((n) => Math.max(1, Math.round(n * share))) };
}

/** How many bonus tiers the hunter has reached against this kind (0 to 3). */
export function huntTier(pr: Profile, kind: EnemyKind): number {
  const n = pr.kills[kind] ?? 0;
  return tierKills(kind).tiers.filter((t) => n >= t).length;
}

/** Extra damage dealt to this kind, from the bestiary: 0, 0.1, 0.2 or 0.3. */
export function huntBonus(pr: Profile, kind: EnemyKind): number {
  const tier = huntTier(pr, kind);
  return tier > 0 ? BESTIARY.bonus[tier - 1] : 0;
}

/** The kinds in bestiary order: commons first, then the masters. */
export const BEAST_ORDER: EnemyKind[] = (Object.keys(KINDS) as EnemyKind[]).sort((a, b) => Number(KINDS[a].boss) - Number(KINDS[b].boss));

/** Kinds shown on one page of the bestiary. */
export const BEAST_PAGE = 12;
