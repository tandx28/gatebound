import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { ECHO, KINDS, PLAYER, RING_WARNING, ROAR, ROOM, STEP } from "./config";
import { damageEnemy, makeEnemy } from "./enemies";
import { bossBindChance } from "./profile";
import { applySave, parseSave, toSave } from "./save";
import { createWorld, enterArena, enterGate, enterRoom, step, type World } from "./world";

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

function arena(): { w: World; c: FakeControls } {
  const w = createWorld(() => 0.5);
  enterArena(w);
  return { w, c: new FakeControls() };
}

describe("entering phase two", () => {
  for (const kind of ["warden", "summoner", "duellist"] as const) {
    it(`${kind}: a player in melee range takes no damage from the change`, () => {
      const { w, c } = arena();
      const e = makeEnemy(kind, w.player.x + 40, w.player.y, "E");
      e.state = "recover";
      e.t = 0.01;
      w.enemies.push(e);
      damageEnemy(w, e, e.maxHp / 2, false, w.player.x, w.player.y, 0);
      expect(e.phase).toBe(2);
      // Stand still for the whole pause: nothing may land.
      run(w, c, ROAR.pause - 0.05);
      expect(w.player.hp).toBe(PLAYER.maxHp);
    });
  }

  it("no ring is released by the change itself", () => {
    const { w } = arena();
    const e = makeEnemy("warden", w.player.x + 40, w.player.y, "E");
    w.enemies.push(e);
    damageEnemy(w, e, e.maxHp / 2, false, w.player.x, w.player.y, 0);
    expect(w.shockwaves).toEqual([]);
  });

  it("throws a nearby player clear, and leaves a distant one alone", () => {
    const { w, c } = arena();
    const e = makeEnemy("warden", w.player.x + 40, w.player.y, "E");
    w.enemies.push(e);
    w.player.iframes = 5;
    const x0 = w.player.x;
    damageEnemy(w, e, e.maxHp / 2, false, w.player.x, w.player.y, 0);
    run(w, c, 0.5);
    expect(x0 - w.player.x).toBeGreaterThan(50);

    const far = arena();
    const f = makeEnemy("warden", far.w.player.x + ROAR.radius + 80, far.w.player.y, "E");
    far.w.enemies.push(f);
    damageEnemy(far.w, f, f.maxHp / 2, false, far.w.player.x, far.w.player.y, 0);
    expect(far.w.player.kx).toBe(0);
  });

  it("cancels the boss's attacks already in the air, and it waits before acting", () => {
    const { w } = arena();
    const e = makeEnemy("warden", w.player.x + 40, w.player.y, "E");
    w.enemies.push(e);
    w.zones.push({ x: w.player.x, y: w.player.y, radius: 120, t: 0.1, total: 1, damage: 30, owner: e });
    damageEnemy(w, e, e.maxHp / 2, false, w.player.x, w.player.y, 0);
    expect(w.zones).toEqual([]);
    expect(e.state).toBe("recover");
    expect(e.t).toBe(ROAR.pause);
    expect(e.inv).toBe(ROAR.pause);
  });

  it("being thrown never carries the player out of the room", () => {
    const { w, c } = arena();
    w.player.x = 30;
    const e = makeEnemy("warden", 80, w.player.y, "E");
    w.enemies.push(e);
    w.player.iframes = 5;
    damageEnemy(w, e, e.maxHp / 2, false, w.player.x, w.player.y, 0);
    run(w, c, 0.6);
    expect(w.player.x).toBeGreaterThanOrEqual(w.player.radius);
  });
});

describe("shockwave rings", () => {
  it("a ring warns before it moves, and cannot hurt while it warns", () => {
    const { w, c } = arena();
    const p = w.player;
    w.shockwaves.push({ x: p.x + 60, y: p.y, wait: RING_WARNING, r: 58, speed: 300, maxR: 600, damage: 25, hit: false });
    run(w, c, RING_WARNING - 0.05);
    expect(w.shockwaves[0].r).toBe(58);
    expect(p.hp).toBe(PLAYER.maxHp);
    run(w, c, 0.3);
    expect(w.shockwaves[0].r).toBeGreaterThan(58);
    expect(p.hp).toBe(PLAYER.maxHp - 25);
  });

  it("the warning is long enough to walk out of melee range", () => {
    // Distance covered at walking speed during the warning, against the gap a ring starts from.
    expect(PLAYER.speed * RING_WARNING).toBeGreaterThan(120);
  });

  it("the Stone Warden's phase-two ring starts with its warning", () => {
    const { w, c } = arena();
    w.player.iframes = 999;
    const e = makeEnemy("warden", w.player.x + 300, w.player.y, "E");
    e.phase = 2;
    e.state = "chase";
    e.cd = 0;
    w.enemies.push(e);
    let seen = false;
    for (let i = 0; i < 6 / STEP && !seen; i++) {
      step(w, c, STEP);
      if (w.shockwaves.length > 0) {
        seen = true;
        expect(w.shockwaves[0].wait).toBeGreaterThan(RING_WARNING - 0.05);
      }
    }
    expect(seen).toBe(true);
  });
});

describe("first boss", () => {
  it("is gentler: less health and a longer slam warning", () => {
    expect(KINDS.warden.hp).toBe(800);
    const { w, c } = arena();
    w.player.iframes = 999;
    const e = makeEnemy("warden", w.player.x + 300, w.player.y, "E");
    e.state = "chase";
    e.cd = 0;
    w.enemies.push(e);
    run(w, c, 0.05);
    expect(w.zones[0].total).toBe(1);
  });
});

describe("binding a boss in a real gate", () => {
  function bossRoom(rng: () => number): { w: World; c: FakeControls } {
    const w = createWorld(seeded(11));
    w.hiddenChance = 0;
    w.profile.classUnlocked = true;
    enterGate(w, "E", { sealed: false });
    enterRoom(w, w.dungeon!.bossId, null);
    w.rng = rng;
    return { w, c: new FakeControls() };
  }

  function killBoss(w: World, c: Controls): void {
    const boss = w.enemies.find((e) => e.boss)!;
    boss.x = w.player.x + 50;
    boss.y = w.player.y;
    boss.hp = 0;
    run(w, c, 0.02);
  }

  it("the boss's remnant survives its death and holds the gate open", () => {
    const { w, c } = bossRoom(() => 0.99);
    killBoss(w, c);
    expect(w.remnants.length).toBe(1);
    expect(w.remnants[0].tries).toBe(ECHO.bossTries);
    expect(w.remnantHold).toBe(true);
    run(w, c, 5);
    expect(w.mode).toBe("gate");
    expect(w.notices.some((n) => n.title === "THE BOSS LINGERS") || w.remnantHold).toBe(true);
  });

  it("a successful bind gives the boss as an echo, then the gate clears", () => {
    const { w, c } = bossRoom(() => 0.1);
    killBoss(w, c);
    c.press("KeyG");
    run(w, c, 0.02);
    expect(w.profile.echoes).toEqual([{ kind: "warden", rank: "E", active: true }]);
    expect(w.remnantHold).toBe(false);
    run(w, c, 2);
    expect(w.mode).toBe("cleared");
    expect(w.profile.gatesCleared).toBe(1);
  });

  it("three failed tries lose it, and the gate still clears", () => {
    const { w, c } = bossRoom(() => 0.99);
    killBoss(w, c);
    for (let i = 0; i < ECHO.bossTries; i++) {
      w.player.mana = 20;
      c.press("KeyG");
      run(w, c, 0.02);
    }
    expect(w.profile.echoes).toEqual([]);
    run(w, c, 2);
    expect(w.mode).toBe("cleared");
  });

  it("T walks away from it, and the gate counts as cleared", () => {
    const { w, c } = bossRoom(() => 0.99);
    killBoss(w, c);
    c.press("KeyT");
    run(w, c, 0.1);
    expect(w.mode).toBe("cleared");
    expect(w.run.retreated).toBe(false);
    expect(w.profile.gatesCleared).toBe(1);
  });

  it("left alone, the remnant fades and the gate clears by itself", () => {
    const { w, c } = bossRoom(() => 0.99);
    killBoss(w, c);
    run(w, c, ECHO.bossRemnantLife + 2);
    expect(w.mode).toBe("cleared");
  });

  it("without the class, the boss leaves nothing and the gate clears at once", () => {
    const { w, c } = bossRoom(() => 0.99);
    w.profile.classUnlocked = false;
    killBoss(w, c);
    expect(w.remnants).toEqual([]);
    run(w, c, 2.5);
    expect(w.mode).toBe("cleared");
  });

  it("the chance starts at half and rises with Intelligence, but is never certain", () => {
    const w = createWorld(() => 0.5);
    expect(bossBindChance(w)).toBe(ECHO.bossChance);
    w.player.prog.stats.int += 20;
    expect(bossBindChance(w)).toBeCloseTo(0.7);
    w.player.prog.stats.int += 500;
    expect(bossBindChance(w)).toBe(0.95);
  });

  it("a save made while the remnant waits resumes into a gate that finishes", () => {
    const { w, c } = bossRoom(() => 0.99);
    killBoss(w, c);
    const data = parseSave(JSON.parse(JSON.stringify(toSave(w))))!;
    expect(data.gate?.bossDead).toBe(true);
    const b = createWorld(seeded(5));
    applySave(b, data);
    expect(b.mode).toBe("gate");
    run(b, c, 2);
    expect(b.mode).toBe("cleared");
  });

  it("a hidden door and a remnant together: binding leaves the gate open for the trial", () => {
    const { w, c } = bossRoom(() => 0.1);
    w.hiddenChance = 1;
    killBoss(w, c);
    expect(w.bossDead).toBe(true);
    expect(w.remnants.length).toBe(1);
    c.press("KeyG");
    run(w, c, 0.02);
    run(w, c, 3);
    expect(w.mode).toBe("gate");
    expect(w.profile.echoes.length).toBe(1);
  });
});
