import { describe, expect, it } from "vitest";
import { PLAYER } from "./config";
import { BOSS_DROP, describeBonus, gearBonus, ITEMS, sellValue, SHOP_STOCK, sumBonus, TITLES } from "./items";
import { derive, newProgress } from "./stats";

describe("items", () => {
  it("the shop sells nine items and never a boss drop", () => {
    expect(SHOP_STOCK.length).toBe(9);
    for (const id of SHOP_STOCK) expect(ITEMS[id].unique).toBeFalsy();
  });

  it("every boss drop is a real, unique item", () => {
    for (const id of Object.values(BOSS_DROP)) expect(ITEMS[id!].unique).toBe(true);
  });

  it("sells for half the price", () => {
    expect(sellValue("iron_fang")).toBe(30);
  });

  it("sums bonuses across parts", () => {
    expect(sumBonus([{ damage: 3 }, { damage: 4, hp: 20 }, { crit: 0.03 }])).toEqual({
      damage: 7,
      hp: 20,
      mana: 0,
      crit: 0.03,
      speedPct: 0,
      damagePct: 0,
    });
  });

  it("combines equipped items with the active title", () => {
    const b = gearBonus({ weapon: "iron_fang", armour: "padded_coat" }, "giant_feller");
    expect(b.damage).toBe(3);
    expect(b.hp).toBe(30);
  });

  it("ignores an unknown item or title", () => {
    expect(gearBonus({ weapon: "nope" }, "nope")).toEqual(sumBonus([]));
  });

  it("describes a bonus in words", () => {
    expect(describeBonus({ damage: 7, crit: 0.03 })).toBe("+7 damage, +3% crit");
  });

  it("every title has a bonus and an explanation", () => {
    for (const t of TITLES) {
      expect(describeBonus(t.bonus)).not.toBe("");
      expect(t.how).not.toBe("");
    }
  });
});

describe("derive with gear", () => {
  const stats = newProgress().stats;

  it("adds flat bonuses, then applies percentages", () => {
    const d = derive(stats, { damage: 2, damagePct: 0.5, hp: 20, mana: 12, speedPct: 0.1, crit: 0.08 });
    expect(d.damage).toBeCloseTo((PLAYER.attackDamage + 2) * 1.5);
    expect(d.maxHp).toBe(PLAYER.maxHp + 20);
    expect(d.maxMana).toBe(PLAYER.maxMana + 12);
    expect(d.moveSpeed).toBeCloseTo(PLAYER.speed * 1.1);
    expect(d.critChance).toBeCloseTo(PLAYER.critChance + 0.08);
  });
});
