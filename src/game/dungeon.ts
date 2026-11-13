import { pick } from "../engine/rng";
import { RANKS, type EnemyKind, type Rank } from "./config";

/** Pure dungeon generation: a tree of same-sized rooms on a grid. */

export type Side = "n" | "e" | "s" | "w";
export const SIDES: Side[] = ["n", "e", "s", "w"];
export const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };
const DELTA: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export interface RoomNode {
  id: number;
  gx: number;
  gy: number;
  /** Neighbour room id per side that has a door. */
  doors: Partial<Record<Side, number>>;
  kind: "start" | "normal" | "boss" | "trial";
  /** Steps from the start room. */
  depth: number;
  cleared: boolean;
  visited: boolean;
  spawns: EnemyKind[];
}

export interface Dungeon {
  rank: Rank;
  rooms: RoomNode[];
  startId: number;
  bossId: number;
}

export function generateDungeon(rank: Rank, rng: () => number): Dungeon {
  const def = RANKS[rank];
  const start: RoomNode = {
    id: 0,
    gx: 0,
    gy: 0,
    doors: {},
    kind: "start",
    depth: 0,
    cleared: true,
    visited: false,
    spawns: [],
  };
  const rooms = [start];
  const at = new Map<string, RoomNode>([["0,0", start]]);

  // Grow a tree: attach each new room to a random existing one.
  while (rooms.length < def.rooms) {
    const from = rooms[pick(rng, rooms.length)];
    const side = SIDES[pick(rng, 4)];
    const gx = from.gx + DELTA[side][0];
    const gy = from.gy + DELTA[side][1];
    const key = `${gx},${gy}`;
    if (at.has(key)) continue;
    const room: RoomNode = {
      id: rooms.length,
      gx,
      gy,
      doors: { [OPPOSITE[side]]: from.id },
      kind: "normal",
      depth: from.depth + 1,
      cleared: false,
      visited: false,
      spawns: [],
    };
    from.doors[side] = room.id;
    rooms.push(room);
    at.set(key, room);
  }

  // The deepest room of a tree is always a dead end: it holds the boss.
  let boss = rooms[1];
  for (const r of rooms) if (r.depth > boss.depth) boss = r;
  boss.kind = "boss";
  boss.spawns = [def.boss];

  for (const r of rooms) {
    if (r.kind !== "normal") continue;
    const count = Math.min(6, 2 + r.depth);
    for (let i = 0; i < count; i++) r.spawns.push(def.kinds[pick(rng, def.kinds.length)]);
  }

  return { rank, rooms, startId: start.id, bossId: boss.id };
}

/** A key dungeon: a short straight run of packed rooms, with no boss. */
export function keyDungeon(rank: Rank, rng: () => number): Dungeon {
  const def = RANKS[rank];
  const rooms: RoomNode[] = [0, 1, 2].map((i) => ({
    id: i,
    gx: i,
    gy: 0,
    doors: { ...(i > 0 ? { w: i - 1 } : {}), ...(i < 2 ? { e: i + 1 } : {}) },
    kind: i === 0 ? "start" : "normal",
    depth: i,
    cleared: i === 0,
    visited: false,
    spawns: i === 0 ? [] : Array.from({ length: 5 + i }, () => def.kinds[pick(rng, def.kinds.length)]),
  }));
  return { rank, rooms, startId: 0, bossId: -1 };
}

/**
 * Attach a hidden trial room to the boss room, on a side with a free cell.
 * It holds an echo of the boss and a few guards. Returns null if boxed in.
 */
export function addTrialRoom(d: Dungeon, rng: () => number): RoomNode | null {
  const boss = d.rooms[d.bossId];
  if (!boss) return null;
  const def = RANKS[d.rank];
  const taken = new Set(d.rooms.map((r) => `${r.gx},${r.gy}`));
  const free = SIDES.filter((s) => boss.doors[s] === undefined && !taken.has(`${boss.gx + DELTA[s][0]},${boss.gy + DELTA[s][1]}`));
  if (free.length === 0) return null;
  const side = free[pick(rng, free.length)];
  const room: RoomNode = {
    id: d.rooms.length,
    gx: boss.gx + DELTA[side][0],
    gy: boss.gy + DELTA[side][1],
    doors: { [OPPOSITE[side]]: boss.id },
    kind: "trial",
    depth: boss.depth + 1,
    cleared: false,
    visited: false,
    spawns: [def.boss, ...Array.from({ length: 3 }, () => def.kinds[pick(rng, def.kinds.length)])],
  };
  boss.doors[side] = room.id;
  d.rooms.push(room);
  return room;
}
