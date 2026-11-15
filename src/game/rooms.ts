import { seeded } from "../engine/rng";
import type { Circle } from "./combat";
import { RANK_IDS, RANKS, ROOM, type Rank } from "./config";
import type { RoomNode } from "./dungeon";
import { damageEnemy } from "./enemies";
import { afflict, hurtPlayer, sfx, type World } from "./state";

/**
 * What stands in a room besides its enemies: pillars that block movement and
 * shots, and traps in the floor. Both are worked out from the room itself
 * (its place in the gate and the gate's rank), so they need no place in the
 * save and never disturb the dice that everything else rolls.
 */

export interface Pillar {
  x: number;
  y: number;
  radius: number;
}

export type TrapKind = "spike" | "flame" | "sludge";

export interface Trap {
  kind: TrapKind;
  x: number;
  y: number;
  /** Reach: a circle's radius, or half the length of a flame jet (which runs east to west). */
  radius: number;
  /** Seconds into its cycle when the room is entered. */
  offset: number;
  /** The last cycle in which it hit the player, and the enemies. */
  hitPlayer: number;
  hitEnemies: number;
}

export type Layout = "open" | "scatter" | "hall" | "ring" | "cross";

export const PILLAR = { radius: 34, big: 62, stun: 1 };
export const TRAPS = {
  spike: { radius: 48, period: 3.2, warn: 1.2, on: 0.35, damage: 12, enemyShare: 0.1 },
  flame: { radius: 150, width: 28, period: 4.6, warn: 1.2, on: 1, damage: 8, enemyShare: 0.08 },
  sludge: { radius: 80 },
  /** The lowest rank at which each kind appears. */
  from: { spike: "E", flame: "C", sludge: "B" } as Record<TrapKind, Rank>,
};

const CX = ROOM.w / 2;
const CY = ROOM.h / 2;
const DOORS: [number, number][] = [[CX, 0], [CX, ROOM.h], [0, CY], [ROOM.w, CY]];

/** Clear of every door, and of the middle where the fight begins. */
function free(x: number, y: number, radius: number, taken: Circle[]): boolean {
  if (Math.hypot(x - CX, y - CY) < 130 + radius) return false;
  for (const [dx, dy] of DOORS) if (Math.hypot(x - dx, y - dy) < 190 + radius) return false;
  return taken.every((t) => Math.hypot(x - t.x, y - t.y) > radius + t.radius + 70);
}

/** The pillars and traps of a room. The same room always gets the same ones. */
export function furnish(rank: Rank, room: RoomNode | null): { layout: Layout; pillars: Pillar[]; traps: Trap[] } {
  if (!room || room.kind !== "normal") return { layout: "open", pillars: [], traps: [] };
  const tier = RANK_IDS.indexOf(rank);
  const rng = seeded((room.gx + 64) * 7919 + (room.gy + 64) * 104729 + room.id * 31 + tier * 1009 + room.depth * 17 + 5);
  const layouts: Layout[] = ["open", "scatter", "scatter", "hall", "ring", "cross"];
  const layout = layouts[Math.floor(rng() * layouts.length)];
  const r = PILLAR.radius;
  let pillars: Pillar[] = [];
  if (layout === "hall") {
    for (const y of [CY - 160, CY + 160]) for (const x of [CX - 320, CX, CX + 320]) pillars.push({ x, y, radius: r });
  } else if (layout === "ring") {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      pillars.push({ x: CX + Math.cos(a) * 250, y: CY + Math.sin(a) * 250, radius: r });
    }
  } else if (layout === "cross") {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pillars.push({ x: CX + sx * 290, y: CY + sy * 190, radius: PILLAR.big });
  } else if (layout === "scatter") {
    for (let tries = 0; tries < 40 && pillars.length < 4; tries++) {
      const x = 200 + rng() * (ROOM.w - 400);
      const y = 170 + rng() * (ROOM.h - 340);
      if (free(x, y, r, pillars)) pillars.push({ x, y, radius: r });
    }
  }
  pillars = pillars.filter((p) => DOORS.every(([dx, dy]) => Math.hypot(p.x - dx, p.y - dy) > 190 + p.radius));

  const kinds = (["spike", "flame", "sludge"] as TrapKind[]).filter((k) => tier >= RANK_IDS.indexOf(TRAPS.from[k]));
  // More traps the higher the rank: none in some Rank E rooms, up to four at the top.
  const count = Math.min(4, Math.floor(rng() * 2) + Math.floor((tier + 1) / 2));
  const traps: Trap[] = [];
  for (let tries = 0; tries < 60 && traps.length < count; tries++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const radius = TRAPS[kind].radius;
    const x = 220 + rng() * (ROOM.w - 440);
    const y = 160 + rng() * (ROOM.h - 320);
    const reach = kind === "flame" ? radius : radius;
    if (!free(x, y, reach, [...pillars, ...traps])) continue;
    traps.push({ kind, x, y, radius, offset: rng() * 3, hitPlayer: -1, hitEnemies: -1 });
  }
  return { layout, pillars, traps };
}

/** Push a body out of any pillar it overlaps. Returns true if it was touching one. */
export function blockCircle(c: Circle, pillars: Pillar[]): boolean {
  let hit = false;
  for (const p of pillars) {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const gap = Math.hypot(dx, dy);
    const min = c.radius + p.radius;
    if (gap >= min) continue;
    hit = true;
    // Dead centre has no way out of its own: pick one.
    const nx = gap > 1e-6 ? dx / gap : 1;
    const ny = gap > 1e-6 ? dy / gap : 0;
    c.x = p.x + nx * min;
    c.y = p.y + ny * min;
  }
  return hit;
}

/** Whether a point lies inside a pillar: a shot that does is spent. */
export function insidePillar(x: number, y: number, pillars: Pillar[]): boolean {
  return pillars.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius);
}

/** What a timed trap is doing at this moment, and which cycle it is in. */
export function trapPhase(t: Trap, clock: number): { phase: "idle" | "warn" | "on"; cycle: number; k: number } {
  if (t.kind === "sludge") return { phase: "on", cycle: 0, k: 1 };
  const def = TRAPS[t.kind];
  const at = clock + t.offset;
  const cycle = Math.floor(at / def.period);
  const into = at - cycle * def.period;
  const onAt = def.period - def.on;
  const warnAt = onAt - def.warn;
  if (into >= onAt) return { phase: "on", cycle, k: (into - onAt) / def.on };
  if (into >= warnAt) return { phase: "warn", cycle, k: (into - warnAt) / def.warn };
  return { phase: "idle", cycle, k: 0 };
}

function inTrap(t: Trap, c: Circle): boolean {
  if (t.kind === "flame") return Math.abs(c.x - t.x) < t.radius + c.radius * 0.5 && Math.abs(c.y - t.y) < TRAPS.flame.width + c.radius * 0.5;
  return Math.hypot(c.x - t.x, c.y - t.y) < t.radius + c.radius * 0.5;
}

/** Run the room's traps. They do not care who stands on them. */
export function stepTraps(w: World, dt: number): void {
  w.trapClock += dt;
  const p = w.player;
  const scale = RANKS[w.rank].dmgMult;
  for (const t of w.traps) {
    if (t.kind === "sludge") {
      if (inTrap(t, p) && p.dashT <= 0) afflict(w, "slow");
      for (const e of w.enemies) if (inTrap(t, e)) e.chillT = Math.max(e.chillT, 0.3);
      continue;
    }
    const { phase, cycle } = trapPhase(t, w.trapClock);
    if (phase !== "on") continue;
    const def = TRAPS[t.kind];
    if (t.hitEnemies !== cycle) {
      t.hitEnemies = cycle;
      sfx(w, t.kind === "spike" ? "block" : "blast");
      for (const e of w.enemies) {
        if (e.boss || e.immortal || e.hp <= 0 || !inTrap(t, e)) continue;
        damageEnemy(w, e, Math.max(1, e.maxHp * def.enemyShare), false, t.x, t.y, 0);
      }
    }
    if (t.hitPlayer !== cycle && inTrap(t, p) && hurtPlayer(w, Math.round(def.damage * scale), t.kind === "flame" ? "burn" : undefined)) t.hitPlayer = cycle;
  }
}
