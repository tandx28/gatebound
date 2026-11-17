import { describe, expect, it } from "vitest";
import { SOUND_IDS } from "../audio/sfx";
import type { Controls } from "../engine/input";
import { ARMY, KINDS, ROOM, STEP, VIEW_W } from "./config";
import { CUTSCENES, MAX_SCENE, SPECIAL_SCENES, sceneLength, seenScenes, SKIP_HOLD, startCutscene } from "./cutscenes";
import { makeEnemy } from "./enemies";
import { TITLES } from "./items";
import { beginStory, chooseEnding, fireQuest, hubAction, syncDay } from "./profile";
import { MAIN, OLD_MAIN } from "./quests";
import { applySave, parseSave, SAVE_VERSION, toSave } from "./save";
import { visibleTabs } from "./state";
import { CHAPTERS, DIALOGUES } from "./story";
import { hubButtons } from "./ui";
import { createWorld, enterArena, enterRoom, step, toggleArmy, toSelect, type World } from "./world";

class FakeControls implements Controls {
  mouseX = 0;
  mouseY = 0;
  aimX = ROOM.w / 2 + 400;
  aimY = ROOM.h / 2;
  attackHeld = false;
  move = { x: 0, y: 0 };
  /** Keys held down, for the hold-to-skip. */
  down = new Set<string>();
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
  held(code: string) {
    return this.down.has(code);
  }
}

function run(w: World, c: Controls, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(w, c, STEP);
}

/** On the gate board, intro already seen. */
function hub(): { w: World; c: FakeControls } {
  const w = createWorld(() => 0.5);
  w.profile.introSeen = true;
  toSelect(w);
  return { w, c: new FakeControls() };
}

/** In an arena as an Echo Caller with the given echoes fighting. (A level 1 squad holds two.) */
function caller(kinds: (keyof typeof KINDS)[] = ["swarmer", "knight"]): { w: World; c: FakeControls } {
  const w = createWorld(() => 0.5);
  w.profile.classUnlocked = true;
  w.profile.echoes = kinds.map((kind) => ({ kind, rank: "E" as const, active: true }));
  enterArena(w, "E");
  enterRoom(w, 0, null);
  return { w, c: new FakeControls() };
}

const at = (id: string) => MAIN.findIndex((q) => q.id === id);

describe("sending the army away and calling it back", () => {
  it("H sinks every echo into the ground, and then they are gone", () => {
    const { w, c } = caller();
    expect(w.allies.length).toBe(2);
    c.press("KeyH");
    run(w, c, 0.02);
    expect(w.armyAway).toBe(true);
    expect(w.allies.every((a) => a.out && a.anim > 0)).toBe(true);
    run(w, c, ARMY.leave + 0.05);
    expect(w.allies.length).toBe(0);
  });

  it("H again raises them beside the hunter; they do nothing until they have risen", () => {
    const { w, c } = caller(["knight"]);
    toggleArmy(w);
    run(w, c, ARMY.cooldown + 0.1);
    const foe = makeEnemy("swarmer", w.player.x + 60, w.player.y, "E");
    foe.state = "recover";
    foe.t = 999;
    foe.hp = foe.maxHp = 1e6;
    w.enemies.push(foe);
    c.press("KeyH");
    run(w, c, 0.02);
    expect(w.armyAway).toBe(false);
    expect(w.allies.length).toBe(1);
    expect(w.allies[0].anim).toBeGreaterThan(0);
    const start = { x: w.allies[0].x, y: w.allies[0].y };
    run(w, c, ARMY.rise - 0.1);
    expect(w.allies[0].x).toBe(start.x);
    expect(foe.hp).toBe(foe.maxHp);
    run(w, c, 2.5);
    expect(foe.hp).toBeLessThan(foe.maxHp);
  });

  it("cannot be flickered: a second press inside the cooldown does nothing", () => {
    const { w, c } = caller();
    c.press("KeyH");
    run(w, c, 0.02);
    c.press("KeyH");
    run(w, c, 0.02);
    expect(w.armyAway).toBe(true);
  });

  it("an army sent away stays away in the next room, and returns with the next gate", () => {
    const { w } = caller();
    toggleArmy(w);
    enterRoom(w, 0, null);
    expect(w.allies.length).toBe(0);
    enterArena(w, "E");
    enterRoom(w, 0, null);
    expect(w.armyAway).toBe(false);
    expect(w.allies.length).toBe(2);
  });

  it("echoes that are away cannot be turned against the hunter", () => {
    const { w, c } = caller();
    toggleArmy(w);
    run(w, c, ARMY.leave + 0.1);
    w.turnedT = 5;
    const hp = w.player.hp;
    run(w, c, 3);
    expect(w.player.hp).toBe(hp);
  });

  it("does nothing before the class is earned, and says so with no echoes", () => {
    const w = createWorld(() => 0.5);
    enterArena(w, "E");
    toggleArmy(w);
    expect(w.armyAway).toBe(false);
    w.profile.classUnlocked = true;
    w.sounds.length = 0;
    toggleArmy(w);
    expect(w.armyAway).toBe(false);
    expect(w.sounds).toContain("deny");
  });
});

describe("the story's shape", () => {
  it("has six chapters that between them hold every main quest once, in order", () => {
    expect(CHAPTERS.length).toBe(6);
    expect(CHAPTERS.flatMap((ch) => ch.quests)).toEqual(MAIN.map((q) => q.id));
  });

  it("keeps every quest of the old chain, in the same order", () => {
    const now = MAIN.map((q) => q.id).filter((id) => OLD_MAIN.includes(id));
    expect(now).toEqual(OLD_MAIN);
  });

  it("level goals rise with the chain and match where each rank opens", () => {
    const goals = MAIN.filter((q) => q.desc.startsWith("Reach level")).map((q) => q.goal);
    expect(goals).toEqual([6, 20, 30, 42]);
  });

  it("holding five echoes, and binding a boss, each move the story on", () => {
    const { w } = hub();
    w.profile.quests.main = at("m6a");
    fireQuest(w, { type: "bind", echoes: 4, boss: false });
    expect(MAIN[w.profile.quests.main].id).toBe("m6a");
    fireQuest(w, { type: "bind", echoes: 5, boss: false });
    expect(MAIN[w.profile.quests.main].id).toBe("m6b");

    w.profile.quests.main = at("m7a");
    fireQuest(w, { type: "bind", echoes: 9, boss: false });
    expect(MAIN[w.profile.quests.main].id).toBe("m7a");
    fireQuest(w, { type: "bind", echoes: 10, boss: true });
    expect(MAIN[w.profile.quests.main].id).toBe("m7b");
  });

  it("a step already met when it opens is passed at once", () => {
    const { w } = hub();
    w.profile.classUnlocked = true;
    w.profile.echoes = Array.from({ length: 6 }, () => ({ kind: "swarmer" as const, rank: "E" as const, active: false }));
    w.player.prog.level = 25;
    w.profile.quests.main = at("m6");
    fireQuest(w, { type: "rite" });
    // Five echoes and level 20 were both already true.
    expect(MAIN[w.profile.quests.main].id).toBe("m7");
  });
});

describe("cutscenes", () => {
  it("none runs longer than forty seconds", () => {
    for (const id of Object.keys(CUTSCENES)) expect(sceneLength(id), id).toBeLessThanOrEqual(MAX_SCENE);
  });

  it("every actor is introduced before it is used, stands inside the room, and every sound exists", () => {
    for (const scene of Object.values(CUTSCENES)) {
      const cast = new Set<string>();
      for (const beat of scene.beats) {
        expect(beat.text.length, scene.id).toBeGreaterThan(0);
        // Three lines of caption at most.
        expect(beat.text.length, `${scene.id}: ${beat.text}`).toBeLessThanOrEqual(190);
        if (beat.sound) expect(SOUND_IDS, `${scene.id}: ${beat.sound}`).toContain(beat.sound);
        for (const cue of beat.cues ?? []) {
          if (!cast.has(cue.a)) {
            expect(cue.kind, `${scene.id}: ${cue.a}`).toBeDefined();
            expect(cue.at, `${scene.id}: ${cue.a}`).toBeDefined();
            cast.add(cue.a);
          }
          for (const p of [cue.at, cue.to]) {
            if (!p) continue;
            expect(p[0]).toBeGreaterThan(0);
            expect(p[0]).toBeLessThan(ROOM.w);
            expect(p[1]).toBeGreaterThan(0);
            expect(p[1]).toBeLessThan(ROOM.h);
          }
        }
      }
    }
  });

  it("each scene belongs to a chapter, and each quest scene to the chapter its quest is in", () => {
    for (const scene of Object.values(CUTSCENES)) {
      expect(scene.chapter).toBeGreaterThanOrEqual(1);
      expect(scene.chapter).toBeLessThanOrEqual(6);
      const ch = CHAPTERS.findIndex((c) => c.quests.includes(scene.id));
      if (ch >= 0) expect(scene.chapter).toBe(ch + 1);
    }
  });

  it("plays to the end by itself and frees the board", () => {
    const { w, c } = hub();
    startCutscene(w, "m7");
    run(w, c, sceneLength("m7") - 0.5);
    expect(w.cutscene).not.toBe(null);
    run(w, c, 1);
    expect(w.cutscene).toBe(null);
  });

  it("a tap of Esc does nothing; holding it two seconds skips", () => {
    const { w, c } = hub();
    startCutscene(w, "m8");
    c.press("Escape");
    run(w, c, 0.1);
    expect(w.cutscene?.beat).toBe(0);
    expect(w.menu).toBe("none");
    c.down.add("Escape");
    run(w, c, SKIP_HOLD - 0.2);
    expect(w.cutscene).not.toBe(null);
    run(w, c, 0.3);
    expect(w.cutscene).toBe(null);
  });

  it("letting go of Esc starts the count again", () => {
    const { w, c } = hub();
    startCutscene(w, "m8");
    c.down.add("Escape");
    run(w, c, 1.5);
    c.down.clear();
    run(w, c, 0.1);
    c.down.add("Escape");
    run(w, c, 1.5);
    expect(w.cutscene).not.toBe(null);
  });

  it("nothing else happens while one plays: no board clicks, no pause", () => {
    const { w, c } = hub();
    startCutscene(w, "m8");
    c.press("Digit1");
    c.press("KeyC");
    run(w, c, 0.1);
    expect(w.mode).toBe("select");
    expect(w.menu).toBe("none");
  });

  it("actors walk to their marks, rise from the floor, and leave it", () => {
    const { w, c } = hub();
    startCutscene(w, "m6");
    const fallen = w.cutscene!.actors.find((a) => a.id === "fallen")!;
    expect(fallen.pose).toBe("down");
    run(w, c, CUTSCENES.m6.beats[0].dur + 0.05);
    expect(fallen.out).toBe(true);
    run(w, c, CUTSCENES.m6.beats[1].dur + 0.05);
    expect(w.cutscene!.actors.some((a) => a.id === "fallen")).toBe(false);
    const shade = w.cutscene!.actors.find((a) => a.id === "shade")!;
    expect(shade.ghost).toBe(true);
    expect(shade.anim).toBeGreaterThan(0);
    run(w, c, CUTSCENES.m6.beats[2].dur + 3);
    expect(shade.moving || Math.hypot(shade.x - 720, shade.y - 500) < 2).toBe(true);
  });

  it("finishing a quest with a scene plays the scene on the next visit to the board", () => {
    const w = createWorld(() => 0.5);
    w.profile.introSeen = true;
    w.profile.quests.main = at("m7");
    // The gate has just been cleared: the result screen is up, not the board.
    w.mode = "cleared";
    fireQuest(w, { type: "gate", rank: "B", noPotion: false, noDamage: false });
    expect(w.cutscene).toBe(null);
    toSelect(w);
    expect(w.cutscene?.id).toBe("m7");
  });

  it("a new game opens on the intro, and a line of dialogue follows it", () => {
    const w = createWorld(() => 0.5);
    const c = new FakeControls();
    beginStory(w);
    toSelect(w);
    expect(w.cutscene?.id).toBe("intro");
    c.down.add("Escape");
    run(w, c, SKIP_HOLD + 0.1);
    c.down.clear();
    expect(w.profile.introSeen).toBe(true);
    run(w, c, 0.05);
    expect(w.dialogue?.lines).toBe(DIALOGUES.intro_after);
  });

  it("the Story tab replays scenes already reached, and no others", () => {
    const { w } = hub();
    w.profile.quests.main = at("m7") + 1;
    expect(seenScenes(w.profile)).toEqual(["intro", "m6", "m7"]);
    hubAction(w, "scene:m9");
    expect(w.cutscene).toBe(null);
    hubAction(w, "scene:m6");
    expect(w.cutscene?.id).toBe("m6");
  });

  it("a replay does not bring the following dialogue back", () => {
    const { w, c } = hub();
    hubAction(w, "scene:intro");
    c.down.add("Escape");
    run(w, c, SKIP_HOLD + 0.1);
    c.down.clear();
    run(w, c, 0.1);
    expect(w.dialogue).toBe(null);
  });
});

describe("the two endings", () => {
  const atLastPage = () => {
    const { w, c } = hub();
    w.profile.quests.main = at("m10");
    w.tab = "story";
    return { w, c };
  };

  it("the choice is offered only once the Monarch is dead", () => {
    const { w } = hub();
    w.tab = "story";
    w.profile.quests.main = at("m9");
    expect(hubButtons(w).some((b) => b.id.startsWith("ending:"))).toBe(false);
    expect(chooseEnding(w, "keeper")).toBe(false);
    w.profile.quests.main = at("m10");
    expect(hubButtons(w).filter((b) => b.id.startsWith("ending:")).map((b) => b.id)).toEqual(["ending:keeper", "ending:unwritten"]);
  });

  it("signing makes the hunter the Keeper: a title, the last quest, and its scene", () => {
    const { w, c } = atLastPage();
    hubAction(w, "ending:keeper");
    expect(w.profile.ending).toBe("keeper");
    expect(w.profile.titles).toContain("keeper");
    expect(w.profile.quests.main).toBe(MAIN.length);
    run(w, c, 0.05);
    expect(w.cutscene?.id).toBe("end_keeper");
  });

  it("burning makes the hunter Unwritten, and plays the other scene", () => {
    const { w, c } = atLastPage();
    hubAction(w, "ending:unwritten");
    expect(w.profile.ending).toBe("unwritten");
    expect(w.profile.titles).toContain("unwritten");
    run(w, c, 0.05);
    expect(w.cutscene?.id).toBe("end_unwritten");
  });

  it("cannot be chosen twice", () => {
    const { w } = atLastPage();
    hubAction(w, "ending:keeper");
    hubAction(w, "ending:unwritten");
    expect(w.profile.ending).toBe("keeper");
    expect(w.profile.titles).not.toContain("unwritten");
    expect(hubButtons(w).some((b) => b.id.startsWith("ending:"))).toBe(false);
  });

  it("both titles exist and give something", () => {
    for (const id of ["keeper", "unwritten"]) expect(Object.keys(TITLES.find((t) => t.id === id)!.bonus).length).toBeGreaterThan(0);
  });

  it("with the Ledger burnt, a missed daily quest brings no penalty; signed, it still does", () => {
    for (const [ending, owed] of [["unwritten", false], ["keeper", true]] as const) {
      const { w } = atLastPage();
      chooseEnding(w, ending);
      w.today = 100;
      syncDay(w);
      w.today = 101;
      syncDay(w);
      expect(w.profile.penaltyPending, ending).toBe(owed);
    }
  });

  it("the game goes on afterwards: the scene ends on the board with every gate open", () => {
    const { w, c } = atLastPage();
    hubAction(w, "ending:unwritten");
    run(w, c, 0.05);
    c.down.add("Escape");
    run(w, c, SKIP_HOLD + 0.1);
    c.down.clear();
    for (let i = 0; i < 4; i++) {
      c.press("Space");
      run(w, c, 0.05);
    }
    expect(w.cutscene).toBe(null);
    expect(w.dialogue).toBe(null);
    expect(w.mode).toBe("select");
    w.tab = "gates";
    expect(hubButtons(w).filter((b) => b.id.startsWith("gate:") && b.enabled).length).toBeGreaterThanOrEqual(6);
  });

  it("the ending survives a save and a load", () => {
    const { w } = atLastPage();
    chooseEnding(w, "keeper");
    const data = parseSave(JSON.parse(JSON.stringify(toSave(w))))!;
    expect(data.profile.ending).toBe("keeper");
    expect(data.profile.title === "keeper" || data.profile.titles.includes("keeper")).toBe(true);
  });

  it("a save cannot claim an ending without the story behind it", () => {
    const { w } = hub();
    const raw = JSON.parse(JSON.stringify(toSave(w)));
    raw.profile.ending = "keeper";
    expect(parseSave(raw)!.profile.ending).toBe(null);
  });
});

describe("older saves", () => {
  const old = (main: number) => {
    const w = createWorld(() => 0.5);
    const raw = JSON.parse(JSON.stringify(toSave(w)));
    raw.v = 4;
    raw.profile.quests.main = main;
    delete raw.profile.ending;
    return parseSave(raw)!;
  };

  it("keep their place in the longer chain, quest for quest", () => {
    OLD_MAIN.forEach((id, i) => expect(MAIN[old(i).profile.quests.main].id).toBe(id));
  });

  it("a finished old chain stands at the last page, with the ending still to choose", () => {
    const data = old(OLD_MAIN.length);
    expect(MAIN[data.profile.quests.main].id).toBe("m10");
    expect(data.profile.ending).toBe(null);
    const w = createWorld(() => 0.5);
    applySave(w, data);
    expect(seenScenes(w.profile)).toEqual(["m6", "m7", "m8", "m9"]);
  });

  it("a current save keeps its index as it is", () => {
    const w = createWorld(() => 0.5);
    w.profile.quests.main = at("m7a");
    const data = parseSave(JSON.parse(JSON.stringify(toSave(w))))!;
    expect(data.v).toBe(SAVE_VERSION);
    expect(MAIN[data.profile.quests.main].id).toBe("m7a");
  });
});

describe("the board with a ninth tab", () => {
  it("every tab fits on the screen, with and without Echoes", () => {
    for (const unlocked of [false, true]) {
      const { w } = hub();
      w.profile.classUnlocked = unlocked;
      const tabs = hubButtons(w).filter((b) => b.kind === "tab");
      expect(tabs.length).toBe(visibleTabs(w).length);
      expect(tabs.map((b) => b.label)).toContain("STORY");
      for (const b of tabs) {
        expect(b.rect.x).toBeGreaterThanOrEqual(20);
        expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(VIEW_W - 20);
      }
      for (let i = 1; i < tabs.length; i++) expect(tabs[i].rect.x).toBeGreaterThanOrEqual(tabs[i - 1].rect.x + tabs[i - 1].rect.w);
    }
  });

  it("the Story tab's buttons stay on the screen with every scene seen", () => {
    const { w } = hub();
    w.profile.quests.main = MAIN.length;
    w.profile.ending = "keeper";
    w.tab = "story";
    const replay = hubButtons(w).filter((b) => b.id.startsWith("scene:"));
    // Every story scene but the intro (not marked seen here); special gates' scenes only once played.
    expect(replay.length).toBe(Object.keys(CUTSCENES).length - 1 - SPECIAL_SCENES.length);
    for (const b of replay) {
      expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(VIEW_W - 20);
      expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(640);
    }
  });
});
