import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import { makeAlly } from "./allies";
import { DOMINION, KINDS, PLAYER, RANK_IDS, ROOM, SKILLS, STEP, type EnemyKind, type Rank } from "./config";
import { damageEnemy, makeEnemy } from "./enemies";
import {
  ALL_RARITIES,
  ANTIDOTE,
  BAG,
  baseOf,
  BOW,
  describeItem,
  DROP_WEIGHT,
  DROPS,
  FLASK,
  FURY,
  gearBonus,
  gearPerks,
  gearPowers,
  itemDef,
  itemName,
  ITEMS,
  makeItem,
  MYTHIC_ODDS,
  MYTHICS,
  PERK,
  PERK_COUNT,
  PERK_IDS,
  PERKS,
  perksOf,
  POTION,
  rollDrop,
  rollPerks,
  sellValue,
  SHOP_POOL,
  WEAPONS,
  type WeaponType,
} from "./items";
import { BELT, grantMythic, hubAction, refreshDerived, restock, settleClear, settleDeath, syncDay } from "./profile";
import { applySave, parseSave, SAVE_VERSION, toSave } from "./save";
import { afflict, healPlayer } from "./state";
import { bagPage, BAG_PAGE, hubButtons, pointIn } from "./ui";
import { createWorld, effective, enterArena, enterBreak, enterGate, enterRoom, step, toSelect, weaponOf, type Enemy, type World } from "./world";

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

/** An arena, with the given gear worn. Weapons fill the two weapon slots in order. */
function arena(gear: string[] = [], rng: () => number = () => 0.5, rank: Rank = "E"): { w: World; c: FakeControls } {
  const w = createWorld(rng);
  w.profile.inventory = [...gear];
  for (let i = 0; i < gear.length; i++) hubAction(w, "equip:0");
  enterArena(w, rank);
  return { w, c: new FakeControls() };
}

function add(w: World, kind: EnemyKind, dx: number, dy: number, hp = 1e6): Enemy {
  const e = makeEnemy(kind, w.player.x + dx, w.player.y + dy, w.rank);
  e.state = "recover";
  e.t = 999;
  e.hp = e.maxHp = hp;
  w.enemies.push(e);
  return e;
}

const dealt = (e: Enemy) => e.maxHp - e.hp;

describe("an owned item is its base plus its perks", () => {
  it("round-trips through its text form", () => {
    const owned = makeItem("iron_fang", ["poison", "chain"]);
    expect(owned).toBe("iron_fang+poison+chain");
    expect(baseOf(owned)).toBe("iron_fang");
    expect(perksOf(owned)).toEqual(["poison", "chain"]);
    expect(itemDef(owned)).toBe(ITEMS.iron_fang);
  });

  it("a plain id from an older save is still a valid item with no perks", () => {
    expect(baseOf("iron_fang")).toBe("iron_fang");
    expect(perksOf("iron_fang")).toEqual([]);
    expect(itemName("iron_fang")).toBe("Iron Fang");
  });

  it("is named after its first perk, and described with its type and perks", () => {
    expect(itemName("iron_fang+poison+chain")).toBe("Venomous Iron Fang");
    expect(describeItem("iron_fang+poison")).toBe("common · dagger · +3 damage · poison");
    expect(describeItem("wardens_knuckle")).toContain("unique");
  });

  it("unknown perks are ignored", () => {
    expect(perksOf("iron_fang+nonsense+poison")).toEqual(["poison"]);
  });

  it("a perk adds to what it sells for; a mythic cannot be sold", () => {
    expect(sellValue("iron_fang")).toBe(30);
    expect(sellValue("iron_fang+poison")).toBe(36);
    expect(sellValue("ashen_wake")).toBe(0);
  });
});

describe("perk rolls", () => {
  it("give each rarity its number of perks: none, one, two, three, four", () => {
    expect(PERK_COUNT).toEqual({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 4 });
    for (const id of Object.keys(ITEMS)) {
      for (let seed = 1; seed <= 5; seed++) {
        const def = ITEMS[id];
        const perks = rollPerks(id, seeded(seed));
        const pool = PERK_IDS.filter((p) => PERKS[p].slots.includes(def.slot)).length;
        expect(perks.length).toBe(def.unique ? 0 : Math.min(PERK_COUNT[def.rarity], pool));
        expect(new Set(perks).size).toBe(perks.length);
        for (const p of perks) expect(PERKS[p].slots).toContain(def.slot);
      }
    }
  });

  it("are the same for the same seed, and vary between seeds", () => {
    expect(rollPerks("nightglass", seeded(4))).toEqual(rollPerks("nightglass", seeded(4)));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => rollPerks("nightglass", seeded(i + 1)).sort().join()));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe("drops", () => {
  it("are always real, sellable gear: never a unique or a mythic", () => {
    for (const rank of RANK_IDS) {
      for (let seed = 1; seed <= 80; seed++) {
        const def = itemDef(rollDrop(rank, seeded(seed)))!;
        expect(SHOP_POOL).toContain(def.id);
      }
    }
  });

  it("get better with rank, and legendaries fall only in Rank A and S", () => {
    const tally = (rank: Rank) => {
      const n = Object.fromEntries(ALL_RARITIES.map((r) => [r, 0])) as Record<string, number>;
      for (let seed = 1; seed <= 600; seed++) n[itemDef(rollDrop(rank, seeded(seed)))!.rarity] += 1;
      return n;
    };
    const e = tally("E");
    const s = tally("S");
    expect(e.common).toBeGreaterThan(s.common);
    expect(s.epic).toBeGreaterThan(e.epic);
    expect(e.legendary + tally("C").legendary + tally("B").legendary).toBe(0);
    expect(tally("A").legendary).toBeGreaterThan(0);
    expect(s.legendary).toBeGreaterThan(tally("A").legendary);
    for (const r of RANK_IDS) expect(DROP_WEIGHT[r].mythic).toBe(0);
  });

  it("a regular enemy drops gear about one time in twenty-five; a boss always", () => {
    let drops = 0;
    const rng = seeded(7);
    for (let i = 0; i < 1500; i++) {
      const w = createWorld(rng);
      enterArena(w);
      const e = add(w, "swarmer", 300, 0);
      e.hp = 0;
      step(w, new FakeControls(), STEP);
      drops += w.run.items.length;
    }
    expect(drops / 1500).toBeGreaterThan(DROPS.chance * 0.5);
    expect(drops / 1500).toBeLessThan(DROPS.chance * 1.7);

    const { w, c } = arena();
    const boss = add(w, "warden", 300, 0);
    boss.hp = 0;
    run(w, c, 0.02);
    expect(w.run.items.length).toBeGreaterThanOrEqual(2);
    expect(w.run.items).toContain("wardens_knuckle");
  });

  it("what was found is lost on death", () => {
    const { w } = arena();
    w.run.items = ["iron_fang+poison"];
    settleDeath(w);
    expect(w.profile.inventory).toEqual([]);
  });

  it("a full bag turns the overflow into gold", () => {
    const { w } = arena();
    w.profile.inventory = Array.from({ length: DROPS.bagSize }, () => "iron_fang");
    w.run.items = ["scale_vest", "padded_coat"];
    w.run.usedPotion = true;
    settleClear(w);
    expect(w.profile.inventory.length).toBe(DROPS.bagSize);
    expect(w.profile.gold).toBe(sellValue("scale_vest") + sellValue("padded_coat"));
  });
});

describe("weapon types", () => {
  it("bare hands fight like a dagger, without its crit", () => {
    const { w } = arena();
    expect(w.player.weapon).toBe(null);
    expect(weaponOf(w.player).range).toBe(WEAPONS.dagger.range);
    expect(w.player.d.critChance).toBe(PLAYER.critChance);
    expect(w.player.d.attackCooldown).toBe(PLAYER.attackCooldown);
  });

  it("a dagger adds crit; a sword and a spear attack more slowly", () => {
    const pace = (id: string) => arena([id]).w.player.d;
    expect(pace("iron_fang").critChance).toBeCloseTo(PLAYER.critChance + WEAPONS.dagger.crit);
    expect(pace("militia_sword").attackCooldown).toBeCloseTo(WEAPONS.sword.cooldown);
    expect(pace("ash_spear").attackCooldown).toBeCloseTo(WEAPONS.spear.cooldown);
    expect(pace("short_bow").attackCooldown).toBeCloseTo(WEAPONS.bow.cooldown);
  });

  it("each type's basic attack hits for its own multiple", () => {
    const hit = (id: string, type: WeaponType) => {
      const { w, c } = arena([id]);
      const e = add(w, "swarmer", 45, 0);
      c.attackHeld = true;
      run(w, c, 0.05);
      return dealt(e) / (PLAYER.attackDamage + ITEMS[id].bonus.damage!) / WEAPONS[type].damage;
    };
    expect(hit("iron_fang", "dagger")).toBeCloseTo(1, 1);
    expect(hit("militia_sword", "sword")).toBeCloseTo(1, 1);
    expect(hit("ash_spear", "spear")).toBeCloseTo(1, 1);
  });

  it("a sword's wide arc reaches enemies a dagger's misses", () => {
    const side = (id: string) => {
      const { w, c } = arena([id]);
      const e = add(w, "swarmer", 15, 55);
      c.attackHeld = true;
      run(w, c, 0.05);
      return dealt(e) > 0;
    };
    expect(side("iron_fang")).toBe(false);
    expect(side("militia_sword")).toBe(true);
  });

  it("a spear reaches far in a thin line and strikes everything along it", () => {
    const { w, c } = arena(["ash_spear"]);
    const near = add(w, "swarmer", 50, 0);
    const far = add(w, "swarmer", 140, 0);
    const wide = add(w, "swarmer", 90, 60);
    c.attackHeld = true;
    run(w, c, 0.05);
    expect(dealt(near)).toBeGreaterThan(0);
    expect(dealt(far)).toBeGreaterThan(0);
    expect(dealt(wide)).toBe(0);
  });

  it("a bow looses an arrow that hits the first enemy in its path, and slows the archer", () => {
    const { w, c } = arena(["short_bow"]);
    const first = add(w, "swarmer", 300, 0);
    const behind = add(w, "swarmer", 420, 0);
    c.attackHeld = true;
    run(w, c, 0.02);
    expect(w.allyShots.length).toBe(1);
    expect(w.allyShots[0].mine).toBe(true);
    c.attackHeld = false;
    run(w, c, 0.5);
    expect(dealt(first)).toBe(Math.round((PLAYER.attackDamage + 3) * WEAPONS.bow.damage));
    expect(dealt(behind)).toBe(0);

    const walk = (held: boolean) => {
      const a = arena(["short_bow"]);
      a.c.move = { x: 0, y: 1 };
      a.c.attackHeld = held;
      const y0 = a.w.player.y;
      run(a.w, a.c, 0.5);
      return a.w.player.y - y0;
    };
    expect(walk(true) / walk(false)).toBeCloseTo(BOW.drawSpeed, 1);
  });
});

describe("two weapon slots", () => {
  it("a second weapon fills the second slot; a third replaces the one in hand", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = ["iron_fang", "short_bow", "ash_spear"];
    hubAction(w, "equip:iron_fang");
    hubAction(w, "equip:short_bow");
    expect(w.profile.equipped).toMatchObject({ weapon: "iron_fang", weapon2: "short_bow" });
    hubAction(w, "equip:ash_spear");
    expect(w.profile.equipped.weapon).toBe("ash_spear");
    expect(w.profile.inventory).toEqual(["iron_fang"]);
  });

  it("only the weapon in hand counts toward stats", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = ["iron_fang", "nightglass"];
    hubAction(w, "equip:iron_fang");
    hubAction(w, "equip:nightglass");
    expect(w.player.d.damage).toBe(PLAYER.attackDamage + 3);
    hubAction(w, "weapon:swap");
    expect(w.profile.activeWeapon).toBe(1);
    expect(w.player.d.damage).toBe(PLAYER.attackDamage + 20);
  });

  it("X swaps in a fight, with a short wait before the next swap", () => {
    const { w, c } = arena(["iron_fang", "short_bow"]);
    expect(w.player.weapon).toBe("dagger");
    c.press("KeyX");
    run(w, c, 0.02);
    expect(w.player.weapon).toBe("bow");
    c.press("KeyX");
    run(w, c, 0.02);
    expect(w.player.weapon).toBe("bow");
    run(w, c, 1);
    c.press("KeyX");
    run(w, c, 0.02);
    expect(w.player.weapon).toBe("dagger");
  });

  it("with one weapon, X and the swap button do nothing", () => {
    const { w, c } = arena(["iron_fang"]);
    c.press("KeyX");
    run(w, c, 0.02);
    expect(w.profile.activeWeapon).toBe(0);
    hubAction(w, "weapon:swap");
    expect(w.profile.activeWeapon).toBe(0);
  });

  it("removing the weapon in hand takes up the other", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = ["iron_fang", "short_bow"];
    hubAction(w, "equip:iron_fang");
    hubAction(w, "equip:short_bow");
    hubAction(w, "unequip:weapon");
    expect(w.profile.activeWeapon).toBe(1);
    expect(w.player.weapon).toBe("bow");
  });

  it("gear bonus, perks and powers read only the worn slots", () => {
    const eq = { weapon: "iron_fang+poison", weapon2: "ashen_wake+chain", armour: "padded_coat" };
    expect(gearBonus(eq, null, 0).damage).toBe(3);
    expect(gearPerks(eq, 0)).toMatchObject({ poison: 1, chain: 0 });
    expect(gearPowers(eq, 0)).toEqual([]);
    expect(gearPowers(eq, 1)).toEqual(["ashen_wake"]);
  });
});

describe("perks in a fight", () => {
  /** One basic hit on a dummy with this weapon, with a fixed roll (no crit at 0.5). */
  function oneHit(weapon: string, others: [number, number][] = [], rng: () => number = () => 0.5) {
    const { w, c } = arena([weapon], rng);
    const e = add(w, "swarmer", 45, 0);
    const rest = others.map(([dx, dy]) => add(w, "swarmer", dx, dy));
    c.attackHeld = true;
    run(w, c, 0.05);
    c.attackHeld = false;
    return { w, c, e, rest, base: dealt(e) };
  }

  it("vampire heals a share of the damage dealt", () => {
    const { w, c } = arena(["militia_sword+lifesteal"]);
    add(w, "swarmer", 45, 0);
    w.player.hp = 10;
    c.attackHeld = true;
    run(w, c, 6);
    expect(w.player.hp).toBeGreaterThan(10);
    expect(healPlayer(w, 0)).toBe(0);
  });

  it("poison keeps taking a further 30% over three seconds", () => {
    const { w, c, e, base } = oneHit("iron_fang+poison");
    w.player.iframes = 99;
    run(w, c, PERK.poison.time + 0.2);
    expect(dealt(e) - base).toBeCloseTo(base * PERK.poison.share, 0);
  });

  it("poison can finish an enemy, and the kill is the player's", () => {
    const { w, c } = arena(["iron_fang+poison"]);
    const e = add(w, "swarmer", 45, 0, 13);
    c.attackHeld = true;
    run(w, c, 0.05);
    c.attackHeld = false;
    expect(e.hp).toBeGreaterThan(0);
    run(w, c, 3.2);
    expect(w.enemies).toEqual([]);
    expect(w.kills).toBe(1);
  });

  it("bleed is set only by a crit", () => {
    const plain = oneHit("iron_fang+bleed");
    expect(plain.e.dotT).toBe(0);
    const crit = oneHit("iron_fang+bleed", [], () => 0.001);
    expect(crit.e.dotT).toBeGreaterThan(0);
  });

  it("frost slows the enemy it hits", () => {
    const { e } = oneHit("iron_fang+frost");
    expect(e.chillT).toBeGreaterThan(0);
    expect(PERK.frost.speed).toBeLessThan(1);
  });

  it("chain arcs to the two nearest others for a share, and never chains again", () => {
    const { e, rest, base } = oneHit("iron_fang+chain", [
      [45, 90],
      [45, -100],
      [45, 150],
      [600, 0],
    ]);
    expect(dealt(rest[0])).toBe(Math.round(base * PERK.chain.share));
    expect(dealt(rest[1])).toBe(Math.round(base * PERK.chain.share));
    expect(dealt(rest[2])).toBe(0);
    expect(dealt(rest[3])).toBe(0);
    expect(dealt(e)).toBe(base);
  });

  it("burn scorches enemies close to the one hit", () => {
    // The first stands just behind the target, out of the dagger's own reach.
    const { rest, base } = oneHit("iron_fang+burn", [
      [110, 0],
      [45, 300],
    ]);
    expect(dealt(rest[0])).toBe(Math.round(base * PERK.burn.share));
    expect(dealt(rest[1])).toBe(0);
  });

  it("thorns hurts whatever is close when the player is hit", () => {
    const { w, c } = arena(["padded_coat+thorns"]);
    const near = add(w, "swarmer", 60, 0);
    const far = add(w, "swarmer", 400, 0);
    w.projectiles.push({ x: w.player.x, y: w.player.y, radius: 7, vx: 0, vy: 0, damage: 5, life: 1 });
    run(w, c, 0.05);
    expect(dealt(near)).toBe(PLAYER.attackDamage);
    expect(dealt(far)).toBe(0);
  });

  it("dodge avoids a share of hits entirely", () => {
    const take = (rng: () => number) => {
      const { w, c } = arena(["padded_coat+dodge"], rng);
      w.projectiles.push({ x: w.player.x, y: w.player.y, radius: 7, vx: 0, vy: 0, damage: 5, life: 1 });
      run(w, c, 0.05);
      return w.player.d.maxHp - w.player.hp;
    };
    expect(take(() => 0.01)).toBe(0);
    expect(take(() => 0.9)).toBe(5);
  });

  it("siphon gives mana for a kill, and gilded more gold", () => {
    const { w, c } = arena(["padded_coat+siphon", "runners_band+gilded"]);
    w.player.mana = 0;
    const e = add(w, "swarmer", 300, 0, 5);
    e.hp = 0;
    run(w, c, 0.02);
    expect(w.player.mana).toBeGreaterThanOrEqual(PERK.siphon);
    expect(w.run.gold).toBe(Math.round(KINDS.swarmer.xp * 0.6 * (1 + PERK.gilded)));
  });

  it("the same perk on two items counts twice", () => {
    const { w } = arena(["padded_coat+dodge", "runners_band+dodge"]);
    expect(w.player.perks.dodge).toBe(2);
  });

  it("an echo's shot carries none of the player's perks", () => {
    const { w, c } = arena(["iron_fang+poison"]);
    const e = add(w, "swarmer", 200, 0);
    w.allyShots.push({ x: w.player.x + 150, y: w.player.y, radius: 7, vx: 400, vy: 0, damage: 10, life: 1 });
    run(w, c, 0.3);
    expect(dealt(e)).toBe(10);
    expect(e.dotT).toBe(0);
  });
});

describe("mythic powers", () => {
  it("Ashen Wake: a dash cuts each enemy it passes through, once", () => {
    const { w, c } = arena(["ashen_wake"]);
    const e = add(w, "swarmer", 60, 0);
    c.press("Space");
    run(w, c, 0.3);
    expect(dealt(e)).toBe(Math.round((PLAYER.attackDamage + 38) * 1.5));
  });

  it("Twin Fang: every fifth hit lands twice", () => {
    const { w, c } = arena(["twin_fang"]);
    const e = add(w, "swarmer", 45, 0);
    const one = Math.round((PLAYER.attackDamage + 38) * WEAPONS.sword.damage);
    c.attackHeld = true;
    for (let hits = 1; hits <= 5; hits++) {
      while (w.player.hits < hits) step(w, c, STEP);
      expect(dealt(e)).toBe(one * (hits + (hits === 5 ? 1 : 0)));
    }
  });

  it("Trial's End: a kill makes Pierce ready again", () => {
    const { w, c } = arena(["trials_end"]);
    w.player.skillCd.pierce = 3;
    const e = add(w, "swarmer", 300, 0, 5);
    e.hp = 0;
    run(w, c, 0.02);
    expect(w.player.skillCd.pierce).toBe(0);
  });

  it("Crown of the Hollow: echoes hit a quarter harder and cannot be turned", () => {
    const base = 100;
    const { w, c } = arena(["hollow_crown"], () => 0.5, "S");
    w.profile.classUnlocked = true;
    w.profile.echoes = [{ kind: "swarmer", rank: "E", active: true }];
    enterArena(w, "S");
    const plain = makeAlly({ kind: "swarmer", rank: "E", active: true }, 0, 0, w.player.d.damage);
    expect(w.allies[0].dmg).toBeCloseTo(plain.dmg * 1.25);
    expect(base).toBe(100);
    w.player.iframes = 9999;
    const m = add(w, "monarch", 380, 0, 1e9);
    m.phase = 3;
    m.state = "idle";
    m.cd2 = 0;
    run(w, c, DOMINION.cast + 1);
    expect(w.turnedT).toBe(0);
  });

  it("Seal-Breaker: no ailment takes hold", () => {
    const { w } = arena(["seal_breaker"]);
    afflict(w, "poison");
    afflict(w, "burn");
    afflict(w, "slow");
    expect(w.player.ail).toMatchObject({ poison: 0, burnT: 0, slowT: 0 });
  });

  it("Untouched Mantle: the first hit in each room does nothing", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    w.hiddenChance = 0;
    w.profile.inventory = ["untouched_mantle"];
    hubAction(w, "equip:0");
    enterGate(w, "E", { sealed: false });
    const shoot = () => w.projectiles.push({ x: w.player.x, y: w.player.y, radius: 7, vx: 0, vy: 0, damage: 5, life: 1 });
    const max = w.player.d.maxHp;
    shoot();
    run(w, c, 0.05);
    expect(w.player.hp).toBe(max);
    w.player.iframes = 0;
    shoot();
    run(w, c, 0.05);
    expect(w.player.hp).toBe(max - 5);
    enterRoom(w, 0, null);
    expect(w.wardReady).toBe(true);
  });

  it("Breakwater: below 30% health, double damage and no healing", () => {
    const { w } = arena(["breakwater"]);
    const full = effective(w.player).damage;
    w.player.hp = Math.floor(w.player.d.maxHp * 0.2);
    expect(effective(w.player).damage).toBeCloseTo(full * 2);
    const hp = w.player.hp;
    expect(healPlayer(w, 50)).toBe(0);
    w.profile.potions = 1;
    step(w, Object.assign(new FakeControls(), {}), STEP);
    expect(w.player.hp).toBe(hp);
  });

  it("The Ledger's Favour: a cleared room puts a sip back in the flask", () => {
    const w = createWorld(seeded(11));
    const c = new FakeControls();
    w.hiddenChance = 0;
    w.profile.inventory = ["ledgers_favour"];
    hubAction(w, "equip:0");
    enterGate(w, "E", { sealed: false });
    w.profile.flask.charges = 0;
    enterRoom(w, w.dungeon!.rooms.find((r) => r.kind === "normal")!.id, null);
    for (const e of w.enemies) e.hp = 0;
    run(w, c, 0.02);
    expect(w.profile.flask.charges).toBe(1);
  });
});

describe("earning mythics", () => {
  it("there are eight, each a real item with a power", () => {
    expect(MYTHICS.length).toBe(8);
    for (const m of MYTHICS) {
      expect(ITEMS[m.id].rarity).toBe("mythic");
      expect(ITEMS[m.id].power).toBe(m.id);
      expect(SHOP_POOL).not.toContain(m.id);
    }
  });

  it("each comes only once", () => {
    const w = createWorld(seeded(1));
    expect(grantMythic(w, "breakwater", false)).toBe(true);
    expect(grantMythic(w, "breakwater", false)).toBe(false);
    expect(w.profile.inventory.filter((x) => baseOf(x) === "breakwater").length).toBe(1);
    expect(w.profile.mythics).toEqual(["breakwater"]);
    expect(perksOf(w.profile.inventory[0]).length).toBe(4);
  });

  it("a late boss gives its mythic by the fifth kill at the latest", () => {
    const w = createWorld(() => 0.99);
    const c = new FakeControls();
    for (let kill = 1; kill <= MYTHIC_ODDS.pity; kill++) {
      enterArena(w, "B");
      const q = add(w, "queen", 300, 0);
      q.hp = 0;
      run(w, c, 0.02);
      const got = w.run.items.some((x) => baseOf(x) === "ashen_wake");
      expect(got).toBe(kill === MYTHIC_ODDS.pity);
      run(w, c, 2.5);
    }
    expect(w.profile.mythics).toContain("ashen_wake");
  });

  it("a boss's mythic lost to a death is not marked earned, and drops again", () => {
    const w = createWorld(() => 0.99);
    const c = new FakeControls();
    w.profile.bossKills.queen = MYTHIC_ODDS.pity;
    enterArena(w, "B");
    w.run.items = ["ashen_wake"];
    settleDeath(w);
    expect(w.profile.mythics).toEqual([]);
    enterArena(w, "B");
    const q = add(w, "queen", 300, 0);
    q.hp = 0;
    run(w, c, 0.02);
    expect(w.run.items.some((x) => baseOf(x) === "ashen_wake")).toBe(true);
  });

  it("a clean clear of Rank B or higher earns the Mantle; of Rank C it does not", () => {
    const clear = (rank: Rank) => {
      const w = createWorld(seeded(1));
      enterArena(w, rank);
      settleClear(w);
      return w.profile.mythics.includes("untouched_mantle");
    };
    expect(clear("C")).toBe(false);
    expect(clear("B")).toBe(true);
  });

  it("clearing a sealed gate of Rank A or higher earns Seal-Breaker", () => {
    const clear = (rank: Rank, sealed: boolean) => {
      const w = createWorld(seeded(1));
      enterArena(w, rank);
      w.sealed = sealed;
      w.run.tookDamage = true;
      settleClear(w);
      return w.profile.mythics.includes("seal_breaker");
    };
    expect(clear("A", false)).toBe(false);
    expect(clear("B", true)).toBe(false);
    expect(clear("A", true)).toBe(true);
  });

  it("holding a Rank S gate break earns Breakwater", () => {
    const w = createWorld(seeded(1));
    w.profile.hunterRank = "S";
    enterBreak(w);
    settleClear(w);
    expect(w.profile.mythics).toContain("breakwater");
  });

  it("the thirtieth daily quest earns the Ledger's Favour", () => {
    const w = createWorld(seeded(1));
    w.today = 100;
    syncDay(w);
    w.profile.dailiesDone = 29;
    w.profile.daily = { day: 100, kills: 39, rooms: 99, gates: 99, done: false };
    enterArena(w);
    const e = add(w, "swarmer", 300, 0, 5);
    e.hp = 0;
    step(w, new FakeControls(), STEP);
    expect(w.profile.dailiesDone).toBe(30);
    expect(w.profile.mythics).toContain("ledgers_favour");
  });
});

describe("the shop", () => {
  it("stocks items with their perks rolled, the same all day", () => {
    const w = createWorld(seeded(1));
    w.profile.hunterRank = "C";
    w.today = 77;
    syncDay(w);
    const stock = [...w.profile.shop.stock];
    expect(stock.length).toBe(6);
    for (const owned of stock) expect(perksOf(owned).length).toBe(PERK_COUNT[itemDef(owned)!.rarity]);
    syncDay(w);
    expect(w.profile.shop.stock).toEqual(stock);
  });

  it("puts a legendary on the shelf only for Rank A and up, and only some days", () => {
    const has = (rank: Rank, day: number) => {
      const w = createWorld(seeded(1));
      w.profile.hunterRank = rank;
      w.today = day;
      syncDay(w);
      return w.profile.shop.stock.some((x) => itemDef(x)!.rarity === "legendary");
    };
    expect(has("A", DROPS.legendaryDayEvery * 20)).toBe(true);
    expect(has("A", DROPS.legendaryDayEvery * 20 + 1)).toBe(false);
    expect(has("C", DROPS.legendaryDayEvery * 20)).toBe(false);
  });

  it("buys by position, and treats any item of an owned base as owned", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 1000;
    w.profile.shop.stock = ["iron_fang+poison", "padded_coat"];
    hubAction(w, "buy:0");
    expect(w.profile.inventory).toEqual(["iron_fang+poison"]);
    hubAction(w, "buy:0");
    expect(w.profile.inventory.length).toBe(1);
    hubAction(w, "buy:9");
    expect(w.profile.inventory.length).toBe(1);
  });

  it("sells one of several alike, by position", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = ["iron_fang", "iron_fang+poison", "iron_fang"];
    hubAction(w, "sell:1");
    expect(w.profile.inventory).toEqual(["iron_fang", "iron_fang"]);
    expect(w.profile.gold).toBe(sellValue("iron_fang+poison"));
  });

  it("will not sell a mythic", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = ["breakwater"];
    hubAction(w, "sell:0");
    expect(w.profile.inventory).toEqual(["breakwater"]);
  });
});

describe("consumables", () => {
  it("each has its own limit; the greater potion needs Rank B", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 99999;
    for (let i = 0; i < 6; i++) for (const id of ["mana", "fury", "antidote", "greater"]) hubAction(w, `buy:${id}`);
    expect(w.profile.bag).toEqual({ greater: 0, mana: BAG.mana.max, fury: BAG.fury.max, antidote: BAG.antidote.max });
    w.profile.hunterRank = "B";
    hubAction(w, "buy:greater");
    hubAction(w, "buy:greater");
    expect(w.profile.bag.greater).toBe(BAG.greater.max);
  });

  it("V drinks a mana potion, but not at full mana", () => {
    const { w, c } = arena();
    w.profile.bag.mana = 2;
    c.press("KeyV");
    run(w, c, 0.02);
    expect(w.profile.bag.mana).toBe(2);
    w.player.mana = 0;
    c.press("KeyV");
    run(w, c, 0.02);
    expect(w.player.mana).toBeGreaterThan(w.player.d.maxMana - 1);
    expect(w.profile.bag.mana).toBe(1);
  });

  it("Z moves the belt to the next thing there is any of, and B uses it", () => {
    const { w, c } = arena();
    w.profile.flask.charges = 0;
    w.profile.bag.fury = 1;
    expect(BELT[w.belt]).toBe("flask");
    c.press("KeyZ");
    run(w, c, 0.02);
    expect(BELT[w.belt]).toBe("fury");
    c.press("KeyB");
    run(w, c, 0.02);
    expect(w.player.furyT).toBeGreaterThan(FURY.time - 1);
    expect(effective(w.player).damage).toBeCloseTo(PLAYER.attackDamage * FURY.damage);
    run(w, c, FURY.time + 0.1);
    expect(effective(w.player).damage).toBe(PLAYER.attackDamage);
  });

  it("an antidote clears every ailment and wards them off for a while", () => {
    const { w, c } = arena();
    w.profile.bag.antidote = 1;
    afflict(w, "poison");
    afflict(w, "slow");
    w.belt = BELT.indexOf("antidote");
    c.press("KeyB");
    run(w, c, 0.02);
    expect(w.player.ail.poison).toBe(0);
    expect(w.player.ail.slowT).toBe(0);
    afflict(w, "burn");
    expect(w.player.ail.burnT).toBe(0);
    run(w, c, ANTIDOTE.immune + 0.1);
    afflict(w, "burn");
    expect(w.player.ail.burnT).toBeGreaterThan(0);
  });

  it("the greater potion restores everything and counts as a potion drunk", () => {
    const { w, c } = arena();
    w.profile.bag.greater = 1;
    w.player.hp = 3;
    w.belt = BELT.indexOf("greater");
    c.press("KeyB");
    run(w, c, 0.02);
    expect(w.player.hp).toBe(w.player.d.maxHp);
    expect(w.run.usedPotion).toBe(true);
  });

  it("the flask heals 30% a sip, costs nothing, is no potion, and refills at the board", () => {
    const { w, c } = arena();
    w.player.hp = 5;
    c.press("KeyB");
    run(w, c, 0.02);
    expect(w.player.hp).toBe(5 + Math.floor(w.player.d.maxHp * FLASK.heal));
    expect(w.profile.flask.charges).toBe(FLASK.start - 1);
    expect(w.run.usedPotion).toBe(false);
    expect(w.profile.gold).toBe(0);
    toSelect(w);
    expect(w.profile.flask.charges).toBe(FLASK.start);
  });

  it("a flask upgrade adds a sip, at a rising price, up to five", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 99999;
    const paid: number[] = [];
    for (let i = 0; i < 6; i++) {
      const before = w.profile.gold;
      hubAction(w, "flask:upgrade");
      if (w.profile.gold < before) paid.push(before - w.profile.gold);
    }
    expect(paid).toEqual(FLASK.cost);
    expect(w.profile.flask).toEqual({ size: FLASK.max, charges: FLASK.max });
  });

  it("nothing is spent on a potion that would do nothing", () => {
    const { w, c } = arena();
    w.profile.bag.greater = 1;
    w.belt = BELT.indexOf("greater");
    c.press("KeyB");
    c.press("KeyF");
    run(w, c, 0.02);
    expect(w.profile.bag.greater).toBe(1);
    expect(w.profile.potions).toBe(POTION.max > 0 ? 1 : 0);
  });
});

describe("auto-buy", () => {
  it("is off by default and buys nothing", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 5000;
    w.profile.potions = 0;
    restock(w);
    expect(w.profile.gold).toBe(5000);
    expect(w.profile.potions).toBe(0);
  });

  it("tops up what is switched on, on returning to the board", () => {
    const w = createWorld(seeded(1));
    w.profile.gold = 5000;
    w.profile.potions = 0;
    hubAction(w, "auto:potion");
    hubAction(w, "auto:mana");
    enterArena(w);
    toSelect(w);
    expect(w.profile.potions).toBe(POTION.max);
    expect(w.profile.bag.mana).toBe(BAG.mana.max);
    expect(w.profile.gold).toBe(5000 - POTION.max * POTION.price - BAG.mana.max * BAG.mana.price);
    expect(w.notices.some((n) => n.title === "AUTO-BUY")).toBe(true);
  });

  it("buys the cheapest first when gold is short", () => {
    const w = createWorld(seeded(1));
    w.profile.potions = 0;
    w.profile.gold = POTION.price * 3 + 10;
    hubAction(w, "auto:fury");
    hubAction(w, "auto:potion");
    restock(w);
    expect(w.profile.potions).toBe(3);
    expect(w.profile.bag.fury).toBe(0);
  });

  it("never takes gold below the floor", () => {
    const w = createWorld(seeded(1));
    w.profile.potions = 0;
    w.profile.gold = 300;
    hubAction(w, "auto:potion");
    for (let i = 0; i < 3; i++) hubAction(w, "floor:+");
    expect(w.profile.goldFloor).toBe(300);
    restock(w);
    expect(w.profile.gold).toBe(300);
    hubAction(w, "floor:-");
    restock(w);
    expect(w.profile.gold).toBeGreaterThanOrEqual(200);
    expect(w.profile.potions).toBe(2);
  });
});

describe("auto-drink", () => {
  it("is off by default", () => {
    const { w, c } = arena();
    w.player.hp = 1;
    run(w, c, 0.5);
    expect(w.profile.potions).toBe(1);
  });

  it("drinks a potion when health drops below the chosen level, not more than once a second", () => {
    const { w, c } = arena();
    hubAction(w, "drink:toggle");
    w.profile.potions = 3;
    w.player.hp = Math.floor(w.player.d.maxHp * 0.25);
    run(w, c, 0.05);
    expect(w.profile.potions).toBe(2);
    w.player.hp = 1;
    run(w, c, 0.5);
    expect(w.profile.potions).toBe(2);
    run(w, c, 0.7);
    expect(w.profile.potions).toBe(1);
  });

  it("the level can be set between 10% and 60%", () => {
    const w = createWorld(seeded(1));
    for (let i = 0; i < 9; i++) hubAction(w, "drink:+");
    expect(w.profile.autoDrink.at).toBe(0.6);
    for (let i = 0; i < 9; i++) hubAction(w, "drink:-");
    expect(w.profile.autoDrink.at).toBe(0.1);
  });
});

describe("the board", () => {
  it("no two controls overlap on the shop, supplies or gear tabs", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = Array.from({ length: 20 }, (_, i) => (i % 2 ? "iron_fang+poison" : "scale_vest"));
    w.profile.shop.stock = SHOP_POOL.slice(0, 6);
    for (const tab of ["shop", "supplies", "gear"] as const) {
      w.tab = tab;
      const list = hubButtons(w);
      for (const a of list) {
        for (const b of list) {
          if (a === b) continue;
          expect(pointIn(b.rect, a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2)).toBe(false);
        }
      }
    }
  });

  it("pages a large bag, and each row acts on the right item", () => {
    const w = createWorld(seeded(1));
    w.profile.inventory = Array.from({ length: BAG_PAGE * 2 + 3 }, (_, i) => (i === BAG_PAGE + 1 ? "nightglass" : "iron_fang"));
    w.tab = "gear";
    expect(bagPage(w).pages).toBe(3);
    hubAction(w, "page:+");
    const row = hubButtons(w).find((b) => b.text === "Nightglass Dagger")!;
    expect(row.id).toBe(`equip:${BAG_PAGE + 1}`);
    hubAction(w, row.id);
    expect(w.profile.equipped.weapon).toBe("nightglass");
    for (let i = 0; i < 9; i++) hubAction(w, "page:+");
    expect(bagPage(w).page).toBe(bagPage(w).pages - 1);
  });
});

describe("save, version 4", () => {
  function geared(): World {
    const w = createWorld(seeded(1));
    // Perk counts a save will accept: one on an uncommon, up to four on a mythic.
    w.profile.inventory = ["hunters_kris+poison", "short_bow", "scale_vest+thorns", "breakwater+dodge", "iron_fang"];
    hubAction(w, "equip:0");
    hubAction(w, "equip:0");
    hubAction(w, "equip:0");
    hubAction(w, "weapon:swap");
    w.profile.bag = { greater: 1, mana: 2, fury: 1, antidote: 2 };
    w.profile.flask = { size: 4, charges: 3 };
    w.profile.autoBuy.potion = true;
    w.profile.goldFloor = 500;
    w.profile.autoDrink = { on: true, at: 0.4 };
    w.profile.bossKills = { queen: 3 };
    w.profile.dailiesDone = 12;
    w.profile.mythics = ["breakwater"];
    return w;
  }

  it("round-trips gear with perks, both weapon slots, supplies and automation", () => {
    const a = geared();
    const data = parseSave(JSON.parse(JSON.stringify(toSave(a))))!;
    expect(data.v).toBe(SAVE_VERSION);
    const b = createWorld(seeded(2));
    applySave(b, data);
    expect(b.profile).toEqual(a.profile);
    expect(b.player.weapon).toBe("bow");
    expect(b.player.perks.thorns).toBe(1);
  });

  it("a save from before perks loads as it was: plain items, new fields at defaults", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    raw.v = 3;
    raw.profile.inventory = ["iron_fang", "scale_vest"];
    raw.profile.equipped = { weapon: "voltaic_edge", armour: "gatehide_mail" };
    for (const k of ["activeWeapon", "bag", "flask", "autoBuy", "goldFloor", "autoDrink", "bossKills", "dailiesDone", "mythics"]) delete raw.profile[k];
    const data = parseSave(raw)!;
    expect(data.profile.inventory).toEqual(["iron_fang", "scale_vest"]);
    expect(data.profile.equipped).toEqual({ weapon: "voltaic_edge", armour: "gatehide_mail" });
    expect(data.profile.flask).toEqual({ size: FLASK.start, charges: FLASK.start });
    expect(data.profile.mythics).toEqual([]);
    expect(data.profile.autoDrink.on).toBe(false);
  });

  it("strips perks that do not exist, do not fit the slot, or exceed the rarity", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    raw.profile.inventory = ["iron_fang+poison+chain+burn", "padded_coat+poison+thorns", "hunters_kris+bogus+frost+frost", "wardens_knuckle+dodge", "nothing+poison"];
    const data = parseSave(raw)!;
    expect(data.profile.inventory).toEqual(["iron_fang", "padded_coat", "hunters_kris+frost", "wardens_knuckle"]);
  });

  it("a second weapon slot may hold only a weapon, and an empty main hand takes up the second", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    raw.profile.equipped = { weapon2: "padded_coat" };
    expect(parseSave(raw)!.profile.equipped).toEqual({});
    raw.profile.equipped = { weapon2: "short_bow" };
    const data = parseSave(raw)!;
    expect(data.profile.equipped).toEqual({ weapon2: "short_bow" });
    expect(data.profile.activeWeapon).toBe(1);
  });

  it("clamps supplies and the flask, and counts a held mythic as earned", () => {
    const raw = JSON.parse(JSON.stringify(toSave(createWorld(seeded(1)))));
    raw.profile.bag = { greater: 99, mana: -4, fury: "x", antidote: 1 };
    raw.profile.flask = { size: 99, charges: 99 };
    raw.profile.autoDrink = { on: true, at: 7 };
    raw.profile.inventory = ["twin_fang"];
    raw.profile.mythics = ["made_up"];
    const p = parseSave(raw)!.profile;
    expect(p.bag).toEqual({ greater: BAG.greater.max, mana: 0, fury: 0, antidote: 1 });
    expect(p.flask).toEqual({ size: FLASK.max, charges: FLASK.max });
    expect(p.autoDrink).toEqual({ on: true, at: 0.6 });
    expect(p.mythics).toEqual(["twin_fang"]);
  });
});

describe("skills still work with every weapon", () => {
  for (const id of ["iron_fang", "militia_sword", "ash_spear", "short_bow"]) {
    it(`Whirl with ${ITEMS[id].name}`, () => {
      const { w, c } = arena([id]);
      w.player.prog.level = SKILLS.whirl.level;
      refreshDerived(w);
      const e = add(w, "swarmer", 60, 0);
      c.press("KeyE");
      run(w, c, 0.02);
      expect(dealt(e)).toBeGreaterThan(0);
      expect(damageEnemy(w, e, 1, false, 0, 0, 0)).toBe(true);
    });
  }
});
