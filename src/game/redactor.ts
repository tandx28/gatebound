import { clamp, norm } from "../engine/vec";
import { KINDS, REDACTOR, ROOM, SKILLS } from "./config";
import { burst, floatText, hurtPlayer, sfx, type Enemy, type World } from "./state";

/**
 * The Redactor: the hidden boss of the margin, and the hardest thing in the
 * game. It keeps its distance and writes the room against the hunter:
 *
 * - Erasure: the whole floor is struck out except three glyph circles.
 * - Strikethrough: a wall of ink sweeps the room. Blink across it, or dash
 *   through it at the right moment.
 * - Margin note: a volley of quills that turn after the hunter.
 * - Redaction bars: black bars slam down one after another.
 * - Footnote: the hunter's own last skill, cast back on where they stand.
 * - In its last stage the floor itself closes in.
 *
 * Every move is warned of before it lands. Erasure and Strikethrough kill
 * outright; the rest take a share of the hunter's health. Each new stage
 * begins by throwing the hunter clear, harmlessly, and clearing the floor.
 */

type Move = "erasure" | "strike" | "quills" | "bars" | "footnote" | "melee";

/** The moves open in each stage. */
const MOVES: Move[][] = [
  ["quills", "bars", "strike", "melee"],
  ["quills", "bars", "strike", "erasure", "footnote", "melee"],
  ["bars", "strike", "erasure", "footnote", "quills"],
];

/** Stage 0, 1 or 2, from the share of health left. */
export function redactorStage(e: Enemy): number {
  const share = e.hp / e.maxHp;
  return share <= REDACTOR.stages[1] ? 2 : share <= REDACTOR.stages[0] ? 1 : 0;
}

/** Three safe circles, well apart and inside the floor that is left. */
function safeSpots(w: World): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const cx = ROOM.w / 2;
  const cy = ROOM.h / 2;
  const reach = w.arenaR > 0 ? w.arenaR - REDACTOR.erasure.radius - 20 : 520;
  for (let tries = 0; out.length < REDACTOR.erasure.safe && tries < 200; tries++) {
    const a = w.rng() * Math.PI * 2;
    const r = Math.sqrt(w.rng()) * reach;
    const x = clamp(cx + Math.cos(a) * r, 90, ROOM.w - 90);
    const y = clamp(cy + Math.sin(a) * r * 0.7, 90, ROOM.h - 90);
    if (out.every((o) => Math.hypot(o.x - x, o.y - y) > 240)) out.push({ x, y });
  }
  return out;
}

function perform(w: World, e: Enemy, move: Move): void {
  const p = w.player;
  const hp = p.d.maxHp;
  if (move === "erasure") {
    w.erasure = { t: REDACTOR.erasure.warn, total: REDACTOR.erasure.warn, safe: safeSpots(w) };
    e.state = "chant";
    e.t = REDACTOR.erasure.warn;
    floatText(w, e.x, e.y - 40, "ERASURE", "#e8e8f0", true);
    sfx(w, "alarm");
  } else if (move === "strike") {
    const axis = w.rng() < 0.5 ? "x" : "y";
    const span = axis === "x" ? ROOM.w : ROOM.h;
    const mine = axis === "x" ? p.x : p.y;
    // It starts on the far side from the hunter and sweeps toward them.
    const dir = mine > span / 2 ? 1 : -1;
    w.sweeps.push({ axis, at: dir > 0 ? 0 : span, dir, wait: REDACTOR.strike.warn });
    e.state = "chant";
    e.t = 0.8;
    floatText(w, e.x, e.y - 40, "STRIKETHROUGH", "#e8e8f0", true);
    sfx(w, "phase");
  } else if (move === "quills") {
    const n = REDACTOR.quills.count + e.stage;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = 0; i < n; i++) {
      const a = base + ((i - (n - 1) / 2) / n) * 2.4;
      w.projectiles.push({
        x: e.x + Math.cos(a) * (e.radius + 10),
        y: e.y + Math.sin(a) * (e.radius + 10),
        radius: 9,
        vx: Math.cos(a) * REDACTOR.quills.speed,
        vy: Math.sin(a) * REDACTOR.quills.speed,
        damage: Math.round(hp * REDACTOR.quills.share),
        life: REDACTOR.quills.life,
        look: "quill",
        home: REDACTOR.quills.turn,
      });
    }
    sfx(w, "shot");
  } else if (move === "bars") {
    const n = REDACTOR.bars.count + e.stage;
    for (let i = 0; i < n; i++) {
      const angle = w.rng() * Math.PI;
      // Each bar is laid across where the hunter is, or nearly.
      const x = clamp(p.x + (w.rng() - 0.5) * 160, 60, ROOM.w - 60);
      const y = clamp(p.y + (w.rng() - 0.5) * 160, 60, ROOM.h - 60);
      const t = REDACTOR.bars.warn + i * REDACTOR.bars.gap;
      w.bars.push({ x, y, angle, len: 900, width: REDACTOR.bars.width, t, total: t, damage: Math.round(hp * REDACTOR.bars.share) });
    }
    sfx(w, "phase");
  } else if (move === "footnote") {
    const name = w.lastSkill ? SKILLS[w.lastSkill].name.toUpperCase() : "YOUR OWN HAND";
    w.zones.push({ x: p.x, y: p.y, radius: REDACTOR.footnote.radius, t: REDACTOR.footnote.warn, total: REDACTOR.footnote.warn, damage: Math.round(hp * REDACTOR.footnote.share), owner: e });
    floatText(w, p.x, p.y - 40, `FOOTNOTE: ${name}`, "#e8e8f0", true);
    sfx(w, "chime");
  } else {
    w.zones.push({ x: e.x, y: e.y, radius: REDACTOR.melee.radius, t: REDACTOR.melee.windup, total: REDACTOR.melee.windup, damage: Math.round(hp * REDACTOR.melee.share), owner: e });
    e.state = "windup";
    e.t = REDACTOR.melee.windup;
  }
}

/** One step of the Redactor itself: keep its distance, change stage, choose its next move. */
export function stepRedactor(w: World, e: Enemy, dt: number, dx: number, dy: number, dist: number): void {
  const p = w.player;
  const stage = redactorStage(e);
  if (stage > e.stage) {
    // A new stage: the floor is wiped clean and the hunter thrown clear, harmlessly.
    e.stage = stage;
    e.inv = 1.5;
    e.cd = REDACTOR.grace;
    w.erasure = null;
    w.sweeps = [];
    w.bars = [];
    w.zones = w.zones.filter((z) => z.owner !== e);
    w.projectiles = w.projectiles.filter((s) => s.look !== "quill");
    const n = norm(p.x - e.x, p.y - e.y);
    p.kx = (n.x || 1) * 700;
    p.ky = n.y * 700;
    if (stage === 2) w.arenaR = REDACTOR.shrink.from;
    w.notices.push({ title: KINDS.redactor.name.toUpperCase(), body: stage === 2 ? "\"Then let the page itself forget you.\"" : "\"You are a correction I have not made yet.\"", life: 4 });
    w.fx.push({ kind: "ink", x: e.x, y: e.y, radius: 300, t: 0.8, total: 0.8, color: "#101018" });
    burst(w, e.x, e.y, "#e8e8f0", 40, 420);
    w.shake = Math.max(w.shake, 14);
    sfx(w, "phase");
    return;
  }

  e.facing = Math.atan2(dy, dx);
  if (e.state === "chant" || e.state === "windup") {
    e.t -= dt;
    if (e.t <= 0) {
      e.state = "drift";
      e.t = 0;
    }
    return;
  }
  if (e.state === "recover") {
    e.t -= dt;
    if (e.t > 0) return;
    e.state = "drift";
  }

  // It floats at a middle distance: close enough to threaten, never in reach for long.
  const want = dist > 320 ? 1 : dist < 170 ? -1 : 0;
  if (want !== 0 && dist > 0) {
    e.x += (dx / dist) * KINDS.redactor.speed * want * dt;
    e.y += (dy / dist) * KINDS.redactor.speed * want * dt;
  }
  e.dirX = dx / (dist || 1);
  e.dirY = dy / (dist || 1);
  if (w.arenaR > 0) {
    // Inside the floor that is left.
    const cx = ROOM.w / 2;
    const cy = ROOM.h / 2;
    const off = Math.hypot(e.x - cx, e.y - cy);
    if (off > w.arenaR - 60) {
      e.x = cx + ((e.x - cx) / off) * (w.arenaR - 60);
      e.y = cy + ((e.y - cy) / off) * (w.arenaR - 60);
    }
  }

  e.cd -= dt;
  if (e.cd > 0) return;
  // Nothing new while an erasure or a sweep is still being written.
  if (w.erasure || w.sweeps.length > 0) return;
  e.cd = REDACTOR.every[e.stage];
  const options = MOVES[e.stage].filter((m, i) => i !== e.n && (m !== "melee" || dist < 220));
  const choice = options[Math.floor(w.rng() * options.length)] ?? "quills";
  e.n = MOVES[e.stage].indexOf(choice);
  perform(w, e, choice);
}

/** Distance from a point to a segment through (x, y) at `angle`, `len` long, centred. */
function toBar(px: number, py: number, x: number, y: number, angle: number, len: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const along = clamp((px - x) * dx + (py - y) * dy, -len / 2, len / 2);
  return Math.hypot(px - (x + dx * along), py - (y + dy * along));
}

/** The Redactor's writing on the floor: erasure, sweeps, bars, and the closing page. */
export function stepRedactorHazards(w: World, dt: number): void {
  const p = w.player;
  const kill = () => hurtPlayer(w, p.d.maxHp * 10);

  if (w.erasure) {
    w.erasure.t -= dt;
    if (w.erasure.t <= 0) {
      const safe = w.erasure.safe.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= REDACTOR.erasure.radius);
      w.fx.push({ kind: "ink", x: ROOM.w / 2, y: ROOM.h / 2, radius: 900, t: 0.6, total: 0.6, color: "#101018" });
      w.shake = Math.max(w.shake, 16);
      sfx(w, "blast");
      if (!safe) kill();
      w.erasure = null;
    }
  }

  for (const s of w.sweeps) {
    if (s.wait > 0) {
      s.wait -= dt;
      continue;
    }
    const before = s.at;
    s.at += s.dir * REDACTOR.strike.speed * dt;
    const mine = s.axis === "x" ? p.x : p.y;
    // Caught if the wall passed over the hunter during this step.
    const lo = Math.min(before, s.at) - REDACTOR.strike.thick;
    const hi = Math.max(before, s.at) + REDACTOR.strike.thick;
    if (mine + p.radius >= lo && mine - p.radius <= hi) kill();
  }
  w.sweeps = w.sweeps.filter((s) => s.at >= -50 && s.at <= (s.axis === "x" ? ROOM.w : ROOM.h) + 50);

  for (const b of w.bars) {
    b.t -= dt;
    if (b.t > 0) continue;
    if (toBar(p.x, p.y, b.x, b.y, b.angle, b.len) <= b.width / 2 + p.radius) hurtPlayer(w, b.damage);
    w.fx.push({ kind: "slash", x: b.x - (Math.cos(b.angle) * b.len) / 2, y: b.y - (Math.sin(b.angle) * b.len) / 2, x2: b.x + (Math.cos(b.angle) * b.len) / 2, y2: b.y + (Math.sin(b.angle) * b.len) / 2, radius: b.width / 2, t: 0.35, total: 0.35, color: "#101018" });
    w.shake = Math.max(w.shake, 5);
  }
  w.bars = w.bars.filter((b) => b.t > 0);

  if (w.arenaR > 0) {
    const s = REDACTOR.shrink;
    w.arenaR = Math.max(s.to, w.arenaR - ((s.from - s.to) / s.time) * dt);
    if (Math.hypot(p.x - ROOM.w / 2, p.y - ROOM.h / 2) > w.arenaR) hurtPlayer(w, Math.round(p.d.maxHp * s.share));
  }
}
