import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { BINDABLE, BREAK, CORPSE, HIDDEN, KINDS, NGPLUS, ORDER, PARRY, RANK_IDS, ROOM, SEALED, SEALED_GUARD, SKILL_IDS, SKILLS, STAGGER, STEP, TOWER, towerRank, VIEW_H, VIEW_W, type Rank } from "./config";
import { generateDungeon } from "./dungeon";
import { makeEnemy } from "./enemies";
import { itemDef, TITLES } from "./items";
import { bindKey, boundKey, canNewGamePlus, chooseEnding, hubAction, keyName, newGamePlus, redGateOpen, settleClear, syncDay, towerOpen, tutorialTip } from "./profile";
import { MAIN } from "./quests";
import { blockCircle, furnish, insidePillar, PILLAR, stepTraps, trapPhase, TRAPS, type Trap } from "./rooms";
import { parseSave, toSave } from "./save";
import { hubButtons, keysButtons, pauseButtons, PAUSE_PANEL } from "./ui";
import { createWorld, enterArena, enterGate, enterRoom, enterTower, step, toSelect, type Enemy, type World } from "./world";

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

function arena(rank: Rank = "E"): { w: World; c: FakeControls } {
  const w = createWorld(() => 0.5);
  enterArena(w, rank);
  return { w, c: new FakeControls() };
}

function add(w: World, kind: keyof typeof KINDS, dx: number, dy: number, hp = 1e6): Enemy {
  const e = makeEnemy(kind, w.player.x + dx, w.player.y + dy, w.rank);
  e.state = "recover";
  e.t = 999;
  e.hp = e.maxHp = hp;
  w.enemies.push(e);
  return e;
}

/** Level, mana and a ready skill in slot Q. */
function withSkill(w: World, id: (typeof SKILL_IDS)[number]): void {
  w.player.prog.level = 60;
  w.player.mana = 999;
  w.profile.loadout = [id, null, null, null];
}

describe("sealed gates", () => {
  it("the sixth gate in a row without one is always sealed, and the count starts again", () => {
    const w = createWorld(() => 0.99);
    for (let i = 0; i < SEALED.pity - 1; i++) {
      enterGate(w, "E");
      expect(w.sealed, `gate ${i + 1}`).toBe(false);
    }
    enterGate(w, "E");
    expect(w.sealed).toBe(true);
    expect(w.profile.sealedPity).toBe(0);
    enterGate(w, "E");
    expect(w.sealed).toBe(false);
  });

  it("each day puts one on the board, no more than a rank above the hunter, until it is cleared", () => {
    const w = createWorld(seeded(3));
    w.profile.introSeen = true;
    w.today = 50;
    toSelect(w);
    syncDay(w);
    expect(redGateOpen(w)).toBe(true);
    expect(RANK_IDS.indexOf(w.profile.redGate.rank)).toBeLessThanOrEqual(1);
    expect(hubButtons(w).some((b) => b.id === "gate:sealed" && b.danger)).toBe(true);
    expect(hubAction(w, "gate:sealed")).toBe("sealed");
    enterGate(w, w.profile.redGate.rank, { sealed: true });
    w.mode = "cleared";
    settleClear(w);
    expect(redGateOpen(w)).toBe(false);
    w.today = 51;
    syncDay(w);
    expect(redGateOpen(w)).toBe(true);
  });

  it("its master is awake on arrival, with two guards, and brings less than full health", () => {
    const w = createWorld(seeded(9));
    enterGate(w, "D", { sealed: true });
    enterRoom(w, w.dungeon!.bossId, "s");
    const boss = w.enemies.find((e) => e.boss)!;
    expect(boss.phase).toBe(2);
    expect(w.enemies.filter((e) => e.kind === SEALED_GUARD.D).length).toBe(SEALED.guards);
    const open = createWorld(seeded(9));
    enterGate(open, "D", { sealed: false });
    enterRoom(open, open.dungeon!.bossId, "s");
    const plain = open.enemies.find((e) => e.boss)!;
    expect(plain.phase).toBe(1);
    expect(open.enemies.length).toBe(1);
    expect(boss.maxHp).toBeLessThan(plain.maxHp * 1.8);
  });

  it("clearing one always pays an item of epic rarity or better", () => {
    for (const rank of ["E", "C", "S"] as Rank[]) {
      const w = createWorld(seeded(5));
      enterGate(w, rank, { sealed: true });
      w.mode = "cleared";
      settleClear(w);
      const best = w.profile.inventory.map((o) => itemDef(o)!.rarity);
      expect(best.some((r) => r === "epic" || r === "legendary"), rank).toBe(true);
    }
  });

  it("the count and the day's gate survive a save", () => {
    const w = createWorld(() => 0.99);
    w.profile.sealedPity = 4;
    w.profile.redGate = { day: 7, rank: "C", done: true };
    const p = parseSave(JSON.parse(JSON.stringify(toSave(w))))!.profile;
    expect(p.sealedPity).toBe(4);
    expect(p.redGate).toEqual({ day: 7, rank: "C", done: true });
  });
});

describe("rare things come to those who keep playing", () => {
  it("every eighth gate closed brings a gate break, of the hunter's own rank", () => {
    const w = createWorld(seeded(11));
    w.profile.introSeen = true;
    w.profile.hunterRank = "S";
    for (let i = 0; i < BREAK.afterGates; i++) {
      expect(w.profile.breakPending, `after ${i} gates`).toBe(false);
      enterGate(w, "E", { sealed: false });
      w.mode = "cleared";
      settleClear(w);
    }
    expect(w.profile.breakPending).toBe(true);
    expect(w.pendingDialogue).toContain("break_surge");
    expect(w.profile.breakPity).toBe(0);
    const p = parseSave(JSON.parse(JSON.stringify(toSave(w))))!.profile;
    expect(p.breakPending).toBe(true);
  });

  it("the fifth boss in a row without a hidden door always opens one; with doors switched off, never", () => {
    for (const [chance, opens] of [[1e-9, true], [0, false]] as const) {
      const w = createWorld(seeded(12));
      w.hiddenChance = chance;
      w.profile.trialPity = HIDDEN.pity - 1;
      enterGate(w, "S", { sealed: false });
      enterRoom(w, w.dungeon!.bossId, "s");
      for (const e of w.enemies) e.hp = 0;
      step(w, new FakeControls(), STEP);
      expect(w.bossDead, `chance ${chance}`).toBe(opens);
      expect(w.profile.trialPity).toBe(opens ? 0 : HIDDEN.pity);
    }
  });
});

describe("rooms with things in them", () => {
  const rooms = (rank: Rank) => Array.from({ length: 30 }, (_, i) => generateDungeon(rank, seeded(i + 1)).rooms).flat();

  it("the same room is always furnished the same way, and only fighting rooms are", () => {
    for (const room of rooms("C")) {
      expect(furnish("C", room)).toEqual(furnish("C", room));
      if (room.kind !== "normal") expect(furnish("C", room).pillars.length + furnish("C", room).traps.length).toBe(0);
    }
  });

  it("pillars and traps keep clear of the doors and the middle, and of each other", () => {
    const doors = [[ROOM.w / 2, 0], [ROOM.w / 2, ROOM.h], [0, ROOM.h / 2], [ROOM.w, ROOM.h / 2]];
    let pillars = 0;
    for (const room of rooms("S")) {
      const f = furnish("S", room);
      pillars += f.pillars.length;
      for (const p of f.pillars) {
        for (const [x, y] of doors) expect(Math.hypot(p.x - x, p.y - y)).toBeGreaterThan(150 + p.radius);
        expect(Math.hypot(p.x - ROOM.w / 2, p.y - ROOM.h / 2)).toBeGreaterThan(100 + p.radius);
        expect(p.x - p.radius).toBeGreaterThan(0);
        expect(p.y + p.radius).toBeLessThan(ROOM.h);
      }
      for (const t of f.traps) for (const p of f.pillars) expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeGreaterThan(p.radius);
    }
    expect(pillars).toBeGreaterThan(20);
  });

  it("traps arrive by rank: spikes from E, flames from C, sludge from B", () => {
    const kinds = (rank: Rank) => new Set(rooms(rank).flatMap((r) => furnish(rank, r).traps.map((t) => t.kind)));
    expect([...kinds("E")]).toEqual(["spike"]);
    expect(kinds("C").has("flame")).toBe(true);
    expect(kinds("C").has("sludge")).toBe(false);
    expect(kinds("S").has("sludge")).toBe(true);
  });

  it("a pillar pushes a body out and stops a shot", () => {
    const pillar = { x: 500, y: 500, radius: PILLAR.radius };
    const body = { x: 510, y: 500, radius: 14 };
    expect(blockCircle(body, [pillar])).toBe(true);
    expect(Math.hypot(body.x - 500, body.y - 500)).toBeCloseTo(PILLAR.radius + 14, 5);
    expect(blockCircle(body, [pillar])).toBe(false);
    expect(insidePillar(505, 505, [pillar])).toBe(true);
    expect(insidePillar(600, 500, [pillar])).toBe(false);
  });

  it("the player cannot walk through a pillar, and an enemy's shot dies on it", () => {
    const { w, c } = arena();
    w.pillars = [{ x: w.player.x + 80, y: w.player.y, radius: PILLAR.radius }];
    c.move = { x: 1, y: 0 };
    run(w, c, 1.5);
    expect(Math.hypot(w.player.x - w.pillars[0].x, w.player.y - w.pillars[0].y)).toBeGreaterThanOrEqual(PILLAR.radius + w.player.radius - 0.01);
    w.projectiles.push({ x: w.pillars[0].x, y: w.pillars[0].y, radius: 6, vx: 0, vy: 0, damage: 5, life: 5 });
    run(w, c, 0.05);
    expect(w.projectiles.length).toBe(0);
  });

  it("an enemy that charges into a pillar is dazed; a boss is not", () => {
    const { w, c } = arena();
    const charger = add(w, "charger", 300, 0);
    const boss = add(w, "warden", -300, 0);
    for (const e of [charger, boss]) {
      e.state = "charge";
      e.t = 0.5;
      w.pillars.push({ x: e.x + 10, y: e.y, radius: PILLAR.radius });
    }
    run(w, c, 0.02);
    expect(charger.state).toBe("recover");
    expect(charger.t).toBeGreaterThan(PILLAR.stun - 0.1);
    expect(boss.state).toBe("charge");
  });

  const trap = (kind: Trap["kind"], x: number, y: number): Trap => ({ kind, x, y, radius: TRAPS[kind].radius, offset: 0, hitPlayer: -1, hitEnemies: -1 });

  it("a spike plate warns before it bites, then hurts hunter and enemy alike, once a cycle", () => {
    const { w, c } = arena();
    const t = trap("spike", w.player.x, w.player.y);
    w.traps = [t];
    const foe = add(w, "swarmer", 20, 0, 100);
    const def = TRAPS.spike;
    expect(trapPhase(t, 0).phase).toBe("idle");
    expect(trapPhase(t, def.period - def.on - 0.1).phase).toBe("warn");
    run(w, c, def.period - def.on - 0.05);
    expect(w.player.hp).toBe(w.player.d.maxHp);
    run(w, c, def.on);
    expect(w.player.hp).toBeLessThan(w.player.d.maxHp);
    expect(foe.hp).toBe(90);
    const hp = w.player.hp;
    w.player.iframes = 0;
    stepTraps(w, 0);
    expect(w.player.hp).toBe(hp);
  });

  it("flames burn, sludge slows, and neither spares the enemy", () => {
    const { w, c } = arena("B");
    w.traps = [trap("sludge", w.player.x, w.player.y)];
    const foe = add(w, "leaper", 10, 0);
    run(w, c, 0.05);
    expect(w.player.ail.slowT).toBeGreaterThan(0);
    expect(foe.chillT).toBeGreaterThan(0);
    w.traps = [trap("flame", w.player.x, w.player.y)];
    w.trapClock = TRAPS.flame.period - TRAPS.flame.on;
    w.player.iframes = 0;
    run(w, c, 0.05);
    expect(w.player.ail.burnT).toBeGreaterThan(0);
  });

  it("arenas, the rite and the tower stay bare", () => {
    const { w } = arena("S");
    enterRoom(w, 0, null);
    expect(w.pillars.length + w.traps.length).toBe(0);
  });
});

describe("stagger and the fallen", () => {
  it("a sword's blow stops a small enemy mid wind-up; a dagger's does not; a boss ignores both", () => {
    for (const [weapon, stops] of [["sword", true], ["dagger", false]] as const) {
      const { w, c } = arena();
      w.player.weapon = weapon;
      const small = add(w, "swarmer", 40, 0);
      const boss = add(w, "warden", 60, 30);
      small.state = "windup";
      boss.state = "windup";
      small.t = boss.t = 5;
      c.press("Mouse0");
      run(w, c, 0.3);
      expect(small.maxHp - small.hp).toBeGreaterThan(0);
      expect(small.state === "recover" && small.t <= STAGGER.time, weapon).toBe(stops);
      expect(boss.state).toBe("windup");
    }
  });

  it("a skill staggers too, and a big enemy shrugs it off", () => {
    const { w, c } = arena();
    withSkill(w, "whirl");
    const small = add(w, "shooter", 50, 0);
    const big = add(w, "brute", -60, 0);
    small.state = big.state = "windup";
    small.t = big.t = 5;
    c.press("KeyQ");
    run(w, c, 0.05);
    expect(small.state).toBe("recover");
    expect(big.state).toBe("windup");
  });

  it("a kill leaves a body that lies a moment and is gone; a new room clears them", () => {
    const { w, c } = arena();
    add(w, "swarmer", 40, 0, 1);
    c.press("Mouse0");
    run(w, c, 0.3);
    expect(w.enemies.length).toBe(0);
    expect(w.corpses.length).toBe(1);
    run(w, c, CORPSE.time + 0.1);
    expect(w.corpses.length).toBe(0);
  });
});

describe("army orders", () => {
  const caller = () => {
    const w = createWorld(() => 0.5);
    w.profile.classUnlocked = true;
    w.profile.echoes = [{ kind: "knight", rank: "E", active: true }];
    enterArena(w, "E");
    enterRoom(w, 0, null);
    return { w, c: new FakeControls() };
  };

  it("J steps through hunt, guard and hold, and a new gate starts on hunt", () => {
    const { w, c } = caller();
    expect(w.armyOrder).toBe("hunt");
    for (const want of ["guard", "hold", "hunt"] as const) {
      c.press("KeyJ");
      run(w, c, 0.02);
      expect(w.armyOrder).toBe(want);
    }
    w.armyOrder = "hold";
    enterArena(w, "E");
    expect(w.armyOrder).toBe("hunt");
  });

  it("on guard an echo leaves a far enemy alone and fights a near one; hunting, it goes for either", () => {
    for (const [order, far, hit] of [["guard", ORDER.guardRadius + 250, false], ["guard", 120, true], ["hunt", ORDER.guardRadius + 250, true]] as const) {
      const { w, c } = caller();
      w.armyOrder = order;
      const foe = add(w, "swarmer", far, 0);
      run(w, c, 4);
      expect(foe.hp < foe.maxHp, `${order} at ${far}`).toBe(hit);
    }
  });

  it("holding, an echo does not move, but strikes what walks up to it", () => {
    const { w, c } = caller();
    w.armyOrder = "hold";
    const a = w.allies[0];
    const at = { x: a.x, y: a.y };
    const far = add(w, "swarmer", 420, 0);
    run(w, c, 2);
    expect(a.x).toBe(at.x);
    expect(a.y).toBe(at.y);
    expect(far.hp).toBe(far.maxHp);
    const near = add(w, "swarmer", 0, 0);
    near.x = a.x + a.radius + near.radius;
    near.y = a.y;
    run(w, c, 2);
    expect(near.hp).toBeLessThan(near.maxHp);
  });
});

describe("tips and keys", () => {
  it("a new hunter gets a tip per room in the first gate, and none after it or on an old save", () => {
    const w = createWorld(seeded(2));
    expect(w.profile.tips).toBe(true);
    enterGate(w, "E", { sealed: false });
    const first = tutorialTip(w);
    expect(first).toContain("W A S D");
    w.dungeon!.rooms[1].visited = true;
    expect(tutorialTip(w)).not.toBe(first);
    for (const r of w.dungeon!.rooms) r.visited = true;
    expect(tutorialTip(w)).toContain("status");
    toSelect(w);
    expect(w.profile.tips).toBe(false);
    enterGate(w, "E", { sealed: false });
    expect(tutorialTip(w)).toBe(null);

    const old = JSON.parse(JSON.stringify(toSave(createWorld(() => 0.5))));
    delete old.profile.tips;
    expect(parseSave(old)!.profile.tips).toBe(false);
  });

  it("tips can be switched off from the pause menu, and name the keys actually in use", () => {
    const w = createWorld(seeded(2));
    enterGate(w, "E", { sealed: false });
    bindKey(w, "KeyW", "KeyI");
    expect(tutorialTip(w)).toContain("I A S D");
    expect(pauseButtons(w).some((b) => b.id === "set:tips")).toBe(true);
    hubAction(w, "set:tips");
    expect(tutorialTip(w)).toBe(null);
  });

  it("moving an action to a key in use trades the two; no key is left doing two things", () => {
    const w = createWorld(() => 0.5);
    bindKey(w, "KeyF", "KeyG");
    expect(boundKey(w, "KeyF")).toBe("KeyG");
    expect(boundKey(w, "KeyG")).toBe("KeyF");
    bindKey(w, "KeyF", "KeyP");
    const used = BINDABLE.map(([a]) => boundKey(w, a));
    expect(new Set(used).size).toBe(used.length);
    bindKey(w, "KeyF", "KeyF");
    bindKey(w, "KeyG", "KeyG");
    expect(w.settings.keys).toEqual({});
    bindKey(w, "KeyF", "Escape");
    expect(boundKey(w, "KeyF")).toBe("KeyF");
    expect(keyName("KeyQ")).toBe("Q");
    expect(keyName("Space")).toBe("SPACE");
    expect(keyName("ShiftLeft")).toBe("SHIFT LEFT");
  });

  it("the controls window opens from settings, waits for a key, and closes back where it came from", () => {
    const { w, c } = arena();
    w.menu = "pause";
    hubAction(w, "set:keys");
    expect(w.menu).toBe("keys");
    const row = keysButtons(w).find((b) => b.id === "keys:Space")!;
    c.mouseX = row.rect.x + 5;
    c.mouseY = row.rect.y + 5;
    c.press("Mouse0");
    run(w, c, 0.02);
    expect(w.rebinding).toBe("Space");
    // While a key is awaited, Esc belongs to the shell, not the window.
    c.press("Escape");
    run(w, c, 0.02);
    expect(w.menu).toBe("keys");
    w.rebinding = null;
    c.press("Escape");
    run(w, c, 0.02);
    expect(w.menu).toBe("pause");
  });

  it("every row of the controls window and of the longer pause menu is on the screen", () => {
    const { w } = arena();
    for (const b of [...keysButtons(w), ...pauseButtons(w)]) {
      expect(b.rect.x).toBeGreaterThanOrEqual(0);
      expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(VIEW_W);
      expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(VIEW_H);
    }
    for (const b of pauseButtons(w)) expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(PAUSE_PANEL.y + PAUSE_PANEL.h - 40);
  });
});

describe("the tower", () => {
  const climber = () => {
    const w = createWorld(seeded(4));
    w.profile.hunterRank = "C";
    w.profile.introSeen = true;
    enterTower(w);
    return { w, c: new FakeControls() };
  };
  const clearFloor = (w: World, c: Controls) => {
    w.enemies.length = 0;
    run(w, c, 0.05);
    run(w, c, TOWER.rest + 0.1);
  };

  it("opens at Rank C, with its button on the board", () => {
    const w = createWorld(() => 0.5);
    w.profile.introSeen = true;
    toSelect(w);
    expect(towerOpen(w.profile)).toBe(false);
    expect(hubAction(w, "gate:tower")).toBe(null);
    w.profile.hunterRank = "C";
    expect(hubButtons(w).some((b) => b.id === "gate:tower")).toBe(true);
    expect(hubAction(w, "gate:tower")).toBe("tower");
  });

  it("each cleared floor leads to the next, harder one, and every tenth climbs a rank", () => {
    const { w, c } = climber();
    expect(w.towerFloor).toBe(1);
    const first = w.enemies.length;
    clearFloor(w, c);
    expect(w.towerFloor).toBe(2);
    expect(w.profile.towerBest).toBe(1);
    for (let i = 0; i < 5; i++) clearFloor(w, c);
    expect(w.enemies.length).toBeGreaterThan(first);
    expect(towerRank(10)).toBe("E");
    expect(towerRank(11)).toBe("D");
    expect(towerRank(999)).toBe("S");
  });

  it("every fifth floor is a boss, and pays gold and an item at once", () => {
    const { w, c } = climber();
    for (let i = 0; i < 4; i++) clearFloor(w, c);
    expect(w.towerFloor).toBe(5);
    expect(w.enemies.some((e) => e.boss)).toBe(true);
    const gold = w.profile.gold;
    clearFloor(w, c);
    expect(w.profile.gold).toBe(gold + TOWER.gold * 5);
    expect(w.profile.inventory.length).toBe(1);
  });

  it("a death keeps the record and what was already paid; titles come at floors 25 and 50", () => {
    const { w, c } = climber();
    for (let i = 0; i < 5; i++) clearFloor(w, c);
    const items = w.profile.inventory.length;
    w.player.hp = 0;
    w.mode = "dead";
    run(w, c, 0.02);
    expect(w.profile.towerBest).toBe(5);
    expect(w.profile.inventory.length).toBe(items);
    expect(parseSave(JSON.parse(JSON.stringify(toSave(w))))!.profile.towerBest).toBe(5);
    for (const id of ["tower_25", "tower_50"]) expect(TITLES.some((t) => t.id === id)).toBe(true);
  });
});

describe("New Game+", () => {
  const finished = () => {
    const w = createWorld(() => 0.5);
    w.profile.introSeen = true;
    w.profile.classUnlocked = true;
    w.player.prog.level = 50;
    w.profile.gold = 777;
    w.profile.echoes = Array.from({ length: 6 }, () => ({ kind: "knight" as const, rank: "A" as const, active: false }));
    toSelect(w);
    w.profile.quests.main = MAIN.findIndex((q) => q.id === "m10");
    chooseEnding(w, "keeper");
    w.pendingDialogue = [];
    w.cutscene = null;
    return w;
  };

  it("is offered only after an ending, on the Story tab", () => {
    const w = createWorld(() => 0.5);
    expect(canNewGamePlus(w.profile)).toBe(false);
    expect(newGamePlus(w)).toBe(false);
    const done = finished();
    done.tab = "story";
    expect(hubButtons(done).some((b) => b.id === "ngplus")).toBe(true);
  });

  it("starts the story again with level, gold, echoes and titles kept, and the page unwritten", () => {
    const w = finished();
    hubAction(w, "ngplus");
    const pr = w.profile;
    expect(pr.cycle).toBe(1);
    expect(pr.ending).toBe(null);
    expect(pr.quests.main).toBe(0);
    expect(w.player.prog.level).toBe(50);
    expect(pr.gold).toBe(777);
    expect(pr.echoes.length).toBe(6);
    expect(pr.titles).toContain("keeper");
  });

  it("enemies are 60% tougher and harder-hitting per cycle, and worth more", () => {
    const base = arena("B").w;
    const plus = arena("B").w;
    plus.profile.cycle = 2;
    const mk = (w: World) => {
      enterRoom(w, 0, null);
      w.spawnQueue.length = 0;
      return w;
    };
    mk(base);
    mk(plus);
    const a = makeEnemy("leaper", 0, 0, "B");
    // spawnEnemy is what the game uses; compare through a tower floor, which spawns with it.
    const t0 = createWorld(seeded(4));
    const t2 = createWorld(seeded(4));
    t2.profile.cycle = 2;
    enterTower(t0);
    enterTower(t2);
    expect(t2.enemies[0].maxHp).toBe(Math.round(t0.enemies[0].maxHp * (1 + NGPLUS.harder * 2)));
    expect(t2.enemies[0].dmg).toBeCloseTo(t0.enemies[0].dmg * (1 + NGPLUS.harder * 2), 5);
    expect(t2.enemies[0].xp).toBeGreaterThan(t0.enemies[0].xp);
    expect(a.hp).toBeGreaterThan(0);
  });

  it("the other ending can then be chosen, both titles are kept, and it stops after three cycles", () => {
    const w = finished();
    newGamePlus(w);
    w.profile.quests.main = MAIN.findIndex((q) => q.id === "m10");
    expect(chooseEnding(w, "unwritten")).toBe(true);
    expect(w.profile.titles).toEqual(expect.arrayContaining(["keeper", "unwritten"]));
    w.profile.cycle = NGPLUS.max;
    expect(canNewGamePlus(w.profile)).toBe(false);
    const p = parseSave(JSON.parse(JSON.stringify(toSave(w))))!.profile;
    expect(p.cycle).toBe(NGPLUS.max);
  });

  it("an Echo Caller is not sent through the rite a second time", () => {
    const w = finished();
    newGamePlus(w);
    w.profile.quests.main = MAIN.findIndex((q) => q.id === "m5");
    w.mode = "cleared";
    settleQuest(w);
    expect(MAIN[w.profile.quests.main].id).not.toBe("m6");
  });
});

/** Finish the current main step the way a cleared Rank C gate would. */
function settleQuest(w: World): void {
  // The generator needs real dice: a constant roll never finds a free cell.
  w.rng = seeded(7);
  enterGate(w, "C", { sealed: false });
  w.mode = "cleared";
  settleClear(w);
}

describe("the six later skills", () => {
  it("there are twelve skills, each with a level, a cost and a rank, and the board fits them", () => {
    expect(SKILL_IDS.length).toBe(12);
    const w = createWorld(() => 0.5);
    w.profile.introSeen = true;
    toSelect(w);
    w.tab = "skills";
    for (const id of SKILL_IDS) {
      expect(SKILLS[id].level).toBeGreaterThan(0);
      expect(w.profile.skillRanks[id]).toBe(1);
      expect(w.player.skillCd[id]).toBe(0);
    }
    expect([24, 30, 36, 42, 48, 54].every((l) => SKILL_IDS.some((id) => SKILLS[id].level === l))).toBe(true);
    for (const b of hubButtons(w)) expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(VIEW_H - 40);
  });

  const caller = (id: (typeof SKILL_IDS)[number]) => {
    const w = createWorld(() => 0.5);
    w.profile.classUnlocked = true;
    w.profile.echoes = [{ kind: "knight", rank: "E", active: true }];
    enterArena(w, "E");
    enterRoom(w, 0, null);
    withSkill(w, id);
    return { w, c: new FakeControls() };
  };

  it("Trade Places swaps the hunter with the echo nearest the cursor; with no echo it costs nothing", () => {
    const { w, c } = caller("swap");
    const a = w.allies[0];
    a.x = w.player.x + 300;
    const [px, ax] = [w.player.x, a.x];
    c.aimX = a.x;
    c.aimY = a.y;
    c.press("KeyQ");
    run(w, c, 0.01);
    // The echo takes a step of its own in the same instant: near enough is right.
    expect(Math.abs(w.player.x - ax)).toBeLessThan(5);
    expect(Math.abs(a.x - px)).toBeLessThan(5);
    w.allies.length = 0;
    w.player.skillCd.swap = 0;
    const mana = w.player.mana;
    c.press("KeyQ");
    run(w, c, 0.01);
    expect(w.player.mana).toBe(mana);
    expect(w.player.skillCd.swap).toBeLessThan(0.02);
  });

  it("Last Order bursts an echo among the enemy; the echo sits out the room but is not lost", () => {
    const { w, c } = caller("sacrifice");
    const a = w.allies[0];
    const foe = add(w, "swarmer", 0, 0);
    foe.x = a.x + 30;
    foe.y = a.y;
    c.aimX = a.x;
    c.aimY = a.y;
    c.press("KeyQ");
    run(w, c, 0.01);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(w.allies.length).toBe(0);
    expect(w.profile.echoes.length).toBe(1);
  });

  it("Parry turns the next blow inside its moment, and wounds and stuns what stands close", () => {
    const { w, c } = arena();
    withSkill(w, "parry");
    const foe = add(w, "swarmer", 40, 0);
    c.press("KeyQ");
    run(w, c, 0.01);
    expect(w.player.parryT).toBeGreaterThan(0);
    const hp = w.player.hp;
    const s = await_hurt(w);
    expect(s).toBe(false);
    expect(w.player.hp).toBe(hp);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(foe.t).toBeLessThanOrEqual(PARRY.stun);
    run(w, c, PARRY.time + 0.5);
    w.player.iframes = 0;
    expect(await_hurt(w)).toBe(true);
  });

  it("Long Shot strikes everything in a line ahead and nothing beside or behind", () => {
    const { w, c } = arena();
    withSkill(w, "shot");
    const ahead = add(w, "swarmer", 300, 0);
    const further = add(w, "swarmer", 600, 10);
    const beside = add(w, "swarmer", 300, 160);
    const behind = add(w, "swarmer", -200, 0);
    c.press("KeyQ");
    run(w, c, 0.01);
    expect(ahead.hp).toBeLessThan(ahead.maxHp);
    expect(further.hp).toBeLessThan(further.maxHp);
    expect(beside.hp).toBe(beside.maxHp);
    expect(behind.hp).toBe(behind.maxHp);
  });

  it("Ward swallows one hit; Blood Price heals from blows while it lasts", () => {
    const { w, c } = arena();
    withSkill(w, "ward");
    c.press("KeyQ");
    run(w, c, 0.01);
    expect(await_hurt(w)).toBe(false);
    w.player.iframes = 0;
    expect(await_hurt(w)).toBe(true);

    const d = arena();
    withSkill(d.w, "drain");
    d.w.player.hp = 10;
    add(d.w, "swarmer", 40, 0);
    d.c.press("KeyQ");
    run(d.w, d.c, 0.01);
    // A bare-handed blow heals less than a point; three add up to more.
    for (let i = 0; i < 3; i++) {
      d.c.press("Mouse0");
      run(d.w, d.c, 0.6);
    }
    expect(d.w.player.hp).toBeGreaterThan(10);
  });
});

import { hurtPlayer } from "./state";
/** Land a plain hit on the player and say whether it got through. */
function await_hurt(w: World): boolean {
  return hurtPlayer(w, 5);
}
