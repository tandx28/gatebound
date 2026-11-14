import type { Controls } from "../../engine/input";
import { seeded } from "../../engine/rng";
import { angleDiff, norm } from "../../engine/vec";
import { BRUTE, ECHO, echoCap, EXPLODER, PLAYER, RANK_IDS, RANKS, ROOM, SKILLS, STEP, WHIRL, type EnemyKind, type Rank } from "../config";
import { SIDES, type Side } from "../dungeon";
import { hubAction, refreshDerived } from "../profile";
import type { Echo, Enemy, World } from "../state";
import { allocate, BASE_STAT, STAT_KEYS, xpToNext, type StatKey } from "../stats";
import { createWorld, enterGate, skillReady, step } from "../world";

/**
 * A scripted player for balance measurements. It dodges telegraphed
 * attacks, flanks shields, drinks potions and walks the dungeon. It is not
 * clever: `reaction` is how often it reconsiders, so a larger value plays
 * like a slower human. Results are a yardstick, not a prediction.
 */
export class Bot implements Controls {
  mouseX = 0;
  mouseY = 0;
  aimX = 0;
  aimY = 0;
  attackHeld = false;
  private move = { x: 0, y: 0 };
  private presses = new Set<string>();
  private think = 0;

  constructor(private reaction: number) {}

  axis() {
    return this.move;
  }

  consume(...codes: string[]) {
    let hit = false;
    for (const c of codes) if (this.presses.delete(c)) hit = true;
    return hit;
  }

  update(w: World, dt: number): void {
    this.think -= dt;
    if (this.think > 0) return;
    this.think = this.reaction;
    this.decide(w);
  }

  private go(x: number, y: number): void {
    this.move = norm(x, y);
  }

  /** The direction to dodge, and whether it needs a dash, or null if safe. */
  private danger(w: World): { x: number; y: number; dash: boolean } | null {
    const p = w.player;
    const toCentre = norm(ROOM.w / 2 - p.x, ROOM.h / 2 - p.y);
    // Step sideways off a line, toward whichever side has more room.
    const sidestep = (dx: number, dy: number) => {
      const a = { x: -dy, y: dx };
      return a.x * toCentre.x + a.y * toCentre.y >= 0 ? a : { x: dy, y: -dx };
    };

    for (const s of w.shockwaves) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      // A ring still giving its warning: just step back, and save the dash.
      if (s.wait > 0) {
        if (d < s.r + 110) return { ...(d > 1 ? norm(p.x - s.x, p.y - s.y) : toCentre), dash: false };
        continue;
      }
      const gap = d - s.r;
      // A ring cannot be outrun: dash through it toward its centre.
      if (!s.hit && gap > 0 && gap < 80) return { ...norm(s.x - p.x, s.y - p.y), dash: true };
    }
    for (const z of w.zones) {
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < z.radius + 24 && z.t < 0.7) {
        const away = d > 1 ? norm(p.x - z.x, p.y - z.y) : toCentre;
        return { ...away, dash: z.t < 0.35 || d < z.radius * 0.4 };
      }
    }
    // Burning ground: get off it.
    for (const patch of w.patches) {
      const d = Math.hypot(p.x - patch.x, p.y - patch.y);
      if (d < patch.radius + 10) return { ...(d > 1 ? norm(p.x - patch.x, p.y - patch.y) : toCentre), dash: false };
    }
    // Echoes turned by Dominion: keep clear of the nearest.
    if (w.turnedT > 0) {
      for (const a of w.allies) {
        const d = Math.hypot(p.x - a.x, p.y - a.y);
        if (d < 110) return { ...(d > 1 ? norm(p.x - a.x, p.y - a.y) : toCentre), dash: d < 50 };
      }
    }
    for (const e of w.enemies) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (e.kind === "exploder" && e.state === "fuse" && d < EXPLODER.blastRadius + 30) {
        return { ...norm(p.x - e.x, p.y - e.y), dash: true };
      }
      // A warper's swap is slipped by dashing as its cast ends.
      if (e.kind === "warper" && e.state === "cast" && e.t < 0.18) return { ...toCentre, dash: true };
      const winding = e.state === "windup" || e.state === "dwind" || e.state === "blinkwind";
      const flying = e.state === "lunge" || e.state === "charge" || e.state === "strike";
      const lunging =
        (e.kind === "swarmer" && ((e.state === "windup" && e.t < 0.2) || e.state === "lunge") && d < 160) ||
        (e.kind === "charger" && ((e.state === "windup" && e.t < 0.3) || e.state === "charge") && d < 520) ||
        ((e.kind === "assassin" || e.kind === "knight") && ((winding && e.t < 0.2) || flying) && d < 200) ||
        (e.kind === "commander" && ((e.state === "windup" && e.t < 0.3) || e.state === "charge") && d < 640) ||
        ((e.kind === "commander" || e.kind === "monarch") && ((winding && e.t < 0.18) || e.state === "strike") && d < 260) ||
        (e.kind === "duellist" && ((e.state === "windup" && e.t < 0.2) || e.state === "strike") && d < 240);
      if (!lunging) continue;
      // Only matters if the attack line passes close.
      const along = (p.x - e.x) * e.dirX + (p.y - e.y) * e.dirY;
      const off = Math.abs((p.x - e.x) * -e.dirY + (p.y - e.y) * e.dirX);
      if (along > -20 && off < e.radius + p.radius + 26) return { ...sidestep(e.dirX, e.dirY), dash: true };
    }
    for (const s of w.projectiles) {
      const v2 = s.vx * s.vx + s.vy * s.vy;
      const t = ((p.x - s.x) * s.vx + (p.y - s.y) * s.vy) / v2;
      if (t <= 0 || t > 0.4) continue;
      const miss = Math.hypot(p.x - (s.x + s.vx * t), p.y - (s.y + s.vy * t));
      if (miss < p.radius + s.radius + 14) return { ...sidestep(s.vx, s.vy), dash: t < 0.15 };
    }
    return null;
  }

  private target(w: World): Enemy | null {
    const p = w.player;
    let best: Enemy | null = null;
    let score = Infinity;
    for (const e of w.enemies) {
      // What makes every other fight worse dies first: totems, warders, menders, eggs.
      const BIAS: Partial<Record<EnemyKind, number>> = {
        totem: 600,
        warder: 320,
        healer: 260,
        egg: 220,
        pyro: 160,
        warper: 160,
        shooter: 120,
        brute: -150,
        colossus: -100,
      };
      // A vanished shade cannot be found; a leaper in the air cannot be hit.
      if (e.state === "vanish" || e.state === "leap") continue;
      const bias = BIAS[e.kind] ?? 0;
      const s = Math.hypot(p.x - e.x, p.y - e.y) - bias;
      if (s < score) {
        score = s;
        best = e;
      }
    }
    return best;
  }

  /** With the room clear, head for the nearest room not yet visited, else the boss. */
  private explore(w: World): void {
    const d = w.dungeon!;
    const here = d.rooms[w.roomId];
    if (w.bossDead) {
      this.presses.add("KeyT");
      return;
    }
    // Breadth-first search for the first step toward an unvisited room.
    const first = new Map<number, Side>();
    const queue: number[] = [here.id];
    const seen = new Set(queue);
    let side: Side | null = null;
    while (queue.length && !side) {
      const id = queue.shift()!;
      for (const s of SIDES) {
        const to = d.rooms[id].doors[s];
        if (to === undefined || seen.has(to)) continue;
        seen.add(to);
        first.set(to, id === here.id ? s : first.get(id)!);
        if (!d.rooms[to].visited) {
          side = first.get(to)!;
          break;
        }
        queue.push(to);
      }
    }
    if (!side) {
      this.move = { x: 0, y: 0 };
      return;
    }
    const p = w.player;
    const cx = ROOM.w / 2;
    const cy = ROOM.h / 2;
    const door = { n: [cx, -60], s: [cx, ROOM.h + 60], w: [-60, cy], e: [ROOM.w + 60, cy] }[side];
    const lateral = side === "n" || side === "s" ? p.x - cx : p.y - cy;
    // Line up with the doorway before walking through it. The margin is wide
    // enough that a fast hunter cannot overshoot it between two decisions.
    if (Math.abs(lateral) > 50) {
      const inside = { n: [cx, 90], s: [cx, ROOM.h - 90], w: [90, cy], e: [ROOM.w - 90, cy] }[side];
      this.go(inside[0] - p.x, inside[1] - p.y);
    } else this.go(door[0] - p.x, door[1] - p.y);
    this.aimX = door[0];
    this.aimY = door[1];
  }

  private decide(w: World): void {
    this.attackHeld = false;
    this.move = { x: 0, y: 0 };
    if (w.mode !== "gate") return;
    const p = w.player;
    if (p.hp / p.d.maxHp < 0.35 && w.profile.potions > 0) this.presses.add("KeyF");

    const t = this.target(w);
    if (!t) return this.explore(w);

    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dist = Math.hypot(dx, dy);
    this.aimX = t.x;
    this.aimY = t.y;
    const reach = PLAYER.attackRange + t.radius - 6;

    // A brute only takes damage from behind, or while it recovers.
    let open = true;
    if (t.kind === "brute" && t.state !== "recover") {
      open = Math.abs(angleDiff(Math.atan2(p.y - t.y, p.x - t.x), t.facing)) > BRUTE.shieldHalf + 0.1;
    }
    this.attackHeld = open && dist < reach;

    // Bind anything in reach, and send the echoes at the target when there are any.
    if (w.profile.classUnlocked && w.profile.echoes.length < ECHO.roster) {
      if (w.remnants.some((r) => Math.hypot(r.x - p.x, r.y - p.y) < ECHO.bindRange)) this.presses.add("KeyG");
    }
    if (skillReady(p, "rally") && w.allies.length > 0 && (t.boss || w.enemies.length >= 3)) this.presses.add(SKILLS.rally.code);
    const near = w.enemies.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < WHIRL.radius + e.radius).length;
    const boss = w.enemies.some((e) => e.boss);
    if (skillReady(p, "surge") && (boss || w.enemies.length >= 4)) this.presses.add(SKILLS.surge.code);
    if (skillReady(p, "whirl") && open && (near >= 2 || (boss && near >= 1))) this.presses.add(SKILLS.whirl.code);
    if (skillReady(p, "pierce") && open && dist > 70 && dist < 190) this.presses.add(SKILLS.pierce.code);

    const danger = this.danger(w);
    if (danger) {
      this.move = { x: danger.x, y: danger.y };
      if (danger.dash && p.dashCd <= 0) this.presses.add("Space");
      return;
    }

    if (t.kind === "brute" && !open) {
      // Circle round to its back.
      const bx = t.x - Math.cos(t.facing) * (t.radius + 34);
      const by = t.y - Math.sin(t.facing) * (t.radius + 34);
      const side = norm(-dy, dx);
      const toBack = norm(bx - p.x, by - p.y);
      // Too close to its front: swing wide instead of walking through it.
      if (dist < t.radius + 60) this.go(toBack.x + side.x * 1.5, toBack.y + side.y * 1.5);
      else this.go(toBack.x, toBack.y);
    } else if (t.kind === "exploder" && dist < 80) {
      // Back away while hitting it, so the fuse never starts in range.
      this.go(-dx, -dy);
    } else if (dist > reach - 14) this.go(dx, dy);
  }
}

/**
 * A plausible squad for a hunter arriving at a rank: the commoners of the
 * rank below, and that rank's boss.
 */
export function squadFor(rank: Rank, level: number): Echo[] {
  const below = RANK_IDS[Math.max(0, RANK_IDS.indexOf(rank) - 1)];
  const kinds = RANKS[below].kinds.filter((k) => k !== "totem");
  const out: Echo[] = [{ kind: RANKS[below].boss, rank: below, active: true }];
  for (let i = 0; out.length < echoCap(level); i++) out.push({ kind: kinds[i % kinds.length], rank: below, active: true });
  return out;
}

export interface Loadout {
  level: number;
  /** Echoes to bring. With any, the hunter has the class. */
  echoes?: Echo[];
  /** Share of stat points per stat; the rest is unspent. */
  build: Partial<Record<StatKey, number>>;
  gear: string[];
  potions: number;
}

export interface RunResult {
  cleared: boolean;
  dead: boolean;
  /** Game time the run took, in seconds. */
  seconds: number;
  hpLeft: number;
  potionsUsed: number;
  gold: number;
  xp: number;
  kills: number;
  /** Rooms cleared, not counting the start room. */
  rooms: number;
  /** Where a failed run ended: "boss", "normal", or "" for a clear. */
  diedIn: string;
  /** Seconds spent in the boss room. */
  bossSeconds: number;
}

/** Experience earned in total by a hunter at this point. */
function lifetimeXp(level: number, xp: number): number {
  let total = xp;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** Spend every unspent point, each on the stat furthest below its share. */
export function spendPoints(w: World, build: Loadout["build"]): void {
  const prog = w.player.prog;
  if (prog.points <= 0) return;
  while (prog.points > 0) {
    const spent = STAT_KEYS.reduce((n, k) => n + prog.stats[k] - BASE_STAT, 0) + 1;
    let best: StatKey = "str";
    let gap = -Infinity;
    for (const k of STAT_KEYS) {
      const g = (build[k] ?? 0) * spent - (prog.stats[k] - BASE_STAT);
      if (g > gap) {
        gap = g;
        best = k;
      }
    }
    allocate(prog, best);
  }
  refreshDerived(w);
}

/** Give the world a hunter of this level, with points spent by the given shares. */
export function applyLoadout(w: World, load: Loadout): void {
  const prog = w.player.prog;
  prog.level = load.level;
  prog.points = (load.level - 1) * 3;
  spendPoints(w, load.build);
  w.profile.inventory = [...load.gear];
  for (const id of load.gear) hubAction(w, `equip:${id}`);
  w.profile.potions = load.potions;
  if (load.echoes) {
    w.profile.classUnlocked = true;
    w.profile.echoes = load.echoes.map((e) => ({ ...e }));
  }
  refreshDerived(w);
}

/** Play one whole gate with the bot and report how it went. */
export function playGate(rank: Rank, load: Loadout, reaction: number, seed: number, limit = 900): RunResult {
  const w = createWorld(seeded(seed));
  w.hiddenChance = 0;
  applyLoadout(w, load);
  enterGate(w, rank, { sealed: false });
  const bot = new Bot(reaction);
  const xpBefore = lifetimeXp(w.player.prog.level, w.player.prog.xp);
  let xpPeak = xpBefore;
  let t = 0;
  let bossSeconds = 0;
  let roomKind = "";
  while (w.mode === "gate" && t < limit) {
    bot.update(w, STEP);
    step(w, bot, STEP);
    t += STEP;
    // A player spends level-up points as they come, mid-gate.
    spendPoints(w, load.build);
    roomKind = w.dungeon!.rooms[w.roomId].kind;
    if (roomKind === "boss") bossSeconds += STEP;
    // The peak ignores what a death takes back.
    xpPeak = Math.max(xpPeak, lifetimeXp(w.player.prog.level, w.player.prog.xp));
    w.sounds.length = 0;
    w.notices.length = 0;
  }
  const xp = xpPeak - xpBefore;
  return {
    rooms: w.dungeon!.rooms.filter((r) => r.cleared && r.kind !== "start").length,
    diedIn: w.mode === "cleared" ? "" : roomKind,
    bossSeconds,
    cleared: w.mode === "cleared",
    dead: w.mode === "dead",
    seconds: t,
    hpLeft: w.player.hp,
    potionsUsed: load.potions - w.profile.potions,
    gold: w.run.gold,
    xp,
    kills: w.kills,
  };
}
