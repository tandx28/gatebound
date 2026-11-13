import { describe, expect, it } from "vitest";
import { activeQuests, MAIN, newQuests, questEvent, questProgress, SIDE } from "./quests";

describe("quests", () => {
  it("starts with the first main quest and every side quest open", () => {
    const ids = activeQuests(newQuests()).map((q) => q.id);
    expect(ids).toEqual(["m1", "s1", "s2", "s3"]);
  });

  it("ignores events that do not match", () => {
    const q = newQuests();
    expect(questEvent(q, { type: "room", rank: "D" })).toEqual([]);
    expect(q.main).toBe(0);
  });

  it("completing a main quest opens the next one", () => {
    const q = newQuests();
    const done = questEvent(q, { type: "room", rank: "E" });
    expect(done.map((d) => d.id)).toEqual(["m1"]);
    expect(activeQuests(q)[0].id).toBe("m2");
  });

  it("a later main quest gets no credit before it opens", () => {
    const q = newQuests();
    questEvent(q, { type: "gate", rank: "D", noPotion: false, noDamage: false });
    expect(q.progress.m4).toBeUndefined();
  });

  it("counting quests add up and complete at the goal", () => {
    const q = newQuests();
    for (let i = 0; i < 29; i++) expect(questEvent(q, { type: "kill", kind: "swarmer" })).toEqual([]);
    expect(questProgress(q, SIDE[0])).toBe(29);
    expect(questEvent(q, { type: "kill", kind: "swarmer" }).map((d) => d.id)).toEqual(["s1"]);
    expect(q.done).toEqual(["s1"]);
    expect(activeQuests(q).some((d) => d.id === "s1")).toBe(false);
  });

  it("a level goal tracks the highest level seen, not a sum", () => {
    const q = newQuests();
    q.main = 2;
    questEvent(q, { type: "level", level: 3 });
    questEvent(q, { type: "level", level: 4 });
    expect(q.progress.m3).toBe(4);
    expect(questEvent(q, { type: "level", level: 6 }).map((d) => d.id)).toEqual(["m3"]);
  });

  it("one event can complete a main and a side quest together", () => {
    const q = newQuests();
    q.main = 1;
    const done = questEvent(q, { type: "gate", rank: "E", noPotion: true, noDamage: false });
    expect(done.map((d) => d.id).sort()).toEqual(["m2", "s3"]);
  });

  it("the chain ends after the last main quest", () => {
    const q = newQuests();
    q.main = MAIN.length - 1;
    questEvent(q, { type: "gate", rank: "C", noPotion: false, noDamage: false });
    expect(q.main).toBe(MAIN.length);
    expect(activeQuests(q).every((d) => d.id.startsWith("s"))).toBe(true);
  });
});
