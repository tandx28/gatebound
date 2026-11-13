import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { ROOM, STEP } from "./config";
import { makeEnemy } from "./enemies";
import { createWorld, enterArena, healPositions, step, type World } from "./world";

const idle: Controls = {
  mouseX: 0,
  mouseY: 0,
  aimX: ROOM.w / 2 + 100,
  aimY: ROOM.h / 2,
  attackHeld: false,
  axis: () => ({ x: 0, y: 0 }),
  consume: () => false,
};

function arena(): World {
  const w = createWorld(() => 0.5);
  enterArena(w);
  return w;
}

describe("healPositions", () => {
  it("leaves a healthy world alone", () => {
    const w = arena();
    const e = makeEnemy("swarmer", 300, 300, "E");
    w.enemies.push(e);
    const before = { x: w.player.x, y: w.player.y };
    healPositions(w);
    expect(w.player.x).toBe(before.x);
    expect(w.enemies).toEqual([e]);
  });

  it("puts a player with a broken position back in the room", () => {
    const w = arena();
    w.player.x = NaN;
    w.player.y = Infinity;
    healPositions(w);
    expect(w.player.x).toBe(ROOM.w / 2);
    expect(w.player.y).toBe(ROOM.h / 2);
  });

  it("drops broken enemies, shots and particles, and keeps the good ones", () => {
    const w = arena();
    const good = makeEnemy("swarmer", 300, 300, "E");
    const bad = makeEnemy("swarmer", NaN, 300, "E");
    w.enemies.push(good, bad);
    w.projectiles.push({ x: 1, y: NaN, radius: 7, vx: 0, vy: 0, damage: 1, life: 1 });
    w.particles.push({ x: Infinity, y: 0, vx: 0, vy: 0, life: 1, color: "#fff" }, { x: 5, y: 5, vx: 0, vy: 0, life: 1, color: "#fff" });
    healPositions(w);
    expect(w.enemies).toEqual([good]);
    expect(w.projectiles).toEqual([]);
    expect(w.particles.length).toBe(1);
  });

  it("clears a broken shake or hit-stop", () => {
    const w = arena();
    w.shake = NaN;
    w.hitstop = NaN;
    healPositions(w);
    expect(w.shake).toBe(0);
    expect(w.hitstop).toBe(0);
  });

  it("runs every step: a broken enemy never survives one", () => {
    const w = arena();
    w.player.iframes = 99;
    w.enemies.push(makeEnemy("swarmer", NaN, NaN, "E"));
    step(w, idle, STEP);
    expect(w.enemies).toEqual([]);
    expect(Number.isFinite(w.player.x)).toBe(true);
  });

  it("a room is not left locked by a broken enemy", () => {
    const w = arena();
    const room = w.dungeon!.rooms[0];
    room.cleared = false;
    w.doorsOpen = false;
    w.enemies.push(makeEnemy("swarmer", NaN, 0, "E"));
    step(w, idle, STEP);
    expect(room.cleared).toBe(true);
    expect(w.doorsOpen).toBe(true);
  });
});
