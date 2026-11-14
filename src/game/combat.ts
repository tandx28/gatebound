import { angleDiff, clamp } from "../engine/vec";

/** Pure combat maths. No rendering or input here, so it is unit-testable. */

export interface Circle {
  x: number;
  y: number;
  radius: number;
  /** Where it was one step ago, so the view can draw between steps. */
  px?: number;
  py?: number;
}

/**
 * Does a melee arc hit a circular target?
 * The arc starts at (ox, oy), points along `facing`, and spans `halfAngle`
 * to each side out to `range`. The target's own radius widens the test.
 */
export function inArc(
  ox: number,
  oy: number,
  facing: number,
  halfAngle: number,
  range: number,
  target: Circle,
): boolean {
  const dx = target.x - ox;
  const dy = target.y - oy;
  const d = Math.hypot(dx, dy);
  if (d > range + target.radius) return false;
  if (d <= target.radius) return true;
  const slack = Math.asin(Math.min(1, target.radius / d));
  return Math.abs(angleDiff(Math.atan2(dy, dx), facing)) <= halfAngle + slack;
}

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

/** Roll one hit. `rng` returns a number in [0, 1). */
export function rollDamage(
  base: number,
  critChance: number,
  critMult: number,
  rng: () => number = Math.random,
): DamageRoll {
  const crit = rng() < critChance;
  return { amount: Math.round(base * (crit ? critMult : 1)), crit };
}

export function applyDamage(hp: number, amount: number): number {
  return Math.max(0, hp - Math.max(0, amount));
}

/** Number of hits of `damage` needed to take `hp` to zero. */
export function hitsToKill(hp: number, damage: number): number {
  return damage <= 0 ? Infinity : Math.ceil(hp / damage);
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
}

/** Push two overlapping circles apart by half the overlap each. */
export function separate(a: Circle, b: Circle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const overlap = a.radius + b.radius - d;
  if (overlap <= 0) return;
  // Coincident centres have no direction; pick one so they still part.
  const nx = d > 1e-6 ? dx / d : 1;
  const ny = d > 1e-6 ? dy / d : 0;
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
}

/** Keep a circle inside a room whose corner is at the origin. */
export function clampToRoom(c: Circle, w: number, h: number): void {
  c.x = clamp(c.x, c.radius, w - c.radius);
  c.y = clamp(c.y, c.radius, h - c.radius);
}
