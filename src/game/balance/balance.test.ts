import { describe, expect, it } from "vitest";
import { KINDS, PLAYER, RANK_IDS, RANKS, SWARMER, type Rank } from "../config";
import { generateDungeon } from "../dungeon";
import { makeEnemy } from "../enemies";
import { seeded } from "../../engine/rng";
import { derive, newProgress, xpToNext } from "../stats";
import { playGate, type Loadout } from "./bot";

/**
 * Balance targets, so later changes cannot quietly break the difficulty
 * curve. The bot runs use fixed seeds, so their results are repeatable.
 */

const BUILD = { str: 0.45, vit: 0.35, agi: 0.2 };

/** Share of bot runs that clear the gate, and how many ran out of time. */
function clearRate(rank: Rank, level: number, gear: string[], reaction: number, runs = 8): { rate: number; stuck: number; seconds: number } {
  const load: Loadout = { level, build: BUILD, gear, potions: 3 };
  let clears = 0;
  let stuck = 0;
  let seconds = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const r = playGate(rank, load, reaction, seed * 13);
    if (r.cleared) {
      clears += 1;
      seconds += r.seconds;
    } else if (!r.dead) stuck += 1;
  }
  return { rate: clears / runs, stuck, seconds: clears ? seconds / clears : 0 };
}

/** Experience from killing everything in an average gate of a rank. */
function gateXp(rank: Rank): number {
  let total = 0;
  const n = 40;
  for (let seed = 1; seed <= n; seed++) {
    const d = generateDungeon(rank, seeded(seed));
    for (const room of d.rooms) for (const kind of room.spawns) total += makeEnemy(kind, 0, 0, rank).xp;
  }
  return total / n;
}

function xpBetween(from: number, to: number): number {
  let total = 0;
  for (let l = from; l < to; l++) total += xpToNext(l);
  return total;
}

describe("the hard start", () => {
  it("a fresh hunter dies to three swarmer hits and needs three to kill one", () => {
    expect(Math.ceil(PLAYER.maxHp / SWARMER.damage)).toBe(3);
    expect(Math.ceil(SWARMER.maxHp / PLAYER.attackDamage)).toBe(3);
  });

  it("no regular rank E enemy kills a fresh hunter in one hit", () => {
    for (const kind of RANKS.E.kinds) expect(KINDS[kind].damage).toBeLessThan(PLAYER.maxHp);
  });
});

describe("rank scaling", () => {
  it("each rank is tougher, hits harder and pays more than the last", () => {
    for (let i = 1; i < RANK_IDS.length; i++) {
      const a = RANKS[RANK_IDS[i - 1]];
      const b = RANKS[RANK_IDS[i]];
      expect(b.hpMult).toBeGreaterThan(a.hpMult);
      expect(b.dmgMult).toBeGreaterThan(a.dmgMult);
      expect(b.xpMult).toBeGreaterThan(a.xpMult);
      expect(b.rooms).toBeGreaterThan(a.rooms);
      expect(b.minLevel).toBeGreaterThan(a.minLevel);
      expect(KINDS[b.boss].hp).toBeGreaterThan(KINDS[a.boss].hp);
    }
  });

  it("a regular enemy at a rank's entry level takes a few hits, not one and not twenty", () => {
    for (const rank of RANK_IDS) {
      const prog = newProgress();
      const points = (RANKS[rank].minLevel - 1) * 3;
      prog.stats.str += Math.round(points * BUILD.str);
      const damage = derive(prog.stats).damage;
      const swarmer = makeEnemy(RANKS[rank].kinds[0], 0, 0, rank);
      const hits = Math.ceil(swarmer.maxHp / damage);
      expect(hits).toBeGreaterThanOrEqual(2);
      expect(hits).toBeLessThanOrEqual(8);
    }
  });
});

describe("levelling pace", () => {
  it("each rank takes a handful of clears to outgrow, not one and not dozens", () => {
    const spans: [Rank, number, number][] = [
      ["E", 1, RANKS.D.minLevel],
      ["D", RANKS.D.minLevel, RANKS.C.minLevel],
      ["C", RANKS.C.minLevel, 20],
    ];
    for (const [rank, from, to] of spans) {
      const clears = xpBetween(from, to) / gateXp(rank);
      expect(clears).toBeGreaterThan(2);
      expect(clears).toBeLessThan(8);
    }
  });
});

describe("difficulty curve, played by the bot", () => {
  it("rank E: beatable but far from safe at level 1, routine by level 5", () => {
    const entry = clearRate("E", 1, [], 0.08);
    expect(entry.rate).toBeGreaterThanOrEqual(0.25);
    expect(entry.rate).toBeLessThan(1);
    expect(clearRate("E", 5, ["iron_fang", "padded_coat"], 0.08).rate).toBeGreaterThanOrEqual(0.9);
  }, 120000);

  it("rank D: a wall at level 6, routine by level 12", () => {
    expect(clearRate("D", 6, ["iron_fang", "padded_coat"], 0.2).rate).toBeLessThanOrEqual(0.4);
    expect(clearRate("D", 12, ["hunters_kris", "scale_vest"], 0.08).rate).toBeGreaterThanOrEqual(0.9);
  }, 120000);

  it("rank C: a wall at level 13, routine by level 19", () => {
    expect(clearRate("C", 13, ["hunters_kris", "scale_vest"], 0.2).rate).toBeLessThanOrEqual(0.5);
    expect(clearRate("C", 19, ["voltaic_edge", "gatehide_mail"], 0.08).rate).toBeGreaterThanOrEqual(0.9);
  }, 120000);

  it("walking into a gate far above your level is death", () => {
    expect(clearRate("C", 1, [], 0.08, 4).rate).toBe(0);
    expect(clearRate("D", 1, [], 0.08, 4).rate).toBe(0);
  }, 120000);

  it("a run is long enough to matter and the bot never gets stuck", () => {
    for (const [rank, level, gear] of [
      ["E", 5, ["iron_fang", "padded_coat"]],
      ["D", 12, ["hunters_kris", "scale_vest"]],
      ["C", 19, ["voltaic_edge", "gatehide_mail"]],
    ] as [Rank, number, string[]][]) {
      const r = clearRate(rank, level, gear, 0.08, 4);
      expect(r.stuck).toBe(0);
      // The bot wastes no time; a person takes two to three times as long.
      expect(r.seconds).toBeGreaterThan(55);
      expect(r.seconds).toBeLessThan(200);
    }
  }, 120000);
});
