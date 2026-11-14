import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { KINDS, PLAYER, ROOM, STEP, SWARMER } from "./config";
import { makeEnemy } from "./enemies";
import { ITEMS, POTION } from "./items";
import { beginStory, DEATH, hubAction, settleClear, settleDeath } from "./profile";
import { MAIN } from "./quests";
import { applySave, parseSave, SAVE_VERSION, toSave } from "./save";
import { LEVEL_CAP, xpToNext } from "./stats";
import { DIALOGUES } from "./story";
import { hubButtons } from "./ui";
import { createWorld, enterArena, enterGate, grantXp, step, type World } from "./world";

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

/** A world on the gate board with a known shop stock. */
const hub = () => {
  const w = createWorld(seeded(4));
  w.profile.shop.stock = ["iron_fang", "padded_coat", "scale_vest"];
  return w;
};
const arena = () => {
  const w = createWorld(() => 0.5);
  enterArena(w);
  return w;
};

describe("shop", () => {
  it("buying takes gold and adds the item; a second copy is refused", () => {
    const w = hub();
    w.profile.gold = 100;
    hubAction(w, "buy:iron_fang");
    expect(w.profile.gold).toBe(40);
    expect(w.profile.inventory).toEqual(["iron_fang"]);
    w.profile.gold = 100;
    hubAction(w, "buy:iron_fang");
    expect(w.profile.gold).toBe(100);
    expect(w.dirty).toBe(true);
  });

  it("refuses a purchase the player cannot afford", () => {
    const w = hub();
    w.profile.gold = 59;
    hubAction(w, "buy:iron_fang");
    expect(w.profile.inventory).toEqual([]);
    expect(w.profile.gold).toBe(59);
  });

  it("never sells a boss drop", () => {
    const w = hub();
    w.profile.gold = 99999;
    hubAction(w, "buy:mirror_edge");
    expect(w.profile.inventory).toEqual([]);
  });

  it("potions stop at the carry limit", () => {
    const w = hub();
    w.profile.gold = 1000;
    for (let i = 0; i < 6; i++) hubAction(w, "buy:potion");
    expect(w.profile.potions).toBe(POTION.max);
    expect(w.profile.gold).toBe(1000 - POTION.price * (POTION.max - 1));
  });

  it("selling returns half the price", () => {
    const w = hub();
    w.profile.inventory = ["scale_vest"];
    hubAction(w, "sell:scale_vest");
    expect(w.profile.gold).toBe(90);
    expect(w.profile.inventory).toEqual([]);
  });

  it("clicking a shop row's button buys it", () => {
    const w = hub();
    const c = new FakeControls();
    w.profile.gold = 100;
    w.tab = "shop";
    const b = hubButtons(w).find((x) => x.id === "buy:padded_coat")!;
    c.mouseX = b.rect.x + 5;
    c.mouseY = b.rect.y + 5;
    c.press("Mouse0");
    run(w, c, 0.02);
    expect(w.profile.inventory).toEqual(["padded_coat"]);
  });

  it("a button that cannot be afforded does nothing when clicked", () => {
    const w = hub();
    const c = new FakeControls();
    w.tab = "shop";
    const b = hubButtons(w).find((x) => x.id === "buy:padded_coat")!;
    expect(b.enabled).toBe(false);
    c.mouseX = b.rect.x + 5;
    c.mouseY = b.rect.y + 5;
    c.press("Mouse0");
    run(w, c, 0.02);
    expect(w.profile.inventory).toEqual([]);
  });
});

describe("equipment and titles", () => {
  it("equipping applies the bonus and raises current health with it", () => {
    const w = hub();
    w.profile.inventory = ["padded_coat", "iron_fang"];
    hubAction(w, "equip:padded_coat");
    hubAction(w, "equip:iron_fang");
    expect(w.player.d.maxHp).toBe(PLAYER.maxHp + 20);
    expect(w.player.hp).toBe(PLAYER.maxHp + 20);
    expect(w.player.d.damage).toBe(PLAYER.attackDamage + 3);
    expect(w.profile.inventory).toEqual([]);
  });

  it("equipping over a worn item swaps them", () => {
    const w = hub();
    w.profile.inventory = ["iron_fang", "hunters_kris"];
    hubAction(w, "equip:iron_fang");
    hubAction(w, "equip:hunters_kris");
    expect(w.profile.equipped.weapon).toBe("hunters_kris");
    expect(w.profile.inventory).toEqual(["iron_fang"]);
  });

  it("removing an item drops the bonus but never kills", () => {
    const w = hub();
    w.profile.inventory = ["gatehide_mail"];
    hubAction(w, "equip:gatehide_mail");
    w.player.hp = 10;
    hubAction(w, "unequip:armour");
    expect(w.player.d.maxHp).toBe(PLAYER.maxHp);
    expect(w.player.hp).toBe(1);
    expect(w.profile.inventory).toEqual(["gatehide_mail"]);
  });

  it("a title can be switched on and off, but only if earned", () => {
    const w = hub();
    hubAction(w, "title:untouched");
    expect(w.profile.title).toBe(null);
    w.profile.titles = ["untouched"];
    hubAction(w, "title:untouched");
    expect(w.profile.title).toBe("untouched");
    expect(w.player.d.moveSpeed).toBeCloseTo(PLAYER.speed * 1.05);
    hubAction(w, "title:untouched");
    expect(w.profile.title).toBe(null);
  });
});

describe("gold and potions in a gate", () => {
  it("a kill adds gold to the run, not the purse", () => {
    const w = arena();
    const c = new FakeControls();
    const e = makeEnemy("swarmer", w.player.x + 300, w.player.y, "E");
    w.enemies.push(e);
    e.hp = 0;
    run(w, c, 0.02);
    expect(w.run.gold).toBe(Math.round(SWARMER.xp * 0.6));
    expect(w.profile.gold).toBe(0);
  });

  it("F drinks a potion for half health and marks the run", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.hp = 10;
    c.press("KeyF");
    run(w, c, 0.02);
    expect(w.player.hp).toBe(10 + PLAYER.maxHp * POTION.heal);
    expect(w.profile.potions).toBe(0);
    expect(w.run.usedPotion).toBe(true);
  });

  it("a potion is not wasted at full health or when none are left", () => {
    const w = arena();
    const c = new FakeControls();
    c.press("KeyF");
    run(w, c, 0.02);
    expect(w.profile.potions).toBe(1);
    w.profile.potions = 0;
    w.player.hp = 10;
    c.press("KeyF");
    run(w, c, 0.02);
    expect(w.player.hp).toBe(10);
  });
});

describe("settling a gate", () => {
  it("clearing banks gold and items and earns the first title", () => {
    const w = arena();
    w.run.gold = 75;
    w.run.items = ["wardens_knuckle"];
    w.run.tookDamage = true;
    // A potion was used, so the no-potion side quest pays nothing here.
    w.run.usedPotion = true;
    settleClear(w);
    expect(w.profile.gold).toBe(75);
    expect(w.profile.inventory).toEqual(["wardens_knuckle"]);
    expect(w.profile.titles).toEqual(["first_gate"]);
    expect(w.profile.title).toBe("first_gate");
    expect(w.profile.gatesCleared).toBe(1);
    // Settling twice must not pay twice.
    settleClear(w);
    expect(w.profile.gold).toBe(75);
  });

  it("a clean, over-level clear earns both extra titles", () => {
    const w = arena();
    w.run.overLevel = true;
    settleClear(w);
    expect(w.profile.titles.sort()).toEqual(["first_gate", "overreacher", "untouched"]);
  });

  it("death loses the run's loot, a fifth of held gold, and a tenth of a level", () => {
    const w = arena();
    w.profile.gold = 200;
    w.player.prog.xp = 30;
    w.run.gold = 60;
    w.run.items = ["wardens_knuckle"];
    settleDeath(w);
    expect(w.profile.gold).toBe(200 - 200 * DEATH.goldLoss);
    expect(w.player.prog.xp).toBe(30 - Math.floor(xpToNext(1) * DEATH.xpLoss));
    expect(w.profile.inventory).toEqual([]);
    expect(w.run.gold).toBe(0);
    expect(w.player.prog.level).toBe(1);
  });

  it("death never takes experience below zero or a level away", () => {
    const w = arena();
    grantXp(w, xpToNext(1));
    w.player.prog.xp = 2;
    settleDeath(w);
    expect(w.player.prog.xp).toBe(0);
    expect(w.player.prog.level).toBe(2);
  });

  it("dying in a fight applies the penalty once", () => {
    const w = arena();
    const c = new FakeControls();
    w.profile.gold = 100;
    const e = makeEnemy("swarmer", w.player.x + 50, w.player.y, "E");
    e.state = "chase";
    w.enemies.push(e);
    run(w, c, 9);
    expect(w.mode).toBe("dead");
    expect(w.profile.gold).toBe(80);
    expect(w.run.summary.length).toBe(3);
  });

  it("killing the Stone Warden drops its item and earns its title", () => {
    const w = arena();
    const c = new FakeControls();
    const boss = makeEnemy("warden", w.player.x + 300, w.player.y, "E");
    w.enemies.push(boss);
    w.run.usedPotion = true;
    boss.hp = 0;
    run(w, c, 2.5);
    expect(w.mode).toBe("cleared");
    expect(w.profile.inventory).toContain("wardens_knuckle");
    expect(w.profile.titles).toContain("giant_feller");
    expect(w.profile.gold).toBe(Math.round(KINDS.warden.xp * 0.5));
  });
});

describe("quests in play", () => {
  it("clearing a room in an E gate completes the first quest and pays it", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    enterGate(w, "E", { sealed: false });
    w.dungeon!.rooms[1].visited = true;
    w.roomId = 1;
    w.doorsOpen = false;
    w.enemies.push(makeEnemy("swarmer", 300, 300, "E"));
    w.enemies[0].hp = 0;
    run(w, c, 0.02);
    expect(w.profile.quests.main).toBe(1);
    expect(w.profile.gold).toBe(30);
    expect(w.profile.potions).toBe(2);
    expect(w.pendingDialogue).toEqual(["m1"]);
    expect(w.notices.some((n) => n.title === "QUEST COMPLETE")).toBe(true);
  });

  it("a level quest that is already met completes as soon as it opens", () => {
    const w = arena();
    w.player.prog.level = 8;
    w.profile.quests.main = 1;
    settleClear(w);
    // m2 (clear an E gate) completes, then m3 (reach level 6) at once.
    expect(w.profile.quests.main).toBe(3);
  });

  it("stat point rewards reach the player", () => {
    const w = arena();
    w.profile.quests.main = 1;
    settleClear(w);
    expect(w.player.prog.points).toBeGreaterThanOrEqual(2);
  });
});

describe("dialogue", () => {
  it("a new game opens with the intro, which blocks the board", () => {
    const w = hub();
    const c = new FakeControls();
    beginStory(w);
    expect(w.dialogue?.lines).toBe(DIALOGUES.intro);
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
  });

  it("Space steps through and the last line closes it", () => {
    const w = hub();
    const c = new FakeControls();
    beginStory(w);
    for (let i = 0; i < DIALOGUES.intro.length; i++) {
      expect(w.dialogue).not.toBe(null);
      c.press("Space");
      run(w, c, 0.02);
    }
    expect(w.dialogue).toBe(null);
    expect(w.profile.introSeen).toBe(true);
  });

  it("Escape skips the rest", () => {
    const w = hub();
    const c = new FakeControls();
    beginStory(w);
    c.press("Escape");
    run(w, c, 0.02);
    expect(w.dialogue).toBe(null);
    expect(w.profile.introSeen).toBe(true);
  });

  it("is not replayed once seen", () => {
    const w = hub();
    w.profile.introSeen = true;
    beginStory(w);
    expect(w.dialogue).toBe(null);
  });

  it("a quest's dialogue waits for the return to the board", () => {
    const w = arena();
    const c = new FakeControls();
    w.pendingDialogue.push("m1");
    w.mode = "cleared";
    c.press("Enter");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
    expect(w.dialogue?.lines).toBe(DIALOGUES.m1);
  });
});

describe("gate board tabs", () => {
  it("Q and E cycle through the tabs", () => {
    const w = hub();
    const c = new FakeControls();
    c.press("KeyE");
    run(w, c, 0.02);
    expect(w.tab).toBe("shop");
    c.press("KeyQ");
    c.press("KeyQ");
    run(w, c, 0.02);
    c.press("KeyQ");
    run(w, c, 0.02);
    expect(w.tab).toBe("system");
  });

  it("number keys only enter a gate from the gates tab", () => {
    const w = hub();
    const c = new FakeControls();
    w.tab = "shop";
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
  });

  it("system buttons ask the shell to act", () => {
    const w = hub();
    hubAction(w, "save:export");
    expect(w.requests).toEqual(["export"]);
  });
});

describe("save", () => {
  function played(): World {
    const w = hub();
    grantXp(w, xpToNext(1) + 5);
    w.profile.gold = 321;
    w.profile.inventory = ["iron_fang", "scale_vest"];
    hubAction(w, "equip:scale_vest");
    w.profile.titles = ["first_gate"];
    hubAction(w, "title:first_gate");
    w.profile.quests.main = 2;
    w.profile.quests.progress = { s1: 12 };
    w.profile.introSeen = true;
    return w;
  }

  it("round-trips through JSON and restores derived values", () => {
    const a = played();
    const data = parseSave(JSON.parse(JSON.stringify(toSave(a))))!;
    const b = hub();
    applySave(b, data);
    expect(b.player.prog).toEqual(a.player.prog);
    expect(b.profile).toEqual(a.profile);
    expect(b.player.d).toEqual(a.player.d);
    expect(b.player.hp).toBe(b.player.d.maxHp);
  });

  it("is a copy: later play does not change it", () => {
    const w = played();
    const data = toSave(w);
    w.profile.gold = 0;
    w.profile.inventory.push("keen_charm");
    expect(data.profile.gold).toBe(321);
    expect(data.profile.inventory).toEqual(["iron_fang"]);
  });

  it("rejects things that are not saves", () => {
    for (const bad of [null, 5, "x", [], {}, { v: 1 }, { v: 1, prog: {}, profile: null }, { v: "1", prog: {}, profile: {} }]) {
      expect(parseSave(bad)).toBe(null);
    }
  });

  it("rejects a save from a newer version", () => {
    const data = toSave(played());
    expect(parseSave({ ...data, v: SAVE_VERSION + 1 })).toBe(null);
  });

  it("repairs out-of-range and unknown values instead of trusting them", () => {
    const data = parseSave({
      v: 1,
      prog: { level: 999, xp: -5, points: "many", stats: { str: 2, agi: 9, vit: NaN } },
      profile: {
        gold: -40,
        potions: 1e12,
        inventory: ["iron_fang", "iron_fang", "made_up", 7, "padded_coat"],
        equipped: { weapon: "padded_coat", armour: "padded_coat", accessory: "made_up" },
        titles: ["first_gate", "made_up"],
        title: "untouched",
        quests: { main: 99, done: ["s1", "zzz"], progress: { s1: 12, zzz: 4, m1: -3 } },
        introSeen: "yes",
      },
    })!;
    expect(data.prog.level).toBe(LEVEL_CAP);
    expect(data.prog.xp).toBe(0);
    expect(data.prog.points).toBe(0);
    expect(data.prog.stats).toEqual({ str: 5, agi: 9, vit: 5, sen: 5, int: 5 });
    expect(data.profile.gold).toBe(0);
    expect(data.profile.potions).toBe(99);
    expect(data.profile.equipped).toEqual({ armour: "padded_coat" });
    expect(data.profile.inventory).toEqual(["iron_fang"]);
    expect(data.profile.titles).toEqual(["first_gate"]);
    expect(data.profile.title).toBe(null);
    expect(data.profile.quests.main).toBe(MAIN.length);
    expect(data.profile.quests.done).toEqual(["s1"]);
    expect(data.profile.quests.progress).toEqual({ s1: 12 });
    expect(data.profile.introSeen).toBe(false);
  });

  it("every item id in a valid save is a known item", () => {
    const data = parseSave(JSON.parse(JSON.stringify(toSave(played()))))!;
    for (const id of data.profile.inventory) expect(ITEMS[id]).toBeDefined();
  });
});
