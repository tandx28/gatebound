import { KINDS, NIGHTMARE, RANK_IDS, RANKS, ROOM } from "./config";
import { spawnEnemy } from "./enemies";
import { burst, sfx, type Enemy, type World } from "./state";

/**
 * What every boss gains as its health runs down, on top of its own attacks
 * and phases. A boss passes through three stages; the later ones add new
 * moves and use them more often. Every move is warned of on the floor
 * before it lands, and a low-rank boss uses fewer and gentler ones.
 */

/** Below these shares of health the boss enters its second and its last stage. */
export const STAGES = [0.6, 0.3];

export const BOSS_EXTRA = {
  /** Seconds between extra moves in each stage. The first stage has none. */
  every: [Infinity, 7.5, 5.2],
  /** A breath after a stage begins before the first move of it. */
  grace: 2.5,
  /** Share of the boss's own hit that a blast and a bolt deal. */
  blast: 0.6,
  bolt: 0.45,
  warn: 1,
};

export type BossMove = "quake" | "volley" | "cross" | "rain";

/** 0 while the boss is fresh, 1 once it is hurt, 2 when it is nearly dead. In Nightmare it starts hurt. */
export function bossStage(w: World, e: Enemy): number {
  const share = e.hp / e.maxHp;
  const stage = share <= STAGES[1] ? 2 : share <= STAGES[0] ? 1 : 0;
  return w.profile.nightmare ? Math.max(1, stage) : stage;
}

/** The moves open to a boss: more of them the higher the rank and the later the stage. */
export function movesFor(tier: number, stage: number): BossMove[] {
  if (stage <= 0) return [];
  const moves: BossMove[] = ["quake"];
  if (tier >= 1) moves.push("volley");
  if (tier >= 2 && stage >= 2) moves.push("cross", "rain");
  return moves;
}

function perform(w: World, e: Enemy, move: BossMove, tier: number, stage: number): void {
  const p = w.player;
  const blast = e.dmg * BOSS_EXTRA.blast;
  const warn = BOSS_EXTRA.warn;
  const zone = (x: number, y: number, radius: number, t: number) =>
    w.zones.push({ x: Math.max(40, Math.min(ROOM.w - 40, x)), y: Math.max(40, Math.min(ROOM.h - 40, y)), radius, t, total: t, damage: blast, owner: e });
  if (move === "quake") {
    // The ground breaks under the hunter, then where they are likely to run.
    const count = 1 + Math.min(2, tier) + (stage >= 2 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const a = w.rng() * Math.PI * 2;
      const far = i === 0 ? 0 : 130 + w.rng() * 90;
      zone(p.x + Math.cos(a) * far, p.y + Math.sin(a) * far, 95, warn + i * 0.28);
    }
  } else if (move === "volley") {
    // A ring of slow bolts: walk between them, or dash through.
    const n = stage >= 2 ? 14 : 10;
    const turn = w.rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2;
      w.projectiles.push({ x: e.x, y: e.y, radius: 9, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, damage: e.dmg * BOSS_EXTRA.bolt, life: 4.5 });
    }
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: e.radius + 50, t: 0.4, total: 0.4, color: "#ff5a60" });
  } else if (move === "cross") {
    // Four lines of blasts run out from the boss, one after another.
    const turn = w.rng() < 0.5 ? 0 : Math.PI / 4;
    for (let arm = 0; arm < 4; arm++) {
      const a = turn + (arm * Math.PI) / 2;
      for (let i = 1; i <= 5; i++) zone(e.x + Math.cos(a) * (e.radius + i * 105), e.y + Math.sin(a) * (e.radius + i * 105), 58, warn * 0.9 + i * 0.13);
    }
  } else {
    // Blasts fall across the room around the hunter.
    for (let i = 0; i < 6; i++) zone(p.x + (w.rng() - 0.5) * 520, p.y + (w.rng() - 0.5) * 380, 78, warn + i * 0.22);
  }
  sfx(w, "phase");
}

/** Run a boss's stage and its extra moves. Called once a step for each boss. */
export function stepBossExtras(w: World, e: Enemy, dt: number): void {
  // The rite is fought alone at a fixed strength; its bosses keep to their own attacks.
  if (!e.boss || e.hp <= 0 || e.immortal || w.gateKind === "rite") return;
  const tier = RANK_IDS.indexOf(w.rank);
  const stage = bossStage(w, e);
  if (stage > e.stage) {
    e.stage = stage;
    e.extraCd = BOSS_EXTRA.grace;
    w.notices.push({ title: KINDS[e.kind].name.toUpperCase(), body: stage >= 2 ? "It is nearly spent, and fights like it." : "Wounded. It changes its ground.", life: 3 });
    w.fx.push({ kind: "ring", x: e.x, y: e.y, radius: e.radius + 120, t: 0.6, total: 0.6, color: "#ff3355" });
    burst(w, e.x, e.y, "#ff3355", 24, 320);
    sfx(w, "phase");
    // At its last stage a high-rank boss calls two of its gate's own to its side, once.
    if (stage >= 2 && tier >= 2 && w.gateKind === "normal") {
      const kinds = RANKS[w.rank].kinds.filter((k) => k !== "totem");
      for (const side of [-1, 1]) {
        const add = spawnEnemy(w, kinds[Math.floor(w.rng() * kinds.length)], Math.max(60, Math.min(ROOM.w - 60, e.x + side * (e.radius + 120))), e.y);
        add.t = 1;
        w.spawnQueue.push(add);
      }
    }
  }
  const moves = movesFor(tier, stage);
  if (moves.length === 0) return;
  e.extraCd -= dt;
  // Never in the middle of being broken or hidden.
  if (e.extraCd > 0 || e.state === "broken" || e.state === "vanish") return;
  e.extraCd = BOSS_EXTRA.every[stage] * (w.profile.nightmare ? NIGHTMARE.bossPace : 1) * (tier === 0 ? 1.25 : 1);
  perform(w, e, moves[Math.floor(w.rng() * moves.length)], tier, stage);
}
