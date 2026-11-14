import { describe, it } from "vitest";
import type { Rank } from "../config";
import { playGate, squadFor, type Loadout } from "./bot";

/**
 * Balance report: bot-played gates across ranks, levels and skill.
 * Slow, so it only runs when asked:  BALANCE=1 npx vitest run src/game/balance
 */

const BUILD = { str: 0.45, vit: 0.35, agi: 0.2 };
const CASES: { rank: Rank; level: number; gear: string[]; army?: boolean }[] = [
  { rank: "E", level: 1, gear: [] },
  { rank: "E", level: 3, gear: ["iron_fang"] },
  { rank: "E", level: 5, gear: ["iron_fang", "padded_coat"] },
  { rank: "D", level: 6, gear: ["iron_fang", "padded_coat"] },
  { rank: "D", level: 9, gear: ["hunters_kris", "scale_vest"] },
  { rank: "D", level: 12, gear: ["hunters_kris", "scale_vest"] },
  { rank: "C", level: 13, gear: ["hunters_kris", "scale_vest"] },
  { rank: "C", level: 16, gear: ["voltaic_edge", "gatehide_mail"] },
  { rank: "C", level: 19, gear: ["voltaic_edge", "gatehide_mail"] },
  // From Rank B the hunter has the class and brings a full squad of echoes.
  { rank: "B", level: 20, gear: ["voltaic_edge", "gatehide_mail"], army: true },
  { rank: "B", level: 25, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "B", level: 29, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "A", level: 30, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "A", level: 36, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "A", level: 41, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "S", level: 42, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "S", level: 50, gear: ["nightglass", "bastion_plate"], army: true },
  { rank: "S", level: 58, gear: ["nightglass", "bastion_plate"], army: true },
];
const SKILL: [string, number][] = [
  ["sharp", 0.08],
  ["average", 0.2],
];
const env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {};
const RUNS = Number(env.RUNS ?? 16);
const ONLY = env.ONLY;

describe.skipIf(!env.BALANCE)("balance report", () => {
  it("prints clear rates, times and income", () => {
    const rows: string[] = ["rank lvl player   clear  time  boss  hp  pots  gold    xp | fails: rooms done, died in boss/room, stuck"];
    for (const c of CASES) {
      if (ONLY && !ONLY.includes(c.rank)) continue;
      for (const [name, reaction] of SKILL) {
        const load: Loadout = { level: c.level, build: BUILD, gear: c.gear, potions: 3, echoes: c.army ? squadFor(c.rank, c.level) : undefined };
        const sum = { clears: 0, time: 0, boss: 0, hp: 0, pots: 0, gold: 0, xp: 0 };
        const fail = { rooms: 0, boss: 0, room: 0, stuck: 0, n: 0 };
        for (let seed = 1; seed <= RUNS; seed++) {
          const r = playGate(c.rank, load, reaction, seed * 13);
          if (r.cleared) {
            sum.clears += 1;
            sum.time += r.seconds;
            sum.boss += r.bossSeconds;
            sum.hp += r.hpLeft;
            sum.pots += r.potionsUsed;
            sum.gold += r.gold;
            sum.xp += r.xp;
          } else {
            fail.n += 1;
            fail.rooms += r.rooms;
            if (!r.dead) fail.stuck += 1;
            else if (r.diedIn === "boss") fail.boss += 1;
            else fail.room += 1;
          }
        }
        const avg = (v: number) => (sum.clears ? v / sum.clears : 0);
        rows.push(
          [
            c.rank.padEnd(4),
            String(c.level).padEnd(3),
            name.padEnd(8),
            `${Math.round((sum.clears / RUNS) * 100)}%`.padStart(5),
            `${Math.round(avg(sum.time))}s`.padStart(5),
            `${Math.round(avg(sum.boss))}s`.padStart(5),
            `${Math.round(avg(sum.hp))}`.padStart(4),
            avg(sum.pots).toFixed(1).padStart(5),
            `${Math.round(avg(sum.gold))}`.padStart(5),
            `${Math.round(avg(sum.xp))}`.padStart(5),
            `| ${fail.n ? (fail.rooms / fail.n).toFixed(1) : "-"} rooms, ${fail.boss}/${fail.room}, ${fail.stuck}`,
          ].join(" "),
        );
      }
    }
    console.log("\n" + rows.join("\n") + "\n");
  }, 900000);
});
