import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { makeAlly } from "./allies";
import {
  ASSASSIN,
  BLINK,
  bossEchoCap,
  COLOSSUS,
  dailyGoals,
  DEFAULT_LOADOUT,
  DOMAIN,
  DOMINION,
  ECHO,
  EGG,
  KINDS,
  KNIGHT,
  LEAPER,
  PLAYER,
  PYRO,
  RALLY,
  RANK_IDS,
  rankForLevel,
  RANKS,
  ROOM,
  SKILL_IDS,
  SKILLS,
  STATUS,
  STEP,
  TOTEM,
  WARDER,
  WARPER,
  type EnemyKind,
} from "./config";
import { damageEnemy, makeEnemy } from "./enemies";
import { canActivate, hubAction } from "./profile";
import { MAIN } from "./quests";
import { applySave, parseSave, toSave } from "./save";
import { afflict } from "./state";
import { LEVEL_CAP } from "./stats";
import { gateCard, hubButtons, pointIn } from "./ui";
import { createWorld, enterArena, step, type Enemy, type World } from "./world";

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

function arena(rng: () => number = () => 0.5): { w: World; c: FakeControls } {
  const w = createWorld(rng);
  enterArena(w, "E");
  return { w, c: new FakeControls() };
}

function add(w: World, kind: EnemyKind, dx: number, dy: number, state?: string, t = 0): Enemy {
  const e = makeEnemy(kind, w.player.x + dx, w.player.y + dy, w.rank);
  if (state) {
    e.state = state;
    e.t = t;
  }
  e.cd = 0;
  w.enemies.push(e);
  return e;
}

describe("ranks and levels", () => {
  it("there are six ranks, each needing a higher level than the last", () => {
    expect(RANK_IDS).toEqual(["E", "D", "C", "B", "A", "S"]);
    for (let i = 1; i < RANK_IDS.length; i++) {
      expect(RANKS[RANK_IDS[i]].minLevel).toBeGreaterThan(RANKS[RANK_IDS[i - 1]].minLevel);
    }
    expect(RANKS.S.minLevel).toBeLessThan(LEVEL_CAP);
    expect(LEVEL_CAP).toBe(60);
  });

  it("every rank's enemies and boss are real kinds, and only the boss is a boss", () => {
    for (const r of RANK_IDS) {
      for (const k of RANKS[r].kinds) expect(KINDS[k].boss).toBe(false);
      expect(KINDS[RANKS[r].boss].boss).toBe(true);
    }
  });

  it("rankForLevel picks the highest rank the level is ready for", () => {
    expect(rankForLevel(1)).toBe("E");
    expect(rankForLevel(19)).toBe("C");
    expect(rankForLevel(20)).toBe("B");
    expect(rankForLevel(41)).toBe("A");
    expect(rankForLevel(60)).toBe("S");
  });

  it("the gate board holds six cards that do not overlap, and keys 4 to 6 enter the new ranks", () => {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (i === j) continue;
        const a = gateCard(i);
        expect(pointIn(gateCard(j), a.x + a.w / 2, a.y + a.h / 2)).toBe(false);
      }
    }
    const w = createWorld(seeded(3));
    const c = new FakeControls();
    c.press("Digit5");
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
    expect(w.rank).toBe("A");
  });

  it("the main quest continues past the rite, one gate per new rank", () => {
    const ids = MAIN.map((q) => q.id);
    expect(ids).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"]);
  });
});

describe("ailments", () => {
  it("poison stacks to its limit and wears off together", () => {
    const { w, c } = arena();
    for (let i = 0; i < 9; i++) afflict(w, "poison");
    expect(w.player.ail.poison).toBe(STATUS.poison.max);
    run(w, c, STATUS.poison.time + 0.1);
    expect(w.player.ail.poison).toBe(0);
  });

  it("poison and burn take health over time, at the stated rates", () => {
    const { w, c } = arena();
    afflict(w, "poison");
    run(w, c, 2);
    // One stack: 1% of 60 a second.
    expect(w.player.hp).toBe(PLAYER.maxHp - 1);
    const b = arena();
    afflict(b.w, "burn");
    run(b.w, b.c, STATUS.burn.time + 0.2);
    expect(b.w.player.hp).toBe(PLAYER.maxHp - Math.floor(PLAYER.maxHp * STATUS.burn.dps * STATUS.burn.time));
  });

  it("slow cuts walking speed, then wears off", () => {
    const walk = (slow: boolean) => {
      const { w, c } = arena();
      if (slow) afflict(w, "slow");
      c.move = { x: 1, y: 0 };
      const x0 = w.player.x;
      run(w, c, 1);
      return w.player.x - x0;
    };
    expect(walk(true) / walk(false)).toBeCloseTo(STATUS.slow.speed, 1);
    const { w, c } = arena();
    afflict(w, "slow");
    run(w, c, STATUS.slow.time + 0.1);
    expect(w.player.ail.slowT).toBe(0);
  });

  it("damage over time ignores a dash, and can kill", () => {
    const { w, c } = arena();
    w.player.hp = 2;
    w.player.iframes = 99;
    for (let i = 0; i < 5; i++) afflict(w, "poison");
    run(w, c, 3);
    expect(w.mode).toBe("dead");
  });

  it("immunity blocks new ailments", () => {
    const { w } = arena();
    w.player.ail.immune = 5;
    afflict(w, "poison");
    afflict(w, "burn");
    afflict(w, "slow");
    expect(w.player.ail).toMatchObject({ poison: 0, burnT: 0, slowT: 0 });
  });

  it("entering a gate clears them", () => {
    const { w } = arena();
    afflict(w, "poison");
    enterArena(w);
    expect(w.player.ail.poison).toBe(0);
  });
});

describe("rank B enemies", () => {
  it("a leaper marks where it will land, cannot be hit in the air, and hurts on landing", () => {
    const { w, c } = arena();
    const e = add(w, "leaper", 200, 0, "chase");
    run(w, c, 0.05);
    expect(w.zones.length).toBe(1);
    expect(w.zones[0]).toMatchObject({ x: w.player.x, y: w.player.y, radius: LEAPER.radius });
    run(w, c, LEAPER.windup + 0.05);
    expect(e.state).toBe("leap");
    expect(damageEnemy(w, e, 5, false, 0, 0, 0)).toBe(false);
    run(w, c, LEAPER.air + 0.1);
    expect(w.player.hp).toBe(PLAYER.maxHp - KINDS.leaper.damage);
    expect(Math.hypot(e.x - w.player.x, e.y - w.player.y)).toBeLessThan(30);
  });

  it("killing a leaper before it jumps cancels the landing", () => {
    const { w, c } = arena();
    const e = add(w, "leaper", 200, 0, "chase");
    run(w, c, 0.05);
    e.hp = 0;
    run(w, c, 1.2);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });

  it("a pyre caster drops three delayed fires, and standing in one burns", () => {
    const { w, c } = arena();
    add(w, "pyro", 320, 0, "idle");
    run(w, c, PYRO.cast + 0.05);
    expect(w.zones.length).toBe(3);
    expect(w.zones.every((z) => z.status === "burn")).toBe(true);
    run(w, c, PYRO.fuse + 0.05);
    expect(w.player.ail.burnT).toBeGreaterThan(0);
    expect(w.player.hp).toBeLessThan(PLAYER.maxHp);
  });

  it("a warder shields enemies near it, but not itself or those far away", () => {
    const { w } = arena();
    const warder = add(w, "warder", 300, 0, "recover", 99);
    const near = add(w, "swarmer", 300 + WARDER.aura - 40, 0, "recover", 99);
    const far = add(w, "swarmer", 300 + WARDER.aura + 200, 0, "recover", 99);
    for (const e of [warder, near, far]) damageEnemy(w, e, 10, false, 0, 0, 0);
    expect(near.maxHp - near.hp).toBe(Math.round(10 * WARDER.shield));
    expect(far.maxHp - far.hp).toBe(10);
    expect(warder.maxHp - warder.hp).toBe(10);
  });

  it("with the warder dead, the shield is gone", () => {
    const { w } = arena();
    const warder = add(w, "warder", 300, 0, "recover", 99);
    const near = add(w, "swarmer", 340, 0, "recover", 99);
    warder.hp = 0;
    damageEnemy(w, near, 10, false, 0, 0, 0);
    expect(near.maxHp - near.hp).toBe(10);
  });
});

describe("rank A enemies", () => {
  it("a shade vanishes, reappears behind the player, and its strike poisons", () => {
    const { w, c } = arena();
    const e = add(w, "assassin", 150, 0, "stalk");
    run(w, c, 0.05);
    expect(e.state).toBe("vanish");
    expect(damageEnemy(w, e, 5, false, 0, 0, 0)).toBe(false);
    run(w, c, ASSASSIN.vanish);
    // The player faces right (toward the cursor), so behind is to the left.
    expect(e.x).toBeLessThan(w.player.x);
    run(w, c, ASSASSIN.windup + ASSASSIN.lungeTime + 0.1);
    expect(w.player.ail.poison).toBe(1);
    expect(w.player.hp).toBeLessThan(PLAYER.maxHp);
  });

  it("a knight's guard soaks hits until it breaks, then the knight is stunned and open", () => {
    const { w, c } = arena();
    const e = add(w, "knight", 300, 0, "recover", 99);
    const guard = e.guard;
    expect(guard).toBe(Math.round(e.maxHp * KNIGHT.guard));
    damageEnemy(w, e, guard - 1, false, 0, 0, 0);
    expect(e.hp).toBe(e.maxHp);
    damageEnemy(w, e, 5, false, 0, 0, 0);
    expect(e.state).toBe("broken");
    expect(e.hp).toBe(e.maxHp);
    damageEnemy(w, e, 7, false, 0, 0, 0);
    expect(e.hp).toBe(e.maxHp - 7);
    w.player.iframes = 99;
    run(w, c, KNIGHT.broken + 0.1);
    expect(e.guard).toBe(guard);
  });

  it("a war totem makes every hit on the player harder and mends its allies", () => {
    const { w, c } = arena();
    const hurt = add(w, "swarmer", 600, 0, "recover", 99);
    hurt.hp = 10;
    add(w, "swarmer", 50, 0, "chase");
    const totem = add(w, "totem", 500, 300);
    run(w, c, 1);
    expect(w.player.hp).toBe(PLAYER.maxHp - Math.round(KINDS.swarmer.damage * TOTEM.damage));
    expect(hurt.hp).toBeGreaterThan(10);
    expect(totem.x).toBe(w.player.x + 500 - 0 * 1);
  });

  it("a totem never moves or attacks", () => {
    const { w, c } = arena();
    const t = add(w, "totem", 200, 0);
    const at = { x: t.x, y: t.y };
    w.player.iframes = 99;
    run(w, c, 5);
    expect({ x: t.x, y: t.y }).toEqual(at);
    expect(w.zones.length + w.projectiles.length).toBe(0);
  });
});

describe("rank S enemies", () => {
  it("a warper trades places with the player and slows them", () => {
    const { w, c } = arena();
    const e = add(w, "warper", 300, 0, "idle");
    const was = { x: w.player.x, y: w.player.y };
    run(w, c, 0.05);
    expect(e.state).toBe("cast");
    const from = { x: e.x, y: e.y };
    run(w, c, WARPER.cast + 0.02);
    expect(w.player.x).toBeCloseTo(from.x, 0);
    expect(Math.hypot(e.x - was.x, e.y - was.y)).toBeLessThan(40);
    expect(w.player.ail.slowT).toBeGreaterThan(0);
  });

  it("a dash at the end of the cast slips the swap", () => {
    const { w, c } = arena();
    add(w, "warper", 300, 0, "cast", 0.1);
    const x0 = w.player.x;
    w.player.iframes = 0.5;
    run(w, c, 0.2);
    expect(Math.abs(w.player.x - x0)).toBeLessThan(5);
    expect(w.player.ail.slowT).toBe(0);
  });

  it("a colossus's slam leaves the ground burning, and only so many patches at once", () => {
    const { w, c } = arena();
    w.player.iframes = 99;
    add(w, "colossus", 100, 0, "chase");
    run(w, c, COLOSSUS.windup + 0.1);
    expect(w.patches.length).toBe(1);
    expect(w.patches[0].radius).toBe(COLOSSUS.patchRadius);
    for (let i = 0; i < 8; i++) w.zones.push({ x: 100 + i * 10, y: 100, radius: 50, t: 0.01, total: 1, damage: 0, patch: 5, status: "burn" });
    run(w, c, 0.05);
    expect(w.patches.length).toBe(COLOSSUS.maxPatches);
  });

  it("standing on burning ground burns; the patch goes out in time", () => {
    const { w, c } = arena();
    w.patches.push({ x: w.player.x, y: w.player.y, radius: 80, life: 1, status: "burn" });
    run(w, c, 0.1);
    expect(w.player.ail.burnT).toBeGreaterThan(0);
    run(w, c, 1.2);
    expect(w.patches).toEqual([]);
  });
});

describe("the Brood Queen", () => {
  it("an egg hatches into a leaper that gives nothing; a broken egg does not hatch", () => {
    const { w, c } = arena();
    w.player.iframes = 99;
    add(w, "egg", 300, 0);
    run(w, c, EGG.hatch + 0.1);
    expect(w.enemies.map((e) => e.kind)).toEqual(["leaper"]);
    expect(w.enemies[0].xp).toBe(0);

    const b = arena();
    const egg = add(b.w, "egg", 300, 0);
    run(b.w, b.c, 1);
    egg.hp = 0;
    run(b.w, b.c, EGG.hatch);
    expect(b.w.enemies).toEqual([]);
  });

  it("lays eggs, but never past the limit", () => {
    const { w, c } = arena(seeded(8));
    w.player.iframes = 9999;
    const q = add(w, "queen", 400, 0, "idle");
    q.hp = q.maxHp = 1e9;
    let most = 0;
    for (let i = 0; i < 40 / STEP; i++) {
      step(w, c, STEP);
      most = Math.max(most, w.enemies.filter((e) => e.kind === "egg" || e.kind === "leaper").length);
    }
    expect(most).toBeGreaterThan(2);
    expect(most).toBeLessThanOrEqual(EGG.max);
  });

  it("its spit poisons", () => {
    const { w, c } = arena();
    const q = add(w, "queen", 300, 0, "spit", 0.3);
    q.facing = Math.PI;
    q.dirX = -1;
    q.dirY = 0;
    run(w, c, 1.6);
    expect(w.player.ail.poison).toBeGreaterThan(0);
  });
});

describe("the Knight Commander", () => {
  it("charges three times, then stands blown and open", () => {
    const { w, c } = arena();
    w.player.iframes = 9999;
    const e = add(w, "commander", 380, 0, "ride");
    let charges = 0;
    let last = "";
    for (let i = 0; i < 8 / STEP && e.state !== "recover"; i++) {
      step(w, c, STEP);
      if (e.state === "charge" && last !== "charge") charges += 1;
      last = e.state;
    }
    expect(charges).toBe(3);
    expect(e.state).toBe("recover");
  });

  it("on foot in phase two it raises a guard that must be broken", () => {
    const { w } = arena();
    const e = add(w, "commander", 380, 0, "ride");
    damageEnemy(w, e, e.maxHp / 2, false, 0, 0, 0);
    expect(e.phase).toBe(2);
    expect(e.guard).toBeGreaterThan(0);
  });
});

describe("the Hollow Monarch", () => {
  it("has three phases, at two thirds and one third of its health", () => {
    const { w } = arena();
    const e = add(w, "monarch", 380, 0, "idle");
    damageEnemy(w, e, e.maxHp / 3 - 10, false, 0, 0, 0);
    expect(e.phase).toBe(1);
    damageEnemy(w, e, 20, false, 0, 0, 0);
    expect(e.phase).toBe(2);
    e.inv = 0;
    damageEnemy(w, e, e.maxHp / 3, false, 0, 0, 0);
    expect(e.phase).toBe(3);
  });

  it("Dominion turns the player's echoes on them for a while, and then it ends", () => {
    const { w, c } = arena();
    w.profile.classUnlocked = true;
    // A weak echo, so the player lives through the whole of it.
    w.allies.push(makeAlly({ kind: "swarmer", rank: "S", active: true }, w.player.x + 30, w.player.y, 20));
    w.turnedT = DOMINION.time;
    run(w, c, 2);
    expect(w.player.hp).toBeLessThan(PLAYER.maxHp);
    expect(w.mode).toBe("gate");
    // Each hit freezes the fight for a moment, so allow a little longer than the timer.
    run(w, c, DOMINION.time + 1.5);
    const hp = w.player.hp;
    expect(w.turnedT).toBe(0);
    w.player.iframes = 0;
    run(w, c, 2);
    expect(w.player.hp).toBe(hp);
  });

  it("without echoes, Dominion is never cast", () => {
    const { w, c } = arena();
    w.player.iframes = 9999;
    const e = add(w, "monarch", 380, 0, "idle");
    e.phase = 3;
    e.hp = e.maxHp = 1e9;
    run(w, c, 12);
    expect(w.turnedT).toBe(0);
  });
});

describe("skill slots", () => {
  it("start as Pierce, Whirl, Surge and Rally", () => {
    expect(createWorld(seeded(1)).profile.loadout).toEqual(DEFAULT_LOADOUT);
  });

  it("putting a skill in a slot swaps it with what was there; clicking its own slot clears it", () => {
    const w = createWorld(seeded(1));
    hubAction(w, "slot:0:whirl");
    expect(w.profile.loadout).toEqual(["whirl", "pierce", "surge", "rally"]);
    hubAction(w, "slot:3:blink");
    expect(w.profile.loadout).toEqual(["whirl", "pierce", "surge", "blink"]);
    hubAction(w, "slot:3:blink");
    expect(w.profile.loadout).toEqual(["whirl", "pierce", "surge", null]);
    hubAction(w, "slot:9:whirl");
    hubAction(w, "slot:0:fireball");
    expect(w.profile.loadout).toEqual(["whirl", "pierce", "surge", null]);
  });

  it("a slot fires whatever skill is in it; an empty slot does nothing", () => {
    const { w, c } = arena();
    w.player.prog.level = 60;
    w.profile.loadout = ["whirl", null, "pierce", "surge"];
    c.press("KeyQ");
    run(w, c, 0.02);
    expect(w.player.skillCd.whirl).toBeGreaterThan(0);
    c.press("KeyE");
    run(w, c, 0.02);
    expect(w.player.skillCd.pierce).toBe(0);
    c.press("Mouse2");
    run(w, c, 0.02);
    expect(w.player.surgeT).toBeGreaterThan(0);
  });

  it("the skills tab offers every skill a button per slot, live only once the level is reached", () => {
    const w = createWorld(seeded(1));
    w.tab = "skills";
    const all = hubButtons(w).filter((b) => b.id.startsWith("slot:"));
    expect(all.length).toBe(SKILL_IDS.length * 4);
    expect(all.find((b) => b.id === "slot:0:domain")!.enabled).toBe(false);
    w.player.prog.level = SKILLS.domain.level;
    expect(hubButtons(w).find((b) => b.id === "slot:0:domain")!.enabled).toBe(true);
  });
});

describe("new skills", () => {
  function ready(): { w: World; c: FakeControls } {
    const a = arena();
    a.w.player.prog.level = 60;
    a.w.profile.loadout = ["rally", "blink", "domain", null];
    return a;
  }

  it("are locked below their levels", () => {
    const { w, c } = arena();
    w.player.prog.level = SKILLS.rally.level - 1;
    w.profile.loadout = ["rally", "blink", "domain", null];
    for (const k of ["KeyQ", "KeyE", "KeyR"]) c.press(k);
    run(w, c, 0.02);
    expect(w.rallyT + w.domainT).toBe(0);
  });

  it("Rally sends every echo at the enemy nearest the cursor, hitting harder", () => {
    const { w, c } = ready();
    const near = add(w, "brute", 60, 0, "recover", 99);
    const far = add(w, "brute", 500, 200, "recover", 99);
    near.facing = 0;
    far.facing = 0;
    w.allies.push(makeAlly({ kind: "swarmer", rank: "E", active: true }, w.player.x, w.player.y, 100));
    c.aimX = far.x;
    c.aimY = far.y;
    c.press("KeyQ");
    run(w, c, 0.02);
    expect(w.rallyTarget).toBe(far);
    w.player.iframes = 99;
    run(w, c, 4);
    expect(far.hp).toBeLessThan(far.maxHp);
    expect(near.hp).toBe(near.maxHp);
    run(w, c, RALLY.time);
    expect(w.rallyT).toBe(0);
    expect(w.rallyTarget).toBe(null);
  });

  it("Blink moves to the cursor, no further than its range, and bursts on arrival", () => {
    const { w, c } = ready();
    const x0 = w.player.x;
    c.aimX = x0 + 150;
    const e = add(w, "swarmer", 170, 0, "recover", 99);
    c.press("KeyE");
    run(w, c, 0.02);
    expect(w.player.x).toBeCloseTo(x0 + 150, 0);
    expect(e.hp).toBeLessThan(e.maxHp);

    const far = ready();
    const fx = far.w.player.x;
    far.c.aimX = fx + 5000;
    far.c.press("KeyE");
    run(far.w, far.c, 0.02);
    expect(far.w.player.x - fx).toBeLessThanOrEqual(Math.min(BLINK.range, ROOM.w - fx) + 1);
    expect(far.w.player.x).toBeLessThanOrEqual(ROOM.w - far.w.player.radius);
  });

  it("Domain halves every enemy's pace and makes them take more damage", () => {
    const { w, c } = ready();
    w.player.iframes = 99;
    const e = add(w, "swarmer", 600, 0, "chase");
    const x0 = e.x;
    c.press("KeyR");
    run(w, c, 1);
    const slow = x0 - e.x;
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(KINDS.swarmer.speed * DOMAIN.slow * 1.1);
    damageEnemy(w, e, 10, false, 0, 0, 0);
    expect(e.maxHp - e.hp).toBe(Math.round(10 * DOMAIN.vulnerable));
    run(w, c, DOMAIN.time + 0.5);
    expect(w.domainT).toBe(0);
    expect(e.slowT).toBe(0);
  });
});

describe("the army", () => {
  it("an echo's hit grows with the player's own", () => {
    const weak = makeAlly({ kind: "swarmer", rank: "E", active: true }, 0, 0, 10);
    const strong = makeAlly({ kind: "swarmer", rank: "E", active: true }, 0, 0, 100);
    expect(strong.dmg).toBeCloseTo(weak.dmg * 10);
  });

  it("an echo bound in a higher gate is stronger for good", () => {
    const e = makeAlly({ kind: "swarmer", rank: "E", active: true }, 0, 0, 100);
    const s = makeAlly({ kind: "swarmer", rank: "S", active: true }, 0, 0, 100);
    expect(s.dmg / e.dmg).toBeCloseTo(ECHO.rankBonus.S);
  });

  it("holds twenty echoes, and more bosses fight at once as the hunter grows", () => {
    expect(ECHO.roster).toBe(20);
    expect(bossEchoCap(1)).toBe(1);
    expect(bossEchoCap(30)).toBe(2);
    expect(bossEchoCap(45)).toBe(3);
    const w = createWorld(seeded(1));
    w.player.prog.level = 45;
    w.profile.echoes = [
      { kind: "warden", rank: "E", active: true },
      { kind: "summoner", rank: "D", active: true },
    ];
    expect(canActivate(w, "duellist")).toBe(true);
    w.profile.echoes.push({ kind: "duellist", rank: "C", active: true });
    expect(canActivate(w, "queen")).toBe(false);
    expect(canActivate(w, "swarmer")).toBe(true);
  });
});

describe("daily quest scaling", () => {
  it("grows with rank, and never shrinks", () => {
    expect(dailyGoals("E")).toEqual({ kills: 40, rooms: 5, gates: 1, points: 3 });
    expect(dailyGoals("S")).toEqual({ kills: 80, rooms: 8, gates: 2, points: 6 });
    for (let i = 1; i < RANK_IDS.length; i++) {
      const a = dailyGoals(RANK_IDS[i - 1]);
      const b = dailyGoals(RANK_IDS[i]);
      for (const k of ["kills", "rooms", "gates", "points"] as const) expect(b[k]).toBeGreaterThanOrEqual(a[k]);
    }
  });
});

describe("save, version 3", () => {
  it("round-trips the loadout and a high rank", () => {
    const a = createWorld(seeded(1));
    a.profile.hunterRank = "S";
    a.profile.loadout = ["blink", null, "domain", "rally"];
    a.player.prog.level = 55;
    const b = createWorld(seeded(2));
    applySave(b, parseSave(JSON.parse(JSON.stringify(toSave(a))))!);
    expect(b.profile.loadout).toEqual(["blink", null, "domain", "rally"]);
    expect(b.profile.hunterRank).toBe("S");
    expect(b.player.prog.level).toBe(55);
  });

  it("repairs a bad loadout: unknown skills and repeats become empty slots", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    raw.profile.loadout = ["pierce", "pierce", "fireball", 7, "whirl", "surge"];
    expect(parseSave(raw)!.profile.loadout).toEqual(["pierce", null, null, null]);
  });

  it("a level 20 save from before carries on: same level, rank B within reach", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    raw.v = 2;
    raw.prog.level = 20;
    delete raw.profile.loadout;
    const data = parseSave(raw)!;
    expect(data.prog.level).toBe(20);
    expect(data.profile.loadout).toEqual(DEFAULT_LOADOUT);
    expect(rankForLevel(data.prog.level)).toBe("B");
  });
});
