import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { CLASSES, CLOCK, KINDS, MARK, METEOR, RANGER, ROOM, RUSH, SKILL_GROUPS, SKILL_SLOTS, STEP, VANGUARD, VIEW_H, VIEW_W, type Rank, type SkillId } from "./config";
import { makeEnemy } from "./enemies";
import { TITLES } from "./items";
import { classOpen, hubAction, newGamePlus, refreshDerived, rushOpen, slotOpen } from "./profile";
import { parseSave, toSave } from "./save";
import { HUB_TABS, hurtPlayer, visibleTabs, type HubTab } from "./state";
import { hubButtons } from "./ui";
import { createWorld, enterArena, enterClock, enterRush, step, toSelect, type Enemy, type World } from "./world";

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

/** A hunter past the rite, in an empty arena, as the given class. */
function as(cls: keyof typeof CLASSES, rank: Rank = "E"): { w: World; c: FakeControls } {
  const w = createWorld(() => 0.5);
  w.profile.classUnlocked = true;
  w.profile.cycle = 1;
  w.profile.cls = cls;
  refreshDerived(w);
  enterArena(w, rank);
  return { w, c: new FakeControls() };
}

/** A harmless, very tough enemy at an offset from the hunter. */
function add(w: World, kind: keyof typeof KINDS, dx: number, dy: number, hp = 1e6): Enemy {
  const e = makeEnemy(kind, w.player.x + dx, w.player.y + dy, w.rank);
  e.state = "recover";
  e.t = 999;
  e.hp = e.maxHp = hp;
  w.enemies.push(e);
  return e;
}

function cast(w: World, c: FakeControls, id: SkillId, seconds = 0.02): void {
  w.player.prog.level = 60;
  w.player.mana = 999;
  w.profile.loadout = [id, null, null, null, null, null, null];
  c.press("KeyQ");
  run(w, c, seconds);
}

describe("classes", () => {
  it("open only after the rite; the Arcanist needs New Game+ 1", () => {
    const w = createWorld(() => 0.5);
    expect(classOpen(w.profile, "vanguard")).toBe(false);
    hubAction(w, "class:vanguard");
    expect(w.profile.cls).toBe("echo");
    w.profile.classUnlocked = true;
    hubAction(w, "class:arcanist");
    expect(w.profile.cls).toBe("echo");
    hubAction(w, "class:ranger");
    expect(w.profile.cls).toBe("ranger");
    w.profile.cycle = 1;
    hubAction(w, "class:arcanist");
    expect(w.profile.cls).toBe("arcanist");
  });

  it("only an Echo Caller fields echoes and has the Echoes tab", () => {
    const { w } = as("vanguard");
    w.profile.echoes = [{ kind: "knight", rank: "E", active: true }];
    enterArena(w, "E");
    expect(w.allies.length).toBe(0);
    expect(visibleTabs(w)).not.toContain("echoes");
    hubAction(w, "class:echo");
    enterArena(w, "E");
    expect(w.allies.length).toBe(1);
    expect(visibleTabs(w)).toContain("echoes");
  });

  it("a Vanguard has more health, and Bulwark halves what lands and throws foes back", () => {
    const { w, c } = as("vanguard");
    const plain = createWorld(() => 0.5);
    expect(w.player.d.maxHp).toBe(Math.round(plain.player.d.maxHp * VANGUARD.hp));
    const foe = add(w, "brute", 60, 0);
    c.press("KeyH");
    run(w, c, 0.05);
    expect(w.player.bulwarkT).toBeGreaterThan(0);
    expect(foe.x - w.player.x).toBeGreaterThan(60);
    const before = w.player.hp;
    w.player.iframes = 0;
    hurtPlayer(w, 40);
    expect(before - w.player.hp).toBe(Math.round(40 * VANGUARD.guard * VANGUARD.taken));
  });

  it("a Ranger's Arrow Storm lands round the cursor after a warning, not at once", () => {
    const { w, c } = as("ranger");
    // Arrows scatter at random: a real sequence, so they do not all fall on one spot.
    w.rng = seeded(7);
    const foe = add(w, "brute", 300, 0);
    c.press("KeyH");
    run(w, c, 0.05);
    expect(w.blasts.length).toBe(RANGER.arrows);
    expect(foe.hp).toBe(foe.maxHp);
    run(w, c, RANGER.delay + RANGER.gap * RANGER.arrows + 0.1);
    expect(w.blasts.length).toBe(0);
    expect(foe.hp).toBeLessThan(foe.maxHp);
    expect(w.armyCd).toBeGreaterThan(0);
  });

  it("an Arcanist's Overflow fills mana and readies every skill", () => {
    const { w, c } = as("arcanist");
    w.player.mana = 0;
    w.player.skillCd.whirl = 5;
    c.press("KeyH");
    run(w, c, 0.02);
    expect(w.player.mana).toBeGreaterThan(w.player.d.maxMana - 1);
    expect(w.player.skillCd.whirl).toBe(0);
    expect(w.player.overflowT).toBeGreaterThan(0);
  });

  it("is kept in the save, and a class the save may not have falls back to Echo Caller", () => {
    const a = createWorld(seeded(1));
    a.profile.classUnlocked = true;
    a.profile.cls = "ranger";
    a.profile.clockBest = 12;
    a.profile.rushBest = 300;
    const back = parseSave(JSON.parse(JSON.stringify(toSave(a))))!;
    expect(back.profile.cls).toBe("ranger");
    expect(back.profile.clockBest).toBe(12);
    expect(back.profile.rushBest).toBe(300);
    const raw = JSON.parse(JSON.stringify(toSave(a)));
    raw.profile.cls = "arcanist";
    expect(parseSave(raw)!.profile.cls).toBe("echo");
    // A save from before classes: no class, no records, four slots.
    delete raw.profile.cls;
    delete raw.profile.clockBest;
    delete raw.profile.rushBest;
    raw.profile.loadout = ["pierce", "whirl", "surge", "rally"];
    const old = parseSave(raw)!;
    expect(old.profile.cls).toBe("echo");
    expect(old.profile.clockBest).toBe(0);
    expect(old.profile.loadout).toEqual(["pierce", "whirl", "surge", "rally", null, null, null]);
  });
});

describe("skill slots from New Game+", () => {
  it("the fifth to seventh slots open one per cycle, and fire on 1, 2, 3", () => {
    const w = createWorld(() => 0.5);
    expect(SKILL_SLOTS.filter((_, i) => slotOpen(w.profile, i)).length).toBe(4);
    hubAction(w, "slot:4:whirl");
    expect(w.profile.loadout[4]).toBe(null);
    w.profile.cycle = 1;
    hubAction(w, "slot:4:whirl");
    expect(w.profile.loadout[4]).toBe("whirl");
    enterArena(w, "E");
    w.player.prog.level = 60;
    w.player.mana = 999;
    const c = new FakeControls();
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.player.skillCd.whirl).toBeGreaterThan(0);
    // A slot not yet open does nothing.
    w.profile.loadout[5] = "frost";
    c.press("Digit2");
    run(w, c, 0.02);
    expect(w.player.skillCd.frost).toBe(0);
  });

  it("each New Game+ grants its own title", () => {
    const w = createWorld(() => 0.5);
    w.profile.ending = "keeper";
    newGamePlus(w);
    expect(w.profile.titles).toContain("ng1");
  });
});

describe("the new skills", () => {
  it("Falling Star lands where the cursor was, only after its delay", () => {
    const { w, c } = as("echo");
    const foe = add(w, "brute", 300, 0);
    cast(w, c, "meteor");
    expect(foe.hp).toBe(foe.maxHp);
    run(w, c, METEOR.delay + 0.05);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it("Death Mark makes the marked enemy take more from every blow", () => {
    const { w, c } = as("echo");
    const foe = add(w, "brute", 300, 0);
    cast(w, c, "mark");
    expect(foe.markT).toBeGreaterThan(0);
    expect(MARK.vulnerable).toBeGreaterThan(1);
  });

  it("Arc Chain leaps from the first enemy to others near it", () => {
    const { w, c } = as("echo");
    const a = add(w, "brute", 300, 0);
    const b = add(w, "brute", 420, 0);
    const far = add(w, "brute", -500, 300);
    cast(w, c, "chain");
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it("Arc Chain with nothing to reach costs nothing", () => {
    const { w, c } = as("echo");
    cast(w, c, "chain");
    expect(w.player.skillCd.chain).toBe(0);
  });

  it("Earthbreaker stuns a common enemy ahead; Rending Arc misses what is behind", () => {
    const { w, c } = as("echo");
    const ahead = add(w, "swarmer", 190, 0);
    ahead.t = 0;
    ahead.state = "chase";
    const behind = add(w, "brute", -100, 0);
    cast(w, c, "quake", 0.4);
    expect(ahead.hp).toBeLessThan(ahead.maxHp);
    expect(ahead.state).toBe("recover");
    cast(w, c, "cleave");
    expect(behind.hp).toBe(behind.maxHp);
  });

  it("Second Wind heals; Frost Nova chills what is close", () => {
    const { w, c } = as("echo");
    const near = add(w, "brute", 100, 0);
    w.player.hp = 10;
    cast(w, c, "mend");
    expect(w.player.hp).toBeGreaterThan(10);
    cast(w, c, "frost");
    expect(near.chillT).toBeGreaterThan(0);
  });

  it("Echo Fury with no echo on the field costs nothing", () => {
    const { w, c } = as("vanguard");
    cast(w, c, "legion");
    expect(w.player.skillCd.legion).toBe(0);
    expect(w.legionT).toBe(0);
  });
});

describe("time trial", () => {
  it("each floor cleared buys time; when it runs out the climb ends and the record stays", () => {
    const w = createWorld(() => 0.5);
    w.profile.hunterRank = "C";
    w.player.prog.level = 60;
    enterClock(w);
    expect(w.gateKind).toBe("clock");
    expect(w.clockT).toBe(CLOCK.start);
    const c = new FakeControls();
    w.enemies = [];
    run(w, c, 0.05);
    expect(w.profile.clockBest).toBe(1);
    expect(w.clockT).toBeGreaterThan(CLOCK.start);
    w.clockT = 0.01;
    w.towerRest = 0;
    add(w, "brute", 300, 0);
    run(w, c, 0.05);
    expect(w.mode).toBe("cleared");
    expect(w.run.settled).toBe(true);
    expect(w.profile.clockBest).toBe(1);
  });
});

describe("boss rush", () => {
  it("opens after the story; six masters fall in turn, then a record and a title", () => {
    const w = createWorld(() => 0.5);
    expect(rushOpen(w.profile)).toBe(false);
    w.profile.ending = "keeper";
    expect(rushOpen(w.profile)).toBe(true);
    w.player.prog.level = 60;
    enterRush(w);
    expect(w.enemies.some((e) => e.boss)).toBe(true);
    const c = new FakeControls();
    const gold = w.profile.gold;
    for (let i = 0; i < RUSH.rounds.length; i++) {
      expect(w.rushIdx).toBe(i);
      w.enemies = [];
      w.spawnQueue = [];
      run(w, c, RUSH.rest + 0.2);
      w.player.hp = w.player.d.maxHp;
    }
    expect(w.mode).toBe("cleared");
    expect(w.profile.rushBest).toBeGreaterThan(0);
    expect(w.profile.titles).toContain("rush");
    expect(w.profile.gold).toBeGreaterThanOrEqual(gold + RUSH.gold);
  });
});

describe("the board at 1280 x 720", () => {
  it("every tab's buttons stay on screen and clear of each other, with everything unlocked", () => {
    const w = createWorld(() => 0.5);
    w.profile.introSeen = true;
    w.profile.classUnlocked = true;
    w.profile.cycle = 3;
    w.profile.ending = "keeper";
    w.profile.hunterRank = "S";
    w.profile.titles = TITLES.map((t) => t.id);
    w.player.prog.level = 60;
    toSelect(w);
    const tabs = visibleTabs(w);
    expect(tabs.length).toBe(HUB_TABS.length);
    for (const tab of tabs as HubTab[]) {
      w.tab = tab;
      const pages = tab === "skills" ? SKILL_GROUPS.length : 1;
      for (let page = 0; page < pages; page++) {
        w.skillPage = page;
        const bs = hubButtons(w);
        for (const b of bs) {
          expect(b.rect.x).toBeGreaterThanOrEqual(0);
          expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(VIEW_W);
          expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(VIEW_H - 30);
        }
        for (let i = 0; i < bs.length; i++) {
          for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i].rect;
            const b = bs[j].rect;
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap, `${tab}: ${bs[i].id} overlaps ${bs[j].id}`).toBe(false);
          }
        }
      }
    }
  });
});
