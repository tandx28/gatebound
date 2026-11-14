/** Logical view size. Both canvases scale this to the window. */
export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Fixed simulation step, in seconds. */
export const STEP = 1 / 120;

/** Every dungeon room has the same footprint. Doors sit mid-wall. */
export const ROOM = { w: 1400, h: 900, doorHalf: 80 };

export const PLAYER = {
  radius: 14,
  maxHp: 60,
  maxMana: 20,
  /** Mana regained per second. */
  manaRegen: 1.5,
  speed: 230,
  dashSpeed: 760,
  dashTime: 0.17,
  dashCooldown: 0.9,
  /** Invulnerability lasts slightly longer than the dash itself. */
  dashIframes: 0.22,
  attackDamage: 8,
  attackRange: 62,
  attackHalfAngle: Math.PI * 0.3,
  attackCooldown: 0.36,
  attackActive: 0.1,
  critChance: 0.05,
  critMult: 2,
  /** Brief invulnerability after taking a hit, so one attack cannot hit twice. */
  hurtIframes: 0.5,
};

export type SkillId = "pierce" | "whirl" | "surge";

export interface SkillDef {
  name: string;
  key: string;
  /** Keyboard code that triggers it. */
  code: string;
  level: number;
  mana: number;
  cooldown: number;
}

export const SKILL_IDS: SkillId[] = ["pierce", "whirl", "surge"];

export const SKILLS: Record<SkillId, SkillDef> = {
  pierce: { name: "Pierce", key: "Q", code: "KeyQ", level: 3, mana: 6, cooldown: 4 },
  whirl: { name: "Whirl", key: "E", code: "KeyE", level: 6, mana: 8, cooldown: 6 },
  surge: { name: "Surge", key: "R", code: "KeyR", level: 10, mana: 12, cooldown: 20 },
};

export const PIERCE = { time: 0.16, speed: 1300, mult: 2.2, width: 22 };
export const WHIRL = { radius: 105, mult: 1.8, knock: 420 };
export const SURGE = { time: 6, speed: 1.35, damage: 1.4 };

export type EnemyKind =
  | "swarmer"
  | "charger"
  | "shooter"
  | "brute"
  | "exploder"
  | "healer"
  | "warden"
  | "summoner"
  | "duellist";

export interface KindDef {
  name: string;
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  boss: boolean;
}

/** The first enemy type: a melee swarmer with a telegraphed lunge. */
export const SWARMER = {
  radius: 13,
  maxHp: 24,
  speed: 125,
  engageRange: 70,
  windup: 0.45,
  lungeSpeed: 520,
  lungeTime: 0.2,
  recover: 0.65,
  /** Three hits kill a fresh player: the early game is meant to be hard. */
  damage: 20,
  xp: 10,
};

export const CHARGER = { range: 280, windup: 0.8, chargeSpeed: 640, chargeTime: 0.75, recover: 0.8, stun: 1.4 };
export const SHOOTER = { near: 230, far: 420, windup: 0.5, cooldown: 2.2, shotSpeed: 340 };
export const BRUTE = { range: 115, windup: 0.9, slamRadius: 135, recover: 1.3, turnRate: 1.7, shieldHalf: 1.22 };
export const EXPLODER = { range: 65, fuse: 0.55, blastRadius: 105 };
export const HEALER = { near: 260, far: 440, cast: 0.8, cooldown: 3.5, radius: 340, heal: 0.3 };

export const KINDS: Record<EnemyKind, KindDef> = {
  swarmer: { name: "Swarmer", radius: SWARMER.radius, hp: SWARMER.maxHp, speed: SWARMER.speed, damage: SWARMER.damage, xp: SWARMER.xp, boss: false },
  charger: { name: "Charger", radius: 16, hp: 40, speed: 95, damage: 30, xp: 16, boss: false },
  shooter: { name: "Shooter", radius: 12, hp: 20, speed: 110, damage: 14, xp: 14, boss: false },
  brute: { name: "Brute", radius: 24, hp: 90, speed: 70, damage: 32, xp: 28, boss: false },
  exploder: { name: "Exploder", radius: 12, hp: 14, speed: 185, damage: 34, xp: 12, boss: false },
  healer: { name: "Mender", radius: 13, hp: 30, speed: 120, damage: 10, xp: 22, boss: false },
  warden: { name: "Stone Warden", radius: 38, hp: 800, speed: 80, damage: 30, xp: 200, boss: true },
  summoner: { name: "The Choirmaster", radius: 24, hp: 1150, speed: 120, damage: 27, xp: 600, boss: true },
  duellist: { name: "Mirror Blade", radius: 16, hp: 3600, speed: 210, damage: 42, xp: 1500, boss: true },
};

export type Rank = "E" | "D" | "C";
export const RANK_IDS: Rank[] = ["E", "D", "C"];

export interface RankDef {
  /** Level at which the gate is a fair fight. */
  minLevel: number;
  hpMult: number;
  dmgMult: number;
  xpMult: number;
  /** Room count, including the start and boss rooms. */
  rooms: number;
  kinds: EnemyKind[];
  boss: EnemyKind;
}

export const RANKS: Record<Rank, RankDef> = {
  E: { minLevel: 1, hpMult: 1, dmgMult: 1, xpMult: 1, rooms: 6, kinds: ["swarmer", "charger", "shooter"], boss: "warden" },
  D: { minLevel: 6, hpMult: 2.8, dmgMult: 1.9, xpMult: 2.5, rooms: 7, kinds: ["shooter", "exploder", "brute"], boss: "summoner" },
  C: { minLevel: 13, hpMult: 5.5, dmgMult: 3.0, xpMult: 5, rooms: 8, kinds: ["charger", "healer", "brute"], boss: "duellist" },
};

/** A sealed gate: found out only once inside. No retreat, tougher, colder, richer. */
export const SEALED = { chance: 1 / 8, hp: 1.8, dmg: 1.4, reward: 2, coldEvery: 3 };

/** A sudden timed order on entering a room. */
export const EMERGENCY = { chance: 0.15, base: 10, perEnemy: 7, hpLoss: 0.3, bonus: 0.5 };

/** A hidden door behind the boss, leading to a harder echo of it. */
export const HIDDEN = { chance: 0.15, hp: 0.7, dmg: 1.3, gold: 400 };

/** Keys open short solo dungeons with a fixed reward. */
export const KEYS = { dropChance: 0.03, gold: 150, points: 1 };

/** Punishment for a missed daily quest: survive this long, in seconds. */
export const PENALTY = { time: 90 };

/** The daily quest: all three goals, reset each calendar day. */
export const DAILY = { kills: 40, rooms: 5, gates: 1, points: 3 };

/** Leaving a gate early keeps only this share of its gold. */
export const RETREAT = { goldKeep: 0.5 };

/** The rank suited to a level, for instances that scale to the player. */
export function rankForLevel(level: number): Rank {
  return level >= RANKS.C.minLevel ? "C" : level >= RANKS.D.minLevel ? "D" : "E";
}

/** Skill books raise a skill's rank: stronger and quicker to come back. */
export const SKILL_RANK = { max: 3, power: 0.25, cooldown: 0.1, surgeTime: 2, bossDrop: 0.35 };

/** A Blank Page refunds every spent stat point. */
export const RESET = { price: 400 };

/**
 * Echoes: the fallen, bound to fight beside you. A remnant lingers where an
 * enemy dies; binding it costs mana. Bosses resist, and allow a few tries.
 */
export const ECHO = {
  roster: 8,
  bindRange: 90,
  bindMana: 5,
  remnantLife: 8,
  /** Chance per try to bind a boss, before the Intelligence bonus. */
  bossChance: 0.5,
  /** Added to that chance per point of Intelligence above the starting value. */
  bossChancePerInt: 0.01,
  bossTries: 3,
  /** A boss's remnant waits this long, holding the gate open. */
  bossRemnantLife: 30,
  /** Share of the living enemy's damage an echo deals. */
  damage: 0.35,
  bossDamage: 1.5,
};

/** How many echoes can fight at once: two at first, one more every three levels. */
export function echoCap(level: number): number {
  return Math.max(2, Math.min(5, 2 + Math.floor((level - RANKS.C.minLevel) / 3)));
}

/** The class-change rite: waves in a sealed arena. Clearing it grants echoes. */
export const RITE: { waves: EnemyKind[][]; points: number } = {
  waves: [
    ["swarmer", "swarmer", "swarmer", "swarmer", "swarmer", "swarmer"],
    ["charger", "charger", "charger", "shooter", "shooter", "shooter"],
    ["brute", "brute", "healer", "healer", "exploder", "exploder"],
    ["warden", "summoner"],
  ],
  points: 5,
};

/** A gate break: your rank's gate, left alone too long, spills into the city. */
export const BREAK = { days: 3, time: 75, every: 10, pack: 4, maxAlive: 10, gold: 100 };

/**
 * A boss entering its second phase roars: it throws the player clear without
 * harm and then waits, so the change is never a free hit on someone in melee.
 */
export const ROAR = { push: 620, pause: 1, radius: 260 };

/** Every shockwave ring shows where it will start for this long before it moves. */
export const RING_WARNING = 0.8;
