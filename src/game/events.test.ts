import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { DAILY, EMERGENCY, HIDDEN, KEYS, KINDS, PENALTY, PLAYER, RANKS, ROOM, SEALED, STEP, SWARMER } from "./config";
import { addTrialRoom, generateDungeon, keyDungeon, OPPOSITE, SIDES } from "./dungeon";
import { damageEnemy, makeEnemy } from "./enemies";
import { POTION, STONE } from "./items";
import { hubAction, syncDay } from "./profile";
import { applySave, parseSave, toSave } from "./save";
import { DIALOGUES } from "./story";
import { pauseButtons, titleButton } from "./ui";
import { createWorld, enterArena, enterGate, enterKeyGate, enterPenalty, enterRoom, step, type World } from "./world";

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
  click(r: { x: number; y: number; w: number; h: number }) {
    this.mouseX = r.x + r.w / 2;
    this.mouseY = r.y + r.h / 2;
    this.presses.add("Mouse0");
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

/** A normal E gate, never sealed, with no random extras unless a test asks. */
function gate(seed = 11): World {
  const w = createWorld(seeded(seed));
  w.hiddenChance = 0;
  enterGate(w, "E", { sealed: false });
  return w;
}

describe("daily shop", () => {
  it("rolls new stock on a new day and keeps it for that day", () => {
    const w = createWorld(seeded(1));
    w.today = 100;
    syncDay(w);
    const first = [...w.profile.shop.stock];
    expect(w.profile.shop.day).toBe(100);
    expect(first.length).toBe(6);
    syncDay(w);
    expect(w.profile.shop.stock).toEqual(first);
    w.today = 101;
    syncDay(w);
    expect(w.profile.shop.day).toBe(101);
    expect(w.profile.shop.stock).not.toEqual(first);
  });

  it("allows one free reset a day, and gives it back the next day", () => {
    const w = createWorld(seeded(1));
    w.today = 100;
    syncDay(w);
    const first = [...w.profile.shop.stock];
    hubAction(w, "shop:reroll");
    const second = [...w.profile.shop.stock];
    expect(second).not.toEqual(first);
    hubAction(w, "shop:reroll");
    expect(w.profile.shop.stock).toEqual(second);
    w.today = 101;
    syncDay(w);
    expect(w.profile.shop.rerolls).toBe(0);
  });

  it("never stocks something already owned", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = ["iron_fang"];
    w.profile.equipped = { armour: "padded_coat" };
    for (let day = 1; day <= 40; day++) {
      w.today = day;
      syncDay(w);
      expect(w.profile.shop.stock).not.toContain("iron_fang");
      expect(w.profile.shop.stock).not.toContain("padded_coat");
    }
  });

  it("only sells what is in stock today", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 5000;
    w.profile.shop.stock = ["iron_fang"];
    hubAction(w, "buy:nightglass");
    expect(w.profile.inventory).toEqual([]);
    hubAction(w, "buy:iron_fang");
    expect(w.profile.inventory).toEqual(["iron_fang"]);
  });

  it("does nothing without a calendar", () => {
    const w = createWorld(seeded(1));
    const before = [...w.profile.shop.stock];
    expect(syncDay(w)).toBe(false);
    expect(w.profile.shop.stock).toEqual(before);
  });
});

describe("return stone", () => {
  it("is bought up to the carry limit", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 1000;
    for (let i = 0; i < 5; i++) hubAction(w, "buy:stone");
    expect(w.profile.stones).toBe(STONE.max);
    expect(w.profile.gold).toBe(1000 - STONE.price * STONE.max);
  });

  it("leaves a gate with the loot, without counting it as cleared", () => {
    const w = gate();
    const c = new FakeControls();
    w.profile.stones = 1;
    w.run.gold = 40;
    c.press("KeyT");
    run(w, c, 0.02);
    expect(w.mode).toBe("cleared");
    expect(w.run.retreated).toBe(true);
    expect(w.profile.stones).toBe(0);
    expect(w.profile.gold).toBe(40);
    expect(w.profile.gatesCleared).toBe(0);
    expect(w.profile.titles).toEqual([]);
  });

  it("does nothing when none are held", () => {
    const w = gate();
    const c = new FakeControls();
    c.press("KeyT");
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
  });

  it("fails in a sealed gate and is not used up", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    enterGate(w, "E", { sealed: true });
    w.profile.stones = 1;
    c.press("KeyT");
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
    expect(w.profile.stones).toBe(1);
  });

  it("fails in the penalty zone", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    enterPenalty(w);
    w.profile.stones = 1;
    w.player.iframes = 99;
    c.press("KeyT");
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
    expect(w.profile.stones).toBe(1);
  });
});

describe("sealed gates", () => {
  it("about one gate in eight is sealed", () => {
    let sealed = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const w = createWorld(seeded(seed));
      enterGate(w, "E");
      if (w.sealed) sealed += 1;
    }
    expect(sealed / 400).toBeGreaterThan(0.06);
    expect(sealed / 400).toBeLessThan(0.2);
  });

  it("enemies are tougher and worth double", () => {
    const w = createWorld(seeded(11));
    enterGate(w, "E", { sealed: true });
    const id = w.dungeon!.rooms.find((r) => r.kind === "normal")!.id;
    enterRoom(w, id, null);
    for (const e of w.enemies) {
      const plain = makeEnemy(e.kind, 0, 0, "E");
      expect(e.maxHp).toBe(Math.round(plain.maxHp * SEALED.hp));
      expect(e.dmg).toBeCloseTo(plain.dmg * SEALED.dmg);
      expect(e.xp).toBe(plain.xp * SEALED.reward);
    }
  });

  it("the cold drains health slowly but never kills", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    enterGate(w, "E", { sealed: true });
    run(w, c, SEALED.coldEvery * 4 + 0.1);
    expect(w.player.hp).toBe(PLAYER.maxHp - 4);
    w.player.hp = 2;
    run(w, c, SEALED.coldEvery * 5);
    expect(w.player.hp).toBe(1);
    expect(w.mode).toBe("gate");
  });

  it("an ordinary gate has no cold", () => {
    const w = gate();
    run(w, new FakeControls(), 10);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });
});

describe("emergency quests", () => {
  /** Enter the first normal room with an emergency quest in force. */
  function enter(): { w: World; c: FakeControls } {
    const w = gate();
    enterRoom(w, w.dungeon!.rooms.find((r) => r.kind === "normal")!.id, null);
    const t = EMERGENCY.base + EMERGENCY.perEnemy * w.enemies.length;
    const xp = w.enemies.reduce((s, e) => s + e.xp, 0);
    w.emergency = { t, total: t, bonus: Math.round(xp * EMERGENCY.bonus) };
    return { w, c: new FakeControls() };
  }

  it("rolls on entering a room, at about the stated rate", () => {
    let hits = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const w = gate(seed);
      enterRoom(w, w.dungeon!.rooms.find((r) => r.kind === "normal")!.id, null);
      if (w.emergency) {
        hits += 1;
        expect(w.emergency.t).toBe(EMERGENCY.base + EMERGENCY.perEnemy * w.enemies.length);
      }
    }
    expect(hits / 300).toBeGreaterThan(0.07);
    expect(hits / 300).toBeLessThan(0.25);
  });

  it("never rolls in the start or boss room", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const w = gate(seed);
      expect(w.emergency).toBe(null);
      enterRoom(w, w.dungeon!.bossId, null);
      expect(w.emergency).toBe(null);
    }
  });

  it("clearing the room in time pays a bonus", () => {
    const { w, c } = enter();
    const bonus = w.emergency!.bonus;
    const base = w.enemies.reduce((s, e) => s + Math.round(e.xp * 0.6), 0);
    killAll(w, c);
    expect(w.emergency).toBe(null);
    expect(w.run.gold).toBe(base + bonus);
    expect(w.notices.some((n) => n.title === "EMERGENCY QUEST COMPLETE")).toBe(true);
  });

  it("running out of time costs health but never the last of it", () => {
    const { w, c } = enter();
    for (const e of w.enemies) e.immortal = true;
    w.emergency!.t = 0.05;
    w.player.iframes = 99;
    run(w, c, 0.1);
    expect(w.emergency).toBe(null);
    expect(w.player.hp).toBe(PLAYER.maxHp - Math.round(PLAYER.maxHp * EMERGENCY.hpLoss));

    w.emergency = { t: 0.05, total: 1, bonus: 0 };
    w.player.hp = 3;
    run(w, c, 0.1);
    expect(w.player.hp).toBe(1);
    expect(w.mode).toBe("gate");
  });

  it("leaving the room cancels it", () => {
    const { w } = enter();
    enterRoom(w, w.dungeon!.startId, null);
    expect(w.emergency).toBe(null);
  });
});

describe("hidden trial", () => {
  it("addTrialRoom attaches a room to a free side of the boss room", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = generateDungeon("D", seeded(seed));
      const n = d.rooms.length;
      const t = addTrialRoom(d, seeded(seed + 1))!;
      expect(d.rooms.length).toBe(n + 1);
      expect(t.kind).toBe("trial");
      const boss = d.rooms[d.bossId];
      const side = SIDES.find((s) => boss.doors[s] === t.id)!;
      expect(t.doors[OPPOSITE[side]]).toBe(boss.id);
      expect(new Set(d.rooms.map((r) => `${r.gx},${r.gy}`)).size).toBe(n + 1);
      expect(t.spawns[0]).toBe(RANKS.D.boss);
    }
  });

  it("gives null for a dungeon with no boss", () => {
    expect(addTrialRoom(keyDungeon("E", seeded(1)), seeded(2))).toBe(null);
  });

  function atBoss(chance: number): { w: World; c: FakeControls } {
    const w = gate();
    const c = new FakeControls();
    w.hiddenChance = chance;
    enterRoom(w, w.dungeon!.bossId, null);
    w.run.usedPotion = true;
    return { w, c };
  }

  it("without the hidden door, the boss kill clears the gate as usual", () => {
    const { w, c } = atBoss(0);
    const rooms = w.dungeon!.rooms.length;
    killAll(w, c);
    run(w, c, 2.5);
    expect(w.dungeon!.rooms.length).toBe(rooms);
    expect(w.mode).toBe("cleared");
  });

  it("with it, the gate stays open and a new door appears", () => {
    const { w, c } = atBoss(1);
    const rooms = w.dungeon!.rooms.length;
    const rev = w.layoutRev;
    killAll(w, c);
    run(w, c, 3);
    expect(w.mode).toBe("gate");
    expect(w.bossDead).toBe(true);
    expect(w.dungeon!.rooms.length).toBe(rooms + 1);
    expect(w.layoutRev).toBe(rev + 1);
    expect(w.doorsOpen).toBe(true);
  });

  it("T then leaves for free and counts as a full clear", () => {
    const { w, c } = atBoss(1);
    killAll(w, c);
    c.press("KeyT");
    run(w, c, 0.1);
    expect(w.mode).toBe("cleared");
    expect(w.run.retreated).toBe(false);
    expect(w.profile.gatesCleared).toBe(1);
    expect(w.profile.stones).toBe(0);
  });

  it("the trial holds a stronger echo of the boss, and beating it gives the sigil", () => {
    const { w, c } = atBoss(1);
    killAll(w, c);
    const trial = w.dungeon!.rooms[w.dungeon!.rooms.length - 1];
    enterRoom(w, trial.id, null);
    const echo = w.enemies.find((e) => e.boss)!;
    expect(echo.phase).toBe(2);
    expect(echo.maxHp).toBe(Math.round(KINDS.warden.hp * HIDDEN.hp));
    expect(echo.dmg).toBeCloseTo(KINDS.warden.damage * HIDDEN.dmg);
    expect(w.doorsOpen).toBe(false);

    killAll(w, c);
    expect(w.run.items).toContain("trial_sigil");
    run(w, c, 2.5);
    expect(w.mode).toBe("cleared");
    expect(w.profile.inventory).toContain("trial_sigil");
    expect(w.dungeon!.rooms.filter((r) => r.kind === "trial").length).toBe(1);
  });

  it("gives gold instead once the sigil is owned", () => {
    const { w, c } = atBoss(1);
    w.profile.inventory.push("trial_sigil");
    killAll(w, c);
    const before = w.run.gold;
    enterRoom(w, w.dungeon!.rooms.length - 1, null);
    for (const e of w.enemies) e.xp = 0;
    killAll(w, c);
    expect(w.run.gold).toBe(before + HIDDEN.gold);
    expect(w.run.items).not.toContain("trial_sigil");
  });
});

describe("key dungeons", () => {
  it("has a start room and two packed rooms in a line, with no boss", () => {
    const d = keyDungeon("D", seeded(3));
    expect(d.rooms.map((r) => r.kind)).toEqual(["start", "normal", "normal"]);
    expect(d.bossId).toBe(-1);
    expect(d.rooms[1].spawns.length).toBe(6);
    expect(d.rooms[2].spawns.length).toBe(7);
    expect(d.rooms[0].doors).toEqual({ e: 1 });
    expect(d.rooms[2].doors).toEqual({ w: 1 });
  });

  it("needs a key, and spends it", () => {
    const w = createWorld(seeded(2));
    expect(hubAction(w, "gate:key")).toBe(null);
    enterKeyGate(w);
    expect(w.mode).toBe("select");
    w.profile.keys = 2;
    expect(hubAction(w, "gate:key")).toBe("key");
    enterKeyGate(w);
    expect(w.mode).toBe("gate");
    expect(w.gateKind).toBe("key");
    expect(w.profile.keys).toBe(1);
  });

  it("clearing both rooms pays the fixed reward, and is not a gate clear", () => {
    const w = createWorld(seeded(2));
    const c = new FakeControls();
    w.profile.keys = 1;
    w.profile.potions = 0;
    // Main quests done, so no quest reward lands in the total.
    w.profile.quests.main = 5;
    enterKeyGate(w);
    // Strip kill rewards and any emergency bonus, to isolate the fixed reward.
    enterRoom(w, 1, "w");
    w.emergency = null;
    for (const e of w.enemies) e.xp = 0;
    killAll(w, c);
    expect(w.clearT).toBe(0);
    enterRoom(w, 2, "w");
    w.emergency = null;
    for (const e of w.enemies) e.xp = 0;
    killAll(w, c);
    run(w, c, 2.5);
    expect(w.mode).toBe("cleared");
    expect(w.profile.gold).toBe(KEYS.gold);
    expect(w.profile.potions).toBe(1);
    expect(w.player.prog.points).toBe(KEYS.points);
    expect(w.profile.gatesCleared).toBe(0);
  });

  it("a key found in a gate is kept on a clear and lost on death", () => {
    const w = gate();
    const c = new FakeControls();
    enterRoom(w, w.dungeon!.rooms.find((r) => r.kind === "normal")!.id, null);
    w.emergency = null;
    w.rng = () => 0.001;
    killAll(w, c);
    expect(w.run.keys).toBeGreaterThan(0);
    const found = w.run.keys;
    w.player.hp = 0;
    w.mode = "dead";
    run(w, c, 0.02);
    expect(found).toBeGreaterThan(0);
    expect(w.profile.keys).toBe(0);
  });
});

describe("daily quest", () => {
  function day(n: number): World {
    const w = createWorld(seeded(5));
    w.today = n;
    syncDay(w);
    return w;
  }

  it("is issued on the first day with no penalty", () => {
    const w = day(300);
    expect(w.profile.daily).toEqual({ day: 300, kills: 0, rooms: 0, gates: 0, done: false });
    expect(w.profile.penaltyPending).toBe(false);
  });

  it("counts kills, rooms and gates, and pays when all three are met", () => {
    const w = day(300);
    const c = new FakeControls();
    w.profile.potions = 0;
    enterArena(w);
    w.profile.daily.kills = DAILY.kills - 1;
    w.profile.daily.rooms = DAILY.rooms;
    w.enemies.push(makeEnemy("swarmer", 200, 200, "E"));
    killAll(w, c);
    expect(w.profile.daily.kills).toBe(DAILY.kills);
    expect(w.profile.daily.done).toBe(false);

    w.profile.daily.gates = DAILY.gates - 1;
    w.clearT = 0.01;
    run(w, c, 0.05);
    expect(w.profile.daily.done).toBe(true);
    expect(w.player.prog.points).toBeGreaterThanOrEqual(DAILY.points);
    expect(w.profile.potions).toBe(POTION.max);
  });

  it("a finished daily brings no penalty the next day", () => {
    const w = day(300);
    w.profile.daily.done = true;
    w.today = 301;
    expect(syncDay(w)).toBe(false);
    expect(w.profile.penaltyPending).toBe(false);
    expect(w.profile.daily.day).toBe(301);
    expect(w.profile.daily.done).toBe(false);
  });

  it("a missed daily forces the penalty zone on the next visit to the board", () => {
    const w = day(300);
    const c = new FakeControls();
    // One missed day: long enough for the penalty, too short for a gate break.
    w.today = 302;
    run(w, c, 0.02);
    expect(w.profile.penaltyPending).toBe(true);
    expect(w.dialogue?.lines).toBe(DIALOGUES.penalty);
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
    c.press("Escape");
    run(w, c, 0.05);
    expect(w.mode).toBe("gate");
    expect(w.gateKind).toBe("penalty");
  });

  it("several missed days cost one penalty, not several", () => {
    const w = day(300);
    w.today = 310;
    syncDay(w);
    w.today = 311;
    expect(syncDay(w)).toBe(false);
    expect(w.profile.penaltyPending).toBe(true);
  });
});

describe("penalty zone", () => {
  function zone(): { w: World; c: FakeControls } {
    const w = createWorld(seeded(5));
    w.profile.penaltyPending = true;
    w.profile.gold = 100;
    enterPenalty(w);
    return { w, c: new FakeControls() };
  }

  it("fills the room with enemies that cannot be hurt and give nothing", () => {
    const { w } = zone();
    expect(w.enemies.length).toBe(8);
    for (const e of w.enemies) {
      expect(damageEnemy(w, e, 9999, false, 0, 0, 0)).toBe(false);
      expect(e.hp).toBe(e.maxHp);
      expect(e.xp).toBe(0);
    }
    expect(w.penaltyT).toBe(PENALTY.time);
  });

  it("surviving the timer ends it with nothing lost and the debt cleared", () => {
    const { w, c } = zone();
    for (let i = 0; i < (PENALTY.time + 0.5) / STEP && w.mode === "gate"; i++) {
      w.player.iframes = 1;
      step(w, c, STEP);
    }
    expect(w.mode).toBe("cleared");
    expect(w.profile.penaltyPending).toBe(false);
    expect(w.profile.gold).toBe(100);
    expect(w.profile.gatesCleared).toBe(0);
    expect(w.enemies.length).toBe(0);
  });

  it("dying costs the usual penalty and still clears the debt", () => {
    const { w, c } = zone();
    run(w, c, 30);
    expect(w.mode).toBe("dead");
    expect(w.profile.gold).toBe(80);
    expect(w.profile.penaltyPending).toBe(false);
  });

  it("kills there never count toward the daily quest", () => {
    const { w, c } = zone();
    w.today = 5;
    w.profile.daily.day = 5;
    w.enemies[0].immortal = false;
    w.enemies[0].hp = 0;
    w.player.iframes = 99;
    run(w, c, 0.02);
    expect(w.profile.daily.kills).toBe(0);
  });
});

describe("pause menu and title", () => {
  it("Escape pauses a gate and freezes it; Escape again resumes", () => {
    const w = gate();
    const c = new FakeControls();
    const e = makeEnemy("swarmer", w.player.x + 50, w.player.y, "E");
    e.state = "chase";
    w.enemies.push(e);
    c.press("Escape");
    run(w, c, 3);
    expect(w.menu).toBe("pause");
    expect(w.player.hp).toBe(PLAYER.maxHp);
    c.press("Escape");
    run(w, c, 0.02);
    expect(w.menu).toBe("none");
  });

  it("Save marks the game for saving and keeps playing", () => {
    const w = gate();
    const c = new FakeControls();
    c.press("Escape");
    run(w, c, 0.02);
    w.dirty = false;
    c.click(pauseButtons(w).find((b) => b.id === "pause:save")!.rect);
    run(w, c, 0.02);
    expect(w.dirty).toBe(true);
    expect(w.mode).toBe("gate");
  });

  it("Save and Exit goes to the title; Play returns to the same gate", () => {
    const w = gate();
    const c = new FakeControls();
    const room = w.roomId;
    c.press("Escape");
    run(w, c, 0.02);
    c.click(pauseButtons(w).find((b) => b.id === "pause:exit")!.rect);
    run(w, c, 0.02);
    expect(w.mode).toBe("title");
    expect(toSave(w).gate).not.toBe(null);
    c.click(titleButton());
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
    expect(w.roomId).toBe(room);
  });

  it("the board can exit to the title and come back", () => {
    const w = createWorld(seeded(1));
    const c = new FakeControls();
    hubAction(w, "save:exit");
    expect(w.mode).toBe("title");
    c.press("Enter");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
  });

  it("the status key does nothing while paused", () => {
    const w = gate();
    const c = new FakeControls();
    c.press("Escape");
    run(w, c, 0.02);
    c.press("KeyC");
    run(w, c, 0.02);
    expect(w.menu).toBe("pause");
  });
});

describe("saving inside a gate", () => {
  function midGate(): World {
    const w = gate();
    const id = w.dungeon!.rooms.find((r) => r.kind === "normal")!.id;
    enterRoom(w, id, null);
    w.emergency = null;
    w.run.gold = 55;
    w.player.hp = 37;
    return w;
  }

  it("a save on the board carries no gate", () => {
    expect(toSave(createWorld(seeded(1))).gate).toBe(null);
  });

  it("resumes the same gate at the start of the same room", () => {
    const a = midGate();
    const data = parseSave(JSON.parse(JSON.stringify(toSave(a))))!;
    const b = createWorld(seeded(77));
    applySave(b, data);
    expect(b.mode).toBe("gate");
    expect(b.rank).toBe(a.rank);
    expect(b.roomId).toBe(a.roomId);
    expect(b.dungeon).toEqual(a.dungeon);
    expect(b.run.gold).toBe(55);
    expect(b.player.hp).toBe(37);
    expect(b.enemies.length).toBe(a.dungeon!.rooms[a.roomId].spawns.length);
    expect(b.doorsOpen).toBe(false);
  });

  it("keeps a sealed gate sealed", () => {
    const a = createWorld(seeded(11));
    enterGate(a, "E", { sealed: true });
    const b = createWorld(seeded(77));
    applySave(b, parseSave(JSON.parse(JSON.stringify(toSave(a))))!);
    expect(b.sealed).toBe(true);
  });

  it("the penalty zone is never saved as a gate", () => {
    const w = createWorld(seeded(5));
    enterPenalty(w);
    expect(toSave(w).gate).toBe(null);
  });

  it("a cleared or lost gate is not saved as in progress", () => {
    const w = midGate();
    w.mode = "dead";
    expect(toSave(w).gate).toBe(null);
  });

  it("a damaged gate record is dropped, and the rest of the save still loads", () => {
    const data = JSON.parse(JSON.stringify(toSave(midGate())));
    data.profile.gold = 42;
    const cases: ((g: any) => void)[] = [
      (g) => (g.dungeon.rooms[1].doors.n = 99),
      (g) => (g.roomId = 50),
      (g) => (g.rank = "S"),
      (g) => (g.dungeon.rooms[1].spawns = ["dragon"]),
      (g) => (g.dungeon.rooms = []),
      (g) => (g.kind = "penalty"),
      (g) => (g.dungeon.rooms[2].id = 7),
    ];
    for (const breakIt of cases) {
      const copy = JSON.parse(JSON.stringify(data));
      breakIt(copy.gate);
      const parsed = parseSave(copy)!;
      expect(parsed.gate).toBe(null);
      expect(parsed.profile.gold).toBe(42);
    }
  });

  it("an older save without the new fields loads with safe defaults", () => {
    const data = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    delete data.gate;
    delete data.profile.shop;
    delete data.profile.daily;
    delete data.profile.keys;
    delete data.profile.stones;
    const parsed = parseSave(data)!;
    expect(parsed.gate).toBe(null);
    expect(parsed.profile.keys).toBe(0);
    expect(parsed.profile.stones).toBe(0);
    expect(parsed.profile.daily.day).toBe(0);
    expect(parsed.profile.shop.stock.length).toBe(6);
  });
});

describe("swarmer baseline is unchanged by the new systems", () => {
  it("still three hits to kill in a plain gate", () => {
    expect(Math.ceil(PLAYER.maxHp / makeEnemy("swarmer", 0, 0, "E").dmg)).toBe(3);
    expect(makeEnemy("swarmer", 0, 0, "E").maxHp).toBe(SWARMER.maxHp);
  });
});
