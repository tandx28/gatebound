import { describe, expect, it } from "vitest";
import {
  applyDamage,
  circlesOverlap,
  clampToRoom,
  hitsToKill,
  inArc,
  rollDamage,
  separate,
} from "./combat";
import { PLAYER, SWARMER } from "./config";

describe("inArc", () => {
  const half = Math.PI / 4;

  it("hits a target straight ahead within range", () => {
    expect(inArc(0, 0, 0, half, 60, { x: 40, y: 0, radius: 10 })).toBe(true);
  });

  it("misses a target behind the attacker", () => {
    expect(inArc(0, 0, 0, half, 60, { x: -40, y: 0, radius: 10 })).toBe(false);
  });

  it("misses a target beyond range plus its radius", () => {
    expect(inArc(0, 0, 0, half, 60, { x: 71, y: 0, radius: 10 })).toBe(false);
  });

  it("hits a target whose edge reaches into range", () => {
    expect(inArc(0, 0, 0, half, 60, { x: 69, y: 0, radius: 10 })).toBe(true);
  });

  it("hits a target whose body crosses the edge of the arc", () => {
    // Centre sits at 50 degrees, just outside a 45 degree half-angle.
    const a = (50 * Math.PI) / 180;
    expect(inArc(0, 0, 0, half, 60, { x: Math.cos(a) * 40, y: Math.sin(a) * 40, radius: 10 })).toBe(true);
    expect(inArc(0, 0, 0, half, 60, { x: Math.cos(a) * 40, y: Math.sin(a) * 40, radius: 1 })).toBe(false);
  });

  it("handles facing across the -PI/PI seam", () => {
    expect(inArc(0, 0, Math.PI, half, 60, { x: -40, y: -5, radius: 5 })).toBe(true);
    expect(inArc(0, 0, -Math.PI, half, 60, { x: -40, y: 5, radius: 5 })).toBe(true);
  });

  it("always hits a target overlapping the origin", () => {
    expect(inArc(0, 0, 0, half, 60, { x: -3, y: 0, radius: 10 })).toBe(true);
  });
});

describe("rollDamage", () => {
  it("deals base damage without a crit", () => {
    expect(rollDamage(8, 0.05, 2, () => 0.5)).toEqual({ amount: 8, crit: false });
  });

  it("multiplies damage on a crit", () => {
    expect(rollDamage(8, 0.05, 2, () => 0.01)).toEqual({ amount: 16, crit: true });
  });

  it("never crits at zero chance", () => {
    expect(rollDamage(8, 0, 2, () => 0).crit).toBe(false);
  });
});

describe("applyDamage", () => {
  it("never drops below zero", () => {
    expect(applyDamage(10, 25)).toBe(0);
  });

  it("ignores negative damage", () => {
    expect(applyDamage(10, -5)).toBe(10);
  });
});

describe("difficulty baseline", () => {
  it("a swarmer kills a fresh player in three hits", () => {
    expect(hitsToKill(PLAYER.maxHp, SWARMER.damage)).toBe(3);
  });

  it("the player kills a swarmer in three plain hits", () => {
    expect(hitsToKill(SWARMER.maxHp, PLAYER.attackDamage)).toBe(3);
  });

  it("dash invulnerability covers the whole dash", () => {
    expect(PLAYER.dashIframes).toBeGreaterThanOrEqual(PLAYER.dashTime);
  });
});

describe("circles", () => {
  it("detects overlap", () => {
    expect(circlesOverlap({ x: 0, y: 0, radius: 10 }, { x: 15, y: 0, radius: 10 })).toBe(true);
    expect(circlesOverlap({ x: 0, y: 0, radius: 10 }, { x: 25, y: 0, radius: 10 })).toBe(false);
  });

  it("separates overlapping circles until they just touch", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 10, y: 0, radius: 10 };
    separate(a, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(20);
  });

  it("separates circles with identical centres", () => {
    const a = { x: 5, y: 5, radius: 10 };
    const b = { x: 5, y: 5, radius: 10 };
    separate(a, b);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(20);
  });

  it("leaves distant circles alone", () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 50, y: 0, radius: 10 };
    separate(a, b);
    expect(a.x).toBe(0);
    expect(b.x).toBe(50);
  });

  it("clamps a circle inside the room", () => {
    const c = { x: -20, y: 5000, radius: 10 };
    clampToRoom(c, 800, 600);
    expect(c).toEqual({ x: 10, y: 590, radius: 10 });
  });
});
