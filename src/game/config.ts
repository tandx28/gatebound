/** Logical view size. The canvas scales this to the window. */
export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Fixed simulation step, in seconds. */
export const STEP = 1 / 120;

export const ROOM = { w: 1600, h: 1000 };

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
  /** Brief invulnerability after taking a hit, so one lunge cannot hit twice. */
  hurtIframes: 0.5,
};

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
