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

export type SkillId = "pierce" | "whirl" | "surge" | "rally" | "blink" | "domain";

export interface SkillDef {
  name: string;
  /** What it does, for the skills tab. */
  about: string;
  /** Key of the slot it sits in by default; empty if it starts unassigned. */
  key: string;
  /** Input code of that slot. */
  code: string;
  level: number;
  mana: number;
  cooldown: number;
}

export const SKILL_IDS: SkillId[] = ["pierce", "whirl", "surge", "rally", "blink", "domain"];

/** The four skill slots: three keys and the right mouse button. */
export const SKILL_SLOTS: { key: string; code: string }[] = [
  { key: "Q", code: "KeyQ" },
  { key: "E", code: "KeyE" },
  { key: "R", code: "KeyR" },
  { key: "RMB", code: "Mouse2" },
];
export const DEFAULT_LOADOUT: (SkillId | null)[] = ["pierce", "whirl", "surge", "rally"];

export const SKILLS: Record<SkillId, SkillDef> = {
  pierce: { name: "Pierce", about: "Lunge through enemies for heavy damage", key: "Q", code: "KeyQ", level: 3, mana: 6, cooldown: 4 },
  whirl: { name: "Whirl", about: "Strike everything around you", key: "E", code: "KeyE", level: 6, mana: 8, cooldown: 6 },
  surge: { name: "Surge", about: "Move, attack and hit harder for a while", key: "R", code: "KeyR", level: 10, mana: 12, cooldown: 20 },
  rally: { name: "Rally", about: "Send every echo at the enemy nearest the cursor", key: "RMB", code: "Mouse2", level: 20, mana: 10, cooldown: 14 },
  blink: { name: "Blink", about: "Teleport to the cursor and burst on arrival", key: "", code: "", level: 32, mana: 8, cooldown: 7 },
  domain: { name: "Domain", about: "Slow every enemy in the room and soften them", key: "", code: "", level: 45, mana: 16, cooldown: 25 },
};

export const RALLY = { time: 6, damage: 1.5 };
export const BLINK = { range: 320, radius: 75, mult: 1.5, iframes: 0.25 };
export const DOMAIN = { time: 5, slow: 0.5, vulnerable: 1.2 };

/** Ailments enemies inflict from Rank B. Shares are of maximum health per second. */
export type StatusId = "poison" | "burn" | "slow";
export const STATUS = {
  poison: { dps: 0.01, time: 5, max: 5 },
  burn: { dps: 0.03, time: 3 },
  slow: { speed: 0.65, time: 3 },
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
  | "duellist"
  | "leaper"
  | "pyro"
  | "warder"
  | "assassin"
  | "knight"
  | "totem"
  | "warper"
  | "colossus"
  | "egg"
  | "queen"
  | "commander"
  | "monarch";

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
  leaper: { name: "Leaper", radius: 14, hp: 30, speed: 130, damage: 24, xp: 18, boss: false },
  pyro: { name: "Pyre Caster", radius: 12, hp: 22, speed: 100, damage: 20, xp: 20, boss: false },
  warder: { name: "Warder", radius: 20, hp: 70, speed: 75, damage: 22, xp: 26, boss: false },
  assassin: { name: "Shade", radius: 12, hp: 26, speed: 170, damage: 30, xp: 24, boss: false },
  knight: { name: "Gate Knight", radius: 18, hp: 60, speed: 110, damage: 26, xp: 28, boss: false },
  totem: { name: "War Totem", radius: 16, hp: 50, speed: 0, damage: 0, xp: 22, boss: false },
  warper: { name: "Warper", radius: 13, hp: 28, speed: 110, damage: 16, xp: 26, boss: false },
  colossus: { name: "Colossus", radius: 34, hp: 160, speed: 60, damage: 36, xp: 44, boss: false },
  egg: { name: "Egg", radius: 12, hp: 8, speed: 0, damage: 0, xp: 0, boss: false },
  queen: { name: "The Brood Queen", radius: 36, hp: 9000, speed: 55, damage: 110, xp: 4000, boss: true },
  commander: { name: "Knight Commander", radius: 20, hp: 20000, speed: 170, damage: 150, xp: 9000, boss: true },
  monarch: { name: "The Hollow Monarch", radius: 24, hp: 45000, speed: 140, damage: 190, xp: 20000, boss: true },
};

export const LEAPER = { range: 330, windup: 0.5, air: 0.35, radius: 85, recover: 0.7, cooldown: 1.6 };
export const PYRO = { near: 260, far: 420, cast: 0.6, cooldown: 3.2, radius: 72, fuse: 1, spread: 140 };
/** Others near a warder take only this share of damage. */
export const WARDER = { range: 100, windup: 0.9, slamRadius: 110, recover: 1.2, aura: 210, shield: 0.4 };
export const ASSASSIN = { vanish: 1, behind: 55, windup: 0.4, lungeSpeed: 560, lungeTime: 0.16, recover: 0.7, cooldown: 2.2 };
/** A knight's guard soaks hits; break it and the knight is stunned and open. */
export const KNIGHT = { guard: 0.35, range: 75, windup: 0.5, lungeSpeed: 480, lungeTime: 0.18, recover: 0.8, broken: 2.5 };
/** While a totem stands, every enemy hits harder and mends. */
export const TOTEM = { damage: 1.4, regen: 0.03 };
export const WARPER = { near: 240, far: 400, cast: 0.8, cooldown: 5, shotCooldown: 2 };
export const COLOSSUS = { range: 140, windup: 1, slamRadius: 150, recover: 1.4, patchRadius: 110, patchLife: 8, maxPatches: 4 };
export const EGG = { hatch: 4, hatchFast: 3, max: 10 };

/** Bosses with more than two phases. */
export const PHASES: Partial<Record<EnemyKind, number>> = { monarch: 3 };
/** How long a third-phase monarch turns the player's echoes against them. */
export const DOMINION = { cast: 1.5, time: 6, every: 18, damage: 0.25 };

export type Rank = "E" | "D" | "C" | "B" | "A" | "S";
export const RANK_IDS: Rank[] = ["E", "D", "C", "B", "A", "S"];

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
  B: { minLevel: 20, hpMult: 12, dmgMult: 4.5, xpMult: 10, rooms: 9, kinds: ["leaper", "pyro", "warder"], boss: "queen" },
  A: { minLevel: 30, hpMult: 18, dmgMult: 6, xpMult: 20, rooms: 10, kinds: ["assassin", "knight", "totem"], boss: "commander" },
  S: { minLevel: 42, hpMult: 26, dmgMult: 7.8, xpMult: 40, rooms: 11, kinds: ["warper", "colossus", "knight", "assassin", "pyro", "leaper"], boss: "monarch" },
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

/** The daily quest at Rank E: all three goals, reset each calendar day. */
export const DAILY = { kills: 40, rooms: 5, gates: 1, points: 3 };

/** The daily quest grows with the hunter's rank, and so does its reward. */
export function dailyGoals(rank: Rank): typeof DAILY {
  const i = RANK_IDS.indexOf(rank);
  return {
    kills: [40, 48, 56, 64, 72, 80][i],
    rooms: [5, 5, 6, 6, 7, 8][i],
    gates: [1, 1, 1, 2, 2, 2][i],
    points: [3, 3, 4, 4, 5, 6][i],
  };
}

/** Leaving a gate early keeps only this share of its gold. */
export const RETREAT = { goldKeep: 0.5 };

/** The rank suited to a level, for instances that scale to the player. */
export function rankForLevel(level: number): Rank {
  let best: Rank = "E";
  for (const r of RANK_IDS) if (level >= RANKS[r].minLevel) best = r;
  return best;
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
  roster: 20,
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
  /** Share of the player's own hit an echo deals, before the bonuses below. */
  damage: 0.3,
  /** A boss echo hits this much harder than a common one. */
  bossDamage: 2.2,
  /** An echo bound in a higher gate is stronger for good. */
  rankBonus: { E: 1, D: 1.1, C: 1.2, B: 1.35, A: 1.5, S: 1.7 } as Record<Rank, number>,
};

/** How many echoes can fight at once: two at first, growing to ten by level 60. */
export function echoCap(level: number): number {
  return Math.max(2, Math.min(10, 2 + Math.floor((level - 12) / 6)));
}

/** How many of them may be bosses: one, then two at level 30 and three at 45. */
export function bossEchoCap(level: number): number {
  return level >= 45 ? 3 : level >= 30 ? 2 : 1;
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
