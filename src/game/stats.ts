import { PLAYER } from "./config";
import type { Bonus } from "./items";

/** Pure stat and levelling maths. */

export const STAT_KEYS = ["str", "agi", "vit", "sen", "int"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_NAMES: Record<StatKey, string> = {
  str: "Strength",
  agi: "Agility",
  vit: "Vitality",
  sen: "Sense",
  int: "Intelligence",
};

export const BASE_STAT = 5;
export const LEVEL_CAP = 20;
export const POINTS_PER_LEVEL = 3;
export const CRIT_CAP = 0.6;

export interface Progress {
  level: number;
  /** Experience toward the next level. */
  xp: number;
  /** Unspent stat points. */
  points: number;
  stats: Stats;
}

export function newProgress(): Progress {
  return {
    level: 1,
    xp: 0,
    points: 0,
    stats: { str: BASE_STAT, agi: BASE_STAT, vit: BASE_STAT, sen: BASE_STAT, int: BASE_STAT },
  };
}

/** Experience needed to go from `level` to the next. Infinite at the cap. */
export function xpToNext(level: number): number {
  if (level >= LEVEL_CAP) return Infinity;
  return Math.round(40 * Math.pow(level, 1.5));
}

export interface Derived {
  maxHp: number;
  maxMana: number;
  damage: number;
  moveSpeed: number;
  attackCooldown: number;
  critChance: number;
  /** Multiplier applied to skill damage. */
  skillPower: number;
}

/**
 * Combat values from stats, plus any gear and title bonus.
 * At base stats with no bonus these equal the PLAYER constants.
 */
export function derive(s: Stats, bonus: Bonus = {}): Derived {
  const over = (k: StatKey) => s[k] - BASE_STAT;
  return {
    maxHp: PLAYER.maxHp + 8 * over("vit") + (bonus.hp ?? 0),
    maxMana: PLAYER.maxMana + 6 * over("int") + (bonus.mana ?? 0),
    damage: (PLAYER.attackDamage + 1.5 * over("str") + (bonus.damage ?? 0)) * (1 + (bonus.damagePct ?? 0)),
    moveSpeed: PLAYER.speed * (1 + 0.012 * over("agi")) * (1 + (bonus.speedPct ?? 0)),
    attackCooldown: PLAYER.attackCooldown / (1 + 0.02 * over("agi")),
    critChance: Math.min(CRIT_CAP, PLAYER.critChance + 0.01 * over("sen") + (bonus.crit ?? 0)),
    skillPower: 1 + 0.05 * over("int"),
  };
}

/**
 * Add experience, levelling up as many times as it allows.
 * Returns the number of levels gained.
 */
export function addXp(p: Progress, amount: number): number {
  let gained = 0;
  p.xp += Math.max(0, amount);
  while (p.level < LEVEL_CAP && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    p.points += POINTS_PER_LEVEL;
    gained += 1;
  }
  if (p.level >= LEVEL_CAP) p.xp = 0;
  return gained;
}

/** Spend one point on a stat. Returns false when no points are left. */
export function allocate(p: Progress, key: StatKey): boolean {
  if (p.points <= 0) return false;
  p.points -= 1;
  p.stats[key] += 1;
  return true;
}
