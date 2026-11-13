import { describe, expect, it } from "vitest";
import { seeded } from "../engine/rng";
import { RANK_IDS, RANKS } from "./config";
import { generateDungeon, OPPOSITE, SIDES } from "./dungeon";

const DELTA = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;

describe("generateDungeon", () => {
  for (const rank of RANK_IDS) {
    it(`rank ${rank}: every seed gives a valid, fully connected layout`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const d = generateDungeon(rank, seeded(seed));
        const def = RANKS[rank];
        expect(d.rooms.length).toBe(def.rooms);

        // No two rooms share a grid cell.
        expect(new Set(d.rooms.map((r) => `${r.gx},${r.gy}`)).size).toBe(d.rooms.length);

        // Doors are mutual and lead to the adjacent cell.
        for (const r of d.rooms) {
          for (const s of SIDES) {
            const to = r.doors[s];
            if (to === undefined) continue;
            const n = d.rooms[to];
            expect(n.doors[OPPOSITE[s]]).toBe(r.id);
            expect([n.gx - r.gx, n.gy - r.gy]).toEqual(DELTA[s]);
          }
        }

        // Every room can be reached from the start.
        const seen = new Set([d.startId]);
        const queue = [d.startId];
        while (queue.length) {
          const r = d.rooms[queue.pop()!];
          for (const to of Object.values(r.doors)) {
            if (!seen.has(to!)) {
              seen.add(to!);
              queue.push(to!);
            }
          }
        }
        expect(seen.size).toBe(d.rooms.length);

        // One boss room: a dead end, as deep as any room, holding only the boss.
        const bosses = d.rooms.filter((r) => r.kind === "boss");
        expect(bosses.length).toBe(1);
        const boss = bosses[0];
        expect(boss.id).toBe(d.bossId);
        expect(Object.keys(boss.doors).length).toBe(1);
        expect(boss.depth).toBe(Math.max(...d.rooms.map((r) => r.depth)));
        expect(boss.spawns).toEqual([def.boss]);

        const start = d.rooms[d.startId];
        expect(start.kind).toBe("start");
        expect(start.cleared).toBe(true);
        expect(start.spawns).toEqual([]);

        for (const r of d.rooms.filter((x) => x.kind === "normal")) {
          expect(r.spawns.length).toBeGreaterThanOrEqual(3);
          expect(r.spawns.length).toBeLessThanOrEqual(6);
          for (const k of r.spawns) expect(def.kinds).toContain(k);
        }
      }
    });
  }

  it("is deterministic for a given seed", () => {
    expect(generateDungeon("D", seeded(42))).toEqual(generateDungeon("D", seeded(42)));
  });

  it("differs between seeds", () => {
    const a = JSON.stringify(generateDungeon("C", seeded(1)));
    const b = JSON.stringify(generateDungeon("C", seeded(2)));
    expect(a).not.toBe(b);
  });
});
