import type { Controls } from "../engine/input";
import { clamp, norm } from "../engine/vec";
import {
  applyDamage,
  circlesOverlap,
  clampToRoom,
  inArc,
  rollDamage,
  separate,
  type Circle,
} from "./combat";
import { PLAYER, ROOM, SWARMER, VIEW_H, VIEW_W } from "./config";

export interface Player extends Circle {
  hp: number;
  facing: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  iframes: number;
  attackCd: number;
  attackT: number;
  attackFacing: number;
  /** Identifies the current swing so each enemy is hit once per swing. */
  swingId: number;
  hurtFlash: number;
}

export type EnemyState = "chase" | "windup" | "lunge" | "recover";

export interface Enemy extends Circle {
  hp: number;
  state: EnemyState;
  /** Time left in the current state. */
  t: number;
  dirX: number;
  dirY: number;
  /** Knockback velocity, decays quickly. */
  kx: number;
  ky: number;
  lastSwing: number;
  flash: number;
  hasHit: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  big: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface World {
  player: Player;
  enemies: Enemy[];
  texts: FloatText[];
  particles: Particle[];
  wave: number;
  kills: number;
  waveDelay: number;
  shake: number;
  hitstop: number;
  dead: boolean;
  camX: number;
  camY: number;
  rng: () => number;
}

export function createWorld(rng: () => number = Math.random): World {
  const w: World = {
    player: {
      x: ROOM.w / 2,
      y: ROOM.h / 2,
      radius: PLAYER.radius,
      hp: PLAYER.maxHp,
      facing: 0,
      dashT: 0,
      dashCd: 0,
      dashX: 1,
      dashY: 0,
      iframes: 0,
      attackCd: 0,
      attackT: 0,
      attackFacing: 0,
      swingId: 0,
      hurtFlash: 0,
    },
    enemies: [],
    texts: [],
    particles: [],
    wave: 0,
    kills: 0,
    waveDelay: 1,
    shake: 0,
    hitstop: 0,
    dead: false,
    camX: 0,
    camY: 0,
    rng,
  };
  updateCamera(w);
  return w;
}

function updateCamera(w: World): void {
  const margin = 60;
  w.camX = clamp(w.player.x - VIEW_W / 2, -margin, ROOM.w - VIEW_W + margin);
  w.camY = clamp(w.player.y - VIEW_H / 2, -margin, ROOM.h - VIEW_H + margin);
}

function spawnWave(w: World): void {
  w.wave += 1;
  const count = 2 + w.wave;
  for (let i = 0; i < count; i++) {
    // Retry until the spawn point is clear of the player.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = 60 + w.rng() * (ROOM.w - 120);
      y = 60 + w.rng() * (ROOM.h - 120);
      if (Math.hypot(x - w.player.x, y - w.player.y) > 380) break;
    }
    w.enemies.push({
      x,
      y,
      radius: SWARMER.radius,
      hp: SWARMER.maxHp,
      state: "recover",
      t: 0.4 + w.rng() * 0.4,
      dirX: 0,
      dirY: 0,
      kx: 0,
      ky: 0,
      lastSwing: -1,
      flash: 0,
      hasHit: false,
    });
    burst(w, x, y, "#e5484d", 8, 140);
  }
  if (w.wave > 1) {
    // Placeholder until levelling lands: a small heal between waves.
    w.player.hp = Math.min(PLAYER.maxHp, w.player.hp + 15);
    w.texts.push({ x: w.player.x, y: w.player.y - 30, text: "+15", life: 0.9, color: "#6dff9c", big: false });
  }
}

function burst(w: World, x: number, y: number, color: string, n: number, speed: number): void {
  for (let i = 0; i < n; i++) {
    const a = w.rng() * Math.PI * 2;
    const s = speed * (0.4 + w.rng() * 0.6);
    w.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + w.rng() * 0.3, color });
  }
}

function stepPlayer(w: World, input: Controls, dt: number): void {
  const p = w.player;
  p.facing = Math.atan2(input.mouseY + w.camY - p.y, input.mouseX + w.camX - p.x);

  const axis = input.axis();
  const move = norm(axis.x, axis.y);

  if (input.consume("Space", "ShiftLeft", "ShiftRight") && p.dashCd <= 0) {
    // Dash along the movement keys, or toward the cursor when standing still.
    const dir = move.x || move.y ? move : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    p.dashX = dir.x;
    p.dashY = dir.y;
    p.dashT = PLAYER.dashTime;
    p.dashCd = PLAYER.dashCooldown;
    p.iframes = Math.max(p.iframes, PLAYER.dashIframes);
    p.attackT = 0;
  }

  if (p.dashT > 0) {
    p.x += p.dashX * PLAYER.dashSpeed * dt;
    p.y += p.dashY * PLAYER.dashSpeed * dt;
    if (w.rng() < 0.6) {
      w.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.18, color: "#5ee6ff" });
    }
  } else {
    p.x += move.x * PLAYER.speed * dt;
    p.y += move.y * PLAYER.speed * dt;
  }
  clampToRoom(p, ROOM.w, ROOM.h);

  if (p.attackCd <= 0 && p.dashT <= 0 && (input.attackHeld || input.consume("Mouse0"))) {
    p.attackCd = PLAYER.attackCooldown;
    p.attackT = PLAYER.attackActive;
    p.attackFacing = p.facing;
    p.swingId += 1;
  }

  if (p.attackT > 0) {
    for (const e of w.enemies) {
      if (e.lastSwing === p.swingId) continue;
      if (!inArc(p.x, p.y, p.attackFacing, PLAYER.attackHalfAngle, PLAYER.attackRange, e)) continue;
      e.lastSwing = p.swingId;
      const roll = rollDamage(PLAYER.attackDamage, PLAYER.critChance, PLAYER.critMult, w.rng);
      e.hp = applyDamage(e.hp, roll.amount);
      e.flash = 0.1;
      const k = norm(e.x - p.x, e.y - p.y);
      e.kx = k.x * 300;
      e.ky = k.y * 300;
      // A hit interrupts a wind-up, but never a lunge already in flight.
      if (e.state === "windup" || e.state === "chase") {
        e.state = "recover";
        e.t = 0.22;
      }
      w.texts.push({
        x: e.x,
        y: e.y - 18,
        text: String(roll.amount),
        life: 0.6,
        color: roll.crit ? "#ffd84a" : "#ffffff",
        big: roll.crit,
      });
      burst(w, e.x, e.y, "#ff8a8f", 5, 180);
      w.hitstop = Math.max(w.hitstop, roll.crit ? 0.07 : 0.035);
      w.shake = Math.max(w.shake, roll.crit ? 6 : 3);
    }
  }

  p.dashT = Math.max(0, p.dashT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.attackT = Math.max(0, p.attackT - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
}

function stepEnemy(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy);

  e.x += e.kx * dt;
  e.y += e.ky * dt;
  const decay = Math.exp(-10 * dt);
  e.kx *= decay;
  e.ky *= decay;
  e.flash = Math.max(0, e.flash - dt);

  switch (e.state) {
    case "chase": {
      const d = norm(dx, dy);
      e.x += d.x * SWARMER.speed * dt;
      e.y += d.y * SWARMER.speed * dt;
      if (dist < SWARMER.engageRange) {
        e.state = "windup";
        e.t = SWARMER.windup;
      }
      break;
    }
    case "windup": {
      // Track the player until just before release, so walking away is not
      // enough: the lunge has to be dashed through or stepped around late.
      if (e.t > 0.12) {
        const d = norm(dx, dy);
        e.dirX = d.x;
        e.dirY = d.y;
      }
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "lunge";
        e.t = SWARMER.lungeTime;
        e.hasHit = false;
      }
      break;
    }
    case "lunge": {
      e.x += e.dirX * SWARMER.lungeSpeed * dt;
      e.y += e.dirY * SWARMER.lungeSpeed * dt;
      if (!e.hasHit && p.iframes <= 0 && circlesOverlap(e, { x: p.x, y: p.y, radius: p.radius + 3 })) {
        e.hasHit = true;
        hurtPlayer(w, SWARMER.damage);
      }
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = SWARMER.recover;
      }
      break;
    }
    case "recover": {
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
      break;
    }
  }
  clampToRoom(e, ROOM.w, ROOM.h);
}

function hurtPlayer(w: World, amount: number): void {
  const p = w.player;
  p.hp = applyDamage(p.hp, amount);
  p.iframes = PLAYER.hurtIframes;
  p.hurtFlash = 0.25;
  w.shake = Math.max(w.shake, 10);
  w.hitstop = Math.max(w.hitstop, 0.07);
  w.texts.push({ x: p.x, y: p.y - 24, text: `-${amount}`, life: 0.8, color: "#ff5a60", big: true });
  burst(w, p.x, p.y, "#5ee6ff", 10, 220);
  if (p.hp <= 0) w.dead = true;
}

/** Advance the simulation by one fixed step. */
export function step(w: World, input: Controls, dt: number): void {
  // Effects keep animating through hit-stop and death.
  for (const t of w.texts) {
    t.life -= dt;
    t.y -= 40 * dt;
  }
  for (const pt of w.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  w.texts = w.texts.filter((t) => t.life > 0);
  w.particles = w.particles.filter((pt) => pt.life > 0);
  w.shake = Math.max(0, w.shake - 40 * dt);

  if (w.dead) return;
  if (w.hitstop > 0) {
    w.hitstop -= dt;
    return;
  }

  stepPlayer(w, input, dt);
  for (const e of w.enemies) stepEnemy(w, e, dt);

  // Keep bodies from stacking. A lunging enemy passes through the player.
  for (let i = 0; i < w.enemies.length; i++) {
    for (let j = i + 1; j < w.enemies.length; j++) separate(w.enemies[i], w.enemies[j]);
  }
  for (const e of w.enemies) {
    if (e.state === "lunge" || w.player.dashT > 0) continue;
    const before = { x: w.player.x, y: w.player.y };
    separate(w.player, e);
    // Only the enemy yields: restore the player and move the enemy the full way.
    e.x += before.x - w.player.x;
    e.y += before.y - w.player.y;
    w.player.x = before.x;
    w.player.y = before.y;
  }

  const alive: Enemy[] = [];
  for (const e of w.enemies) {
    if (e.hp > 0) {
      alive.push(e);
    } else {
      w.kills += 1;
      burst(w, e.x, e.y, "#e5484d", 16, 260);
    }
  }
  w.enemies = alive;

  if (w.enemies.length === 0) {
    w.waveDelay -= dt;
    if (w.waveDelay <= 0) {
      spawnWave(w);
      w.waveDelay = 1.5;
    }
  }

  updateCamera(w);
}
