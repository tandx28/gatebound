import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { seeded } from "../engine/rng";
import {
  CHARGER,
  EXPLODER,
  KINDS,
  PLAYER,
  ROOM,
  SHOOTER,
  SKILLS,
  STEP,
  SURGE,
  SWARMER,
  type EnemyKind,
  type Rank,
} from "./config";
import { SIDES, type Side } from "./dungeon";
import { damageEnemy, makeEnemy } from "./enemies";
import { xpToNext } from "./stats";
import { gateCard, statButton } from "./ui";
import { createWorld, currentRoom, effective, enterArena, enterGate, grantXp, step, type Enemy, type World } from "./world";

/** Scripted controls. The cursor defaults to directly right of the room centre. */
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

/** Constant generator: repeatable, and never crits at 0.5. */
const fixedRng = () => 0.5;

function run(w: World, c: Controls, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(w, c, STEP);
}

/** An empty sealed room with the player in the middle. */
function arena(rank: Rank = "E"): World {
  const w = createWorld(fixedRng);
  enterArena(w, rank);
  return w;
}

/** Add an enemy at an offset from the player, optionally in a given state. */
function add(w: World, kind: EnemyKind, dx: number, dy: number, state?: string, t = 0): Enemy {
  const e = makeEnemy(kind, w.player.x + dx, w.player.y + dy, w.rank);
  if (state) {
    e.state = state;
    e.t = t;
  }
  e.cd = 0;
  w.enemies.push(e);
  return e;
}

describe("player attack", () => {
  it("one swing hits an enemy in the arc exactly once", () => {
    const w = arena();
    const c = new FakeControls();
    const e = add(w, "swarmer", 40, 0, "recover", 99);
    c.attackHeld = true;
    run(w, c, PLAYER.attackActive);
    expect(e.hp).toBe(SWARMER.maxHp - PLAYER.attackDamage);
  });

  it("does not hit an enemy behind the player", () => {
    const w = arena();
    const c = new FakeControls();
    const e = add(w, "swarmer", -40, 0, "recover", 99);
    c.attackHeld = true;
    run(w, c, 0.3);
    expect(e.hp).toBe(SWARMER.maxHp);
  });

  it("a queued click swings even when the button is already released", () => {
    const w = arena();
    const c = new FakeControls();
    c.press("Mouse0");
    run(w, c, 0.05);
    expect(w.player.swingId).toBe(1);
  });

  it("kills a swarmer in three swings, counts the kill, grants experience", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "swarmer", 40, 0, "recover", 99);
    c.attackHeld = true;
    // Walk forward: each hit knocks the enemy back out of reach.
    c.move = { x: 1, y: 0 };
    run(w, c, PLAYER.attackCooldown * 3 + 0.3);
    expect(w.enemies.length).toBe(0);
    expect(w.kills).toBe(1);
    expect(w.player.prog.xp).toBe(SWARMER.xp);
  });

  it("interrupts a swarmer's wind-up", () => {
    const w = arena();
    const c = new FakeControls();
    const e = add(w, "swarmer", 40, 0, "windup", SWARMER.windup);
    c.attackHeld = true;
    run(w, c, 0.05);
    expect(e.state).toBe("recover");
  });
});

describe("swarmer", () => {
  it("hits a player who stands still for 20 damage, once", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "swarmer", 50, 0, "chase");
    run(w, c, SWARMER.windup + SWARMER.lungeTime + 0.3);
    expect(w.player.hp).toBe(PLAYER.maxHp - SWARMER.damage);
  });

  it("misses a player who dashes through it", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "swarmer", 50, 0, "chase");
    run(w, c, SWARMER.windup - 0.02);
    c.move = { x: 0, y: 1 };
    c.press("Space");
    run(w, c, SWARMER.lungeTime + 0.2);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });

  it("kills a passive player on the third hit", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "swarmer", 50, 0, "chase");
    run(w, c, 8);
    expect(w.player.hp).toBe(0);
    expect(w.mode).toBe("dead");
  });
});

describe("charger", () => {
  it("is stunned when its charge ends in a wall", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.x = ROOM.w - 60;
    w.player.iframes = 99;
    const e = add(w, "charger", -250, 0, "chase");
    run(w, c, CHARGER.windup + 0.6);
    expect(e.state).toBe("recover");
    expect(e.t).toBeGreaterThan(CHARGER.recover);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });

  it("hits a player standing in its path", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "charger", -200, 0, "chase");
    run(w, c, CHARGER.windup + 0.5);
    expect(w.player.hp).toBe(PLAYER.maxHp - KINDS.charger.damage);
  });
});

describe("shooter", () => {
  it("fires a shot that hits a player who stands still", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "shooter", 300, 0, "idle");
    run(w, c, SHOOTER.windup + 300 / SHOOTER.shotSpeed + 0.3);
    expect(w.player.hp).toBe(PLAYER.maxHp - KINDS.shooter.damage);
    expect(w.projectiles.length).toBe(0);
  });

  it("a shot passes through a dashing player", () => {
    const w = arena();
    const c = new FakeControls();
    w.projectiles.push({ x: w.player.x + 30, y: w.player.y, radius: 7, vx: -340, vy: 0, damage: 14, life: 2 });
    c.press("Space");
    run(w, c, 0.15);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });
});

describe("brute", () => {
  it("blocks a hit from the front", () => {
    const w = arena();
    const c = new FakeControls();
    const e = add(w, "brute", 50, 0, "chase");
    e.facing = Math.PI;
    c.attackHeld = true;
    run(w, c, PLAYER.attackActive);
    expect(e.hp).toBe(e.maxHp);
  });

  it("takes a hit from behind", () => {
    const w = arena();
    const c = new FakeControls();
    const e = add(w, "brute", 50, 0, "chase");
    e.facing = 0;
    c.attackHeld = true;
    run(w, c, PLAYER.attackActive);
    expect(e.hp).toBe(e.maxHp - PLAYER.attackDamage);
  });

  it("takes a frontal hit while recovering from its slam", () => {
    const w = arena();
    const c = new FakeControls();
    const e = add(w, "brute", 50, 0, "recover", 99);
    e.facing = Math.PI;
    c.attackHeld = true;
    run(w, c, PLAYER.attackActive);
    expect(e.hp).toBe(e.maxHp - PLAYER.attackDamage);
  });

  it("its slam damages a player who stays close", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "brute", 60, 0, "chase");
    run(w, c, 1.2);
    expect(w.player.hp).toBe(PLAYER.maxHp - KINDS.brute.damage);
  });
});

describe("exploder", () => {
  it("blasts a nearby player and dies without reward", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "exploder", 30, 0, "chase");
    run(w, c, EXPLODER.fuse + 0.2);
    expect(w.player.hp).toBe(PLAYER.maxHp - KINDS.exploder.damage);
    expect(w.enemies.length).toBe(0);
    expect(w.player.prog.xp).toBe(0);
  });

  it("does not blast if killed during the fuse", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "exploder", 30, 0, "fuse", EXPLODER.fuse);
    c.attackHeld = true;
    run(w, c, 1);
    expect(w.enemies.length).toBe(0);
    expect(w.player.hp).toBe(PLAYER.maxHp);
    expect(w.player.prog.xp).toBe(KINDS.exploder.xp);
  });
});

describe("mender", () => {
  it("heals a wounded ally in range", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.iframes = 99;
    const hurt = add(w, "swarmer", 350, 80, "recover", 99);
    hurt.hp = 5;
    add(w, "healer", 350, 0, "idle");
    run(w, c, 1);
    expect(hurt.hp).toBe(5 + Math.round(SWARMER.maxHp * 0.3));
  });
});

describe("bosses", () => {
  it("enters phase two at half health and is briefly untouchable", () => {
    const w = arena();
    const e = add(w, "warden", 300, 0);
    damageEnemy(w, e, e.maxHp / 2, false, w.player.x, w.player.y, 0);
    expect(e.phase).toBe(2);
    expect(e.inv).toBeGreaterThan(0);
    expect(damageEnemy(w, e, 10, false, w.player.x, w.player.y, 0)).toBe(false);
  });

  it("a boss is not knocked back", () => {
    const w = arena();
    const e = add(w, "warden", 300, 0);
    damageEnemy(w, e, 10, false, w.player.x, w.player.y, 300);
    expect(e.kx).toBe(0);
  });

  it("the warden's slam hits a player who does not move", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "warden", 300, 0, "chase");
    run(w, c, 1.2);
    expect(w.player.hp).toBe(PLAYER.maxHp - KINDS.warden.damage);
  });

  it("the choirmaster calls minions that give no experience", () => {
    const w = arena("D");
    const c = new FakeControls();
    w.player.iframes = 99;
    add(w, "summoner", 380, 0, "idle");
    run(w, c, 0.2);
    const minions = w.enemies.filter((e) => !e.boss);
    expect(minions.length).toBe(2);
    for (const m of minions) expect(m.xp).toBe(0);
  });

  it("the mirror blade answers a dash with a strike of its own", () => {
    const w = arena("C");
    const c = new FakeControls();
    const e = add(w, "duellist", 150, 0, "stalk");
    e.cd = 99;
    c.move = { x: 0, y: 1 };
    c.press("Space");
    run(w, c, 0.05);
    expect(e.state).toBe("windup");
    expect(e.inv).toBeGreaterThan(0);
  });

  it("killing the boss clears the gate and returns to the board on Enter", () => {
    const w = arena();
    const c = new FakeControls();
    const boss = add(w, "warden", 300, 0);
    add(w, "swarmer", -300, 0);
    boss.hp = 0;
    run(w, c, 0.02);
    expect(w.enemies.length).toBe(0);
    expect(w.player.prog.level).toBeGreaterThan(1);
    run(w, c, 2.4);
    expect(w.mode).toBe("cleared");
    c.press("Enter");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
  });
});

describe("dash", () => {
  it("moves the player and starts the cooldown", () => {
    const w = arena();
    const c = new FakeControls();
    const x0 = w.player.x;
    c.press("Space");
    run(w, c, PLAYER.dashTime + 0.05);
    expect(w.player.x - x0).toBeGreaterThan(PLAYER.dashSpeed * PLAYER.dashTime * 0.9);
    expect(w.player.dashCd).toBeGreaterThan(0);
  });

  it("cannot be used again while on cooldown", () => {
    const w = arena();
    const c = new FakeControls();
    c.press("Space");
    run(w, c, PLAYER.dashTime + 0.05);
    const x1 = w.player.x;
    c.press("Space");
    run(w, c, 0.1);
    expect(w.player.x).toBeCloseTo(x1);
  });
});

describe("skills", () => {
  it("are locked below their level", () => {
    const w = arena();
    const c = new FakeControls();
    const x0 = w.player.x;
    c.press("KeyQ");
    run(w, c, 0.1);
    expect(w.player.x).toBe(x0);
    expect(w.player.skillCd.pierce).toBe(0);
  });

  it("pierce lunges through an enemy for heavy damage and costs mana", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.prog.level = SKILLS.pierce.level;
    const e = add(w, "swarmer", 100, 0, "recover", 99);
    const x0 = w.player.x;
    c.press("KeyQ");
    run(w, c, 0.3);
    expect(e.hp).toBe(SWARMER.maxHp - Math.round(PLAYER.attackDamage * 2.2));
    expect(w.player.x - x0).toBeGreaterThan(150);
    expect(w.player.mana).toBeLessThan(PLAYER.maxMana - SKILLS.pierce.mana + 1);
    expect(w.player.skillCd.pierce).toBeGreaterThan(0);
  });

  it("whirl hits enemies on every side", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.prog.level = SKILLS.whirl.level;
    const a = add(w, "swarmer", 60, 0, "recover", 99);
    const b = add(w, "swarmer", -60, 0, "recover", 99);
    const far = add(w, "swarmer", 0, 300, "recover", 99);
    c.press("KeyE");
    run(w, c, 0.02);
    const hit = SWARMER.maxHp - Math.round(PLAYER.attackDamage * 1.8);
    expect(a.hp).toBe(hit);
    expect(b.hp).toBe(hit);
    expect(far.hp).toBe(SWARMER.maxHp);
  });

  it("surge raises damage and speed for a while, then ends", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.prog.level = SKILLS.surge.level;
    c.press("KeyR");
    run(w, c, 0.02);
    expect(effective(w.player).damage).toBeCloseTo(PLAYER.attackDamage * SURGE.damage);
    expect(effective(w.player).moveSpeed).toBeCloseTo(PLAYER.speed * SURGE.speed);
    run(w, c, SURGE.time + 0.1);
    expect(effective(w.player).damage).toBe(PLAYER.attackDamage);
  });

  it("do nothing without enough mana", () => {
    const w = arena();
    const c = new FakeControls();
    w.player.prog.level = 10;
    w.player.mana = 0;
    c.press("KeyE");
    run(w, c, 0.02);
    expect(w.player.skillCd.whirl).toBe(0);
  });
});

describe("experience and levelling", () => {
  it("a level-up restores health and mana, gives points, and posts a notice", () => {
    const w = arena();
    w.player.hp = 5;
    w.player.mana = 0;
    grantXp(w, xpToNext(1));
    expect(w.player.prog.level).toBe(2);
    expect(w.player.prog.points).toBe(3);
    expect(w.player.hp).toBe(w.player.d.maxHp);
    expect(w.player.mana).toBe(w.player.d.maxMana);
    expect(w.notices[0].title).toBe("LEVEL UP");
  });

  it("reaching a skill's level announces it", () => {
    const w = arena();
    grantXp(w, xpToNext(1) + xpToNext(2));
    expect(w.notices.some((n) => n.title === "SKILL ACQUIRED" && n.body.includes("Pierce"))).toBe(true);
  });

  it("experience short of a level changes nothing else", () => {
    const w = arena();
    w.player.hp = 5;
    grantXp(w, xpToNext(1) - 1);
    expect(w.player.prog.level).toBe(1);
    expect(w.player.hp).toBe(5);
    expect(w.notices.length).toBe(0);
  });
});

describe("status window", () => {
  it("pauses the fight while open", () => {
    const w = arena();
    const c = new FakeControls();
    add(w, "swarmer", 50, 0, "chase");
    c.press("KeyC");
    run(w, c, 3);
    expect(w.menu).toBe("status");
    expect(w.player.hp).toBe(PLAYER.maxHp);
    c.press("KeyC");
    run(w, c, 0.05);
    expect(w.menu).toBe("none");
  });

  it("a number key spends a point and raises the stat", () => {
    const w = arena();
    const c = new FakeControls();
    grantXp(w, xpToNext(1));
    c.press("KeyC");
    run(w, c, 0.02);
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.player.prog.stats.str).toBe(6);
    expect(w.player.prog.points).toBe(2);
    expect(w.player.d.damage).toBeGreaterThan(PLAYER.attackDamage);
  });

  it("clicking a [+] button spends a point; vitality also raises current health", () => {
    const w = arena();
    const c = new FakeControls();
    grantXp(w, xpToNext(1));
    const hp0 = w.player.hp;
    c.press("KeyC");
    run(w, c, 0.02);
    const b = statButton(2);
    c.mouseX = b.x + b.w / 2;
    c.mouseY = b.y + b.h / 2;
    c.press("Mouse0");
    run(w, c, 0.02);
    expect(w.player.prog.stats.vit).toBe(6);
    expect(w.player.hp).toBe(hp0 + 8);
  });

  it("does nothing without points", () => {
    const w = arena();
    const c = new FakeControls();
    c.press("KeyC");
    run(w, c, 0.02);
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.player.prog.stats.str).toBe(5);
  });
});

describe("gate board", () => {
  it("starts on the board; a number key enters that rank", () => {
    const w = createWorld(seeded(3));
    const c = new FakeControls();
    expect(w.mode).toBe("select");
    c.press("Digit2");
    run(w, c, 0.02);
    expect(w.mode).toBe("gate");
    expect(w.rank).toBe("D");
  });

  it("a click on a card enters that rank", () => {
    const w = createWorld(seeded(3));
    const c = new FakeControls();
    const r = gateCard(2);
    c.mouseX = r.x + 10;
    c.mouseY = r.y + 10;
    c.press("Mouse0");
    run(w, c, 0.02);
    expect(w.rank).toBe("C");
    expect(w.mode).toBe("gate");
  });

  it("dying returns to the board, rested, with levels kept", () => {
    const w = arena();
    const c = new FakeControls();
    grantXp(w, xpToNext(1));
    add(w, "swarmer", 50, 0, "chase");
    run(w, c, 8);
    expect(w.mode).toBe("dead");
    c.press("Enter");
    run(w, c, 0.02);
    expect(w.mode).toBe("select");
    expect(w.player.hp).toBe(w.player.d.maxHp);
    expect(w.player.prog.level).toBe(2);
  });
});

describe("rooms and doors", () => {
  const MOVE: Record<Side, { x: number; y: number }> = {
    n: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    e: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
  };

  function gate(): { w: World; c: FakeControls; side: Side } {
    const w = createWorld(seeded(11));
    enterGate(w, "E");
    const side = SIDES.find((s) => currentRoom(w)!.doors[s] !== undefined)!;
    return { w, c: new FakeControls(), side };
  }

  /** Walk in a direction until the room changes or time runs out. */
  function walk(w: World, c: FakeControls, side: Side, seconds: number): void {
    const from = w.roomId;
    c.move = MOVE[side];
    for (let i = 0; i < seconds / STEP && w.roomId === from; i++) step(w, c, STEP);
    c.move = { x: 0, y: 0 };
  }

  it("the start room is safe and open", () => {
    const { w } = gate();
    expect(currentRoom(w)!.kind).toBe("start");
    expect(w.enemies.length).toBe(0);
    expect(w.doorsOpen).toBe(true);
  });

  it("a wall without a door stops the player", () => {
    const { w, c } = gate();
    const blocked = SIDES.find((s) => currentRoom(w)!.doors[s] === undefined)!;
    walk(w, c, blocked, 5);
    expect(w.roomId).toBe(0);
    const p = w.player;
    expect(p.x).toBeGreaterThanOrEqual(p.radius);
    expect(p.x).toBeLessThanOrEqual(ROOM.w - p.radius);
    expect(p.y).toBeGreaterThanOrEqual(p.radius);
    expect(p.y).toBeLessThanOrEqual(ROOM.h - p.radius);
  });

  it("walking through a door enters the next room, spawns its enemies, and locks it", () => {
    const { w, c, side } = gate();
    const target = currentRoom(w)!.doors[side]!;
    walk(w, c, side, 5);
    expect(w.roomId).toBe(target);
    const room = currentRoom(w)!;
    expect(room.visited).toBe(true);
    expect(w.enemies.length).toBe(room.spawns.length);
    expect(w.doorsOpen).toBe(false);
  });

  it("a locked door cannot be walked back through", () => {
    const { w, c, side } = gate();
    walk(w, c, side, 5);
    const here = w.roomId;
    w.player.iframes = 99;
    const back = ({ n: "s", s: "n", e: "w", w: "e" } as const)[side];
    walk(w, c, back, 1.5);
    expect(w.roomId).toBe(here);
  });

  it("clearing the room unlocks the doors, and it stays cleared", () => {
    const { w, c, side } = gate();
    walk(w, c, side, 5);
    const here = w.roomId;
    for (const e of w.enemies) e.hp = 0;
    run(w, c, 0.02);
    expect(currentRoom(w)!.cleared).toBe(true);
    expect(w.doorsOpen).toBe(true);
    const back = ({ n: "s", s: "n", e: "w", w: "e" } as const)[side];
    walk(w, c, back, 2);
    expect(w.roomId).toBe(0);
    walk(w, c, side, 2);
    expect(w.roomId).toBe(here);
    expect(w.enemies.length).toBe(0);
  });
});

describe("rank scaling", () => {
  it("regular enemies grow with rank; bosses do not", () => {
    expect(makeEnemy("swarmer", 0, 0, "D").maxHp).toBe(Math.round(SWARMER.maxHp * 2.2));
    expect(makeEnemy("swarmer", 0, 0, "D").dmg).toBeCloseTo(SWARMER.damage * 1.5);
    expect(makeEnemy("summoner", 0, 0, "D").maxHp).toBe(KINDS.summoner.hp);
  });
});

describe("stability", () => {
  const kinds = Object.keys(KINDS) as EnemyKind[];

  for (const kind of kinds) {
    it(`${kind}: 25 seconds against an untouchable player stays finite and in bounds`, () => {
      const w = createWorld(seeded(5));
      enterArena(w, "C");
      const c = new FakeControls();
      const e = add(w, kind, 250, 60);
      if (e.boss) e.phase = 2;
      for (let i = 0; i < 25 / STEP; i++) {
        w.player.iframes = 1;
        // Wander so the enemy has something to chase.
        c.move = { x: Math.cos(i / 200), y: Math.sin(i / 310) };
        if (i % 180 === 0) c.press("Space");
        step(w, c, STEP);
      }
      for (const o of w.enemies) {
        expect(Number.isFinite(o.x) && Number.isFinite(o.y)).toBe(true);
        expect(o.x).toBeGreaterThanOrEqual(o.radius);
        expect(o.x).toBeLessThanOrEqual(ROOM.w - o.radius);
        expect(o.y).toBeGreaterThanOrEqual(o.radius);
        expect(o.y).toBeLessThanOrEqual(ROOM.h - o.radius);
      }
      expect(Number.isFinite(w.player.x) && Number.isFinite(w.player.y)).toBe(true);
      expect(w.player.hp).toBe(w.player.d.maxHp);
    });
  }

  it("random play through whole gates never throws or leaves the map", () => {
    for (const rank of ["E", "D", "C"] as Rank[]) {
      const rng = seeded(99);
      const w = createWorld(seeded(17));
      enterGate(w, rank);
      const c = new FakeControls();
      for (let i = 0; i < 40 / STEP; i++) {
        if (i % 40 === 0) {
          c.move = { x: Math.round(rng() * 2 - 1), y: Math.round(rng() * 2 - 1) };
          c.aimX = rng() * ROOM.w;
          c.aimY = rng() * ROOM.h;
          c.attackHeld = rng() < 0.7;
          if (rng() < 0.3) c.press("Space");
          if (rng() < 0.1) c.press(["KeyQ", "KeyE", "KeyR"][Math.floor(rng() * 3)]);
        }
        if (w.mode === "dead" || w.mode === "cleared") c.press("Enter");
        if (w.mode === "select") c.press("Digit1");
        step(w, c, STEP);
        const p = w.player;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`player left the map at step ${i}`);
        expect(p.x).toBeGreaterThan(-ROOM.doorHalf);
        expect(p.x).toBeLessThan(ROOM.w + ROOM.doorHalf);
        expect(p.y).toBeGreaterThan(-ROOM.doorHalf);
        expect(p.y).toBeLessThan(ROOM.h + ROOM.doorHalf);
      }
    }
  });
});
