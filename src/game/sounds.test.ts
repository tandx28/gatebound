import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { PLAYER, ROOM, SKILLS, STEP } from "./config";
import { makeEnemy } from "./enemies";
import { applySetting, hubAction } from "./profile";
import { sfx } from "./state";
import { xpToNext } from "./stats";
import { hubButtons, pauseButtons, pointIn, settingsButtons } from "./ui";
import { createWorld, enterArena, enterGate, enterRoom, grantXp, step, type World } from "./world";

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

function arena(): { w: World; c: FakeControls } {
  const w = createWorld(() => 0.5);
  enterArena(w);
  w.sounds = [];
  return { w, c: new FakeControls() };
}

/** Sounds raised since the last call. */
function heard(w: World): string[] {
  return w.sounds.splice(0);
}

describe("sound events in a fight", () => {
  it("a swing that connects raises swing then hit", () => {
    const { w, c } = arena();
    const e = makeEnemy("swarmer", w.player.x + 40, w.player.y, "E");
    e.t = 99;
    w.enemies.push(e);
    c.attackHeld = true;
    run(w, c, 0.05);
    expect(heard(w)).toEqual(["swing", "hit"]);
  });

  it("a swing at nothing raises only swing", () => {
    const { w, c } = arena();
    c.press("Mouse0");
    run(w, c, 0.05);
    expect(heard(w)).toEqual(["swing"]);
  });

  it("a kill, a dash, and being hurt each have their own sound", () => {
    const { w, c } = arena();
    const e = makeEnemy("swarmer", w.player.x + 300, w.player.y, "E");
    w.enemies.push(e);
    e.hp = 0;
    run(w, c, 0.02);
    expect(heard(w)).toContain("kill");

    c.press("Space");
    run(w, c, 0.02);
    expect(heard(w)).toEqual(["dash"]);

    const foe = makeEnemy("swarmer", w.player.x + 50, w.player.y, "E");
    foe.state = "chase";
    w.enemies.push(foe);
    run(w, c, 1);
    expect(heard(w)).toContain("hurt");
  });

  it("death sounds different from a hit", () => {
    const { w, c } = arena();
    w.player.hp = 5;
    const foe = makeEnemy("swarmer", w.player.x + 50, w.player.y, "E");
    foe.state = "chase";
    w.enemies.push(foe);
    run(w, c, 1);
    const s = heard(w);
    expect(s).toContain("death");
    expect(s).not.toContain("hurt");
  });

  it("each skill raises its own sound, and a locked one raises none", () => {
    const { w, c } = arena();
    c.press("KeyQ");
    run(w, c, 0.02);
    expect(heard(w)).toEqual([]);
    w.player.prog.level = 10;
    for (const [code, id] of [["KeyE", "whirl"], ["KeyR", "surge"]] as const) {
      c.press(code);
      run(w, c, 0.02);
      expect(heard(w)).toEqual([id]);
    }
    expect(SKILLS.pierce.code).toBe("KeyQ");
  });

  it("a level-up and a potion are heard", () => {
    const { w, c } = arena();
    grantXp(w, xpToNext(1));
    expect(heard(w)).toContain("levelup");
    w.player.hp = 10;
    c.press("KeyF");
    run(w, c, 0.02);
    expect(heard(w)).toEqual(["potion"]);
  });

  it("walking into a room sounds the door; starting a gate does not", () => {
    const w = createWorld(seeded(11));
    enterGate(w, "E", { sealed: false });
    expect(w.sounds).not.toContain("door");
    w.sounds = [];
    enterRoom(w, 1, "n");
    expect(w.sounds).toContain("door");
  });

  it("a blocked hit sounds like a block, not a hit", () => {
    const { w, c } = arena();
    const e = makeEnemy("brute", w.player.x + 50, w.player.y, "E");
    e.state = "chase";
    e.facing = Math.PI;
    w.enemies.push(e);
    c.attackHeld = true;
    run(w, c, PLAYER.attackActive);
    const s = heard(w);
    expect(s).toContain("block");
    expect(s).not.toContain("hit");
  });
});

describe("sound events on the board", () => {
  it("buying sounds like coins; a refused purchase sounds a denial", () => {
    const w = createWorld(seeded(1));
    w.profile.shop.stock = ["iron_fang"];
    hubAction(w, "buy:iron_fang");
    expect(heard(w)).toEqual(["deny"]);
    w.profile.gold = 100;
    hubAction(w, "buy:iron_fang");
    expect(heard(w)).toEqual(["buy"]);
  });

  it("changing tab and equipping click", () => {
    const w = createWorld(seeded(1));
    hubAction(w, "tab:shop");
    expect(heard(w)).toEqual(["click"]);
    w.profile.inventory = ["iron_fang"];
    hubAction(w, "equip:iron_fang");
    expect(heard(w)).toEqual(["click"]);
  });

  it("an earlier unsaved change does not make a refused action click", () => {
    const w = createWorld(seeded(1));
    w.dirty = true;
    hubAction(w, "sell:nothing");
    expect(heard(w)).toEqual(["deny"]);
    expect(w.dirty).toBe(true);
  });
});

describe("sound queue", () => {
  it("stops growing when nothing drains it", () => {
    const w = createWorld(seeded(1));
    for (let i = 0; i < 500; i++) sfx(w, "hit");
    expect(w.sounds.length).toBe(64);
  });
});

describe("settings", () => {
  it("volumes move in tenths and stay within 0 and 1", () => {
    const w = createWorld(seeded(1));
    expect(w.settings.sfx).toBe(0.7);
    applySetting(w, "sfx+");
    expect(w.settings.sfx).toBe(0.8);
    for (let i = 0; i < 20; i++) applySetting(w, "sfx+");
    expect(w.settings.sfx).toBe(1);
    for (let i = 0; i < 20; i++) applySetting(w, "sfx-");
    expect(w.settings.sfx).toBe(0);
    applySetting(w, "music-");
    expect(w.settings.music).toBe(0.4);
    expect(w.settingsDirty).toBe(true);
  });

  it("screen shake toggles", () => {
    const w = createWorld(seeded(1));
    applySetting(w, "shake");
    expect(w.settings.shake).toBe(false);
    applySetting(w, "shake");
    expect(w.settings.shake).toBe(true);
  });

  it("an unknown setting changes nothing", () => {
    const w = createWorld(seeded(1));
    applySetting(w, "brightness+");
    expect(w.settingsDirty).toBe(false);
    expect(heard(w)).toEqual([]);
  });

  it("a change plays a click, so the new volume is heard", () => {
    const w = createWorld(seeded(1));
    applySetting(w, "sfx-");
    expect(heard(w)).toEqual(["click"]);
  });

  it("the buttons disable at the ends of the range", () => {
    const w = createWorld(seeded(1));
    w.settings.sfx = 0;
    w.settings.music = 1;
    const b = settingsButtons(w, 0, 100, 0);
    expect(b.find((x) => x.id === "set:sfx-")!.enabled).toBe(false);
    expect(b.find((x) => x.id === "set:sfx+")!.enabled).toBe(true);
    expect(b.find((x) => x.id === "set:music+")!.enabled).toBe(false);
  });

  it("can be changed from the System tab by click", () => {
    const w = createWorld(seeded(1));
    const c = new FakeControls();
    w.tab = "system";
    c.click(hubButtons(w).find((b) => b.id === "set:shake")!.rect);
    run(w, c, 0.02);
    expect(w.settings.shake).toBe(false);
  });

  it("can be changed from the pause menu, without leaving it", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    enterGate(w, "E", { sealed: false });
    c.press("Escape");
    run(w, c, 0.02);
    c.click(pauseButtons(w).find((b) => b.id === "set:music+")!.rect);
    run(w, c, 0.02);
    expect(w.settings.music).toBe(0.6);
    expect(w.menu).toBe("pause");
  });

  it("no two controls on a screen overlap", () => {
    const w = createWorld(seeded(1));
    w.tab = "system";
    for (const list of [hubButtons(w), pauseButtons(w)]) {
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          const cx = a.rect.x + a.rect.w / 2;
          const cy = a.rect.y + a.rect.h / 2;
          expect(pointIn(b.rect, cx, cy)).toBe(false);
        }
      }
    }
  });
});
