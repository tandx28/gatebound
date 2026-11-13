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
  warden: { name: "Stone Warden", radius: 38, hp: 420, speed: 80, damage: 30, xp: 200, boss: true },
  summoner: { name: "The Choirmaster", radius: 24, hp: 900, speed: 120, damage: 24, xp: 600, boss: true },
  duellist: { name: "Mirror Blade", radius: 16, hp: 1800, speed: 210, damage: 45, xp: 1500, boss: true },
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
  E: { minLevel: 1, hpMult: 1, dmgMult: 1, xpMult: 1, rooms: 5, kinds: ["swarmer", "charger", "shooter"], boss: "warden" },
  D: { minLevel: 6, hpMult: 2.2, dmgMult: 1.5, xpMult: 2.5, rooms: 6, kinds: ["shooter", "exploder", "brute"], boss: "summoner" },
  C: { minLevel: 13, hpMult: 4, dmgMult: 2.2, xpMult: 5, rooms: 7, kinds: ["charger", "healer", "brute"], boss: "duellist" },
};
