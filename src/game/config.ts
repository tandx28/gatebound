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

export type SkillId =
  | "pierce"
  | "whirl"
  | "surge"
  | "rally"
  | "blink"
  | "domain"
  | "swap"
  | "sacrifice"
  | "parry"
  | "shot"
  | "ward"
  | "drain"
  | "cleave"
  | "quake"
  | "mend"
  | "frost"
  | "chain"
  | "meteor"
  | "mark"
  | "legion";

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

export const SKILL_IDS: SkillId[] = [
  "pierce",
  "whirl",
  "surge",
  "rally",
  "swap",
  "sacrifice",
  "blink",
  "parry",
  "shot",
  "domain",
  "ward",
  "drain",
  "cleave",
  "quake",
  "mend",
  "frost",
  "chain",
  "meteor",
  "mark",
  "legion",
];

/** The pages of the skills tab: skills grouped by what they are for. */
export const SKILL_GROUPS: { name: string; about: string; skills: SkillId[] }[] = [
  { name: "BLADE", about: "strikes and movement", skills: ["pierce", "whirl", "cleave", "blink", "shot", "quake"] },
  { name: "GUARD", about: "staying alive and hitting harder", skills: ["surge", "parry", "mend", "ward", "drain"] },
  { name: "ARCANE", about: "control and ruin from afar", skills: ["frost", "chain", "mark", "domain", "meteor"] },
  { name: "ECHO", about: "commands for an Echo Caller's army", skills: ["rally", "swap", "sacrifice", "legion"] },
];

/**
 * The skill slots: three keys and the right mouse button, then three more
 * that open one per New Game+ cycle (`cycle` is the cycle that opens it).
 */
export const SKILL_SLOTS: { key: string; code: string; cycle: number }[] = [
  { key: "Q", code: "KeyQ", cycle: 0 },
  { key: "E", code: "KeyE", cycle: 0 },
  { key: "R", code: "KeyR", cycle: 0 },
  { key: "RMB", code: "Mouse2", cycle: 0 },
  { key: "1", code: "Digit1", cycle: 1 },
  { key: "2", code: "Digit2", cycle: 2 },
  { key: "3", code: "Digit3", cycle: 3 },
];
export const DEFAULT_LOADOUT: (SkillId | null)[] = ["pierce", "whirl", "surge", "rally", null, null, null];

export const SKILLS: Record<SkillId, SkillDef> = {
  pierce: { name: "Pierce", about: "Lunge through enemies for heavy damage", key: "Q", code: "KeyQ", level: 3, mana: 6, cooldown: 4 },
  whirl: { name: "Whirl", about: "Strike everything around you", key: "E", code: "KeyE", level: 6, mana: 8, cooldown: 6 },
  surge: { name: "Surge", about: "Move, attack and hit harder for a while", key: "R", code: "KeyR", level: 10, mana: 12, cooldown: 20 },
  rally: { name: "Rally", about: "Send every echo at the enemy nearest the cursor", key: "RMB", code: "Mouse2", level: 20, mana: 10, cooldown: 14 },
  blink: { name: "Blink", about: "Teleport to the cursor and burst on arrival", key: "", code: "", level: 32, mana: 8, cooldown: 7 },
  domain: { name: "Domain", about: "Slow every enemy in the room and soften them", key: "", code: "", level: 45, mana: 16, cooldown: 25 },
  swap: { name: "Trade Places", about: "Swap places with the echo nearest the cursor", key: "", code: "", level: 24, mana: 6, cooldown: 8 },
  sacrifice: { name: "Last Order", about: "The echo nearest the cursor bursts", key: "", code: "", level: 30, mana: 14, cooldown: 18 },
  parry: { name: "Parry", about: "Turn the next blow within a moment back on those nearby", key: "", code: "", level: 36, mana: 5, cooldown: 6 },
  shot: { name: "Long Shot", about: "A line of force through everything ahead", key: "", code: "", level: 42, mana: 12, cooldown: 9 },
  ward: { name: "Ward", about: "The next hit you take does nothing", key: "", code: "", level: 48, mana: 14, cooldown: 22 },
  drain: { name: "Blood Price", about: "For a while, your blows heal you", key: "", code: "", level: 54, mana: 16, cooldown: 24 },
  cleave: { name: "Rending Arc", about: "A wide, heavy cut across everything in front", key: "", code: "", level: 14, mana: 7, cooldown: 5 },
  frost: { name: "Frost Nova", about: "Chill everything near you; they slow to a crawl", key: "", code: "", level: 16, mana: 9, cooldown: 10 },
  mend: { name: "Second Wind", about: "Recover a share of your health at once", key: "", code: "", level: 18, mana: 12, cooldown: 30 },
  chain: { name: "Arc Chain", about: "Lightning leaps from enemy to enemy", key: "", code: "", level: 26, mana: 10, cooldown: 7 },
  quake: { name: "Earthbreaker", about: "Split the ground ahead; it stuns what it hits", key: "", code: "", level: 28, mana: 11, cooldown: 9 },
  legion: { name: "Echo Fury", about: "Every echo hits far harder for a while", key: "", code: "", level: 34, mana: 14, cooldown: 26 },
  mark: { name: "Death Mark", about: "The enemy nearest the cursor takes more damage", key: "", code: "", level: 38, mana: 8, cooldown: 12 },
  meteor: { name: "Falling Star", about: "A star strikes the cursor after a breath", key: "", code: "", level: 50, mana: 18, cooldown: 16 },
};

export const SWAP = { iframes: 0.3 };
export const SACRIFICE = { radius: 170, mult: 5 };
export const PARRY = { time: 0.45, radius: 150, mult: 2.5, stun: 0.9 };
export const SHOT = { range: 720, width: 30, mult: 3.2 };
export const DRAIN = { time: 6, share: 0.12 };
/** Rending Arc: reach, half the arc's angle, damage. */
export const CLEAVE = { range: 150, half: 1.2, mult: 2.6, knock: 340 };
/** Earthbreaker: blasts walking out from the hunter, one after another. */
export const QUAKE = { count: 4, step: 95, radius: 72, first: 0.08, gap: 0.09, mult: 1.7, stun: 1 };
/** Second Wind: share of health restored. */
export const MEND = { heal: 0.3 };
/** Frost Nova: radius, damage, and seconds of chill. */
export const FROST = { radius: 210, mult: 1.1, chill: 4 };
/** Arc Chain: how many enemies it reaches, how far each leap goes, how far the first. */
export const CHAIN = { jumps: 5, leap: 260, reach: 560, mult: 1.8 };
/** Falling Star: delay before it lands, blast radius, damage. */
export const METEOR = { delay: 0.8, radius: 150, mult: 4.5 };
/** Death Mark: seconds, and how much more damage the marked enemy takes. */
export const MARK = { time: 8, vulnerable: 1.5 };
/** Echo Fury: seconds, and how much harder echoes hit. */
export const LEGION = { time: 8, damage: 1.6 };

/** A class, chosen on the board once the rite is done. H is its own power. */
export type ClassId = "echo" | "vanguard" | "ranger" | "arcanist";
export const CLASS_IDS: ClassId[] = ["echo", "vanguard", "ranger", "arcanist"];
export interface ClassDef {
  name: string;
  /** The H power: its name and what it does. */
  power: string;
  powerAbout: string;
  /** What the class always has. */
  passive: string;
  /** Seconds between uses of the H power. */
  cooldown: number;
  /** New Game+ cycle that opens the class. */
  cycle: number;
}
export const CLASSES: Record<ClassId, ClassDef> = {
  echo: { name: "Echo Caller", power: "Arise", powerAbout: "send your army away or call it back", passive: "binds the fallen (G) and fights with an army", cooldown: 1.2, cycle: 0 },
  vanguard: { name: "Vanguard", power: "Bulwark", powerAbout: "throw back foes; half damage taken, +30% blows for 6 s", passive: "+25% health, take 10% less from every hit", cooldown: 24, cycle: 0 },
  ranger: { name: "Ranger", power: "Arrow Storm", powerAbout: "eight arrows rain round the cursor", passive: "bows hit 25% harder, +5% crit, faster dash", cooldown: 14, cycle: 0 },
  arcanist: { name: "Arcanist", power: "Overflow", powerAbout: "full mana, skills ready, skills +40% for 6 s", passive: "+30% skill power, +30% mana, faster mana", cooldown: 40, cycle: 1 },
};
export const VANGUARD = { time: 6, taken: 0.5, damage: 1.3, radius: 170, knock: 560, hp: 1.25, guard: 0.9 };
export const RANGER = { arrows: 8, spread: 130, radius: 62, delay: 0.45, gap: 0.08, mult: 1.5, bow: 1.25, dash: 0.75, crit: 0.05 };
export const ARCANIST = { time: 6, power: 1.4, skill: 1.3, mana: 1.3, regen: 1.6 };
/** Which sound each of the later skills borrows. */
export const SKILL_SOUND: Partial<Record<SkillId, string>> = { swap: "dash", sacrifice: "blast", parry: "block", shot: "pierce", ward: "chime", drain: "surge" };

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
  | "monarch"
  | "redactor";

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
  queen: { name: "The Brood Queen", radius: 36, hp: 14000, speed: 55, damage: 145, xp: 4000, boss: true },
  commander: { name: "Knight Commander", radius: 20, hp: 20000, speed: 170, damage: 120, xp: 9000, boss: true },
  monarch: { name: "The Hollow Monarch", radius: 24, hp: 34000, speed: 140, damage: 125, xp: 20000, boss: true },
  redactor: { name: "The Redactor", radius: 30, hp: 90000, speed: 150, damage: 150, xp: 40000, boss: true },
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
  B: { minLevel: 20, hpMult: 15, dmgMult: 5.5, xpMult: 10, rooms: 9, kinds: ["leaper", "pyro", "warder"], boss: "queen" },
  A: { minLevel: 30, hpMult: 18, dmgMult: 6, xpMult: 20, rooms: 10, kinds: ["assassin", "knight", "totem"], boss: "commander" },
  S: { minLevel: 42, hpMult: 26, dmgMult: 7.2, xpMult: 40, rooms: 11, kinds: ["warper", "colossus", "knight", "assassin", "pyro", "leaper"], boss: "monarch" },
};

/** A sealed gate: found out only once inside. No retreat, tougher, colder, richer. */
export const SEALED = {
  chance: 1 / 8,
  /** Luck aside, at least one gate in this many is sealed. */
  pity: 6,
  hp: 1.8,
  dmg: 1.4,
  reward: 2,
  coldEvery: 3,
  /** Its boss is flanked by this many guards, each this much tougher than usual. */
  guards: 2,
  guardHp: 1,
  /** The boss starts in its second phase, so it brings only this share of its health. */
  bossHp: 0.45,
};

/**
 * How much tougher and harder-hitting a sealed gate's enemies are. The top
 * ranks are already brutal, so the seal adds less there: measured with the
 * bot so that a hunter at the end of a rank clears its sealed gate at least
 * half the time.
 */
export const SEALED_SCALE: Record<Rank, { hp: number; dmg: number; reward: number }> = {
  E: { hp: SEALED.hp, dmg: SEALED.dmg, reward: SEALED.reward },
  D: { hp: SEALED.hp, dmg: SEALED.dmg, reward: SEALED.reward },
  C: { hp: SEALED.hp, dmg: SEALED.dmg, reward: SEALED.reward },
  B: { hp: SEALED.hp, dmg: SEALED.dmg, reward: SEALED.reward },
  A: { hp: 1.5, dmg: 1.2, reward: SEALED.reward },
  S: { hp: 1.3, dmg: 1.1, reward: SEALED.reward },
};

/** Who stands guard beside the boss of a sealed gate of each rank. */
export const SEALED_GUARD: Record<Rank, EnemyKind> = { E: "charger", D: "brute", C: "brute", B: "warder", A: "knight", S: "colossus" };

/** A sudden timed order on entering a room. */
export const EMERGENCY = { chance: 0.15, base: 10, perEnemy: 7, hpLoss: 0.3, bonus: 0.5 };

/** A hidden door behind the boss, leading to a harder echo of it. */
/** `pity`: luck aside, the fifth boss in a row without a hidden door always opens one. */
export const HIDDEN = { chance: 0.15, pity: 5, hp: 0.7, dmg: 1.3, gold: 400 };

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
/** A heavy blow (sword, spear, any skill) breaks a small enemy's wind-up. Bosses and big enemies shrug it off. */
export const STAGGER = { maxRadius: 18, time: 0.45 };
/** How long a fallen enemy lies where it fell. */
export const CORPSE = { time: 1.6, sink: 0.5 };

/**
 * Nightmare: offered once New Game+ has been finished to its last cycle.
 * Everything is tougher still, bosses fight as if already wounded and act
 * sooner, death costs double, and kills pay and drop twice as much.
 */
export const NIGHTMARE = { hp: 2, dmg: 1.5, reward: 2, drop: 2, deathLoss: 2, bossPace: 0.7 };

/** New Game+: the story again with everything kept, against stronger enemies that pay more. */
export const NGPLUS = { max: 3, harder: 0.6, reward: 0.5 };

/**
 * The tower: one room a floor, without end. Every tenth floor climbs a rank
 * (and stays at S from floor 51), and within a rank each floor is a little
 * harder than the last. Every fifth floor is a boss, and pays out.
 */
export const TOWER = { openRank: "C" as Rank, bossEvery: 5, floorsPerRank: 10, perFloor: 0.07, pack: 3, packGrow: 0.3, maxPack: 9, rest: 2.5, gold: 60 };

/**
 * The time trial: the tower against a clock. Each floor cleared buys time;
 * when the clock runs out the climb ends and everything earned is kept.
 */
export const CLOCK = { start: 90, perFloor: 15, perBoss: 30, title: 15 };

/**
 * The boss rush: every rank's master in turn, all at Rank S strength, with a
 * short breath and a little health between. Opens once the story is told.
 */
export const RUSH = {
  rest: 3,
  heal: 0.3,
  gold: 4000,
  /** Each round's masters, by the rank whose boss they are: six alone, then pairs, then three at once. */
  rounds: [["E"], ["D"], ["C"], ["B"], ["A"], ["S"], ["D", "C"], ["B", "A"], ["C", "A", "S"]] as Rank[][],
};

/**
 * Boss floors of the tower and the time trial: from floor 20 every tenth
 * floor holds two masters, and from floor 40 three. With more than one boss
 * up, their big moves take turns, at least `lull` seconds apart.
 */
export const MULTI = { pairFrom: 20, trioFrom: 40, every: 10, lull: 2.2 };

/**
 * A mythic's ultimate, on Y. Seconds to recharge; each kill shortens the
 * wait. The numbers for each are beside it.
 */
export const ULT = {
  charge: 90,
  perKill: 1,
  ashen: { slashes: 5, gap: 0.14, width: 46, mult: 3.2, iframes: 1.1 },
  twin: { strikes: 12, gap: 0.06, reach: 320, radius: 46, mult: 1.8 },
  trial: { delay: 0.3, width: 70, mult: 7 },
  crown: { time: 10 },
  seal: { stun: 3, delay: 3 },
  mantle: { time: 5, radius: 240, knock: 600 },
  wave: { delay: 0.45, base: 3, low: 6 },
  favour: { mark: 10 },
  quill: { delay: 1.1, mult: 9 },
};

/**
 * The practice room where a mythic's ultimate can be seen from the board:
 * inert targets in a ring, the hunter untouchable, back to the board this
 * long after the ultimate is used (or at once with Esc).
 */
export const PRACTICE = {
  after: 6,
  ring: 230,
  hp: 1e7,
  dummies: ["brute", "charger", "swarmer", "shooter", "brute", "knight"] as EnemyKind[],
  /** Echoes lent for the Hollow Court when the hunter has none of their own. */
  echoes: ["knight", "assassin", "brute", "shooter"] as EnemyKind[],
};

/** Kills of a kind that unlock its lore and then each damage bonus. Bosses need a tenth. */
export const BESTIARY = { lore: 10, tiers: [50, 150, 500], bonus: [0.1, 0.2, 0.3], bossShare: 0.1 };

/**
 * The struck lines: five hidden pages, then four glyph stones on floor 13 of
 * the tower, struck in order, open the Redactor's margin.
 */
export const LINES = { count: 5, floor: 13, stillFor: 60, towerFloor: 30, stoneRadius: 36, rest: 40, level: 60 };

/** The Redactor's moves. Damage is a share of the hunter's health where it says so; erasure and strikethrough kill outright. */
export const REDACTOR = {
  /** Seconds between moves in each stage, and the breath after a stage begins. */
  every: [3.4, 2.7, 2.0],
  grace: 3,
  stages: [0.66, 0.33],
  erasure: { warn: 2.5, safe: 3, radius: 72 },
  strike: { warn: 1.5, speed: 1150, thick: 34 },
  quills: { count: 5, speed: 300, turn: 2.2, life: 5, share: 0.18 },
  bars: { count: 5, warn: 1, gap: 0.3, width: 70, share: 0.35 },
  footnote: { warn: 1.1, radius: 130, share: 0.3 },
  melee: { range: 90, windup: 0.7, radius: 120, share: 0.3 },
  /** The last stage: the floor closes in to this radius and hurts anyone outside it. */
  shrink: { from: 760, to: 360, time: 25, share: 0.1 },
};

export function towerRank(floor: number): Rank {
  return RANK_IDS[Math.min(RANK_IDS.length - 1, Math.floor((floor - 1) / TOWER.floorsPerRank))];
}

/** Actions that can be moved to another key: the key each has by default, and its name. */
export const BINDABLE: [string, string][] = [
  ["KeyW", "Move up"],
  ["KeyS", "Move down"],
  ["KeyA", "Move left"],
  ["KeyD", "Move right"],
  ["Space", "Dash"],
  ["KeyQ", "Skill 1"],
  ["KeyE", "Skill 2"],
  ["KeyR", "Skill 3"],
  ["KeyF", "Potion"],
  ["KeyV", "Mana draught"],
  ["KeyB", "Belt item"],
  ["KeyZ", "Next belt item"],
  ["KeyX", "Swap weapon"],
  ["KeyT", "Return Stone"],
  ["KeyG", "Bind a remnant"],
  ["KeyH", "Class power"],
  ["KeyY", "Mythic ultimate"],
  ["KeyJ", "Army orders"],
  ["KeyC", "Status"],
];

/** What the army has been told to do. Guard: fight only what comes this close to the hunter. */
export type ArmyOrder = "hunt" | "guard" | "hold";
export const ORDERS: ArmyOrder[] = ["hunt", "guard", "hold"];
export const ORDER = { guardRadius: 240, holdRange: 420 };
export const ORDER_TEXT: Record<ArmyOrder, string> = { hunt: "HUNT", guard: "GUARD ME", hold: "HOLD HERE" };

/** Calling the army out of the ground, and sending it back. */
export const ARMY = { rise: 0.8, leave: 0.5, cooldown: 1.2 };

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
/** A break comes after `days` of neglect, or after every `afterGates` gates closed: the pressure goes somewhere. */
export const BREAK = { days: 3, afterGates: 8, time: 75, every: 10, pack: 4, maxAlive: 10, gold: 100 };

/**
 * A boss entering its second phase roars: it throws the player clear without
 * harm and then waits, so the change is never a free hit on someone in melee.
 */
export const ROAR = { push: 620, pause: 1, radius: 260 };

/** Every shockwave ring shows where it will start for this long before it moves. */
export const RING_WARNING = 0.8;
