import type { Controls } from "../engine/input";
import { clamp, norm } from "../engine/vec";
import { makeAlly, stepAlly, stepAllyShots } from "./allies";
import { circlesOverlap, inArc, rollDamage, separate } from "./combat";
import {
  BREAK,
  ECHO,
  echoCap,
  EMERGENCY,
  HIDDEN,
  KINDS,
  PENALTY,
  PIERCE,
  PLAYER,
  RANK_IDS,
  rankForLevel,
  RANKS,
  RITE,
  ROOM,
  SEALED,
  SKILL_RANK,
  SKILL_IDS,
  SKILLS,
  SURGE,
  WHIRL,
  type EnemyKind,
  type Rank,
  type SkillId,
} from "./config";
import { addTrialRoom, generateDungeon, keyDungeon, OPPOSITE, type Dungeon, type RoomNode, type Side } from "./dungeon";
import { damageEnemy, isCommitted, spawnEnemy, spawnPoint, stepEnemy } from "./enemies";
import {
  blast,
  burst,
  floatText,
  hurtPlayer,
  sfx,
  visibleTabs,
  type Enemy,
  type GateKind,
  type GateSnapshot,
  type Player,
  type World,
} from "./state";
import {
  advanceDialogue,
  applySetting,
  bossBindChance,
  canActivate,
  fireQuest,
  hubAction,
  newProfile,
  newRun,
  nextDialogue,
  onKill,
  refreshDerived,
  settleClear,
  settleDeath,
  settleRetreat,
  syncDay,
  trialReward,
  usePotion,
} from "./profile";
import { addXp, allocate, derive, newProgress, POINTS_PER_LEVEL, STAT_KEYS } from "./stats";
import { hubButtons, pauseButtons, pointIn, statButton, titleButton } from "./ui";

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
    sounds: [],
    settings: { sfx: 0.7, music: 0.5, shake: true },
    settingsDirty: false,
    today: 0,
    gateKind: "normal",
    sealed: false,
    coldT: 0,
    emergency: null,
    penaltyT: 0,
    allies: [],
    allyShots: [],
    remnants: [],
    riteWave: 0,
    breakT: 0,
    breakSpawn: 0,
    bossDead: false,
    remnantHold: false,
    layoutRev: 0,
    hiddenChance: HIDDEN.chance,
    afterTitle: "select",
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
      lungePower: 1,
      lungeX: 1,
      lungeY: 0,
      surgeT: 0,
      moving: false,
      kx: 0,
      ky: 0,
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
  w.allyShots = [];
  w.remnants = [];
}

/** Bring the active echoes onto the field, in a ring round the player. */
function deployAllies(w: World): void {
  const p = w.player;
  const squad = w.profile.echoes.filter((e) => e.active).slice(0, echoCap(p.prog.level));
  w.allies = squad.map((echo, i) => {
    const a = (i / Math.max(1, squad.length)) * Math.PI * 2;
    return makeAlly(echo, p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46);
  });
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
  p.kx = 0;
  p.ky = 0;
  p.hurtFlash = 0;
  p.skillCd = { pierce: 0, whirl: 0, surge: 0 };
}

/** Common setup for entering any kind of gate. The player enters rested. */
function beginGate(w: World, rank: Rank, dungeon: Dungeon, kind: GateKind, sealed: boolean): void {
  w.rank = rank;
  w.dungeon = dungeon;
  w.gateKind = kind;
  w.sealed = sealed;
  w.coldT = 0;
  w.emergency = null;
  w.penaltyT = 0;
  w.riteWave = 0;
  w.breakT = 0;
  w.breakSpawn = 0;
  w.allies = [];
  w.bossDead = false;
  w.remnantHold = false;
  w.mode = "gate";
  w.menu = "none";
  w.clearT = 0;
  w.texts = [];
  w.fx = [];
  w.run = newRun();
  resetPlayer(w.player);
}

/**
 * Start a gate of the given rank. One gate in eight turns out to be sealed;
 * pass `sealed` to decide it instead of rolling.
 */
export function enterGate(w: World, rank: Rank, opts: { sealed?: boolean } = {}): void {
  const dungeon = generateDungeon(rank, w.rng);
  const sealed = opts.sealed ?? w.rng() < SEALED.chance;
  beginGate(w, rank, dungeon, "normal", sealed);
  w.run.overLevel = w.player.prog.level < RANKS[rank].minLevel;
  enterRoom(w, dungeon.startId, null);
  if (sealed) {
    w.notices.push({ title: "SEALED GATE", body: "The way out is gone. Stronger enemies, biting cold, double reward.", life: 5 });
  } else {
    w.notices.push({ title: `RANK ${rank} GATE`, body: "Find the boss room. Doors lock while enemies live.", life: 3 });
  }
}

/** Spend a key on a short dungeon scaled to the player's level. */
export function enterKeyGate(w: World): void {
  if (w.profile.keys <= 0) return;
  w.profile.keys -= 1;
  w.dirty = true;
  const rank = rankForLevel(w.player.prog.level);
  const dungeon = keyDungeon(rank, w.rng);
  beginGate(w, rank, dungeon, "key", false);
  enterRoom(w, dungeon.startId, null);
  w.notices.push({ title: "KEY DUNGEON", body: "Two rooms. Clear both for the reward.", life: 3 });
}

function arenaDungeon(rank: Rank): Dungeon {
  return {
    rank,
    startId: 0,
    bossId: -1,
    rooms: [{ id: 0, gx: 0, gy: 0, doors: {}, kind: "start", depth: 0, cleared: true, visited: true, spawns: [] }],
  };
}

/** Common setup for the single-room instances. */
function beginArena(w: World, rank: Rank, kind: GateKind, doorsOpen: boolean): void {
  beginGate(w, rank, arenaDungeon(rank), kind, false);
  w.roomId = 0;
  w.doorsOpen = doorsOpen;
  clearField(w);
  w.player.x = ROOM.w / 2;
  w.player.y = ROOM.h / 2;
  // Echoes follow everywhere except into the penalty zone and the rite.
  if (kind !== "penalty" && kind !== "rite") deployAllies(w);
}

/** A single sealed, empty room with no doors. Used by tests. */
export function enterArena(w: World, rank: Rank = "E"): void {
  beginArena(w, rank, "normal", true);
}

function spawnPack(w: World, kinds: EnemyKind[]): void {
  for (const kind of kinds) {
    const at = KINDS[kind].boss ? { x: ROOM.w / 2 + (w.rng() - 0.5) * 500, y: 220 } : spawnPoint(w);
    const e = spawnEnemy(w, kind, at.x, at.y);
    e.t = 0.8 + w.rng() * 0.5;
    w.enemies.push(e);
    burst(w, at.x, at.y, "#e5484d", 8, 140);
  }
}

/** The class-change rite: four waves, alone, at Rank C strength. */
export function enterRite(w: World): void {
  beginArena(w, "C", "rite", false);
  spawnPack(w, RITE.waves[0]);
  w.notices.push({ title: "RITE OF ECHOES", body: `Wave 1 of ${RITE.waves.length}. You enter alone.`, life: 4 });
}

/** A gate break: hold out against packs of your own rank until it closes. */
export function enterBreak(w: World): void {
  beginArena(w, w.profile.hunterRank, "break", false);
  w.breakT = BREAK.time;
  w.breakSpawn = 0;
  w.notices.push({ title: "GATE BREAK", body: `Hold for ${BREAK.time} seconds. They keep coming.`, life: 5 });
}

/** The penalty zone: survive a set time against enemies that cannot be killed. */
export function enterPenalty(w: World): void {
  const rank = rankForLevel(w.player.prog.level);
  beginArena(w, rank, "penalty", false);
  w.penaltyT = PENALTY.time;
  const pack: EnemyKind[] = ["swarmer", "swarmer", "swarmer", "swarmer", "charger", "charger", "shooter", "shooter"];
  for (const kind of pack) {
    const at = spawnPoint(w);
    const e = spawnEnemy(w, kind, at.x, at.y);
    e.immortal = true;
    e.xp = 0;
    e.t = 1 + w.rng();
    w.enemies.push(e);
  }
  w.notices.push({ title: "PENALTY ZONE", body: `Survive ${PENALTY.time} seconds. They cannot be killed.`, life: 5 });
}

/** A copy of the gate in progress, for the save. Null when there is nothing to resume. */
export function snapshotGate(w: World): GateSnapshot | null {
  const inGate = w.mode === "gate" || (w.mode === "title" && w.afterTitle === "gate");
  // Only real gates resume; the single-room trials start over.
  const resumable = w.gateKind === "normal" || w.gateKind === "key";
  if (!inGate || !w.dungeon || !resumable || w.clearT > 0) return null;
  return JSON.parse(
    JSON.stringify({
      rank: w.rank,
      kind: w.gateKind,
      sealed: w.sealed,
      // A gate held open for a boss's remnant counts as beaten.
      bossDead: w.bossDead || w.remnantHold,
      dungeon: w.dungeon,
      roomId: w.roomId,
      run: w.run,
      hp: w.player.hp,
      mana: w.player.mana,
    }),
  );
}

/** Pick a saved gate back up at the start of the room it was saved in. */
export function resumeGate(w: World, snap: GateSnapshot): void {
  beginGate(w, snap.rank, snap.dungeon, snap.kind, snap.sealed);
  w.run = snap.run;
  w.bossDead = snap.bossDead;
  enterRoom(w, snap.roomId, null);
  w.player.hp = Math.max(1, Math.min(w.player.d.maxHp, snap.hp));
  w.player.mana = Math.max(0, Math.min(w.player.d.maxMana, snap.mana));
  // The boss was already dead and nothing else waits: finish the gate.
  if (snap.bossDead && !snap.dungeon.rooms.some((r) => r.kind === "trial" && !r.cleared)) w.clearT = 1.5;
}

/** Back to the gate board. */
export function toSelect(w: World): void {
  w.mode = "select";
  w.dungeon = null;
  w.gateKind = "normal";
  w.sealed = false;
  w.emergency = null;
  w.bossDead = false;
  w.remnantHold = false;
  w.allies = [];
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
  deployAllies(w);
  room.visited = true;
  w.emergency = null;
  if (from) sfx(w, "door");

  if (room.cleared || room.spawns.length === 0) {
    room.cleared = true;
    w.doorsOpen = true;
    return;
  }
  // Doors lock until the room is cleared.
  w.doorsOpen = false;
  let reward = 0;
  for (const kind of room.spawns) {
    const at = KINDS[kind].boss ? { x: ROOM.w / 2, y: ROOM.h / 2 } : spawnPoint(w);
    const e = spawnEnemy(w, kind, at.x, at.y);
    e.t = 0.7 + w.rng() * 0.4;
    if (e.boss && room.kind === "trial") {
      // The echo starts where the boss left off: already in its second phase.
      e.phase = 2;
      e.maxHp = Math.round(e.maxHp * HIDDEN.hp);
      e.hp = e.maxHp;
      e.dmg *= HIDDEN.dmg;
    }
    reward += e.xp;
    w.enemies.push(e);
    burst(w, at.x, at.y, "#e5484d", 8, 140);
    if (e.boss) {
      const body = room.kind === "trial" ? "An echo of what you just killed. It remembers." : "The gate's master has noticed you.";
      w.notices.push({ title: KINDS[kind].name.toUpperCase(), body, life: 3 });
    }
  }
  w.emergency = null;
  if (room.kind === "normal" && w.rng() < EMERGENCY.chance) {
    const t = EMERGENCY.base + EMERGENCY.perEnemy * room.spawns.length;
    w.emergency = { t, total: t, bonus: Math.round(reward * EMERGENCY.bonus) };
    sfx(w, "alarm");
    w.notices.push({ title: "EMERGENCY QUEST", body: `Kill every enemy within ${t} seconds, or be punished.`, life: 4 });
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
  sfx(w, "levelup");
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
  // Each rank from a skill book adds power and trims the cooldown.
  const extra = w.profile.skillRanks[id] - 1;
  const power = 1 + SKILL_RANK.power * extra;
  p.mana -= SKILLS[id].mana;
  p.skillCd[id] = SKILLS[id].cooldown * (1 - SKILL_RANK.cooldown * extra);
  p.attackT = 0;
  p.swingId += 1;
  sfx(w, id);
  if (id === "pierce") {
    p.lungeT = PIERCE.time;
    p.lungePower = power;
    p.lungeX = Math.cos(p.facing);
    p.lungeY = Math.sin(p.facing);
    p.dashT = 0;
    p.iframes = Math.max(p.iframes, PIERCE.time + 0.06);
  } else if (id === "whirl") {
    for (const e of w.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) <= WHIRL.radius + e.radius) {
        strike(w, e, WHIRL.mult * p.d.skillPower * power, WHIRL.knock);
      }
    }
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: WHIRL.radius, t: 0.25, total: 0.25, color: "#5ee6ff" });
    w.shake = Math.max(w.shake, 5);
  } else {
    p.surgeT = SURGE.time + SKILL_RANK.surgeTime * extra;
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

/**
 * T: leave the gate. Free once the boss is dead; otherwise it costs a
 * Return Stone, which does nothing in a sealed gate or the penalty zone.
 */
function tryLeave(w: World): void {
  if ((w.gateKind !== "normal" && w.gateKind !== "key") || w.clearT > 0) return;
  if (w.remnantHold && !w.bossDead) {
    // Walking away from a boss's remnant: the gate was won, so it clears.
    w.remnantHold = false;
    w.remnants = [];
    w.clearT = 0.01;
    return;
  }
  if (w.bossDead) {
    w.clearT = 0.01;
    return;
  }
  if (w.sealed) {
    w.notices.push({ title: "SEALED", body: "The stone is cold and dead in your hand.", life: 2.5 });
    return;
  }
  if (w.profile.stones <= 0) return;
  w.profile.stones -= 1;
  sfx(w, "stone");
  clearField(w);
  settleRetreat(w);
  w.mode = "cleared";
}

/**
 * G: bind the nearest remnant as an echo. Costs mana. Regular enemies bind
 * at once; a boss resists, and its remnant allows only a few tries.
 */
function tryBind(w: World): void {
  const p = w.player;
  const pr = w.profile;
  if (!pr.classUnlocked) return;
  let best = -1;
  let d = ECHO.bindRange;
  w.remnants.forEach((r, i) => {
    const n = Math.hypot(r.x - p.x, r.y - p.y);
    if (n <= d) {
      d = n;
      best = i;
    }
  });
  if (best < 0) return;
  const r = w.remnants[best];
  if (pr.echoes.length >= ECHO.roster) {
    sfx(w, "deny");
    w.notices.push({ title: "ROSTER FULL", body: "Release an echo on the gate board to bind another.", life: 2.5 });
    return;
  }
  if (p.mana < ECHO.bindMana) {
    sfx(w, "deny");
    floatText(w, p.x, p.y, "NO MANA", "#4f7bff");
    return;
  }
  p.mana -= ECHO.bindMana;
  const boss = KINDS[r.kind].boss;
  if (boss && w.rng() >= bossBindChance(w)) {
    r.tries -= 1;
    sfx(w, "fail");
    floatText(w, r.x, r.y, r.tries > 0 ? `IT RESISTS  (${r.tries} left)` : "IT IS GONE", "#ff5a60", true);
    if (r.tries <= 0) w.remnants.splice(best, 1);
    return;
  }
  const echo = { kind: r.kind, rank: r.rank, active: canActivate(w, r.kind) };
  pr.echoes.push(echo);
  w.remnants.splice(best, 1);
  w.dirty = true;
  sfx(w, "summon");
  burst(w, r.x, r.y, "#8a6cff", 24, 260);
  floatText(w, r.x, r.y, echo.active ? "BOUND" : "BOUND  (in reserve)", "#b9a4ff", true);
  // An echo with room in the squad rises where it fell and fights at once.
  if (echo.active) w.allies.push(makeAlly(echo, r.x, r.y));
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
  if (input.consume("KeyG")) tryBind(w);
  if (input.consume("KeyT")) {
    tryLeave(w);
    if (w.mode !== "gate") return;
  }

  if (input.consume("Space", "ShiftLeft", "ShiftRight") && p.dashCd <= 0 && p.lungeT <= 0) {
    // Dash along the movement keys, or toward the cursor when standing still.
    const dir = p.moving ? move : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    p.dashX = dir.x;
    p.dashY = dir.y;
    p.dashT = PLAYER.dashTime;
    p.dashCd = PLAYER.dashCooldown;
    p.iframes = Math.max(p.iframes, PLAYER.dashIframes);
    p.attackT = 0;
    sfx(w, "dash");
  }

  if (p.lungeT > 0) {
    p.x += p.lungeX * PIERCE.speed * dt;
    p.y += p.lungeY * PIERCE.speed * dt;
    for (const e of w.enemies) {
      if (e.lastSwing === p.swingId) continue;
      if (!circlesOverlap(e, { x: p.x, y: p.y, radius: p.radius + PIERCE.width })) continue;
      e.lastSwing = p.swingId;
      strike(w, e, PIERCE.mult * p.d.skillPower * p.lungePower, 200);
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
  // Being thrown: carried on top of whatever else the player is doing.
  p.x += p.kx * dt;
  p.y += p.ky * dt;
  const fade = Math.exp(-7 * dt);
  p.kx *= fade;
  p.ky *= fade;
  const roomBefore = w.roomId;
  constrainPlayer(w);
  if (w.roomId !== roomBefore) return;

  if (p.attackCd <= 0 && p.dashT <= 0 && p.lungeT <= 0 && (input.attackHeld || input.consume("Mouse0"))) {
    p.attackCd = eff.attackCooldown;
    p.attackT = PLAYER.attackActive;
    p.attackFacing = p.facing;
    p.swingId += 1;
    sfx(w, "swing");
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
    // A ring shows where it will start before it moves or can hurt.
    if (s.wait > 0) {
      s.wait -= dt;
      continue;
    }
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
      sfx(w, "click");
    }
  });
}

/**
 * Gate board input. Dialogue comes first and blocks everything else.
 * Otherwise: click a button, press 1-3 on the gates tab, or Q/E to change tab.
 */
function stepSelect(w: World, input: Controls): void {
  syncDay(w);
  nextDialogue(w);
  const clicked = input.consume("Mouse0");
  // A missed daily quest is paid for before anything else, then a gate break.
  if (!w.dialogue && w.profile.penaltyPending) return enterPenalty(w);
  if (!w.dialogue && w.profile.breakPending) return enterBreak(w);
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
    sfx(w, "click");
    const tabs = visibleTabs(w);
    w.tab = tabs[(Math.max(0, tabs.indexOf(w.tab)) + turn + tabs.length) % tabs.length];
  }
  if (!action) return;
  const enter = hubAction(w, action);
  if (enter === "key") enterKeyGate(w);
  else if (enter === "rite") enterRite(w);
  else if (enter) enterGate(w, enter);
}

/** Title screen: Play, by click or key. */
function stepTitle(w: World, input: Controls): void {
  const clicked = input.consume("Mouse0") && pointIn(titleButton(), input.mouseX, input.mouseY);
  if (!clicked && !input.consume("Enter", "Space")) return;
  w.mode = w.afterTitle === "gate" && w.dungeon ? "gate" : "select";
  w.menu = "none";
  sfx(w, "chime");
}

/** Pause menu: resume, save, or save and leave to the title screen. */
function stepPause(w: World, input: Controls): void {
  if (input.consume("Escape")) {
    w.menu = "none";
    return;
  }
  if (!input.consume("Mouse0")) return;
  const hit = pauseButtons(w).find((b) => pointIn(b.rect, input.mouseX, input.mouseY));
  if (!hit) return;
  if (hit.id.startsWith("set:")) return applySetting(w, hit.id.slice(4));
  sfx(w, "click");
  if (hit.id === "pause:resume") w.menu = "none";
  else if (hit.id === "pause:save") {
    w.dirty = true;
    w.notices.push({ title: "GAME SAVED", body: "You will resume from the start of this room.", life: 3 });
  } else if (hit.id === "pause:exit") {
    w.dirty = true;
    w.menu = "none";
    w.afterTitle = "gate";
    w.mode = "title";
  }
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

/**
 * Last line of defence: nothing may leave a step with a position that is not
 * a number. The player is put back in the room; anything else is dropped.
 */
export function healPositions(w: World): void {
  const ok = (c: { x: number; y: number }) => Number.isFinite(c.x) && Number.isFinite(c.y);
  const p = w.player;
  if (!ok(p)) {
    p.x = ROOM.w / 2;
    p.y = ROOM.h / 2;
    p.dashT = 0;
    p.lungeT = 0;
    sfx(w, "deny");
  }
  // Removed quietly: a broken enemy gives nothing and must not block the room.
  if (!w.enemies.every(ok)) w.enemies = w.enemies.filter(ok);
  if (!w.allies.every(ok)) w.allies = w.allies.filter(ok);
  if (!w.projectiles.every(ok)) w.projectiles = w.projectiles.filter(ok);
  if (!w.allyShots.every(ok)) w.allyShots = w.allyShots.filter(ok);
  if (!w.particles.every(ok)) w.particles = w.particles.filter(ok);
  if (!Number.isFinite(w.shake)) w.shake = 0;
  if (!Number.isFinite(w.hitstop)) w.hitstop = 0;
}

/** Advance the simulation by one fixed step. */
export function step(w: World, input: Controls, dt: number): void {
  for (const n of w.notices) n.life -= dt;
  w.notices = w.notices.filter((n) => n.life > 0);

  if (w.mode === "title") return stepTitle(w, input);

  // The status window and the pause menu stop everything behind them.
  const canMenu = (w.mode === "gate" || w.mode === "select") && w.menu !== "pause";
  if (canMenu && input.consume("KeyC", "Tab")) w.menu = w.menu === "status" ? "none" : "status";
  if (w.menu === "status") {
    if (input.consume("Escape")) w.menu = "none";
    else stepStatus(w, input);
    return;
  }
  if (w.menu === "pause") return stepPause(w, input);
  if (w.mode === "gate" && input.consume("Escape")) {
    w.menu = "pause";
    sfx(w, "click");
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
  // So does leaving by stone. (`mode` changes deep inside, so widen it.)
  if (w.roomId !== roomBefore || (w.mode as string) !== "gate") return;

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

  for (const a of w.allies) stepAlly(w, a, dt);
  stepAllyShots(w, dt);
  for (const r of w.remnants) r.life -= dt;
  w.remnants = w.remnants.filter((r) => r.life > 0);

  stepHazards(w, dt);
  healPositions(w);

  let bossDied = false;
  const alive: Enemy[] = [];
  for (const e of w.enemies) {
    if (e.hp > 0) {
      alive.push(e);
      continue;
    }
    w.kills += 1;
    sfx(w, e.boss ? "bosskill" : "kill");
    burst(w, e.x, e.y, "#e5484d", e.boss ? 60 : 16, e.boss ? 420 : 260);
    onKill(w, e);
    if (e.xp > 0) grantXp(w, e.xp);
    if (e.boss) bossDied = true;
  }
  w.enemies = alive;

  const room = currentRoom(w);
  // Only in a real gate does the boss's death end things; the rite's bosses are just a wave.
  if (bossDied && w.gateKind === "normal") {
    // The boss's death ends the fight outright.
    for (const e of w.enemies) burst(w, e.x, e.y, "#e5484d", 10, 200);
    // The fight ends, but what the boss left behind stays to be bound.
    const left = w.remnants.filter((r) => KINDS[r.kind].boss);
    clearField(w);
    w.remnants = left;
    w.shake = Math.max(w.shake, 14);
    const trial = room?.kind === "trial";
    if (trial) trialReward(w);
    // Rarely, a hidden door opens behind the boss instead of the gate closing.
    const hidden =
      !trial && w.gateKind === "normal" && !w.bossDead && w.rng() < w.hiddenChance ? addTrialRoom(w.dungeon!, w.rng) : null;
    if (hidden) {
      w.bossDead = true;
      w.layoutRev += 1;
      w.notices.push({ title: "A HIDDEN DOOR", body: "Something waits behind it. Enter, or press T to leave with what you have.", life: 6 });
    } else if (left.length > 0) {
      // Hold the gate open until the remnant is bound, lost, or left behind.
      w.remnantHold = true;
      const chance = Math.round(bossBindChance(w) * 100);
      w.notices.push({ title: "THE BOSS LINGERS", body: `Press G beside it to bind (${chance}% a try), or T to leave.`, life: 6 });
    } else {
      w.clearT = 2.2;
      floatText(w, p.x, p.y, "GATE CLEARED", "#ffd84a", true);
    }
  }

  if (w.remnantHold && !w.remnants.some((r) => KINDS[r.kind].boss)) {
    w.remnantHold = false;
    // With a hidden door open the gate stays; otherwise it now closes.
    if (!w.bossDead && w.clearT <= 0) {
      w.clearT = 1.5;
      floatText(w, p.x, p.y, "GATE CLEARED", "#ffd84a", true);
    }
  }

  if (room && !room.cleared && w.enemies.length === 0 && w.mode === "gate") {
    room.cleared = true;
    w.doorsOpen = true;
    if (!bossDied) {
      floatText(w, p.x, p.y, "ROOM CLEARED", "#6dff9c", true);
      sfx(w, "roomclear");
    }
    if (w.emergency) {
      const bonus = w.emergency.bonus;
      w.emergency = null;
      w.run.gold += bonus;
      w.notices.push({ title: "EMERGENCY QUEST COMPLETE", body: `+${bonus} gold  ·  +${bonus} experience`, life: 4 });
      grantXp(w, bonus);
    }
    fireQuest(w, { type: "room", rank: w.rank });
    // A key dungeon has no boss: it ends when every room is clear.
    if (w.gateKind === "key" && w.dungeon!.rooms.every((r) => r.cleared)) {
      w.clearT = 2.2;
      floatText(w, p.x, p.y, "DUNGEON CLEARED", "#ffd84a", true);
    }
  }

  if (w.emergency) {
    w.emergency.t -= dt;
    if (w.emergency.t <= 0) {
      // Failure costs health, but never the last of it.
      w.emergency = null;
      sfx(w, "fail");
      const loss = Math.min(p.hp - 1, Math.round(p.d.maxHp * EMERGENCY.hpLoss));
      p.hp -= loss;
      p.hurtFlash = 0.4;
      w.shake = Math.max(w.shake, 12);
      w.notices.push({ title: "EMERGENCY QUEST FAILED", body: `Penalty: -${loss} health`, life: 4 });
    }
  }

  if (w.sealed) {
    // The cold wears health down slowly; it weakens but does not kill.
    w.coldT += dt;
    if (w.coldT >= SEALED.coldEvery) {
      w.coldT = 0;
      if (p.hp > 1) p.hp -= 1;
    }
  }

  // The rite: the next wave arrives when the last enemy of this one falls.
  if (w.gateKind === "rite" && w.enemies.length === 0 && w.clearT <= 0 && (w.mode as string) === "gate") {
    w.riteWave += 1;
    if (w.riteWave < RITE.waves.length) {
      spawnPack(w, RITE.waves[w.riteWave]);
      sfx(w, "alarm");
      w.notices.push({ title: "RITE OF ECHOES", body: `Wave ${w.riteWave + 1} of ${RITE.waves.length}`, life: 3 });
    } else {
      w.clearT = 2.2;
      floatText(w, p.x, p.y, "RITE COMPLETE", "#b9a4ff", true);
    }
  }

  if (w.breakT > 0 && (w.mode as string) === "gate") {
    w.breakT -= dt;
    w.breakSpawn -= dt;
    if (w.breakT <= 0) {
      clearField(w);
      w.enemies = [];
      w.mode = "cleared";
      settleClear(w);
      sfx(w, "gateclear");
      return;
    }
    if (w.breakSpawn <= 0 && w.enemies.length <= BREAK.maxAlive - BREAK.pack) {
      const kinds = RANKS[w.rank].kinds;
      spawnPack(w, Array.from({ length: BREAK.pack }, () => kinds[Math.min(kinds.length - 1, Math.floor(w.rng() * kinds.length))]));
      w.breakSpawn = BREAK.every;
    }
  }

  if (w.penaltyT > 0 && (w.mode as string) === "gate") {
    w.penaltyT -= dt;
    if (w.penaltyT <= 0) {
      clearField(w);
      w.mode = "cleared";
      settleClear(w);
      sfx(w, "gateclear");
      return;
    }
  }

  // `mode` is set from deep inside the hit handling, so widen it back out.
  if ((w.mode as string) === "dead") settleDeath(w);

  if (w.clearT > 0 && w.mode === "gate") {
    w.clearT -= dt;
    if (w.clearT <= 0) {
      w.mode = "cleared";
      settleClear(w);
      sfx(w, "gateclear");
    }
  }
}
