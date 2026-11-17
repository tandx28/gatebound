import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { BESTIARY, KINDS, LINES, MULTI, REDACTOR, ROOM, RUSH, STEP, ULT, type Rank } from "./config";
import { huntBonus } from "./bestiary";
import { makeEnemy } from "./enemies";
import { BOW, makeItem, STAFF } from "./items";
import { earnLine, hubAction, playSpecial, recordKill, refreshDerived, ultimateOf } from "./profile";
import { parseSave, toSave } from "./save";
import type { Enemy, World } from "./state";
import { createWorld, enterArena, enterMargin, enterRush, enterTower, GLYPH_ORDER, step } from "./world";

class FakeControls implements Controls {
  mouseX = 0;
  mouseY = 0;
  aimX = ROOM.w / 2 + 300;
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
  const w = createWorld(seeded(3));
  w.player.prog.level = 60;
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

function wield(w: World, owned: string): void {
  w.profile.equipped.weapon = owned;
  w.profile.activeWeapon = 0;
  refreshDerived(w);
}

describe("staff and bow", () => {
  it("a staff's bolt takes its staff's element and bursts on the enemies near where it lands", () => {
    const { w, c } = arena();
    wield(w, makeItem("ember_staff", ["burn"]));
    const first = add(w, "brute", 300, 0);
    const near = add(w, "brute", 300, STAFF.splash - 10);
    c.attackHeld = true;
    run(w, c, 0.02);
    expect(w.allyShots[0].look).toBe("fire");
    c.attackHeld = false;
    run(w, c, 0.6);
    expect(first.hp).toBeLessThan(first.maxHp);
    expect(near.hp).toBeLessThan(near.maxHp);
  });

  it("a full draw looses a charged arrow that passes through everything in line", () => {
    const { w, c } = arena();
    wield(w, "short_bow");
    const a = add(w, "swarmer", 200, 0);
    const b = add(w, "swarmer", 320, 0);
    c.attackHeld = true;
    run(w, c, BOW.charge + 0.05);
    c.attackHeld = false;
    run(w, c, 0.02);
    expect(w.allyShots[0].look).toBe("charged");
    run(w, c, 0.5);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
});

describe("mythic ultimates", () => {
  it("come from the mythic in the weapon hand first, and recharge, faster with kills", () => {
    const { w, c } = arena();
    expect(ultimateOf(w.profile)).toBe(null);
    w.profile.equipped.armour = "untouched_mantle";
    wield(w, "trials_end");
    expect(ultimateOf(w.profile)).toBe("trials_end");
    const foe = add(w, "brute", 500, 0);
    c.press("KeyY");
    run(w, c, ULT.trial.delay + 0.1);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(w.player.ultCd).toBeGreaterThan(ULT.charge - 1);
    // Pressed again while recharging: nothing.
    const hp = foe.hp;
    c.press("KeyY");
    run(w, c, ULT.trial.delay + 0.1);
    expect(foe.hp).toBe(hp);
    const before = w.player.ultCd;
    add(w, "swarmer", 40, 0, 1).hp = 0;
    run(w, c, 0.02);
    expect(w.player.ultCd).toBeLessThan(before - ULT.perKill + 0.05);
  });

  it("the Untouched Mantle's ultimate makes the hunter untouchable for a while", () => {
    const { w, c } = arena();
    w.profile.equipped.armour = "untouched_mantle";
    refreshDerived(w);
    c.press("KeyY");
    run(w, c, 0.02);
    w.player.iframes = 0;
    const hp = w.player.hp;
    add(w, "brute", 0, 0).dmg = 50;
    w.zones.push({ x: w.player.x, y: w.player.y, radius: 80, t: 0.01, total: 0.01, damage: 50 });
    run(w, c, 0.1);
    expect(w.player.hp).toBe(hp);
    expect(w.player.mantleT).toBeGreaterThan(0);
  });
});

describe("the bestiary", () => {
  it("counts kills by kind, and past fifty a kind takes more damage", () => {
    const w = createWorld(seeded(1));
    for (let i = 0; i < BESTIARY.tiers[0] - 1; i++) recordKill(w, "swarmer");
    expect(huntBonus(w.profile, "swarmer")).toBe(0);
    recordKill(w, "swarmer");
    expect(huntBonus(w.profile, "swarmer")).toBe(BESTIARY.bonus[0]);
    // A boss needs a tenth as many.
    for (let i = 0; i < 5; i++) recordKill(w, "warden");
    expect(huntBonus(w.profile, "warden")).toBe(BESTIARY.bonus[0]);
  });

  it("a kill in a gate is recorded, and survives a save", () => {
    const { w, c } = arena();
    add(w, "swarmer", 40, 0, 1).hp = 0;
    run(w, c, 0.02);
    expect(w.profile.kills.swarmer).toBe(1);
    const back = parseSave(JSON.parse(JSON.stringify(toSave(w))))!;
    expect(back.profile.kills.swarmer).toBe(1);
  });
});

describe("multiple masters", () => {
  it("tower boss floors hold two masters from floor 20 and three from floor 40", () => {
    const w = createWorld(seeded(5));
    w.profile.hunterRank = "S";
    w.player.prog.level = 60;
    enterTower(w);
    const c = new FakeControls();
    const climb = (floor: number) => {
      w.towerFloor = floor - 1;
      w.enemies = [];
      w.towerRest = 0.01;
      run(w, c, 0.02);
      return w.enemies.filter((e) => e.boss).length;
    };
    expect(climb(15)).toBe(1);
    expect(climb(MULTI.pairFrom)).toBe(2);
    expect(climb(MULTI.trioFrom)).toBe(3);
  });

  it("the boss rush ends with pairs and a trio", () => {
    expect(RUSH.rounds.length).toBe(9);
    expect(RUSH.rounds.at(-1)!.length).toBe(3);
    const w = createWorld(seeded(2));
    w.profile.ending = "keeper";
    enterRush(w);
    w.rushIdx = 0;
    w.enemies = [];
    w.towerRest = 0.01;
    w.rushIdx = 6 - 1;
    run(w, new FakeControls(), 0.02);
    expect(w.enemies.filter((e) => e.boss).length).toBe(2);
  });
});

describe("the struck lines and the margin", () => {
  it("a gate cleared with skills alone, and a minute of stillness, each give a line", () => {
    const { w, c } = arena();
    w.gateKind = "normal";
    w.enemies = [];
    run(w, c, LINES.stillFor + 0.1);
    expect(w.profile.lines).toContain(4);
  });

  it("with five lines, floor 13's stones in the right order open the margin; a wrong one puts them out", () => {
    const w = createWorld(seeded(4));
    w.player.prog.level = 60;
    w.profile.hunterRank = "S";
    for (let i = 0; i < LINES.count; i++) earnLine(w, i);
    enterTower(w);
    const c = new FakeControls();
    w.towerFloor = LINES.floor;
    w.enemies = [];
    run(w, c, 0.05);
    expect(w.glyphs.length).toBe(4);
    const stone = (g: number) => w.glyphs.find((x) => x.glyph === g)!;
    const walk = (g: number) => {
      w.player.x = stone(g).x;
      w.player.y = stone(g).y;
      run(w, c, 0.02);
    };
    walk(GLYPH_ORDER[1]);
    expect(w.glyphs.every((g) => !g.lit)).toBe(true);
    for (const g of GLYPH_ORDER) walk(g);
    expect(w.gateKind).toBe("margin");
    expect(w.profile.marginFound).toBe(true);
    expect(w.enemies.some((e) => e.kind === "redactor")).toBe(true);
  });
});

describe("the Redactor", () => {
  const margin = () => {
    const w = createWorld(seeded(6));
    w.player.prog.level = 60;
    refreshDerived(w);
    enterMargin(w);
    const boss = w.enemies[0];
    boss.cd = 999;
    return { w, boss, c: new FakeControls() };
  };

  it("Erasure kills anyone outside the safe circles, after its warning", () => {
    const { w, c } = margin();
    w.erasure = { t: REDACTOR.erasure.warn, total: REDACTOR.erasure.warn, safe: [{ x: 200, y: 200 }] };
    w.player.x = 900;
    w.player.y = 600;
    run(w, c, REDACTOR.erasure.warn - 0.2);
    expect(w.player.hp).toBeGreaterThan(0);
    run(w, c, 0.4);
    expect(w.player.hp).toBe(0);
  });

  it("standing in a safe circle, Erasure passes over", () => {
    const { w, c } = margin();
    w.erasure = { t: 0.2, total: 0.2, safe: [{ x: w.player.x, y: w.player.y }] };
    run(w, c, 0.4);
    expect(w.player.hp).toBe(w.player.d.maxHp);
  });

  it("Strikethrough kills what it crosses; a Blink across it survives", () => {
    const a = margin();
    a.w.sweeps.push({ axis: "x", at: 0, dir: 1, wait: 0 });
    a.w.player.x = 700;
    run(a.w, a.c, 1);
    expect(a.w.player.hp).toBe(0);

    const b = margin();
    b.w.sweeps.push({ axis: "x", at: 0, dir: 1, wait: 0 });
    b.w.player.x = 700;
    b.w.player.prog.level = 60;
    b.w.player.mana = 999;
    b.w.profile.loadout = ["blink", null, null, null, null, null, null];
    b.c.aimX = 300;
    b.c.aimY = b.w.player.y;
    // Wait until the wall is close, then blink back past it.
    run(b.w, b.c, (700 - 120) / REDACTOR.strike.speed);
    b.c.press("KeyQ");
    run(b.w, b.c, 1);
    expect(b.w.player.hp).toBeGreaterThan(0);
  });

  it("a new stage clears the floor and throws the hunter clear without harm", () => {
    const { w, boss, c } = margin();
    w.bars.push({ x: w.player.x, y: w.player.y, angle: 0, len: 900, width: 70, t: 0.5, total: 0.5, damage: 999 });
    boss.hp = boss.maxHp * (REDACTOR.stages[0] - 0.01);
    run(w, c, 0.6);
    expect(boss.stage).toBe(1);
    expect(w.bars.length).toBe(0);
    expect(w.player.hp).toBe(w.player.d.maxHp);
  });

  it("struck out, it leaves the Blank Quill and the title", () => {
    const { w, boss, c } = margin();
    boss.hp = 0;
    run(w, c, 0.05);
    expect(w.mode).toBe("cleared");
    expect(w.profile.mythics).toContain("blank_quill");
    expect(w.profile.titles).toContain("unstruck");
    expect(hubAction(w, "gate:margin")).toBe("margin");
  });
});

describe("special gates' scenes", () => {
  it("play in full once where scenes are on, then only as a title card", () => {
    const w = createWorld(seeded(1));
    w.specialScenes = true;
    playSpecial(w, "sealed");
    expect(w.cutscene?.id).toBe("sealed");
    w.cutscene = null;
    playSpecial(w, "sealed");
    expect(w.cutscene).toBe(null);
    expect(w.sting?.title).toBe("SEALED GATE");
  });

  it("a save before this release loads with no lines, no kills and no scenes seen", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    for (const k of ["kills", "lines", "replayed", "marginFound", "scenesSeen"]) delete raw.profile[k];
    const back = parseSave(raw)!;
    expect(back.profile.lines).toEqual([]);
    expect(back.profile.kills).toEqual({});
    expect(back.profile.marginFound).toBe(false);
    raw.profile.lines = [4, 0, 4, 9, "x"];
    expect(parseSave(raw)!.profile.lines).toEqual([0, 4]);
  });
});
