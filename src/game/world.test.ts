import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { PLAYER, STEP, SWARMER, VIEW_H, VIEW_W } from "./config";
import { xpToNext } from "./stats";
import { statButton } from "./ui";
import { createWorld, grantXp, step, type Enemy, type World } from "./world";

/** Scripted controls. The cursor defaults to directly right of the player. */
class FakeControls implements Controls {
  mouseX = VIEW_W / 2 + 100;
  mouseY = VIEW_H / 2;
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

/** Deterministic generator so runs repeat exactly. Never crits at 0.5. */
const fixedRng = () => 0.5;

function run(w: World, c: Controls, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(w, c, STEP);
}

function enemyAt(w: World, dx: number, dy: number, state: Enemy["state"], t = 0): Enemy {
  const e: Enemy = {
    x: w.player.x + dx,
    y: w.player.y + dy,
    radius: SWARMER.radius,
    hp: SWARMER.maxHp,
    state,
    t,
    dirX: 0,
    dirY: 0,
    kx: 0,
    ky: 0,
    lastSwing: -1,
    flash: 0,
    hasHit: false,
  };
  w.enemies.push(e);
  return e;
}

/** A world with the first wave suppressed, for controlled scenarios. */
function emptyWorld(): World {
  const w = createWorld(fixedRng);
  w.waveDelay = 1e9;
  return w;
}

describe("player attack", () => {
  it("one swing hits an enemy in the arc exactly once", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    const e = enemyAt(w, 40, 0, "recover", 99);
    c.attackHeld = true;
    run(w, c, PLAYER.attackActive);
    expect(e.hp).toBe(SWARMER.maxHp - PLAYER.attackDamage);
  });

  it("does not hit an enemy behind the player", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    const e = enemyAt(w, -40, 0, "recover", 99);
    c.attackHeld = true;
    run(w, c, 0.3);
    expect(e.hp).toBe(SWARMER.maxHp);
  });

  it("a queued click swings even when the button is already released", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    c.press("Mouse0");
    run(w, c, 0.05);
    expect(w.player.swingId).toBe(1);
  });

  it("kills a swarmer in three swings and counts the kill", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    enemyAt(w, 40, 0, "recover", 99);
    c.attackHeld = true;
    // Walk forward: each hit knocks the enemy back out of reach.
    c.move = { x: 1, y: 0 };
    run(w, c, PLAYER.attackCooldown * 3 + 0.3);
    expect(w.enemies.length).toBe(0);
    expect(w.kills).toBe(1);
  });

  it("interrupts a wind-up", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    const e = enemyAt(w, 40, 0, "windup", SWARMER.windup);
    c.attackHeld = true;
    run(w, c, 0.05);
    expect(e.state).toBe("recover");
  });
});

describe("swarmer lunge", () => {
  it("hits a player who stands still for 20 damage, once", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    enemyAt(w, 50, 0, "chase");
    run(w, c, SWARMER.windup + SWARMER.lungeTime + 0.3);
    expect(w.player.hp).toBe(PLAYER.maxHp - SWARMER.damage);
  });

  it("misses a player who dashes through it", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    enemyAt(w, 50, 0, "chase");
    // Dash just before release (allowing for the brief chase into range), so
    // the lunge passes through the invulnerability window.
    run(w, c, SWARMER.windup - 0.02);
    c.move = { x: 0, y: 1 };
    c.press("Space");
    run(w, c, SWARMER.lungeTime + 0.2);
    expect(w.player.hp).toBe(PLAYER.maxHp);
  });

  it("kills a passive player on the third hit", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    enemyAt(w, 50, 0, "chase");
    run(w, c, 8);
    expect(w.player.hp).toBe(0);
    expect(w.dead).toBe(true);
  });
});

describe("dash", () => {
  it("moves the player and starts the cooldown", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    const x0 = w.player.x;
    c.press("Space");
    run(w, c, PLAYER.dashTime + 0.05);
    expect(w.player.x - x0).toBeGreaterThan(PLAYER.dashSpeed * PLAYER.dashTime * 0.9);
    expect(w.player.dashCd).toBeGreaterThan(0);
  });

  it("cannot be used again while on cooldown", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    c.press("Space");
    run(w, c, PLAYER.dashTime + 0.05);
    const x1 = w.player.x;
    c.press("Space");
    run(w, c, 0.1);
    expect(w.player.x).toBeCloseTo(x1);
  });
});

describe("waves", () => {
  it("spawns the first wave of three, away from the player", () => {
    const w = createWorld(() => 0.1);
    run(w, new FakeControls(), 1.1);
    expect(w.wave).toBe(1);
    expect(w.enemies.length).toBe(3);
    for (const e of w.enemies) {
      expect(Math.hypot(e.x - w.player.x, e.y - w.player.y)).toBeGreaterThan(300);
    }
  });
});

describe("experience and levelling", () => {
  it("a kill grants the swarmer's experience", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    enemyAt(w, 40, 0, "recover", 99);
    c.attackHeld = true;
    c.move = { x: 1, y: 0 };
    run(w, c, PLAYER.attackCooldown * 3 + 0.3);
    expect(w.player.prog.xp).toBe(SWARMER.xp);
  });

  it("a level-up restores health and mana, gives points, and posts a notice", () => {
    const w = emptyWorld();
    w.player.hp = 5;
    w.player.mana = 0;
    grantXp(w, xpToNext(1));
    expect(w.player.prog.level).toBe(2);
    expect(w.player.prog.points).toBe(3);
    expect(w.player.hp).toBe(w.player.d.maxHp);
    expect(w.player.mana).toBe(w.player.d.maxMana);
    expect(w.notices[0].title).toBe("LEVEL UP");
  });

  it("experience short of a level changes nothing else", () => {
    const w = emptyWorld();
    w.player.hp = 5;
    grantXp(w, xpToNext(1) - 1);
    expect(w.player.prog.level).toBe(1);
    expect(w.player.hp).toBe(5);
    expect(w.notices.length).toBe(0);
  });
});

describe("status window", () => {
  it("pauses the fight while open", () => {
    const w = emptyWorld();
    const c = new FakeControls();
    enemyAt(w, 50, 0, "chase");
    c.press("KeyC");
    run(w, c, 3);
    expect(w.menu).toBe("status");
    expect(w.player.hp).toBe(PLAYER.maxHp);
    c.press("KeyC");
    run(w, c, 0.05);
    expect(w.menu).toBe("none");
  });

  it("a number key spends a point and raises the stat", () => {
    const w = emptyWorld();
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
    const w = emptyWorld();
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
    const w = emptyWorld();
    const c = new FakeControls();
    c.press("KeyC");
    run(w, c, 0.02);
    c.press("Digit1");
    run(w, c, 0.02);
    expect(w.player.prog.stats.str).toBe(5);
  });
});
