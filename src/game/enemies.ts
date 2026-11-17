import { angleDiff, clamp, norm } from "../engine/vec";
import { applyDamage, circlesOverlap, clampToRoom } from "./combat";
import {
  ASSASSIN,
  BRUTE,
  CHARGER,
  COLOSSUS,
  DOMAIN,
  MARK,
  DOMINION,
  EGG,
  EXPLODER,
  HEALER,
  KINDS,
  KNIGHT,
  LEAPER,
  PHASES,
  PYRO,
  RANKS,
  RING_WARNING,
  ROAR,
  ROOM,
  NGPLUS,
  NIGHTMARE,
  SEALED_SCALE,
  SHOOTER,
  SWARMER,
  TOTEM,
  WARDER,
  WARPER,
  type EnemyKind,
  type Rank,
  type StatusId,
} from "./config";
import { afflict, blast, burst, floatText, hurtPlayer, sfx, type Enemy, type World } from "./state";

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
    stage: 0,
    extraCd: 0,
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
    tx: 0,
    ty: 0,
    sx: 0,
    sy: 0,
    guard: kind === "knight" ? Math.round(hp * KNIGHT.guard) : 0,
    slowT: 0,
    dot: 0,
    dotT: 0,
    chillT: 0,
    markT: 0,
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
      sfx(w, "block");
      burst(w, e.x, e.y, "#9fd0ff", 4, 160);
      w.hitstop = Math.max(w.hitstop, 0.03);
      return false;
    }
  }

  // A guard soaks every hit until it breaks, and then the knight is stunned and open.
  if (e.guard > 0 && e.state !== "broken") {
    e.guard -= amount;
    e.flash = 0.06;
    sfx(w, "block");
    w.hitstop = Math.max(w.hitstop, 0.03);
    if (e.guard <= 0) {
      e.guard = 0;
      e.state = "broken";
      e.t = KNIGHT.broken;
      floatText(w, e.x, e.y, "GUARD BROKEN", "#ffd84a", true);
      burst(w, e.x, e.y, "#ffd84a", 14, 260);
      w.shake = Math.max(w.shake, 6);
    } else floatText(w, e.x, e.y, "GUARD", "#d0d8e8");
    return true;
  }

  let scaled = amount;
  // A warder shields every other enemy standing near it.
  const shielded =
    e.kind !== "warder" &&
    w.enemies.some((o) => o !== e && o.kind === "warder" && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < WARDER.aura);
  if (shielded) scaled *= WARDER.shield;
  if (w.domainT > 0) scaled *= DOMAIN.vulnerable;
  if (e.markT > 0) scaled *= MARK.vulnerable;

  const dmg = Math.round(scaled);
  e.hp = applyDamage(e.hp, dmg);
  e.flash = 0.1;
  sfx(w, crit ? "crit" : "hit");
  floatText(w, e.x, e.y, String(dmg), shielded ? "#7fd0ff" : crit ? "#ffd84a" : "#ffffff", crit);
  burst(w, e.x, e.y, "#ff8a8f", 5, 180);
  w.hitstop = Math.max(w.hitstop, crit ? 0.07 : 0.035);
  w.shake = Math.max(w.shake, crit ? 6 : 3);

  if (e.boss) {
    // Most bosses have two phases; a few have more, split evenly across their health.
    const phases = PHASES[e.kind] ?? 2;
    if (e.phase < phases && e.hp > 0 && e.hp <= e.maxHp * (1 - e.phase / phases)) {
      e.phase += 1;
      if (e.kind === "commander") e.guard = Math.round(e.maxHp * 0.08);
      if (e.kind === "monarch" && e.phase === 3) e.cd2 = 6;
      sfx(w, "phase");
      // The roar: untouchable while it gathers itself, attacks cancelled, and
      // anyone close is thrown clear without harm.
      e.inv = ROAR.pause;
      e.state = "recover";
      e.t = ROAR.pause;
      e.cd = Math.max(e.cd, ROAR.pause + 0.4);
      e.n = 0;
      w.zones = w.zones.filter((z) => z.owner !== e);
      w.notices.push({ title: KINDS[e.kind].name.toUpperCase(), body: "It will not hold back any longer.", life: 2.5 });
      burst(w, e.x, e.y, "#ff5a60", 30, 380);
      w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: ROAR.radius, t: 0.5, total: 0.5, color: "#ff5a60" });
      const p = w.player;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      if (Math.hypot(dx, dy) < ROAR.radius) {
        const away = Math.hypot(dx, dy) > 1 ? norm(dx, dy) : { x: 1, y: 0 };
        p.kx = away.x * ROAR.push;
        p.ky = away.y * ROAR.push;
        p.dashT = 0;
        p.lungeT = 0;
      }
    }
    return true;
  }

  const k = norm(e.x - fromX, e.y - fromY);
  const HEAVY: Partial<Record<EnemyKind, number>> = { brute: 0.25, charger: 0.6, warder: 0.3, knight: 0.5, colossus: 0.1, totem: 0, egg: 0 };
  const heavy = HEAVY[e.kind] ?? 1;
  e.kx = k.x * knock * heavy;
  e.ky = k.y * knock * heavy;

  // Light enemies flinch out of a wind-up. Committed attacks are never stopped.
  if (e.kind === "swarmer" && (e.state === "windup" || e.state === "chase")) {
    e.state = "recover";
    e.t = 0.22;
  } else if ((e.kind === "shooter" || e.kind === "healer" || e.kind === "pyro" || e.kind === "warper") && e.state !== "idle") {
    e.state = "idle";
    e.cd = Math.max(e.cd, 0.7);
  }
  return true;
}

/** Make an enemy for the gate in progress, with its modifiers applied. */
export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number): Enemy {
  const e = makeEnemy(kind, x, y, w.rank, w.sealed ? SEALED_SCALE[w.rank] : undefined);
  const cycle = w.profile.cycle;
  if (cycle > 0) {
    // New Game+: everything is tougher, hits harder, and is worth more.
    const m = 1 + NGPLUS.harder * cycle;
    e.maxHp = Math.round(e.maxHp * m);
    e.hp = e.maxHp;
    e.dmg *= m;
    e.xp = Math.round(e.xp * (1 + NGPLUS.reward * cycle));
  }
  if (w.profile.nightmare) {
    e.maxHp = Math.round(e.maxHp * NIGHTMARE.hp);
    e.hp = e.maxHp;
    e.dmg *= NIGHTMARE.dmg;
    e.xp = Math.round(e.xp * NIGHTMARE.reward);
  }
  return e;
}

function fire(w: World, e: Enemy, angle: number, speed: number, damage: number, status?: StatusId): void {
  sfx(w, "shot");
  w.projectiles.push({
    x: e.x + Math.cos(angle) * e.radius,
    y: e.y + Math.sin(angle) * e.radius,
    radius: 7,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    life: 3.5,
    status,
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
function contactHit(w: World, e: Enemy, status?: StatusId): void {
  const p = w.player;
  if (!e.hasHit && circlesOverlap(e, { x: p.x, y: p.y, radius: p.radius + 3 })) {
    if (hurtPlayer(w, e.dmg, status)) e.hasHit = true;
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
      sfx(w, "heal");
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
      if (two) w.shockwaves.push({ x: e.x, y: e.y, wait: RING_WARNING, r: e.radius + 20, speed: 300, maxR: 620, damage: e.dmg * 0.8, hit: false });
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
    w.zones.push({ x: p.x, y: p.y, radius: 120, t: 1, total: 1, damage: e.dmg, owner: e });
    e.n = two ? 2 : 0;
    e.cd2 = 0.35;
    e.t = two ? 2.05 : 1.45;
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
  keepDistance(e, dx, dy, dist, 230, 390, KINDS.summoner.speed, dt);

  // Blink away when cornered.
  if (dist < 150 && e.cd2 <= 0) {
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 70, t: 0.35, total: 0.35, color: "#b070ff" });
    const spot = randomSpot(w, 380);
    e.x = spot.x;
    e.y = spot.y;
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 70, t: 0.35, total: 0.35, color: "#b070ff" });
    e.cd2 = two ? 4 : 6;
  }
  if (e.cd > 0) return;

  const minions = w.enemies.length + w.spawnQueue.length - 1;
  if (e.n % 2 === 0 && minions < (two ? 4 : 3)) {
    sfx(w, "summon");
    const kinds: EnemyKind[] = two ? ["swarmer", "charger"] : ["swarmer", "swarmer"];
    kinds.forEach((kind, i) => {
      const a = w.rng() * Math.PI * 2;
      const m = spawnEnemy(w, kind, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
      m.t = 0.6 + i * 0.2;
      m.xp = 0;
      // Summoned minions are fodder: half as tough as the real thing.
      m.maxHp = Math.round(m.maxHp / 2);
      m.hp = m.maxHp;
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

/** Rank B: springs onto where the player stands. The landing spot is marked. */
function stepLeaper(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  switch (e.state) {
    case "chase":
      trackDir(e, dx, dy);
      if (dist > LEAPER.range) move(e, dx, dy, KINDS.leaper.speed, dt);
      else if (e.cd <= 0) {
        e.state = "windup";
        e.t = LEAPER.windup;
        e.tx = p.x;
        e.ty = p.y;
        const fuse = LEAPER.windup + LEAPER.air;
        w.zones.push({ x: e.tx, y: e.ty, radius: LEAPER.radius, t: fuse, total: fuse, damage: e.dmg, owner: e });
      } else move(e, -dy, dx, KINDS.leaper.speed * 0.6, dt);
      break;
    case "windup":
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "leap";
        e.t = LEAPER.air;
        e.sx = e.x;
        e.sy = e.y;
        // In the air it cannot be reached.
        e.inv = LEAPER.air;
      }
      break;
    case "leap": {
      e.t -= dt;
      const k = 1 - Math.max(0, e.t) / LEAPER.air;
      e.x = e.sx + (e.tx - e.sx) * k;
      e.y = e.sy + (e.ty - e.sy) * k;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = LEAPER.recover;
        e.cd = LEAPER.cooldown;
      }
      break;
    }
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

/** Rank B: keeps away and drops delayed fire on and around the player. */
function stepPyro(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  if (e.state === "cast") {
    e.t -= dt;
    if (e.t <= 0) {
      for (let i = 0; i < 3; i++) {
        const a = w.rng() * Math.PI * 2;
        const r = i === 0 ? 0 : PYRO.spread * (0.5 + 0.5 * w.rng());
        w.zones.push({
          x: clamp(p.x + Math.cos(a) * r, 40, ROOM.w - 40),
          y: clamp(p.y + Math.sin(a) * r, 40, ROOM.h - 40),
          radius: PYRO.radius,
          t: PYRO.fuse,
          total: PYRO.fuse,
          damage: e.dmg,
          owner: e,
          status: "burn",
        });
      }
      e.state = "idle";
      e.cd = PYRO.cooldown;
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
  keepDistance(e, dx, dy, dist, PYRO.near, PYRO.far, KINDS.pyro.speed, dt);
  if (e.cd <= 0) {
    e.state = "cast";
    e.t = PYRO.cast;
  }
}

/** Rank B: slow and tough; its presence shields the enemies around it. */
function stepWarder(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "chase":
      trackDir(e, dx, dy);
      move(e, dx, dy, KINDS.warder.speed, dt);
      if (dist < WARDER.range) {
        e.state = "windup";
        e.t = WARDER.windup;
        w.zones.push({ x: e.x, y: e.y, radius: WARDER.slamRadius, t: WARDER.windup, total: WARDER.windup, damage: e.dmg, owner: e });
      }
      break;
    case "windup":
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = WARDER.recover;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

/** Rank A: vanishes, then strikes from behind with a poisoned blade. */
function stepAssassin(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  switch (e.state) {
    case "stalk":
      trackDir(e, dx, dy);
      if (dist > 190) move(e, dx, dy, KINDS.assassin.speed, dt);
      else move(e, -dy, dx, KINDS.assassin.speed * 0.7, dt);
      if (e.cd <= 0 && dist < 420) {
        e.state = "vanish";
        e.t = ASSASSIN.vanish;
        e.inv = ASSASSIN.vanish;
        w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 40, t: 0.3, total: 0.3, color: "#9b5cff" });
      }
      break;
    case "vanish":
      e.t -= dt;
      if (e.t <= 0) {
        // It reappears at the player's back.
        e.x = p.x - Math.cos(p.facing) * ASSASSIN.behind;
        e.y = p.y - Math.sin(p.facing) * ASSASSIN.behind;
        clampToRoom(e, ROOM.w, ROOM.h);
        trackDir(e, p.x - e.x, p.y - e.y);
        e.state = "windup";
        e.t = ASSASSIN.windup;
        w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 40, t: 0.3, total: 0.3, color: "#9b5cff" });
      }
      break;
    case "windup":
      if (e.t > 0.1) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "strike";
        e.t = ASSASSIN.lungeTime;
        e.hasHit = false;
      }
      break;
    case "strike":
      e.x += e.dirX * ASSASSIN.lungeSpeed * dt;
      e.y += e.dirY * ASSASSIN.lungeSpeed * dt;
      contactHit(w, e, "poison");
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = ASSASSIN.recover;
        e.cd = ASSASSIN.cooldown;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "stalk";
  }
}

/** Rank A: a guard that soaks hits until it breaks, then a double lunge. */
function stepKnight(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "broken":
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "chase";
        e.guard = Math.round(e.maxHp * KNIGHT.guard);
      }
      break;
    case "chase":
      trackDir(e, dx, dy);
      move(e, dx, dy, KINDS.knight.speed, dt);
      if (dist < KNIGHT.range) {
        e.state = "windup";
        e.t = KNIGHT.windup;
        e.n = 1;
      }
      break;
    case "windup":
      if (e.t > 0.1) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "lunge";
        e.t = KNIGHT.lungeTime;
        e.hasHit = false;
      }
      break;
    case "lunge":
      e.x += e.dirX * KNIGHT.lungeSpeed * dt;
      e.y += e.dirY * KNIGHT.lungeSpeed * dt;
      contactHit(w, e);
      e.t -= dt;
      if (e.t <= 0) {
        if (e.n > 0) {
          e.n -= 1;
          e.state = "windup";
          e.t = 0.3;
        } else {
          e.state = "recover";
          e.t = KNIGHT.recover;
        }
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

/** Rank S: trades places with the player, dropping them among its allies. */
function stepWarper(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  if (e.state === "cast") {
    e.t -= dt;
    if (e.t <= 0) {
      // A dash through the end of the cast slips the swap.
      if (p.iframes <= 0 && w.mode === "gate") {
        const ex = e.x;
        const ey = e.y;
        e.x = p.x;
        e.y = p.y;
        p.x = ex;
        p.y = ey;
        afflict(w, "slow");
        w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 60, t: 0.35, total: 0.35, color: "#40e0ff" });
        w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 60, t: 0.35, total: 0.35, color: "#40e0ff" });
        sfx(w, "summon");
      }
      e.state = "idle";
      e.cd = WARPER.cooldown;
      e.n += 1;
    }
    return;
  }
  if (e.state === "windup") {
    if (e.t > 0.1) trackDir(e, dx, dy);
    e.t -= dt;
    if (e.t <= 0) {
      fire(w, e, e.facing, SHOOTER.shotSpeed, e.dmg, "slow");
      e.state = "idle";
      e.cd = WARPER.shotCooldown;
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
  keepDistance(e, dx, dy, dist, WARPER.near, WARPER.far, KINDS.warper.speed, dt);
  if (e.cd <= 0) {
    const swap = e.n % 2 === 0;
    e.state = swap ? "cast" : "windup";
    e.t = swap ? WARPER.cast : SHOOTER.windup;
  }
}

/** Rank S: a giant whose slam leaves the ground burning. */
function stepColossus(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  switch (e.state) {
    case "chase":
      trackDir(e, dx, dy);
      move(e, dx, dy, KINDS.colossus.speed, dt);
      if (dist < COLOSSUS.range) {
        e.state = "windup";
        e.t = COLOSSUS.windup;
        w.zones.push({
          x: e.x,
          y: e.y,
          radius: COLOSSUS.slamRadius,
          t: COLOSSUS.windup,
          total: COLOSSUS.windup,
          damage: e.dmg,
          owner: e,
          status: "burn",
          patch: COLOSSUS.patchLife,
        });
      }
      break;
    case "windup":
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = COLOSSUS.recover;
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "chase";
  }
}

/** Laid by the Brood Queen. Destroy it, or it hatches. */
function stepEgg(w: World, e: Enemy, dt: number): void {
  if (e.state !== "egg") {
    e.state = "egg";
    e.t = EGG.hatch;
  }
  e.t -= dt;
  if (e.t > 0) return;
  const m = spawnEnemy(w, "leaper", e.x, e.y);
  m.xp = 0;
  m.maxHp = Math.round(m.maxHp / 2);
  m.hp = m.maxHp;
  m.t = 0.4;
  w.spawnQueue.push(m);
  burst(w, e.x, e.y, "#c8e060", 12, 220);
  e.hp = 0;
}

/** Rank B boss: lays eggs, spits poison, and sweeps anyone who stays close. */
function stepQueen(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const two = e.phase >= 2;
  if (e.state === "spit") {
    if (e.t > 0.1) trackDir(e, dx, dy);
    e.t -= dt;
    if (e.t <= 0) {
      const n = two ? 5 : 3;
      for (let i = 0; i < n; i++) fire(w, e, e.facing + (i - (n - 1) / 2) * 0.22, 300, e.dmg * 0.5, "poison");
      e.state = "idle";
    }
    return;
  }
  if (e.state === "sweep") {
    e.t -= dt;
    if (e.t <= 0) {
      if (two) w.shockwaves.push({ x: e.x, y: e.y, wait: RING_WARNING, r: e.radius + 20, speed: 300, maxR: 640, damage: e.dmg * 0.6, hit: false });
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
  if (dist > 170) move(e, dx, dy, KINDS.queen.speed * (two ? 1.3 : 1), dt);
  if (e.cd > 0) return;

  const turn = e.n % 3;
  e.n += 1;
  if (turn === 0) {
    const brood = w.enemies.filter((o) => o.kind === "egg" || (o.kind === "leaper" && o.xp === 0)).length + w.spawnQueue.length;
    const lay = Math.max(0, Math.min(two ? 5 : 3, EGG.max - brood));
    for (let i = 0; i < lay; i++) {
      const a = w.rng() * Math.PI * 2;
      const r = 90 + w.rng() * 80;
      const egg = spawnEnemy(w, "egg", e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
      egg.state = "egg";
      egg.t = two ? EGG.hatchFast : EGG.hatch;
      clampToRoom(egg, ROOM.w, ROOM.h);
      w.spawnQueue.push(egg);
    }
    if (lay > 0) sfx(w, "summon");
  } else if (turn === 1) {
    e.state = "spit";
    e.t = 0.5;
  } else {
    w.zones.push({ x: e.x, y: e.y, radius: 190, t: 0.9, total: 0.9, damage: e.dmg, owner: e });
    e.state = "sweep";
    e.t = 1.2;
  }
  e.cd = two ? 2 : 2.6;
}

/** Rank A boss: three mounted charges, then, on foot, a guarded duel. */
function stepCommander(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const two = e.phase >= 2;
  switch (e.state) {
    case "broken":
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "duel";
        e.guard = Math.round(e.maxHp * 0.08);
      }
      break;
    case "ride":
      trackDir(e, dx, dy);
      keepDistance(e, dx, dy, dist, 300, 440, KINDS.commander.speed, dt);
      if (e.cd <= 0) {
        e.state = "windup";
        e.t = 0.7;
        e.n = 2;
      }
      break;
    case "windup":
      // The line is fixed early enough to walk out of it: a dash cannot
      // recharge between three charges, so none of them may need one.
      if (e.t > 0.3) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "charge";
        e.t = 0.7;
        e.hasHit = false;
      }
      break;
    case "charge": {
      e.x += e.dirX * 820 * dt;
      e.y += e.dirY * 820 * dt;
      contactHit(w, e);
      e.t -= dt;
      const wall = e.x < e.radius || e.x > ROOM.w - e.radius || e.y < e.radius || e.y > ROOM.h - e.radius;
      if (wall || e.t <= 0) {
        if (e.n > 0) {
          e.n -= 1;
          e.state = "windup";
          e.t = 0.6;
        } else {
          // After the third charge the horse is blown: the opening.
          e.state = "recover";
          e.t = 1.3;
          e.cd = 1.6;
        }
      }
      break;
    }
    case "duel":
      trackDir(e, dx, dy);
      if (dist > 70) move(e, dx, dy, KINDS.commander.speed * 1.1, dt);
      else if (e.cd <= 0) {
        e.state = "dwind";
        e.t = 0.4;
        e.n = 1;
      }
      break;
    case "dwind":
      if (e.t > 0.12) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "strike";
        e.t = 0.18;
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
          e.state = "dwind";
          e.t = 0.3;
        } else {
          w.shockwaves.push({ x: e.x, y: e.y, wait: RING_WARNING, r: e.radius + 20, speed: 320, maxR: 600, damage: e.dmg * 0.6, hit: false });
          e.state = "recover";
          e.t = 0.9;
          e.cd = 1.2;
        }
      }
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = two ? "duel" : "ride";
  }
}

/**
 * Rank S boss, in three phases: a barrage; then guards and strikes from
 * behind; then Dominion, which turns the player's own echoes on them.
 * While idle, `tx` counts ground blasts still to place and `ty` times them.
 */
function stepMonarch(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  const ph = e.phase;
  switch (e.state) {
    case "cast":
      e.t -= dt;
      if (e.t <= 0) {
        const count = 14 + 4 * (ph - 1);
        const offset = w.rng() * Math.PI * 2;
        for (let i = 0; i < count; i++) fire(w, e, offset + (i / count) * Math.PI * 2, 260, e.dmg * 0.5);
        e.state = "idle";
      }
      return;
    case "dominion":
      e.t -= dt;
      if (e.t <= 0) {
        // The Crown of the Hollow holds the echoes fast.
        if (w.allies.length > 0 && !w.player.powers.includes("hollow_crown")) {
          w.turnedT = DOMINION.time;
          sfx(w, "fail");
        }
        e.cd2 = DOMINION.every;
        e.state = "idle";
      }
      return;
    case "blinkwind":
      if (e.t > 0.1) trackDir(e, dx, dy);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "strike";
        e.t = 0.18;
        e.hasHit = false;
      }
      return;
    case "strike":
      e.x += e.dirX * 900 * dt;
      e.y += e.dirY * 900 * dt;
      contactHit(w, e);
      e.t -= dt;
      if (e.t <= 0) {
        e.state = "recover";
        e.t = 0.7;
      }
      return;
    case "idle":
      break;
    default:
      e.t -= dt;
      if (e.t <= 0) e.state = "idle";
      return;
  }

  if (e.tx > 0) {
    e.ty -= dt;
    if (e.ty <= 0) {
      w.zones.push({ x: p.x, y: p.y, radius: 110, t: 0.8, total: 0.8, damage: e.dmg, owner: e });
      e.tx -= 1;
      e.ty = 0.3;
    }
  }
  trackDir(e, dx, dy);
  keepDistance(e, dx, dy, dist, 260, 420, KINDS.monarch.speed, dt);

  if (ph >= 3 && e.cd2 <= 0 && w.allies.length > 0) {
    e.state = "dominion";
    e.t = DOMINION.cast;
    w.notices.push({ title: "DOMINION", body: "Your echoes turn. Keep away from them until it passes.", life: 3 });
    return;
  }
  if (e.cd > 0) return;

  const turn = e.n % (ph === 1 ? 2 : 4);
  e.n += 1;
  if (turn === 0) {
    e.state = "cast";
    e.t = 0.6;
  } else if (turn === 1) {
    e.tx = 1 + ph;
    e.ty = 0;
    if (ph >= 2) w.shockwaves.push({ x: e.x, y: e.y, wait: RING_WARNING, r: e.radius + 20, speed: 320, maxR: 700, damage: e.dmg * 0.5, hit: false });
  } else if (turn === 2) {
    const guards = w.enemies.filter((o) => !o.boss).length + w.spawnQueue.length;
    if (guards < 3) {
      const kinds: EnemyKind[] = ["knight", "assassin"];
      kinds.forEach((kind, i) => {
        const a = w.rng() * Math.PI * 2;
        const m = spawnEnemy(w, kind, e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80);
        m.t = 0.6 + i * 0.2;
        m.xp = 0;
        m.maxHp = Math.round(m.maxHp / 2);
        m.hp = m.maxHp;
        m.guard = Math.round(m.guard / 2);
        clampToRoom(m, ROOM.w, ROOM.h);
        w.spawnQueue.push(m);
      });
      sfx(w, "summon");
    }
  } else {
    // Step out of sight and reappear at the player's back.
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 70, t: 0.35, total: 0.35, color: "#ffe9a0" });
    e.x = p.x - Math.cos(p.facing) * 70;
    e.y = p.y - Math.sin(p.facing) * 70;
    clampToRoom(e, ROOM.w, ROOM.h);
    trackDir(e, p.x - e.x, p.y - e.y);
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: 70, t: 0.35, total: 0.35, color: "#ffe9a0" });
    e.state = "blinkwind";
    e.t = 0.45;
  }
  e.cd = [2.4, 1.9, 1.5][ph - 1] ?? 1.5;
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

  // A standing totem mends every other enemy, bosses far more slowly.
  if (e.kind !== "totem" && e.hp > 0 && e.hp < e.maxHp && w.enemies.some((o) => o.kind === "totem" && o.hp > 0)) {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * TOTEM.regen * (e.boss ? 0.2 : 1) * dt);
  }

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
    case "leaper":
      stepLeaper(w, e, dt, dx, dy, dist);
      break;
    case "pyro":
      stepPyro(w, e, dt, dx, dy, dist);
      break;
    case "warder":
      stepWarder(w, e, dt, dx, dy, dist);
      break;
    case "assassin":
      stepAssassin(w, e, dt, dx, dy, dist);
      break;
    case "knight":
      stepKnight(w, e, dt, dx, dy, dist);
      break;
    case "totem":
      // It only stands there; its harm is in what it does for the others.
      break;
    case "warper":
      stepWarper(w, e, dt, dx, dy, dist);
      break;
    case "colossus":
      stepColossus(w, e, dt, dx, dy, dist);
      break;
    case "egg":
      stepEgg(w, e, dt);
      break;
    case "queen":
      stepQueen(w, e, dt, dx, dy, dist);
      break;
    case "commander":
      stepCommander(w, e, dt, dx, dy, dist);
      break;
    case "monarch":
      stepMonarch(w, e, dt, dx, dy, dist);
      break;
  }
  clampToRoom(e, ROOM.w, ROOM.h);
}

/** States in which an enemy is mid-attack and passes through bodies. */
export function isCommitted(e: Enemy): boolean {
  return e.state === "lunge" || e.state === "charge" || e.state === "strike" || e.state === "leap";
}
