import { damageEnemy } from "./enemies";
import { PERK } from "./items";
import { healPlayer, type Enemy, type World } from "./state";

/** What the player's gear adds to a hit that lands. */

/** Poison and bleed share one burn-down: the stronger rate wins, the clock restarts. */
function addDot(e: Enemy, total: number, time: number): void {
  e.dot = Math.max(e.dot, total / time);
  e.dotT = time;
}

/**
 * A hit by the player, with their perks applied. `splash` marks damage that
 * is itself the result of a perk, so it cannot set off more of them.
 */
export function playerHit(
  w: World,
  e: Enemy,
  amount: number,
  crit: boolean,
  fromX: number,
  fromY: number,
  knock: number,
  splash = false,
): boolean {
  if (!damageEnemy(w, e, amount, crit, fromX, fromY, knock)) return false;
  if (splash) return true;
  const pk = w.player.perks;

  if (pk.lifesteal > 0) healPlayer(w, amount * PERK.lifesteal * pk.lifesteal);
  if (pk.poison > 0) addDot(e, amount * PERK.poison.share * pk.poison, PERK.poison.time);
  if (pk.bleed > 0 && crit) addDot(e, amount * PERK.bleed.share * pk.bleed, PERK.bleed.time);
  if (pk.frost > 0) e.chillT = PERK.frost.time * pk.frost;

  if (pk.burn > 0) {
    for (const o of w.enemies) {
      if (o === e || o.hp <= 0 || Math.hypot(o.x - e.x, o.y - e.y) > PERK.burn.radius + o.radius) continue;
      playerHit(w, o, amount * PERK.burn.share * pk.burn, false, e.x, e.y, 0, true);
    }
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: PERK.burn.radius, t: 0.2, total: 0.2, color: "#ff8a3c" });
  }
  if (pk.chain > 0) {
    // The nearest few other enemies in reach each take a share.
    const near = w.enemies
      .filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= PERK.chain.radius)
      .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))
      .slice(0, PERK.chain.targets);
    for (const o of near) {
      playerHit(w, o, amount * PERK.chain.share * pk.chain, false, e.x, e.y, 0, true);
      w.fx.push({ kind: "ring", x: o.x, y: o.y, radius: o.radius + 10, t: 0.18, total: 0.18, color: "#8fd0ff" });
    }
  }
  return true;
}

/** Burn poison and bleed down, and thaw frost. Called once a step for each enemy. */
export function stepEnemyPerks(e: Enemy, dt: number): void {
  if (e.dotT > 0 && !e.immortal) {
    e.hp = Math.max(0, e.hp - e.dot * dt);
    e.dotT -= dt;
    if (e.dotT <= 0) e.dot = 0;
  }
  e.chillT = Math.max(0, e.chillT - dt);
}
