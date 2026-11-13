import { angleDiff, clamp, norm } from "../engine/vec";
import { applyDamage, circlesOverlap, clampToRoom } from "./combat";
import {
  BRUTE,
  CHARGER,
  EXPLODER,
  HEALER,
  KINDS,
  RANKS,
  ROOM,
  SEALED,
  SHOOTER,
  SWARMER,
  type EnemyKind,
  type Rank,
} from "./config";
import { blast, burst, floatText, hurtPlayer, type Enemy, type World } from "./state";

/** Enemy construction, damage rules, and per-kind behaviour. */

/** Extra scaling on top of rank, as in a sealed gate. */
export interface Boost {
  hp: number;
  dmg: number;
  reward: number;
}

export function makeEnemy(kind: EnemyKind, x: number, y: number, rank: Rank, boost: Boost = { hp: 1, dmg: 1, reward: 1 }): Enemy {
  const def = KINDS[kind];
  const r = RANKS[rank];
  // Bosses are tuned per gate already; only regular enemies scale with rank.
  const hp = Math.round(def.hp * (def.boss ? 1 : r.hpMult) * boost.hp);
  return {
    x,
    y,
    radius: def.radius,
    kind,
    hp,
    maxHp: hp,
    dmg: def.damage * (def.boss ? 1 : r.dmgMult) * boost.dmg,
    xp: Math.round(def.xp * (def.boss ? 1 : r.xpMult) * boost.reward),
    boss: def.boss,
    phase: 1,
    state: "recover",
    t: 0.5,
    cd: 1.2,
    cd2: 0,
    n: 0,
    dirX: 1,
    dirY: 0,
    facing: 0,
    kx: 0,
    ky: 0,
    lastSwing: -1,
    flash: 0,
    hasHit: false,
    inv: 0,
  };
}

/**
 * Apply a player hit. Returns false when it was dodged or blocked.
 * (fromX, fromY) is where the attack came from, for shields and knockback.
 */
export function damageEnemy(
  w: World,
  e: Enemy,
  amount: number,
  crit: boolean,
  fromX: number,
  fromY: number,
  knock: number,
): boolean {
  if (e.inv > 0 || e.hp <= 0 || e.immortal) return false;

  // A brute's shield stops hits from the front, except while it recovers.
  if (e.kind === "brute" && e.state !== "recover") {
    const toAttacker = Math.atan2(fromY - e.y, fromX - e.x);
    if (Math.abs(angleDiff(toAttacker, e.facing)) < BRUTE.shieldHalf) {
      floatText(w, e.x, e.y, "BLOCK", "#9fb4d0");
      burst(w, e.x, e.y, "#9fd0ff", 4, 160);
      w.hitstop = Math.max(w.hitstop, 0.03);
      return false;
    }
  }

  const dmg = Math.round(amount);
  e.hp = applyDamage(e.hp, dmg);
  e.flash = 0.1;
  floatText(w, e.x, e.y, String(dmg), crit ? "#ffd84a" : "#ffffff", crit);
  burst(w, e.x, e.y, "#ff8a8f", 5, 180);
  w.hitstop = Math.max(w.hitstop, crit ? 0.07 : 0.035);
  w.shake = Math.max(w.shake, crit ? 6 : 3);

  if (e.boss) {
    if (e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp / 2) {
      e.phase = 2;
      e.inv = 0.8;
      e.cd = 1;
      w.notices.push({ title: KINDS[e.kind].name.toUpperCase(), body: "It will not hold back any longer.", life: 2.5 });
      burst(w, e.x, e.y, "#ff5a60", 30, 380);
      w.shockwaves.push({ x: e.x, y: e.y, r: e.radius, speed: 320, maxR: 420, damage: e.dmg * 0.6, hit: false });
    }
    return true;
  }

  const k = norm(e.x - fromX, e.y - fromY);
  const heavy = e.kind === "brute" ? 0.25 : e.kind === "charger" ? 0.6 : 1;
  e.kx = k.x * knock * heavy;
  e.ky = k.y * knock * heavy;

  // Light enemies flinch out of a wind-up. Committed attacks are never stopped.
  if (e.kind === "swarmer" && (e.state === "windup" || e.state === "chase")) {
    e.state = "recover";
    e.t = 0.22;
  } else if ((e.kind === "shooter" || e.kind === "healer") && e.state !== "idle") {
    e.state = "idle";
    e.cd = Math.max(e.cd, 0.7);
  }
  return true;
}

/** Make an enemy for the gate in progress, with its modifiers applied. */
export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number): Enemy {
  return makeEnemy(kind, x, y, w.rank, w.sealed ? SEALED : undefined);
}

function fire(w: World, e: Enemy, angle: number, speed: number, damage: number): void {
  w.projectiles.push({
    x: e.x + Math.cos(angle) * e.radius,
    y: e.y + Math.sin(angle) * e.radius,
    radius: 7,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    life: 3.5,
  });
}

function move(e: Enemy, dx: number, dy: number, speed: number, dt: number): void {
  const d = norm(dx, dy);
  e.x += d.x * speed * dt;
  e.y += d.y * speed * dt;
}

/** Hold a band of distance from the player, strafing while inside it. */
function keepDistance(e: Enemy, dx: number, dy: number, dist: number, near: number, far: number, speed: number, dt: number): void {
  if (dist < near) move(e, -dx, -dy, speed, dt);
  else if (dist > far) move(e, dx, dy, speed, dt);
  else move(e, -dy, dx, speed * 0.4 * (e.n % 2 === 0 ? 1 : -1), dt);
}

/** A straight-line attack in flight: hits the player once on contact. */
function contactHit(w: World, e: Enemy): void {
  const p = w.player;
  if (!e.hasHit && circlesOverlap(e, { x: p.x, y: p.y, radius: p.radius + 3 })) {
    if (hurtPlayer(w, e.dmg)) e.hasHit = true;
  }
}

function trackDir(e: Enemy, dx: number, dy: number): void {
  const d = norm(dx, dy);
  e.dirX = d.x;
  e.dirY = d.y;
  e.facing = Math.atan2(d.y, d.x);
}

function randomSpot(w: World, minFromPlayer: number): { x: number; y: number } {
  let x = ROOM.w / 2;
  let y = ROOM.h / 2;
  for (let tries = 0; tries < 20; tries++) {
    x = 80 + w.rng() * (ROOM.w - 160);
    y = 80 + w.rng() * (ROOM.h - 160);
    if (Math.hypot(x - w.player.x, y - w.player.y) > minFromPlayer) break;
  }
  return { x, y };
}

export function spawnPoint(w: World): { x: number; y: number } {
  return randomSpot(w, 340);
}

function stepSwarmer(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "chase":
      trackDir(e, dx, dy);
      move(e, dx, dy, SWARMER.speed, dt);
      if (dist < SWARMER.engageRange) {
        e.state = "windup";
        e.t = SWARMER.windup;
      }
      break;
    case "windup":
      // Track the player until just before release, so walking away is not
      // enough: the lunge has to be dashed through or stepped around late.
      if (e.t > 0.12) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "lunge";
        e.t = SWARMER.lungeTime;
        e.hasHit = false;
      }
      break;
    case "lunge":
      e.x += e.dirX * SWARMER.lungeSpeed * dt;
      e.y += e.dirY * SWARMER.lungeSpeed * dt;
      contactHit(w, e);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = SWARMER.recover;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

function stepCharger(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "chase":
      trackDir(e, dx, dy);
      if (dist > CHARGER.range) move(e, dx, dy, KINDS.charger.speed, dt);
      else {
        e.state = "windup";
        e.t = CHARGER.windup;
      }
      break;
    case "windup":
      if (e.t > 0.2) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "charge";
        e.t = CHARGER.chargeTime;
        e.hasHit = false;
      }
      break;
    case "charge":
      e.x += e.dirX * CHARGER.chargeSpeed * dt;
      e.y += e.dirY * CHARGER.chargeSpeed * dt;
      contactHit(w, e);
      e.t -= dt;
      if (e.x < e.radius || e.x > ROOM.w - e.radius || e.y < e.radius || e.y > ROOM.h - e.radius) {
        // Baiting it into a wall leaves it stunned and open.
        e.state = "recover";
        e.t = CHARGER.stun;
        w.shake = Math.max(w.shake, 4);
        burst(w, e.x, e.y, "#ffb060", 8, 200);
      } else if (e.t <= 0) {
        e.state = "recover";
        e.t = CHARGER.recover;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

function stepShooter(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  if (e.state === "windup") {
    if (e.t > 0.1) trackDir(e, dx, dy);
    e.t -= dt;
    if (e.t <= 0) {
      fire(w, e, e.facing, SHOOTER.shotSpeed, e.dmg);
      e.state = "idle";
      e.cd = SHOOTER.cooldown;
      e.n += 1;
    }
    return;
  }
  if (e.state !== "idle") {
    e.t -= dt;
    if (e.t <= 0) e.state = "idle";
    return;
  }
  trackDir(e, dx, dy);
  keepDistance(e, dx, dy, dist, SHOOTER.near, SHOOTER.far, KINDS.shooter.speed, dt);
  if (e.cd <= 0) {
    e.state = "windup";
    e.t = SHOOTER.windup;
  }
}

function stepBrute(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "chase": {
      // It turns slowly, so its back can be reached.
      const want = Math.atan2(dy, dx);
      e.facing += clamp(angleDiff(want, e.facing), -BRUTE.turnRate * dt, BRUTE.turnRate * dt);
      move(e, dx, dy, KINDS.brute.speed, dt);
      if (dist < BRUTE.range) {
        e.state = "windup";
        e.t = BRUTE.windup;
        w.zones.push({ x: e.x, y: e.y, radius: BRUTE.slamRadius, t: BRUTE.windup, total: BRUTE.windup, damage: e.dmg, owner: e });
      }
      break;
    }
    case "windup":
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = BRUTE.recover;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

function stepExploder(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "chase":
      trackDir(e, dx, dy);
      move(e, dx, dy, KINDS.exploder.speed, dt);
      if (dist < EXPLODER.range) {
        e.state = "fuse";
        e.t = EXPLODER.fuse;
      }
      break;
    case "fuse":
      // Killing it before the fuse ends prevents the blast.
      e.t -= dt;
      if (e.t <= 0) {
        blast(w, e.x, e.y, EXPLODER.blastRadius, e.dmg, "#ffd84a");
        e.hp = 0;
        e.xp = 0;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

function stepHealer(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  if (e.state === "cast") {
    e.t -= dt;
    if (e.t <= 0) {
      for (const o of w.enemies) {
        if (o === e || o.hp <= 0 || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > HEALER.radius) continue;
        const amount = Math.min(o.maxHp - o.hp, Math.round(o.maxHp * HEALER.heal));
        o.hp += amount;
        floatText(w, o.x, o.y, `+${amount}`, "#6dff9c");
      }
      w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: HEALER.radius, t: 0.4, total: 0.4, color: "#6dff9c" });
      e.state = "idle";
      e.cd = HEALER.cooldown;
      e.n += 1;
    }
    return;
  }
  if (e.state === "windup") {
    if (e.t > 0.1) trackDir(e, dx, dy);
    e.t -= dt;
    if (e.t <= 0) {
      fire(w, e, e.facing, SHOOTER.shotSpeed * 0.8, e.dmg);
      e.state = "idle";
      e.cd = 2.6;
      e.n += 1;
    }
    return;
  }
  if (e.state !== "idle") {
    e.t -= dt;
    if (e.t <= 0) e.state = "idle";
    return;
  }
  trackDir(e, dx, dy);
  keepDistance(e, dx, dy, dist, HEALER.near, HEALER.far, KINDS.healer.speed, dt);
  if (e.cd <= 0) {
    const wounded = w.enemies.some(
      (o) => o !== e && o.hp > 0 && o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) <= HEALER.radius,
    );
    // With nobody to mend, it fights for itself.
    e.state = wounded ? "cast" : "windup";
    e.t = wounded ? HEALER.cast : SHOOTER.windup;
  }
}

/** E-rank boss: slams the ground where the player stands. */
function stepWarden(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  const two = e.phase === 2;
  if (e.state === "attack") {
    // Phase two follows the first slam with two more, each re-aimed.
    if (e.n > 0 && e.cd2 <= 0) {
      w.zones.push({ x: p.x, y: p.y, radius: 110, t: 0.7, total: 0.7, damage: e.dmg, owner: e });
      e.n -= 1;
      e.cd2 = 0.35;
    }
    e.t -= dt;
    if (e.t <= 0) {
      if (two) w.shockwaves.push({ x: e.x, y: e.y, r: e.radius, speed: 300, maxR: 620, damage: e.dmg * 0.8, hit: false });
      e.state = "chase";
      e.cd = two ? 1.1 : 1.6;
    }
    return;
  }
  if (e.state !== "chase") {
    e.t -= dt;
    if (e.t <= 0) e.state = "chase";
    return;
  }
  trackDir(e, dx, dy);
  if (dist > 90) move(e, dx, dy, KINDS.warden.speed * (two ? 1.3 : 1), dt);
  if (e.cd > 0) return;
  if (dist < 150) {
    w.zones.push({ x: e.x, y: e.y, radius: 175, t: 0.7, total: 0.7, damage: e.dmg, owner: e });
    e.t = 1.2;
    e.n = 0;
  } else {
    w.zones.push({ x: p.x, y: p.y, radius: 120, t: 0.85, total: 0.85, damage: e.dmg, owner: e });
    e.n = two ? 2 : 0;
    e.cd2 = 0.35;
    e.t = two ? 1.9 : 1.3;
  }
  e.state = "attack";
}

/** D-rank boss: keeps away, calls minions, and fills the room with shots. */
function stepSummoner(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const two = e.phase === 2;
  if (e.state === "cast") {
    e.t -= dt;
    if (e.t <= 0) {
      const count = two ? 16 : 10;
      const offset = w.rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) fire(w, e, offset + (i / count) * Math.PI * 2, 250, e.dmg);
      e.state = "idle";
    }
    return;
  }
  if (e.state !== "idle") {
    e.t -= dt;
    if (e.t <= 0) e.state = "idle";
    return;
  }
  trackDir(e, dx, dy);
  keepDistance(e, dx, dy, dist, 300, 460, KINDS.summoner.speed, dt);

  // Blink away when cornered.
  if (dist < 150 && e.cd2 <= 0) {
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 70, t: 0.35, total: 0.35, color: "#b070ff" });
    const spot = randomSpot(w, 380);
    e.x = spot.x;
    e.y = spot.y;
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 70, t: 0.35, total: 0.35, color: "#b070ff" });
    e.cd2 = two ? 2.5 : 4;
  }
  if (e.cd > 0) return;

  const minions = w.enemies.length + w.spawnQueue.length - 1;
  if (e.n % 2 === 0 && minions < (two ? 5 : 4)) {
    const kinds: EnemyKind[] = two ? ["swarmer", "charger"] : ["swarmer", "swarmer"];
    kinds.forEach((kind, i) => {
      const a = w.rng() * Math.PI * 2;
      const m = spawnEnemy(w, kind, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
      m.t = 0.6 + i * 0.2;
      m.xp = 0;
      clampToRoom(m, ROOM.w, ROOM.h);
      w.spawnQueue.push(m);
      burst(w, m.x, m.y, "#b070ff", 10, 180);
    });
  } else {
    e.state = "cast";
    e.t = 0.6;
  }
  e.n += 1;
  e.cd = two ? 1.9 : 2.6;
}

/** C-rank boss: a fast duellist that answers the player's dash with its own. */
function stepDuellist(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  const two = e.phase === 2;
  switch (e.state) {
    case "stalk": {
      trackDir(e, dx, dy);
      if (dist > 200) move(e, dx, dy, KINDS.duellist.speed, dt);
      else move(e, -dy, dx, KINDS.duellist.speed * 0.7, dt);

      if (p.dashT > 0 && e.cd2 <= 0) {
        // Mirror: sidestep untouchably, then strike at once.
        const side = norm(-dy, dx);
        e.kx = side.x * 700;
        e.ky = side.y * 700;
        e.inv = 0.25;
        e.cd2 = two ? 1.5 : 2.5;
        e.state = "windup";
        e.t = 0.28;
        e.n = two ? 1 : 0;
      } else if (e.cd <= 0 && dist < 260) {
        e.state = "windup";
        e.t = 0.4;
        e.n = two ? 2 : 1;
      }
      break;
    }
    case "windup":
      if (e.t > 0.08) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "strike";
        e.t = 0.2;
        e.hasHit = false;
      }
      break;
    case "strike":
      e.x += e.dirX * 900 * dt;
      e.y += e.dirY * 900 * dt;
      contactHit(w, e);
      e.t -= dt;
      if (e.t <= 0) {
        if (e.n > 0) {
          e.n -= 1;
          e.state = "windup";
          e.t = 0.22;
        } else {
          if (two) {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            for (const off of [-0.3, 0, 0.3]) fire(w, e, a + off, 380, e.dmg * 0.5);
          }
          e.state = "recover";
          e.t = 0.55;
          e.cd = 1.1;
        }
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "stalk";
  }
}

export function stepEnemy(w: World, e: Enemy, dt: number): void {
  const p = w.player;
  e.x += e.kx * dt;
  e.y += e.ky * dt;
  const decay = Math.exp(-10 * dt);
  e.kx *= decay;
  e.ky *= decay;
  e.flash = Math.max(0, e.flash - dt);
  e.inv = Math.max(0, e.inv - dt);
  e.cd = Math.max(0, e.cd - dt);
  e.cd2 = Math.max(0, e.cd2 - dt);

  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy);

  switch (e.kind) {
    case "swarmer":
      stepSwarmer(w, e, dt, dx, dy, dist);
      break;
    case "charger":
      stepCharger(w, e, dt, dx, dy, dist);
      break;
    case "shooter":
      stepShooter(w, e, dt, dx, dy, dist);
      break;
    case "brute":
      stepBrute(w, e, dt, dx, dy, dist);
      break;
    case "exploder":
      stepExploder(w, e, dt, dx, dy, dist);
      break;
    case "healer":
      stepHealer(w, e, dt, dx, dy, dist);
      break;
    case "warden":
      stepWarden(w, e, dt, dx, dy, dist);
      break;
    case "summoner":
      stepSummoner(w, e, dt, dx, dy, dist);
      break;
    case "duellist":
      stepDuellist(w, e, dt, dx, dy, dist);
      break;
  }
  clampToRoom(e, ROOM.w, ROOM.h);
}

/** States in which an enemy is mid-attack and passes through bodies. */
export function isCommitted(e: Enemy): boolean {
  return e.state === "lunge" || e.state === "charge" || e.state === "strike";
}
