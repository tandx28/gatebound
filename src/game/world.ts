import type { Controls } from "../engine/input";
import { clamp, norm } from "../engine/vec";
import { circlesOverlap, inArc, rollDamage, separate } from "./combat";
import {
  KINDS,
  PIERCE,
  PLAYER,
  RANK_IDS,
  RANKS,
  ROOM,
  SKILL_IDS,
  SKILLS,
  SURGE,
  WHIRL,
  type Rank,
  type SkillId,
} from "./config";
import { generateDungeon, OPPOSITE, type RoomNode, type Side } from "./dungeon";
import { damageEnemy, isCommitted, makeEnemy, spawnPoint, stepEnemy } from "./enemies";
import { blast, burst, floatText, HUB_TABS, hurtPlayer, type Enemy, type Player, type World } from "./state";
import {
  advanceDialogue,
  fireQuest,
  hubAction,
  newProfile,
  newRun,
  nextDialogue,
  onKill,
  refreshDerived,
  settleClear,
  settleDeath,
  usePotion,
} from "./profile";
import { addXp, allocate, derive, newProgress, POINTS_PER_LEVEL, STAT_KEYS } from "./stats";
import { hubButtons, pointIn, statButton } from "./ui";

export type { Enemy, Player, World } from "./state";

export function createWorld(rng: () => number = Math.random): World {
  const prog = newProgress();
  const d = derive(prog.stats);
  return {
    profile: newProfile(),
    run: newRun(),
    tab: "gates",
    dialogue: null,
    pendingDialogue: [],
    dirty: false,
    requests: [],
    mode: "select",
    menu: "none",
    notices: [],
    player: {
      x: ROOM.w / 2,
      y: ROOM.h / 2,
      radius: PLAYER.radius,
      hp: d.maxHp,
      mana: d.maxMana,
      prog,
      d,
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
      skillCd: { pierce: 0, whirl: 0, surge: 0 },
      lungeT: 0,
      lungeX: 1,
      lungeY: 0,
      surgeT: 0,
      moving: false,
    },
    enemies: [],
    spawnQueue: [],
    projectiles: [],
    zones: [],
    shockwaves: [],
    fx: [],
    texts: [],
    particles: [],
    dungeon: null,
    roomId: 0,
    rank: "E",
    doorsOpen: true,
    clearT: 0,
    kills: 0,
    shake: 0,
    hitstop: 0,
    rng,
  };
}

export function currentRoom(w: World): RoomNode | null {
  return w.dungeon ? w.dungeon.rooms[w.roomId] : null;
}

function clearField(w: World): void {
  w.enemies = [];
  w.spawnQueue = [];
  w.projectiles = [];
  w.zones = [];
  w.shockwaves = [];
}

function resetPlayer(p: Player): void {
  p.hp = p.d.maxHp;
  p.mana = p.d.maxMana;
  p.dashT = 0;
  p.dashCd = 0;
  p.iframes = 0;
  p.attackT = 0;
  p.attackCd = 0;
  p.lungeT = 0;
  p.surgeT = 0;
  p.hurtFlash = 0;
  p.skillCd = { pierce: 0, whirl: 0, surge: 0 };
}

/** Start a gate of the given rank. The player enters rested. */
export function enterGate(w: World, rank: Rank): void {
  w.rank = rank;
  w.dungeon = generateDungeon(rank, w.rng);
  w.mode = "gate";
  w.menu = "none";
  w.clearT = 0;
  w.texts = [];
  w.fx = [];
  w.run = newRun();
  w.run.overLevel = w.player.prog.level < RANKS[rank].minLevel;
  resetPlayer(w.player);
  enterRoom(w, w.dungeon.startId, null);
  w.notices.push({ title: `RANK ${rank} GATE`, body: "Find the boss room. Doors lock while enemies live.", life: 3 });
}

/** A single sealed, empty room with no doors. Used by tests. */
export function enterArena(w: World, rank: Rank = "E"): void {
  w.rank = rank;
  w.dungeon = {
    rank,
    startId: 0,
    bossId: -1,
    rooms: [{ id: 0, gx: 0, gy: 0, doors: {}, kind: "start", depth: 0, cleared: true, visited: true, spawns: [] }],
  };
  w.mode = "gate";
  w.roomId = 0;
  w.doorsOpen = true;
  w.run = newRun();
  clearField(w);
  resetPlayer(w.player);
  w.player.x = ROOM.w / 2;
  w.player.y = ROOM.h / 2;
}

/** Back to the gate board. */
export function toSelect(w: World): void {
  w.mode = "select";
  w.dungeon = null;
  clearField(w);
  w.fx = [];
  w.texts = [];
  w.particles = [];
  resetPlayer(w.player);
  w.player.x = ROOM.w / 2;
  w.player.y = ROOM.h / 2;
  w.tab = "gates";
  nextDialogue(w);
}

/** Move into a room. `from` is the side of the new room the player arrives at. */
export function enterRoom(w: World, id: number, from: Side | null): void {
  const room = w.dungeon!.rooms[id];
  const p = w.player;
  w.roomId = id;
  clearField(w);
  const inset = 70;
  if (from === "n") [p.x, p.y] = [ROOM.w / 2, inset];
  else if (from === "s") [p.x, p.y] = [ROOM.w / 2, ROOM.h - inset];
  else if (from === "w") [p.x, p.y] = [inset, ROOM.h / 2];
  else if (from === "e") [p.x, p.y] = [ROOM.w - inset, ROOM.h / 2];
  else [p.x, p.y] = [ROOM.w / 2, ROOM.h / 2];
  p.dashT = 0;
  p.lungeT = 0;
  room.visited = true;

  if (room.cleared || room.spawns.length === 0) {
    room.cleared = true;
    w.doorsOpen = true;
    return;
  }
  // Doors lock until the room is cleared.
  w.doorsOpen = false;
  for (const kind of room.spawns) {
    const at = KINDS[kind].boss ? { x: ROOM.w / 2, y: ROOM.h / 2 } : spawnPoint(w);
    const e = makeEnemy(kind, at.x, at.y, w.rank);
    e.t = 0.7 + w.rng() * 0.4;
    w.enemies.push(e);
    burst(w, at.x, at.y, "#e5484d", 8, 140);
    if (e.boss) w.notices.push({ title: KINDS[kind].name.toUpperCase(), body: "The gate's master has noticed you.", life: 3 });
  }
}

/** Award experience. A level-up fully restores health and mana. */
export function grantXp(w: World, amount: number): void {
  const p = w.player;
  const before = p.prog.level;
  const gained = addXp(p.prog, amount);
  if (gained === 0) return;
  p.hp = p.d.maxHp;
  p.mana = p.d.maxMana;
  w.notices.push({
    title: "LEVEL UP",
    body: `Level ${p.prog.level}  ·  +${gained * POINTS_PER_LEVEL} stat points  ·  fully restored`,
    life: 3,
  });
  w.dirty = true;
  fireQuest(w, { type: "level", level: p.prog.level });
  for (const id of SKILL_IDS) {
    const s = SKILLS[id];
    if (before < s.level && p.prog.level >= s.level) {
      w.notices.push({ title: "SKILL ACQUIRED", body: `${s.name}  ·  press ${s.key}`, life: 4 });
    }
  }
  burst(w, p.x, p.y, "#ffd84a", 26, 320);
}

/** Damage, speed and attack rate after temporary effects. */
export function effective(p: Player): { damage: number; moveSpeed: number; attackCooldown: number } {
  const on = p.surgeT > 0;
  return {
    damage: p.d.damage * (on ? SURGE.damage : 1),
    moveSpeed: p.d.moveSpeed * (on ? SURGE.speed : 1),
    attackCooldown: p.d.attackCooldown / (on ? SURGE.speed : 1),
  };
}

export function skillReady(p: Player, id: SkillId): boolean {
  const s = SKILLS[id];
  return p.prog.level >= s.level && p.skillCd[id] <= 0 && p.mana >= s.mana;
}

function strike(w: World, e: Enemy, mult: number, knock: number): void {
  const p = w.player;
  const roll = rollDamage(effective(p).damage * mult, p.d.critChance, PLAYER.critMult, w.rng);
  damageEnemy(w, e, roll.amount, roll.crit, p.x, p.y, knock);
}

function useSkill(w: World, id: SkillId): void {
  const p = w.player;
  if (!skillReady(p, id)) return;
  p.mana -= SKILLS[id].mana;
  p.skillCd[id] = SKILLS[id].cooldown;
  p.attackT = 0;
  p.swingId += 1;
  if (id === "pierce") {
    p.lungeT = PIERCE.time;
    p.lungeX = Math.cos(p.facing);
    p.lungeY = Math.sin(p.facing);
    p.dashT = 0;
    p.iframes = Math.max(p.iframes, PIERCE.time + 0.06);
  } else if (id === "whirl") {
    for (const e of w.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) <= WHIRL.radius + e.radius) {
        strike(w, e, WHIRL.mult * p.d.skillPower, WHIRL.knock);
      }
    }
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: WHIRL.radius, t: 0.25, total: 0.25, color: "#5ee6ff" });
    w.shake = Math.max(w.shake, 5);
  } else {
    p.surgeT = SURGE.time;
    burst(w, p.x, p.y, "#ffd84a", 20, 260);
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 80, t: 0.4, total: 0.4, color: "#ffd84a" });
  }
}

/**
 * Keep the player inside the room. An open door lets them walk out through
 * its gap; passing fully through moves them to the next room.
 */
function constrainPlayer(w: World): void {
  const p = w.player;
  const r = p.radius;
  const room = currentRoom(w);
  const cx = ROOM.w / 2;
  const cy = ROOM.h / 2;
  const half = ROOM.doorHalf - r;
  const door = (s: Side) => (w.doorsOpen && room ? room.doors[s] : undefined);

  // Each wall: [side, how far past the wall line, lateral offset from the door centre].
  const walls: [Side, number, number][] = [
    ["n", r - p.y, p.x - cx],
    ["s", p.y - (ROOM.h - r), p.x - cx],
    ["w", r - p.x, p.y - cy],
    ["e", p.x - (ROOM.w - r), p.y - cy],
  ];
  for (const [s, past, lateral] of walls) {
    if (past <= 0) continue;
    const to = door(s);
    if (to !== undefined && Math.abs(lateral) <= half) {
      if (past > r * 2) return enterRoom(w, to, OPPOSITE[s]);
      continue;
    }
    // Blocked: push back to the wall line.
    if (s === "n") p.y = r;
    else if (s === "s") p.y = ROOM.h - r;
    else if (s === "w") p.x = r;
    else p.x = ROOM.w - r;
  }
}

function stepPlayer(w: World, input: Controls, dt: number): void {
  const p = w.player;
  const eff = effective(p);
  p.facing = Math.atan2(input.aimY - p.y, input.aimX - p.x);

  const axis = input.axis();
  const move = norm(axis.x, axis.y);
  p.moving = move.x !== 0 || move.y !== 0;

  for (const id of SKILL_IDS) if (input.consume(SKILLS[id].code)) useSkill(w, id);
  if (input.consume("KeyF")) usePotion(w);

  if (input.consume("Space", "ShiftLeft", "ShiftRight") && p.dashCd <= 0 && p.lungeT <= 0) {
    // Dash along the movement keys, or toward the cursor when standing still.
    const dir = p.moving ? move : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    p.dashX = dir.x;
    p.dashY = dir.y;
    p.dashT = PLAYER.dashTime;
    p.dashCd = PLAYER.dashCooldown;
    p.iframes = Math.max(p.iframes, PLAYER.dashIframes);
    p.attackT = 0;
  }

  if (p.lungeT > 0) {
    p.x += p.lungeX * PIERCE.speed * dt;
    p.y += p.lungeY * PIERCE.speed * dt;
    for (const e of w.enemies) {
      if (e.lastSwing === p.swingId) continue;
      if (!circlesOverlap(e, { x: p.x, y: p.y, radius: p.radius + PIERCE.width })) continue;
      e.lastSwing = p.swingId;
      strike(w, e, PIERCE.mult * p.d.skillPower, 200);
    }
    w.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.22, color: "#ffffff" });
  } else if (p.dashT > 0) {
    p.x += p.dashX * PLAYER.dashSpeed * dt;
    p.y += p.dashY * PLAYER.dashSpeed * dt;
    if (w.rng() < 0.6) w.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.18, color: "#5ee6ff" });
  } else {
    p.x += move.x * eff.moveSpeed * dt;
    p.y += move.y * eff.moveSpeed * dt;
  }
  const roomBefore = w.roomId;
  constrainPlayer(w);
  if (w.roomId !== roomBefore) return;

  if (p.attackCd <= 0 && p.dashT <= 0 && p.lungeT <= 0 && (input.attackHeld || input.consume("Mouse0"))) {
    p.attackCd = eff.attackCooldown;
    p.attackT = PLAYER.attackActive;
    p.attackFacing = p.facing;
    p.swingId += 1;
  }

  if (p.attackT > 0) {
    for (const e of w.enemies) {
      if (e.lastSwing === p.swingId) continue;
      if (!inArc(p.x, p.y, p.attackFacing, PLAYER.attackHalfAngle, PLAYER.attackRange, e)) continue;
      e.lastSwing = p.swingId;
      strike(w, e, 1, 300);
    }
  }

  p.dashT = Math.max(0, p.dashT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.lungeT = Math.max(0, p.lungeT - dt);
  p.surgeT = Math.max(0, p.surgeT - dt);
  p.attackT = Math.max(0, p.attackT - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.mana = Math.min(p.d.maxMana, p.mana + PLAYER.manaRegen * dt);
  for (const id of SKILL_IDS) p.skillCd[id] = Math.max(0, p.skillCd[id] - dt);
}

function stepHazards(w: World, dt: number): void {
  const p = w.player;

  for (const s of w.projectiles) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.x < 0 || s.x > ROOM.w || s.y < 0 || s.y > ROOM.h) s.life = 0;
    // A shot passes through a dashing player and keeps flying.
    if (s.life > 0 && circlesOverlap(s, p) && hurtPlayer(w, s.damage)) s.life = 0;
  }
  w.projectiles = w.projectiles.filter((s) => s.life > 0);

  for (const z of w.zones) {
    if (z.owner && z.owner.hp <= 0) {
      z.t = -1;
      continue;
    }
    z.t -= dt;
    if (z.t <= 0) {
      blast(w, z.x, z.y, z.radius, z.damage);
      z.t = -1;
    }
  }
  w.zones = w.zones.filter((z) => z.t > 0);

  for (const s of w.shockwaves) {
    s.r += s.speed * dt;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (!s.hit && Math.abs(d - s.r) < 16 + p.radius && hurtPlayer(w, s.damage)) s.hit = true;
  }
  w.shockwaves = w.shockwaves.filter((s) => s.r < s.maxR);
}

/** Status window input: number keys or the [+] buttons spend stat points. */
function stepStatus(w: World, input: Controls): void {
  const p = w.player;
  const clicked = input.consume("Mouse0");
  STAT_KEYS.forEach((key, i) => {
    const byKey = input.consume(`Digit${i + 1}`);
    const byClick = clicked && pointIn(statButton(i), input.mouseX, input.mouseY);
    if ((byKey || byClick) && allocate(p.prog, key)) {
      refreshDerived(w);
      w.dirty = true;
    }
  });
}

/**
 * Gate board input. Dialogue comes first and blocks everything else.
 * Otherwise: click a button, press 1-3 on the gates tab, or Q/E to change tab.
 */
function stepSelect(w: World, input: Controls): void {
  const clicked = input.consume("Mouse0");
  if (w.dialogue) {
    if (input.consume("Escape")) advanceDialogue(w, true);
    else if (clicked || input.consume("Space", "Enter")) advanceDialogue(w, false);
    return;
  }

  let action: string | null = null;
  if (clicked) {
    const hit = hubButtons(w).find((b) => b.enabled && pointIn(b.rect, input.mouseX, input.mouseY));
    if (hit) action = hit.id;
  }
  if (w.tab === "gates") {
    RANK_IDS.forEach((rank, i) => {
      if (input.consume(`Digit${i + 1}`)) action = `gate:${rank}`;
    });
  }
  const turn = (input.consume("KeyE") ? 1 : 0) - (input.consume("KeyQ") ? 1 : 0);
  if (turn !== 0) {
    const n = HUB_TABS.length;
    w.tab = HUB_TABS[(HUB_TABS.indexOf(w.tab) + turn + n) % n];
  }
  if (!action) return;
  const rank = hubAction(w, action);
  if (rank) enterGate(w, rank);
}

function stepEffects(w: World, dt: number): void {
  for (const t of w.texts) {
    t.life -= dt;
    t.y -= 40 * dt;
  }
  for (const pt of w.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  for (const f of w.fx) f.t -= dt;
  w.texts = w.texts.filter((t) => t.life > 0);
  w.particles = w.particles.filter((pt) => pt.life > 0);
  w.fx = w.fx.filter((f) => f.t > 0);
  w.shake = Math.max(0, w.shake - 40 * dt);
}

/** Advance the simulation by one fixed step. */
export function step(w: World, input: Controls, dt: number): void {
  for (const n of w.notices) n.life -= dt;
  w.notices = w.notices.filter((n) => n.life > 0);

  // The status window pauses everything behind it.
  const canMenu = w.mode === "gate" || w.mode === "select";
  if (canMenu && input.consume("KeyC", "Tab")) w.menu = w.menu === "status" ? "none" : "status";
  if (w.menu !== "none") {
    if (input.consume("Escape")) w.menu = "none";
    else stepStatus(w, input);
    return;
  }

  stepEffects(w, dt);

  if (w.mode === "select") return stepSelect(w, input);
  if (w.mode === "dead" || w.mode === "cleared") {
    if (input.consume("Enter", "KeyR")) toSelect(w);
    return;
  }

  if (w.hitstop > 0) {
    w.hitstop -= dt;
    return;
  }

  const roomBefore = w.roomId;
  stepPlayer(w, input, dt);
  // Walking through a door ends this step: the new room starts fresh.
  if (w.roomId !== roomBefore) return;

  for (const e of w.enemies) stepEnemy(w, e, dt);
  if (w.spawnQueue.length > 0) {
    w.enemies.push(...w.spawnQueue);
    w.spawnQueue = [];
  }

  // Keep bodies from stacking. An attack in flight passes through.
  for (let i = 0; i < w.enemies.length; i++) {
    for (let j = i + 1; j < w.enemies.length; j++) {
      const a = w.enemies[i];
      const b = w.enemies[j];
      if (!isCommitted(a) && !isCommitted(b)) separate(a, b);
    }
  }
  const p = w.player;
  for (const e of w.enemies) {
    if (isCommitted(e) || p.dashT > 0 || p.lungeT > 0 || !circlesOverlap(p, e)) continue;
    const gap = Math.hypot(e.x - p.x, e.y - p.y);
    const d = gap > 1e-6 ? { x: (e.x - p.x) / gap, y: (e.y - p.y) / gap } : { x: 1, y: 0 };
    const overlap = p.radius + e.radius - gap;
    if (e.boss) {
      // A boss does not budge: the player is pushed out.
      p.x = clamp(p.x - d.x * overlap, p.radius, ROOM.w - p.radius);
      p.y = clamp(p.y - d.y * overlap, p.radius, ROOM.h - p.radius);
    } else {
      e.x += d.x * overlap;
      e.y += d.y * overlap;
    }
  }

  stepHazards(w, dt);

  let bossDied = false;
  const alive: Enemy[] = [];
  for (const e of w.enemies) {
    if (e.hp > 0) {
      alive.push(e);
      continue;
    }
    w.kills += 1;
    burst(w, e.x, e.y, "#e5484d", e.boss ? 60 : 16, e.boss ? 420 : 260);
    onKill(w, e);
    if (e.xp > 0) grantXp(w, e.xp);
    if (e.boss) bossDied = true;
  }
  w.enemies = alive;

  if (bossDied) {
    // The boss's death ends the fight outright.
    for (const e of w.enemies) burst(w, e.x, e.y, "#e5484d", 10, 200);
    clearField(w);
    w.shake = Math.max(w.shake, 14);
    w.clearT = 2.2;
    floatText(w, p.x, p.y, "GATE CLEARED", "#ffd84a", true);
  }

  const room = currentRoom(w);
  if (room && !room.cleared && w.enemies.length === 0 && w.mode === "gate") {
    room.cleared = true;
    w.doorsOpen = true;
    if (!bossDied) floatText(w, p.x, p.y, "ROOM CLEARED", "#6dff9c", true);
    fireQuest(w, { type: "room", rank: w.rank });
  }

  // `mode` is set from deep inside the hit handling, so widen it back out.
  if ((w.mode as string) === "dead") settleDeath(w);

  if (w.clearT > 0 && w.mode === "gate") {
    w.clearT -= dt;
    if (w.clearT <= 0) {
      w.mode = "cleared";
      settleClear(w);
    }
  }
}
