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
  kind: "start" | "normal" | "boss";
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
