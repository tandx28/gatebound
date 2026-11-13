import { applyDamage, type Circle } from "./combat";
import { PLAYER, type EnemyKind, type Rank, type SkillId } from "./config";
import type { Dungeon } from "./dungeon";
import type { Derived, Progress } from "./stats";

/** Shared simulation state and the small helpers every system needs. */

export interface Player extends Circle {
  hp: number;
  mana: number;
  prog: Progress;
  /** Combat values derived from stats. */
  d: Derived;
  facing: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  iframes: number;
  attackCd: number;
  attackT: number;
  attackFacing: number;
  /** Identifies the current swing or skill so each enemy is hit once by it. */
  swingId: number;
  hurtFlash: number;
  skillCd: Record<SkillId, number>;
  /** Pierce in flight. */
  lungeT: number;
  lungeX: number;
  lungeY: number;
  surgeT: number;
  moving: boolean;
}

export interface Enemy extends Circle {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** Contact or attack damage, already scaled by gate rank. */
  dmg: number;
  xp: number;
  boss: boolean;
  phase: 1 | 2;
  state: string;
  /** Time left in the current state. */
  t: number;
  /** General cooldowns; meaning depends on kind. */
  cd: number;
  cd2: number;
  /** General counter; meaning depends on kind. */
  n: number;
  dirX: number;
  dirY: number;
  facing: number;
  /** Knockback velocity, decays quickly. */
  kx: number;
  ky: number;
  lastSwing: number;
  flash: number;
  hasHit: boolean;
  /** Seconds of invulnerability left. */
  inv: number;
}

export interface Projectile extends Circle {
  vx: number;
  vy: number;
  damage: number;
  life: number;
}

/** A telegraphed blast: it goes off when `t` reaches zero. */
export interface Zone {
  x: number;
  y: number;
  radius: number;
  t: number;
  total: number;
  damage: number;
  /** If set and dead before the blast, the blast is cancelled. */
  owner?: Enemy;
}

/** An expanding ring that must be dashed through. */
export interface Shockwave {
  x: number;
  y: number;
  r: number;
  speed: number;
  maxR: number;
  damage: number;
  hit: boolean;
}

/** A purely visual ground effect. */
export interface Fx {
  kind: "ring" | "blast";
  x: number;
  y: number;
  radius: number;
  t: number;
  total: number;
  color: string;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  big: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/** A System message shown briefly at the top of the screen. */
export interface Notice {
  title: string;
  body: string;
  life: number;
}

export type Menu = "none" | "status";
export type Mode = "select" | "gate" | "cleared" | "dead";

export interface World {
  mode: Mode;
  menu: Menu;
  notices: Notice[];
  player: Player;
  enemies: Enemy[];
  /** Enemies created mid-step; added once the enemy loop finishes. */
  spawnQueue: Enemy[];
  projectiles: Projectile[];
  zones: Zone[];
  shockwaves: Shockwave[];
  fx: Fx[];
  texts: FloatText[];
  particles: Particle[];
  dungeon: Dungeon | null;
  roomId: number;
  rank: Rank;
  doorsOpen: boolean;
  /** Countdown from the boss kill to the cleared screen. */
  clearT: number;
  kills: number;
  shake: number;
  hitstop: number;
  rng: () => number;
}

export function burst(w: World, x: number, y: number, color: string, n: number, speed: number): void {
  for (let i = 0; i < n; i++) {
    const a = w.rng() * Math.PI * 2;
    const s = speed * (0.4 + w.rng() * 0.6);
    w.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + w.rng() * 0.3, color });
  }
}

export function floatText(w: World, x: number, y: number, text: string, color: string, big = false): void {
  w.texts.push({ x, y, text, life: big ? 0.8 : 0.6, color, big });
}

/** Damage the player unless invulnerable. Returns true when the hit landed. */
export function hurtPlayer(w: World, amount: number): boolean {
  const p = w.player;
  if (p.iframes > 0 || w.mode !== "gate") return false;
  const dmg = Math.round(amount);
  p.hp = applyDamage(p.hp, dmg);
  p.iframes = PLAYER.hurtIframes;
  p.hurtFlash = 0.25;
  w.shake = Math.max(w.shake, 10);
  w.hitstop = Math.max(w.hitstop, 0.07);
  floatText(w, p.x, p.y, `-${dmg}`, "#ff5a60", true);
  burst(w, p.x, p.y, "#5ee6ff", 10, 220);
  if (p.hp <= 0) w.mode = "dead";
  return true;
}

/** An immediate blast: visual, plus damage if the player is inside. */
export function blast(w: World, x: number, y: number, radius: number, damage: number, color = "#ff5a60"): void {
  w.fx.push({ kind: "blast", x, y, radius, t: 0.3, total: 0.3, color });
  burst(w, x, y, color, 14, 300);
  w.shake = Math.max(w.shake, 5);
  const p = w.player;
  if (Math.hypot(p.x - x, p.y - y) < radius + p.radius * 0.5) hurtPlayer(w, damage);
}
