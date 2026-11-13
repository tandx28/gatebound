import { describe, expect, it } from "vitest";
import { PLAYER } from "./config";
import {
  addXp,
  allocate,
  BASE_STAT,
  CRIT_CAP,
  derive,
  LEVEL_CAP,
  newProgress,
  POINTS_PER_LEVEL,
  STAT_KEYS,
  xpToNext,
} from "./stats";

describe("derive", () => {
  it("matches the base player constants at base stats", () => {
    const d = derive(newProgress().stats);
    expect(d.maxHp).toBe(PLAYER.maxHp);
    expect(d.maxMana).toBe(PLAYER.maxMana);
    expect(d.damage).toBe(PLAYER.attackDamage);
    expect(d.moveSpeed).toBe(PLAYER.speed);
    expect(d.attackCooldown).toBe(PLAYER.attackCooldown);
    expect(d.critChance).toBe(PLAYER.critChance);
    expect(d.skillPower).toBe(1);
  });

  it("each stat improves its own value", () => {
    const base = derive(newProgress().stats);
    const up = (k: (typeof STAT_KEYS)[number]) => {
      const p = newProgress();
      p.stats[k] += 10;
      return derive(p.stats);
    };
    expect(up("str").damage).toBeGreaterThan(base.damage);
    expect(up("agi").moveSpeed).toBeGreaterThan(base.moveSpeed);
    expect(up("agi").attackCooldown).toBeLessThan(base.attackCooldown);
    expect(up("vit").maxHp).toBeGreaterThan(base.maxHp);
    expect(up("sen").critChance).toBeGreaterThan(base.critChance);
    expect(up("int").maxMana).toBeGreaterThan(base.maxMana);
    expect(up("int").skillPower).toBeGreaterThan(base.skillPower);
  });

  it("caps crit chance", () => {
    const p = newProgress();
    p.stats.sen = 999;
    expect(derive(p.stats).critChance).toBe(CRIT_CAP);
  });
});

describe("xpToNext", () => {
  it("rises with every level", () => {
    for (let l = 1; l < LEVEL_CAP - 1; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it("is infinite at the cap", () => {
    expect(xpToNext(LEVEL_CAP)).toBe(Infinity);
  });
});

describe("addXp", () => {
  it("keeps the remainder after a level-up", () => {
    const p = newProgress();
    expect(addXp(p, xpToNext(1) + 7)).toBe(1);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(7);
    expect(p.points).toBe(POINTS_PER_LEVEL);
  });

  it("levels several times from one large award", () => {
    const p = newProgress();
    const gained = addXp(p, xpToNext(1) + xpToNext(2) + xpToNext(3));
    expect(gained).toBe(3);
    expect(p.level).toBe(4);
    expect(p.points).toBe(3 * POINTS_PER_LEVEL);
  });

  it("stops at the level cap and holds no spare experience", () => {
    const p = newProgress();
    addXp(p, 1e9);
    expect(p.level).toBe(LEVEL_CAP);
    expect(p.xp).toBe(0);
    expect(p.points).toBe((LEVEL_CAP - 1) * POINTS_PER_LEVEL);
    expect(addXp(p, 500)).toBe(0);
    expect(p.xp).toBe(0);
  });

  it("ignores negative amounts", () => {
    const p = newProgress();
    addXp(p, -50);
    expect(p.xp).toBe(0);
  });
});

describe("allocate", () => {
  it("spends one point on one stat", () => {
    const p = newProgress();
    p.points = 2;
    expect(allocate(p, "agi")).toBe(true);
    expect(p.stats.agi).toBe(BASE_STAT + 1);
    expect(p.points).toBe(1);
  });

  it("refuses when no points remain", () => {
    const p = newProgress();
    expect(allocate(p, "str")).toBe(false);
    expect(p.stats.str).toBe(BASE_STAT);
  });
});
