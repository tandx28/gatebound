import { describe, expect, it } from "vitest";
import { musicState } from "../audio/director";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { makeAlly, stepAlly } from "./allies";
import { BREAK, ECHO, echoCap, KINDS, PLAYER, RANKS, RESET, RITE, ROOM, SKILL_RANK, SKILLS, STEP, SURGE, WHIRL, type EnemyKind } from "./config";
import { makeEnemy } from "./enemies";
import { ITEMS, RANK_WEIGHT, rollStock } from "./items";
import { hubAction, riteOpen, settleClear, syncDay } from "./profile";
import { MAIN } from "./quests";
import { applySave, parseSave, SAVE_VERSION, toSave } from "./save";
import { visibleTabs } from "./state";
import { xpToNext } from "./stats";
import { DIALOGUES } from "./story";
import { hubButtons } from "./ui";
import { createWorld, effective, enterArena, enterBreak, enterGate, enterPenalty, enterRite, enterRoom, grantXp, step, type World } from "./world";

class FakeControls implements Controls {
  mouseX = 0;
  mouseY = 0;
  aimX = ROOM.w / 2 + 400;
  aimY = ROOM.h / 2;
  attackHeld = false;
  move = { x: 0, y: 0 };
  private presses = new Set<string>();
  axis() {
    return this.move;
  }
  press(code: string) {
    this.presses.add(code);
  }
  consume(...codes: string[]) {
    let hit = false;
    for (const c of codes) if (this.presses.delete(c)) hit = true;
    return hit;
  }
}

function run(w: World, c: Controls, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(w, c, STEP);
}

function killAll(w: World, c: Controls): void {
  for (const e of w.enemies) e.hp = 0;
  run(w, c, 0.02);
}

const board = () => createWorld(seeded(4));

/** An arena with the class already earned. */
function caller(rng: () => number = () => 0.5): { w: World; c: FakeControls } {
  const w = createWorld(rng);
  w.profile.classUnlocked = true;
  enterArena(w, "C");
  return { w, c: new FakeControls() };
}

/** Put an enemy near the player and kill it, leaving a remnant if one is due. */
function fell(w: World, c: Controls, kind: EnemyKind, dx = 40): void {
  const e = makeEnemy(kind, w.player.x + dx, w.player.y, w.rank);
  w.enemies.push(e);
  e.hp = 0;
  run(w, c, 0.02);
}

describe("hunter rank", () => {
  it("clearing a gate above your rank raises it, with a line from the clerk", () => {
    const w = createWorld(() => 0.5);
    enterArena(w, "D");
    settleClear(w);
    expect(w.profile.hunterRank).toBe("D");
    expect(w.pendingDialogue).toContain("rankD");
    expect(w.run.summary.some((s) => s.includes("Rank D"))).toBe(true);
    expect(DIALOGUES.rankD.length).toBeGreaterThan(0);
  });

  it("clearing a lower gate never lowers it", () => {
    const w = createWorld(() => 0.5);
    w.profile.hunterRank = "C";
    enterArena(w, "E");
    settleClear(w);
    expect(w.profile.hunterRank).toBe("C");
  });

  it("a higher rank is shown better shop stock", () => {
    const count = (rank: "E" | "C") => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        for (const id of rollStock(seeded(seed), [], RANK_WEIGHT[rank])) if (ITEMS[id].rarity === "epic" || ITEMS[id].rarity === "rare") n += 1;
      }
      return n;
    };
    expect(count("C")).toBeGreaterThan(count("E") * 1.3);
  });

  it("the shop uses the hunter's rank when the day turns", () => {
    const stock = (rank: "E" | "C") => {
      const w = board();
      w.profile.hunterRank = rank;
      w.today = 50;
      syncDay(w);
      return w.profile.shop.stock.join();
    };
    expect(stock("E")).not.toBe(stock("C"));
  });
});

describe("blank page", () => {
  function spent(): World {
    const w = board();
    grantXp(w, xpToNext(1) + xpToNext(2));
    w.player.prog.stats.str += 4;
    w.player.prog.stats.vit += 2;
    w.player.prog.points = 0;
    w.profile.gold = 1000;
    return w;
  }

  it("refunds every spent point and resets the stats", () => {
    const w = spent();
    hubAction(w, "buy:reset");
    expect(w.player.prog.points).toBe(6);
    expect(w.player.prog.stats).toEqual({ str: 5, agi: 5, vit: 5, sen: 5, int: 5 });
    expect(w.profile.gold).toBe(1000 - RESET.price);
    expect(w.player.d.damage).toBe(PLAYER.attackDamage);
    expect(w.player.hp).toBeLessThanOrEqual(w.player.d.maxHp);
  });

  it("is refused with nothing to refund, or too little gold", () => {
    const fresh = board();
    fresh.profile.gold = 1000;
    hubAction(fresh, "buy:reset");
    expect(fresh.profile.gold).toBe(1000);
    const poor = spent();
    poor.profile.gold = RESET.price - 1;
    hubAction(poor, "buy:reset");
    expect(poor.player.prog.stats.str).toBe(9);
  });
});

describe("skill books", () => {
  it("a boss may drop one; it raises the skill when the gate is cleared", () => {
    const w = createWorld(() => 0.5);
    const c = new FakeControls();
    enterArena(w, "E");
    w.rng = () => 0.01;
    fell(w, c, "warden", 300);
    expect(w.run.books.length).toBe(1);
    const id = w.run.books[0];
    run(w, c, 2.5);
    expect(w.mode).toBe("cleared");
    expect(w.profile.skillRanks[id]).toBe(2);
    expect(w.run.summary.some((s) => s.includes("improved to rank 2"))).toBe(true);
  });

  it("a book is lost with the rest of the loot on death", () => {
    const w = createWorld(() => 0.5);
    const c = new FakeControls();
    enterArena(w, "E");
    w.run.books = ["whirl"];
    w.player.hp = 0;
    w.mode = "dead";
    run(w, c, 0.02);
    expect(w.profile.skillRanks.whirl).toBe(1);
  });

  it("no book drops once every skill is at the top rank", () => {
    const w = createWorld(() => 0.5);
    const c = new FakeControls();
    enterArena(w, "E");
    w.profile.skillRanks = { pierce: 3, whirl: 3, surge: 3 };
    w.rng = () => 0.01;
    fell(w, c, "warden", 300);
    expect(w.run.books).toEqual([]);
  });

  it("never stacks a skill past the top rank within one run", () => {
    const w = createWorld(() => 0.5);
    enterArena(w, "E");
    w.profile.skillRanks = { pierce: 3, whirl: 2, surge: 3 };
    w.run.books = ["whirl", "whirl"];
    settleClear(w);
    expect(w.profile.skillRanks.whirl).toBe(SKILL_RANK.max);
  });

  it("each rank makes Whirl hit harder and come back sooner", () => {
    const hit = (rank: number) => {
      const w = createWorld(() => 0.5);
      const c = new FakeControls();
      enterArena(w, "C");
      w.player.prog.level = 10;
      w.profile.skillRanks.whirl = rank;
      const e = makeEnemy("brute", w.player.x + 60, w.player.y, "C");
      e.state = "recover";
      e.t = 99;
      w.enemies.push(e);
      c.press("KeyE");
      run(w, c, 0.02);
      return { dealt: e.maxHp - e.hp, cd: w.player.skillCd.whirl };
    };
    const one = hit(1);
    const three = hit(3);
    expect(one.dealt).toBe(Math.round(PLAYER.attackDamage * WHIRL.mult));
    expect(three.dealt).toBe(Math.round(PLAYER.attackDamage * WHIRL.mult * (1 + 2 * SKILL_RANK.power)));
    expect(three.cd).toBeLessThan(one.cd);
    expect(three.cd).toBeCloseTo(SKILLS.whirl.cooldown * (1 - 2 * SKILL_RANK.cooldown), 1);
  });

  it("each rank makes Surge last longer", () => {
    const w = createWorld(() => 0.5);
    const c = new FakeControls();
    enterArena(w);
    w.player.prog.level = 10;
    w.profile.skillRanks.surge = 2;
    c.press("KeyR");
    run(w, c, SURGE.time + 0.5);
    expect(effective(w.player).damage).toBeGreaterThan(PLAYER.attackDamage);
    run(w, c, SKILL_RANK.surgeTime);
    expect(effective(w.player).damage).toBe(PLAYER.attackDamage);
  });
});

describe("rite of echoes", () => {
  function ready(): World {
    const w = board();
    w.profile.quests.main = MAIN.findIndex((q) => q.id === "m6");
    return w;
  }

  it("is offered on the board only while it is the open main quest", () => {
    const early = board();
    expect(riteOpen(early.profile)).toBe(false);
    expect(hubAction(early, "gate:rite")).toBe(null);
    expect(hubButtons(early).some((b) => b.id === "gate:rite")).toBe(false);
    const w = ready();
    expect(hubAction(w, "gate:rite")).toBe("rite");
    expect(hubButtons(w).some((b) => b.id === "gate:rite")).toBe(true);
  });

  it("starts with the first wave at Rank C strength, and the hunter alone", () => {
    const w = ready();
    w.profile.classUnlocked = true;
    w.profile.echoes = [{ kind: "swarmer", rank: "C", active: true }];
    enterRite(w);
    expect(w.gateKind).toBe("rite");
    expect(w.enemies.map((e) => e.kind)).toEqual(RITE.waves[0]);
    expect(w.enemies[0].maxHp).toBe(Math.round(KINDS.swarmer.hp * RANKS.C.hpMult));
    expect(w.allies).toEqual([]);
  });

  it("each wave follows the last; killing one of two bosses does not end it", () => {
    const w = ready();
    const c = new FakeControls();
    enterRite(w);
    w.player.iframes = 999;
    for (let wave = 1; wave < RITE.waves.length; wave++) {
      killAll(w, c);
      expect(w.riteWave).toBe(wave);
      expect(w.enemies.map((e) => e.kind)).toEqual(RITE.waves[wave]);
    }
    w.enemies[0].hp = 0;
    run(w, c, 0.02);
    expect(w.enemies.length).toBe(1);
    expect(w.clearT).toBe(0);
  });

  it("clearing it grants the class, completes the quest, and opens the Echoes tab", () => {
    const w = ready();
    const c = new FakeControls();
    enterRite(w);
    w.player.iframes = 999;
    const points = w.player.prog.points;
    expect(visibleTabs(w)).not.toContain("echoes");
    for (let wave = 0; wave < RITE.waves.length; wave++) {
      for (const e of w.enemies) e.xp = 0;
      killAll(w, c);
    }
    run(w, c, 2.5);
    expect(w.mode).toBe("cleared");
    expect(w.profile.classUnlocked).toBe(true);
    expect(w.profile.quests.main).toBe(MAIN.length);
    expect(w.player.prog.points).toBe(points + 5);
    expect(w.pendingDialogue).toContain("m6");
    expect(visibleTabs(w)).toContain("echoes");
    expect(w.profile.gatesCleared).toBe(0);
  });

  it("dying in it grants nothing, and it can be tried again", () => {
    const w = ready();
    const c = new FakeControls();
    enterRite(w);
    run(w, c, 30);
    expect(w.mode).toBe("dead");
    expect(w.profile.classUnlocked).toBe(false);
    expect(riteOpen(w.profile)).toBe(true);
  });

  it("a Return Stone does nothing there, and it is never saved as a gate", () => {
    const w = ready();
    const c = new FakeControls();
    enterRite(w);
    w.profile.stones = 1;
    w.player.iframes = 999;
    c.press("KeyT");
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
    expect(w.profile.stones).toBe(1);
    expect(toSave(w).gate).toBe(null);
  });

  it("plays as a boss fight", () => {
    const w = ready();
    enterRite(w);
    expect(musicState(w).scene).toBe("boss");
  });
});

describe("remnants and binding", () => {
  it("nothing lingers before the class is earned", () => {
    const w = createWorld(() => 0.5);
    const c = new FakeControls();
    enterArena(w);
    fell(w, c, "swarmer");
    expect(w.remnants).toEqual([]);
  });

  it("an Echo Caller's kills leave a remnant; summoned minions leave none", () => {
    const { w, c } = caller();
    fell(w, c, "swarmer");
    expect(w.remnants.length).toBe(1);
    expect(w.remnants[0]).toMatchObject({ kind: "swarmer", rank: "C", tries: 1 });
    const minion = makeEnemy("swarmer", w.player.x + 40, w.player.y, "C");
    minion.xp = 0;
    w.enemies.push(minion);
    minion.hp = 0;
    run(w, c, 0.02);
    expect(w.remnants.length).toBe(1);
  });

  it("G near a remnant binds it: it joins the roster and fights at once", () => {
    const { w, c } = caller();
    fell(w, c, "swarmer");
    const mana = w.player.mana;
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes).toEqual([{ kind: "swarmer", rank: "C", active: true }]);
    expect(w.allies.length).toBe(1);
    expect(w.remnants).toEqual([]);
    expect(w.player.mana).toBeLessThan(mana - ECHO.bindMana + 0.2);
    expect(w.dirty).toBe(true);
  });

  it("G does nothing out of range, without mana, or without the class", () => {
    const { w, c } = caller();
    fell(w, c, "swarmer", ECHO.bindRange + 60);
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes).toEqual([]);

    const near = caller();
    fell(near.w, near.c, "swarmer");
    near.w.player.mana = 0;
    near.c.press("KeyG");
    run(near.w, near.c, 0.02);
    expect(near.w.profile.echoes).toEqual([]);
    expect(near.w.remnants.length).toBe(1);
  });

  it("a remnant fades after its time", () => {
    const { w, c } = caller();
    fell(w, c, "swarmer");
    run(w, c, ECHO.remnantLife + 0.1);
    expect(w.remnants).toEqual([]);
  });

  it("a full roster refuses, and keeps the remnant", () => {
    const { w, c } = caller();
    w.profile.echoes = Array.from({ length: ECHO.roster }, () => ({ kind: "swarmer" as EnemyKind, rank: "C" as const, active: false }));
    fell(w, c, "swarmer");
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes.length).toBe(ECHO.roster);
    expect(w.remnants.length).toBe(1);
  });

  it("past the squad limit, a new echo goes to the reserve", () => {
    const { w, c } = caller();
    const cap = echoCap(w.player.prog.level);
    w.profile.echoes = Array.from({ length: cap }, () => ({ kind: "swarmer" as EnemyKind, rank: "C" as const, active: true }));
    fell(w, c, "charger");
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes[cap]).toEqual({ kind: "charger", rank: "C", active: false });
    expect(w.allies.length).toBe(0);
  });

  it("a boss resists: failed tries use it up", () => {
    const { w, c } = caller(() => 0.9);
    w.gateKind = "break";
    fell(w, c, "warden", 60);
    expect(w.remnants[0].tries).toBe(ECHO.bossTries);
    for (let i = 0; i < ECHO.bossTries; i++) {
      w.player.mana = 20;
      c.press("KeyG");
      run(w, c, 0.02);
    }
    expect(w.remnants).toEqual([]);
    expect(w.profile.echoes).toEqual([]);
  });

  it("a boss can be bound on a lucky try, but only one fights at a time", () => {
    const { w, c } = caller(() => 0.1);
    w.gateKind = "break";
    fell(w, c, "warden", 60);
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes).toEqual([{ kind: "warden", rank: "C", active: true }]);
    w.player.mana = 20;
    fell(w, c, "summoner", 60);
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes[1]).toEqual({ kind: "summoner", rank: "C", active: false });
  });

  it("the squad grows with level, from two up to five", () => {
    expect(echoCap(1)).toBe(2);
    expect(echoCap(13)).toBe(2);
    expect(echoCap(16)).toBe(3);
    expect(echoCap(19)).toBe(4);
    expect(echoCap(99)).toBe(5);
  });
});

describe("echoes in a fight", () => {
  function withAlly(kind: EnemyKind): { w: World; c: FakeControls } {
    const { w, c } = caller();
    w.profile.echoes = [{ kind, rank: "C", active: true }];
    enterArena(w, "C");
    return { w, c };
  }

  it("the active squad enters every room with the player, up to the limit", () => {
    const w = createWorld(seeded(11));
    w.hiddenChance = 0;
    w.profile.classUnlocked = true;
    w.profile.echoes = Array.from({ length: 6 }, (_, i) => ({ kind: "swarmer" as EnemyKind, rank: "E" as const, active: i < 4 }));
    enterGate(w, "E", { sealed: false });
    expect(w.allies.length).toBe(echoCap(1));
    enterRoom(w, 1, "n");
    expect(w.allies.length).toBe(echoCap(1));
  });

  it("echoes stay out of the penalty zone", () => {
    const w = createWorld(seeded(11));
    w.profile.classUnlocked = true;
    w.profile.echoes = [{ kind: "swarmer", rank: "E", active: true }];
    enterPenalty(w);
    expect(w.allies).toEqual([]);
  });

  it("a melee echo hunts an enemy down, and the kill is the player's", () => {
    const { w, c } = withAlly("swarmer");
    w.player.iframes = 999;
    const e = makeEnemy("shooter", w.player.x + 300, w.player.y, "E");
    w.enemies.push(e);
    const xp = w.player.prog.xp;
    run(w, c, 12);
    expect(w.enemies.length).toBe(0);
    expect(w.kills).toBe(1);
    expect(w.player.prog.xp).toBeGreaterThan(xp);
  });

  it("enemies ignore echoes and go for the player", () => {
    const { w, c } = withAlly("brute");
    w.player.iframes = 999;
    const e = makeEnemy("swarmer", w.player.x + 400, w.player.y, "C");
    e.state = "chase";
    e.hp = e.maxHp = 1e6;
    w.enemies.push(e);
    w.allies[0].x = w.player.x + 380;
    run(w, c, 0.5);
    // It closed on the player, away from the echo standing next to it.
    expect(e.x).toBeLessThan(w.player.x + 400);
  });

  it("a ranged echo shoots; its shots hurt enemies and never the player", () => {
    const { w, c } = withAlly("shooter");
    const e = makeEnemy("brute", w.player.x + 250, w.player.y, "C");
    e.state = "recover";
    e.t = 99;
    e.facing = 0;
    w.enemies.push(e);
    w.allies[0].x = w.player.x + 500;
    run(w, c, 3);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(w.player.hp).toBe(w.player.d.maxHp);
  });

  it("a sweeping echo hits every enemy around it", () => {
    const { w } = withAlly("warden");
    const a = w.allies[0];
    const near = [40, -40].map((dy) => {
      const e = makeEnemy("swarmer", a.x + 50, a.y + dy, "C");
      e.t = 99;
      w.enemies.push(e);
      return e;
    });
    a.cd = 0;
    stepAlly(w, a, STEP);
    for (const e of near) expect(e.hp).toBeLessThan(e.maxHp);
  });

  it("a mender echo heals the player now and then", () => {
    const { w, c } = withAlly("healer");
    w.player.hp = 20;
    run(w, c, 1);
    expect(w.player.hp).toBe(20 + Math.round(w.player.d.maxHp * 0.08));
  });

  it("a boss echo hits far harder than a common one", () => {
    const boss = makeAlly({ kind: "duellist", rank: "C", active: true }, 0, 0);
    const common = makeAlly({ kind: "swarmer", rank: "C", active: true }, 0, 0);
    expect(boss.dmg).toBeGreaterThan(common.dmg * 2);
  });

  it("echoes stay inside the room", () => {
    const { w, c } = withAlly("charger");
    w.player.iframes = 999;
    const e = makeEnemy("shooter", 40, 40, "C");
    e.hp = e.maxHp = 1e6;
    w.enemies.push(e);
    run(w, c, 8);
    const a = w.allies[0];
    expect(a.x).toBeGreaterThanOrEqual(a.radius);
    expect(a.y).toBeGreaterThanOrEqual(a.radius);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
  });
});

describe("echoes on the board", () => {
  function roster(): World {
    const w = board();
    w.profile.classUnlocked = true;
    w.profile.echoes = [
      { kind: "swarmer", rank: "C", active: true },
      { kind: "charger", rank: "C", active: true },
      { kind: "brute", rank: "C", active: false },
      { kind: "warden", rank: "E", active: false },
    ];
    return w;
  }

  it("an echo can be rested and sent back out", () => {
    const w = roster();
    hubAction(w, "echo:toggle:0");
    expect(w.profile.echoes[0].active).toBe(false);
    hubAction(w, "echo:toggle:0");
    expect(w.profile.echoes[0].active).toBe(true);
  });

  it("the squad limit holds", () => {
    const w = roster();
    hubAction(w, "echo:toggle:2");
    expect(w.profile.echoes[2].active).toBe(false);
    const b = hubButtons({ ...w, tab: "echoes" } as World).find((x) => x.id === "echo:toggle:2")!;
    expect(b.enabled).toBe(false);
  });

  it("releasing removes it for good", () => {
    const w = roster();
    hubAction(w, "echo:release:1");
    expect(w.profile.echoes.map((e) => e.kind)).toEqual(["swarmer", "brute", "warden"]);
  });

  it("a bad index does nothing", () => {
    const w = roster();
    hubAction(w, "echo:release:9");
    hubAction(w, "echo:toggle:x");
    expect(w.profile.echoes.length).toBe(4);
  });
});

describe("gate breaks", () => {
  function day(n: number): World {
    const w = board();
    w.today = n;
    syncDay(w);
    w.profile.daily.done = true;
    return w;
  }

  it("tracking starts on the first day, with no break owed", () => {
    const w = day(500);
    expect(w.profile.lastClear).toBe(500);
    expect(w.profile.breakPending).toBe(false);
  });

  it("three days without clearing your own rank's gate breaks it", () => {
    const w = day(500);
    w.today = 502;
    syncDay(w);
    w.profile.daily.done = true;
    expect(w.profile.breakPending).toBe(false);
    w.today = 503;
    syncDay(w);
    expect(w.profile.breakPending).toBe(true);
    expect(w.pendingDialogue).toContain("break");
  });

  it("clearing a gate of your rank resets the clock; a lower one does not", () => {
    const w = day(500);
    w.profile.hunterRank = "D";
    w.today = 502;
    enterArena(w, "E");
    settleClear(w);
    expect(w.profile.lastClear).toBe(500);
    enterArena(w, "D");
    settleClear(w);
    expect(w.profile.lastClear).toBe(502);
  });

  it("the break is forced on the next visit to the board, after its warning", () => {
    const w = day(500);
    const c = new FakeControls();
    w.today = 503;
    run(w, c, 0.02);
    expect(w.dialogue?.lines).toBe(DIALOGUES.break);
    c.press("Escape");
    run(w, c, 0.05);
    expect(w.mode).toBe("gate");
    expect(w.gateKind).toBe("break");
    expect(w.rank).toBe("E");
  });

  it("packs keep arriving, but never past the limit", () => {
    const w = day(500);
    const c = new FakeControls();
    enterBreak(w);
    let most = 0;
    for (let i = 0; i < 40 / STEP; i++) {
      w.player.iframes = 1;
      step(w, c, STEP);
      most = Math.max(most, w.enemies.length);
    }
    expect(most).toBeGreaterThan(BREAK.pack);
    expect(most).toBeLessThanOrEqual(BREAK.maxAlive);
  });

  it("holding out closes it, pays a reward, and resets the clock", () => {
    const w = day(500);
    const c = new FakeControls();
    w.today = 503;
    enterBreak(w);
    for (let i = 0; i < (BREAK.time + 1) / STEP && w.mode === "gate"; i++) {
      w.player.iframes = 1;
      step(w, c, STEP);
    }
    expect(w.mode).toBe("cleared");
    expect(w.profile.breakPending).toBe(false);
    expect(w.profile.lastClear).toBe(503);
    expect(w.profile.gold).toBe(BREAK.gold);
    expect(w.enemies).toEqual([]);
  });

  it("dying there costs the usual, and still closes the break", () => {
    const w = day(500);
    const c = new FakeControls();
    w.today = 503;
    w.profile.breakPending = true;
    w.profile.gold = 100;
    enterBreak(w);
    run(w, c, 40);
    expect(w.mode).toBe("dead");
    expect(w.profile.breakPending).toBe(false);
    expect(w.profile.gold).toBe(80);
  });
});

describe("save, version 2", () => {
  function veteran(): World {
    const w = board();
    w.profile.hunterRank = "C";
    w.profile.classUnlocked = true;
    w.profile.skillRanks = { pierce: 2, whirl: 3, surge: 1 };
    w.profile.echoes = [
      { kind: "warden", rank: "E", active: true },
      { kind: "brute", rank: "C", active: false },
    ];
    w.profile.lastClear = 400;
    return w;
  }

  it("round-trips the new fields", () => {
    const a = veteran();
    const data = parseSave(JSON.parse(JSON.stringify(toSave(a))))!;
    expect(data.v).toBe(SAVE_VERSION);
    const b = board();
    applySave(b, data);
    expect(b.profile).toEqual(a.profile);
  });

  it("a version 1 save loads with the new fields at their defaults", () => {
    const old = JSON.parse(JSON.stringify(toSave(board())));
    old.v = 1;
    for (const k of ["hunterRank", "skillRanks", "classUnlocked", "echoes", "lastClear", "breakPending"]) delete old.profile[k];
    old.profile.gold = 77;
    const data = parseSave(old)!;
    expect(data.v).toBe(SAVE_VERSION);
    expect(data.profile.gold).toBe(77);
    expect(data.profile.hunterRank).toBe("E");
    expect(data.profile.skillRanks).toEqual({ pierce: 1, whirl: 1, surge: 1 });
    expect(data.profile.classUnlocked).toBe(false);
    expect(data.profile.echoes).toEqual([]);
  });

  it("rejects a save from a later version", () => {
    expect(parseSave({ ...toSave(board()), v: SAVE_VERSION + 1 })).toBe(null);
  });

  it("drops bad echoes, trims the roster, and clamps skill ranks", () => {
    const raw = JSON.parse(JSON.stringify(toSave(veteran())));
    raw.profile.echoes = [
      { kind: "dragon", rank: "C", active: true },
      { kind: "swarmer", rank: "S", active: true },
      "nonsense",
      ...Array.from({ length: 20 }, () => ({ kind: "swarmer", rank: "C", active: false })),
    ];
    raw.profile.skillRanks = { pierce: 99, whirl: -3, surge: "x" };
    raw.profile.hunterRank = "S";
    const data = parseSave(raw)!;
    expect(data.profile.echoes.length).toBeLessThanOrEqual(ECHO.roster);
    expect(data.profile.echoes.every((e) => e.kind === "swarmer" && e.rank === "C")).toBe(true);
    expect(data.profile.skillRanks).toEqual({ pierce: 3, whirl: 1, surge: 1 });
    expect(data.profile.hunterRank).toBe("E");
  });

  it("a save cannot hold echoes without the class", () => {
    const raw = JSON.parse(JSON.stringify(toSave(veteran())));
    raw.profile.classUnlocked = false;
    expect(parseSave(raw)!.profile.echoes).toEqual([]);
  });
});
