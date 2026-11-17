import { norm } from "../engine/vec";
import { circlesOverlap, clampToRoom } from "./combat";
import { DOMINION, ECHO, KINDS, LEGION, ORDER, RALLY, ROOM, type EnemyKind } from "./config";
import { damageEnemy } from "./enemies";
import { playerHit } from "./perks";
import { STAFF } from "./items";
import { floatText, hurtPlayer, sfx, type Ally, type Echo, type Enemy, type ShotLook, type World } from "./state";

/** The colour of each kind of shot's burst, for the view's splash mark. */
export const SHOT_HUE: Record<ShotLook, string> = {
  arrow: "#5ee6ff",
  charged: "#9ff6ff",
  orb: "#8fb4ff",
  fire: "#ff7a2a",
  ice: "#9fe8ff",
  bolt: "#fff27a",
  venom: "#6dff5a",
  blood: "#ff3a6a",
  quill: "#e8e8f0",
};

/**
 * Echoes on the field. They hunt the nearest enemy on their own. Enemies
 * neither see nor harm them: they are already dead.
 */

type Style = "melee" | "sweep" | "ranged" | "support";

const STYLE: Record<EnemyKind, Style> = {
  swarmer: "melee",
  charger: "melee",
  duellist: "melee",
  brute: "sweep",
  exploder: "sweep",
  warden: "sweep",
  shooter: "ranged",
  summoner: "ranged",
  healer: "support",
  leaper: "melee",
  assassin: "melee",
  knight: "melee",
  egg: "melee",
  commander: "melee",
  warder: "sweep",
  colossus: "sweep",
  queen: "sweep",
  pyro: "ranged",
  warper: "ranged",
  monarch: "ranged",
  totem: "support",
  redactor: "sweep",
};

/** A sweep hits many, a shot is safe: both deal less per hit than a blade. */
const STYLE_DAMAGE: Record<Style, number> = { melee: 1, sweep: 0.8, ranged: 0.7, support: 0 };

const SWEEP_RADIUS = 95;
const HEAL = { share: 0.08, every: 6 };

export function echoName(e: Echo): string {
  return `${KINDS[e.kind].name} echo`;
}

/**
 * An echo's hit is a share of the player's own (`base`), so the army grows
 * as the hunter does. Where it was bound, and whether it was a boss, add to that.
 */
export function makeAlly(echo: Echo, x: number, y: number, base: number): Ally {
  const def = KINDS[echo.kind];
  return {
    x,
    y,
    radius: def.radius,
    kind: echo.kind,
    rank: echo.rank,
    dmg: base * ECHO.damage * ECHO.rankBonus[echo.rank] * STYLE_DAMAGE[STYLE[echo.kind]] * (def.boss ? ECHO.bossDamage : 1),
    cd: 0.6,
    facing: 0,
    flash: 0,
    anim: 0,
    out: false,
  };
}

function nearestEnemy(w: World, a: Ally): Enemy | null {
  let best: Enemy | null = null;
  let d = Infinity;
  const p = w.player;
  for (const e of w.enemies) {
    if (e.hp <= 0 || e.immortal) continue;
    // On guard, only what has come close to the hunter is worth leaving their side for.
    if (w.armyOrder === "guard" && Math.hypot(e.x - p.x, e.y - p.y) > ORDER.guardRadius + e.radius) continue;
    // Holding, an echo answers only what comes within its reach.
    if (w.armyOrder === "hold" && Math.hypot(e.x - a.x, e.y - a.y) > (STYLE[a.kind] === "ranged" ? ORDER.holdRange : a.radius + e.radius + 20)) continue;
    const n = Math.hypot(e.x - a.x, e.y - a.y);
    if (n < d) {
      d = n;
      best = e;
    }
  }
  return best;
}

function walk(a: Ally, dx: number, dy: number, speed: number, dt: number, held = false): void {
  if (held) return;
  const d = norm(dx, dy);
  a.x += d.x * speed * dt;
  a.y += d.y * speed * dt;
  if (d.x !== 0 || d.y !== 0) a.facing = Math.atan2(d.y, d.x);
}

export function stepAlly(w: World, a: Ally, dt: number): void {
  const p = w.player;
  const style = STYLE[a.kind];
  // Fast enough to keep pace with the player.
  const speed = Math.max(190, KINDS[a.kind].speed * 1.4);
  // Rising or sinking: it does nothing else until that is over.
  if (a.anim > 0) {
    a.anim = Math.max(0, a.anim - dt);
    return;
  }
  a.cd = Math.max(0, a.cd - dt);
  a.flash = Math.max(0, a.flash - dt);

  // Told to hold, an echo stays where it stands (Rally and Dominion still move it).
  const held = w.armyOrder === "hold" && !(w.rallyT > 0 && w.rallyTarget);
  const follow = () => {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    if (Math.hypot(dx, dy) > 90) walk(a, dx, dy, speed, dt, held);
  };

  // Dominion: for a while the echoes hunt their own master.
  if (w.turnedT > 0) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const reach = a.radius + p.radius + 12;
    if (Math.hypot(dx, dy) > reach) walk(a, dx, dy, speed * 0.8, dt);
    else if (a.cd <= 0) {
      hurtPlayer(w, Math.max(1, a.dmg * DOMINION.damage));
      a.cd = 1.2;
      a.flash = 0.15;
    }
    clampToRoom(a, ROOM.w, ROOM.h);
    return;
  }

  if (style === "support") {
    follow();
    if (a.cd <= 0 && p.hp < p.d.maxHp && w.mode === "gate") {
      const heal = Math.min(p.d.maxHp - p.hp, Math.round(p.d.maxHp * HEAL.share));
      p.hp += heal;
      a.cd = HEAL.every;
      a.flash = 0.3;
      floatText(w, p.x, p.y, `+${heal}`, "#b9a4ff");
      sfx(w, "heal");
    }
    clampToRoom(a, ROOM.w, ROOM.h);
    return;
  }

  // Rally overrides each echo's own choice of target, and makes it hit harder.
  const rallied = w.rallyT > 0 && w.rallyTarget && w.rallyTarget.hp > 0 ? w.rallyTarget : null;
  const dmg = a.dmg * (rallied ? RALLY.damage : 1) * (w.legionT > 0 ? LEGION.damage : 1);
  const t = rallied ?? nearestEnemy(w, a);
  if (!t) {
    follow();
    clampToRoom(a, ROOM.w, ROOM.h);
    return;
  }
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const dist = Math.hypot(dx, dy);
  a.facing = Math.atan2(dy, dx);

  if (style === "ranged") {
    if (dist > 300) walk(a, dx, dy, speed, dt, held);
    else if (dist < 180) walk(a, -dx, -dy, speed, dt, held);
    if (a.cd <= 0) {
      const spread = a.kind === "summoner" ? [-0.2, 0, 0.2] : [0];
      for (const off of spread) {
        const ang = a.facing + off;
        w.allyShots.push({ x: a.x, y: a.y, radius: 7, vx: Math.cos(ang) * 440, vy: Math.sin(ang) * 440, damage: dmg, life: 2 });
      }
      a.cd = a.kind === "summoner" ? 1.8 : 1.4;
      a.flash = 0.15;
    }
  } else {
    const reach = a.radius + t.radius + 16;
    if (dist > reach) walk(a, dx, dy, speed, dt, held);
    else if (a.cd <= 0) {
      if (style === "sweep") {
        for (const e of w.enemies) {
          if (Math.hypot(e.x - a.x, e.y - a.y) <= SWEEP_RADIUS + e.radius) damageEnemy(w, e, dmg, false, a.x, a.y, 160);
        }
        w.fx.push({ kind: "ring", x: a.x, y: a.y, radius: SWEEP_RADIUS, t: 0.25, total: 0.25, color: "#8a6cff" });
        a.cd = 1.6;
      } else {
        damageEnemy(w, t, dmg, false, a.x, a.y, 120);
        a.cd = a.kind === "duellist" ? 0.5 : 0.9;
      }
      a.flash = 0.15;
    }
  }
  clampToRoom(a, ROOM.w, ROOM.h);
}

/** Move echo shots and land them on the first enemy they touch. */
export function stepAllyShots(w: World, dt: number): void {
  for (const s of w.allyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.x < 0 || s.x > ROOM.w || s.y < 0 || s.y > ROOM.h) s.life = 0;
    if (s.life <= 0) continue;
    for (const e of w.enemies) {
      if (e.hp <= 0 || !circlesOverlap(s, e) || s.hits?.includes(e)) continue;
      // The player's own arrows carry their perks; an echo's shot does not.
      if (s.mine) playerHit(w, e, s.damage, s.crit === true, s.x - s.vx * 0.01, s.y - s.vy * 0.01, 120);
      else damageEnemy(w, e, s.damage, false, s.x - s.vx * 0.01, s.y - s.vy * 0.01, 80);
      // A staff's bolt bursts and catches what stands close.
      if (s.splash) {
        for (const o of w.enemies) {
          if (o === e || o.hp <= 0 || Math.hypot(o.x - s.x, o.y - s.y) > s.splash + o.radius) continue;
          damageEnemy(w, o, Math.round(s.damage * STAFF.share), false, s.x, s.y, 60);
        }
        w.fx.push({ kind: "blast", x: s.x, y: s.y, radius: s.splash, t: 0.25, total: 0.25, color: SHOT_HUE[s.look ?? "orb"] });
      }
      // A charged arrow keeps going, striking each enemy once.
      if (s.pierce) {
        s.hits?.push(e);
        continue;
      }
      s.life = 0;
      break;
    }
  }
  w.allyShots = w.allyShots.filter((s) => s.life > 0);
}
