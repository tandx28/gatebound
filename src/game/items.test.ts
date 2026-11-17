import { describe, expect, it } from "vitest";
import { PLAYER } from "./config";
import { seeded } from "../engine/rng";
import { BOSS_DROP, describeBonus, gearBonus, ITEMS, RARITIES, rollStock, sellValue, SHOP_POOL, SHOP_SLOTS, sumBonus, TITLES } from "./items";
import { derive, newProgress } from "./stats";

describe("items", () => {
  it("the shop pool holds every rarity and never a unique drop", () => {
    expect(SHOP_POOL.length).toBe(41);
    for (const id of SHOP_POOL) expect(ITEMS[id].rarity).not.toBe("mythic");
    for (const id of SHOP_POOL) expect(ITEMS[id].unique).toBeFalsy();
    for (const r of RARITIES) expect(SHOP_POOL.some((id) => ITEMS[id].rarity === r)).toBe(true);
  });

  it("rarer items cost more", () => {
    const price = (r: string) => ITEMS[SHOP_POOL.find((id) => ITEMS[id].rarity === r)!].price;
    expect(price("common")).toBeLessThan(price("uncommon"));
    expect(price("uncommon")).toBeLessThan(price("rare"));
    expect(price("rare")).toBeLessThan(price("epic"));
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

describe("rollStock", () => {
  it("gives six distinct items from the pool", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const stock = rollStock(seeded(seed));
      expect(stock.length).toBe(SHOP_SLOTS);
      expect(new Set(stock).size).toBe(SHOP_SLOTS);
      for (const id of stock) expect(SHOP_POOL).toContain(id);
    }
  });

  it("is the same for the same seed and differs between seeds", () => {
    expect(rollStock(seeded(9))).toEqual(rollStock(seeded(9)));
    const all = new Set(Array.from({ length: 20 }, (_, i) => rollStock(seeded(i + 1)).join()));
    expect(all.size).toBeGreaterThan(15);
  });

  it("never offers an excluded item", () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(rollStock(seeded(seed), ["iron_fang", "padded_coat"])).not.toContain("iron_fang");
    }
  });

  it("returns fewer items when the pool runs short", () => {
    expect(rollStock(seeded(1), SHOP_POOL.slice(2)).sort()).toEqual(SHOP_POOL.slice(0, 2).sort());
  });

  it("offers common items far more often than epic ones", () => {
    const seen = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    for (let seed = 1; seed <= 400; seed++) for (const id of rollStock(seeded(seed))) seen[ITEMS[id].rarity] += 1;
    expect(seen.common).toBeGreaterThan(seen.rare);
    expect(seen.uncommon).toBeGreaterThan(seen.epic);
    expect(seen.common).toBeGreaterThan(seen.epic * 2);
    expect(seen.epic).toBeGreaterThan(0);
    // Legendaries and mythics never come from an ordinary roll.
    expect(seen.legendary + seen.mythic).toBe(0);
  });
});
