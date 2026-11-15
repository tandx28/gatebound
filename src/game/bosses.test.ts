import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { BOSS_EXTRA, bossStage, movesFor, STAGES } from "./bosses";
import { NGPLUS, NIGHTMARE, RANK_IDS, ROOM, STEP, type Rank } from "./config";
import { makeEnemy, spawnEnemy } from "./enemies";
import { itemDef, RANK_WEIGHT, TITLES } from "./items";
import { chooseEnding, hubAction, settleClear, settleDeath, syncDay } from "./profile";
import { MAIN } from "./quests";
import { parseSave, toSave } from "./save";
import { hubButtons } from "./ui";
import { createWorld, enterArena, enterGate, step, toSelect, type World } from "./world";

const idle: Controls = { mouseX: 0, mouseY: 0, aimX: ROOM.w, aimY: ROOM.h / 2, attackHeld: false, axis: () => ({ x: 0, y: 0 }), consume: () => false };

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(w, idle, STEP);
}

/** An arena of the given rank with its boss far from a hunter who cannot die. */
function fight(rank: Rank, share: number): { w: World; boss: ReturnType<typeof makeEnemy> } {
  const w = createWorld(seeded(5));
  enterArena(w, rank);
  w.player.hp = w.player.d.maxHp = 1e9;
  const boss = spawnEnemy(w, "warden", w.player.x + 500, w.player.y);
  boss.state = "recover";
  boss.t = 999;
  boss.hp = Math.round(boss.maxHp * share);
  w.enemies.push(boss);
  return { w, boss };
}

describe("bosses grow harder as they weaken", () => {
  it("a boss passes through three stages by health", () => {
    const { w, boss } = fight("C", 1);
    expect(bossStage(w, boss)).toBe(0);
    boss.hp = boss.maxHp * (STAGES[0] - 0.01);
    expect(bossStage(w, boss)).toBe(1);
    boss.hp = boss.maxHp * (STAGES[1] - 0.01);
    expect(bossStage(w, boss)).toBe(2);
  });

  it("a fresh boss has no extra moves; later stages and higher ranks have more", () => {
    for (let tier = 0; tier < RANK_IDS.length; tier++) expect(movesFor(tier, 0)).toEqual([]);
    expect(movesFor(0, 2)).toEqual(["quake"]);
    expect(movesFor(1, 1)).toEqual(["quake", "volley"]);
    expect(movesFor(2, 1)).toEqual(["quake", "volley"]);
    expect(movesFor(2, 2)).toEqual(["quake", "volley", "cross", "rain"]);
    expect(BOSS_EXTRA.every[2]).toBeLessThan(BOSS_EXTRA.every[1]);
  });

  it("a fresh boss never uses one; a wounded one does, after a breath, and every blast is warned", () => {
    const fresh = fight("C", 1);
    fresh.boss.t = 999;
    run(fresh.w, 12);
    expect(fresh.w.zones.length + fresh.w.projectiles.length).toBe(0);

    const hurt = fight("C", 0.5);
    run(hurt.w, BOSS_EXTRA.grace - 0.3);
    expect(hurt.boss.stage).toBe(1);
    expect(hurt.w.zones.length + hurt.w.projectiles.length).toBe(0);
    let seen = 0;
    let shortest = Infinity;
    for (let i = 0; i < 14 / STEP; i++) {
      step(hurt.w, idle, STEP);
      for (const z of hurt.w.zones) shortest = Math.min(shortest, z.total);
      seen = Math.max(seen, hurt.w.zones.length + hurt.w.projectiles.length);
    }
    expect(seen).toBeGreaterThan(0);
    expect(shortest).toBeGreaterThanOrEqual(0.85);
  });

  it("at its last stage a high-rank gate's boss calls two to its side, once; a Rank E boss calls none", () => {
    for (const [rank, adds] of [["C", 2], ["E", 0]] as const) {
      const w = createWorld(seeded(8));
      enterGate(w, rank, { sealed: false });
      w.enemies.length = 0;
      w.player.hp = w.player.d.maxHp = 1e9;
      const boss = spawnEnemy(w, "warden", w.player.x + 400, w.player.y);
      boss.state = "recover";
      boss.t = 999;
      boss.hp = boss.maxHp * 0.2;
      w.enemies.push(boss);
      run(w, 0.1);
      expect(w.enemies.length - 1, rank).toBe(adds);
      run(w, 3);
      expect(w.enemies.filter((e) => !e.boss).length, rank).toBeLessThanOrEqual(adds);
    }
  });

  it("the rite's bosses keep to their own attacks", () => {
    const { w, boss } = fight("C", 0.2);
    w.gateKind = "rite";
    run(w, 10);
    expect(boss.stage).toBe(0);
    expect(w.zones.length + w.projectiles.length).toBe(0);
  });
});

describe("the shop follows the hunter's level", () => {
  it("a high-level hunter of low rank is shown the stock their level deserves", () => {
    const rarities = (level: number) => {
      const w = createWorld(seeded(2));
      w.profile.introSeen = true;
      w.player.prog.level = level;
      const seen = new Set<string>();
      for (let day = 100; day < 160; day++) {
        w.today = day;
        w.profile.daily.done = true;
        syncDay(w);
        for (const owned of w.profile.shop.stock) seen.add(itemDef(owned)!.rarity);
      }
      return seen;
    };
    // Rank E stock holds no legendaries; a level 45 hunter, still Rank E on paper, finds them on their rare days.
    expect(RANK_WEIGHT.E.epic).toBeLessThan(RANK_WEIGHT.S.epic);
    expect(rarities(1).has("legendary")).toBe(false);
    expect(rarities(45).has("legendary")).toBe(true);
  });
});

describe("Nightmare", () => {
  const veteran = () => {
    const w = createWorld(seeded(6));
    w.profile.introSeen = true;
    w.profile.cycle = NGPLUS.max;
    toSelect(w);
    w.profile.quests.main = MAIN.findIndex((q) => q.id === "m10");
    return w;
  };

  it("is unlocked by finishing the story on the last New Game+ cycle, and not before", () => {
    const early = veteran();
    early.profile.cycle = NGPLUS.max - 1;
    chooseEnding(early, "keeper");
    expect(early.profile.nightmareUnlocked).toBe(false);
    hubAction(early, "nightmare");
    expect(early.profile.nightmare).toBe(false);

    const w = veteran();
    chooseEnding(w, "unwritten");
    expect(w.profile.nightmareUnlocked).toBe(true);
    w.tab = "story";
    w.cutscene = null;
    expect(hubButtons(w).some((b) => b.id === "nightmare" && b.danger)).toBe(true);
    hubAction(w, "nightmare");
    expect(w.profile.nightmare).toBe(true);
    hubAction(w, "nightmare");
    expect(w.profile.nightmare).toBe(false);
  });

  it("makes every enemy tougher, harder-hitting and worth more, and starts bosses wounded", () => {
    const plain = createWorld(seeded(6));
    const dark = createWorld(seeded(6));
    dark.profile.nightmareUnlocked = dark.profile.nightmare = true;
    enterArena(plain, "B");
    enterArena(dark, "B");
    const a = spawnEnemy(plain, "leaper", 100, 100);
    const b = spawnEnemy(dark, "leaper", 100, 100);
    expect(b.maxHp).toBe(Math.round(a.maxHp * NIGHTMARE.hp));
    expect(b.dmg).toBeCloseTo(a.dmg * NIGHTMARE.dmg, 5);
    expect(b.xp).toBe(Math.round(a.xp * NIGHTMARE.reward));
    const boss = spawnEnemy(dark, "queen", 300, 300);
    expect(bossStage(dark, boss)).toBe(1);
    expect(bossStage(plain, spawnEnemy(plain, "queen", 300, 300))).toBe(0);
  });

  it("doubles what death takes, and gives a title for a Rank S gate cleared in it", () => {
    const loss = (nightmare: boolean) => {
      const w = createWorld(seeded(6));
      w.profile.nightmareUnlocked = w.profile.nightmare = nightmare;
      w.profile.gold = 1000;
      enterArena(w, "E");
      w.mode = "dead";
      settleDeath(w);
      return 1000 - w.profile.gold;
    };
    expect(loss(true)).toBe(loss(false) * NIGHTMARE.deathLoss);

    const w = createWorld(seeded(6));
    w.profile.nightmareUnlocked = w.profile.nightmare = true;
    enterGate(w, "S", { sealed: false });
    w.mode = "cleared";
    settleClear(w);
    expect(w.profile.titles).toContain("nightmare");
    expect(TITLES.some((t) => t.id === "nightmare")).toBe(true);
  });

  it("is kept by a save, but a save cannot switch it on without having earned it", () => {
    const w = createWorld(seeded(6));
    w.profile.nightmareUnlocked = w.profile.nightmare = true;
    expect(parseSave(JSON.parse(JSON.stringify(toSave(w))))!.profile.nightmare).toBe(true);
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(6)))));
    raw.profile.nightmare = true;
    expect(parseSave(raw)!.profile.nightmare).toBe(false);
  });
});
