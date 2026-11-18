import type { Controls } from "../engine/input";
import { clamp, norm } from "../engine/vec";
import { makeAlly, stepAlly, stepAllyShots } from "./allies";
import { circlesOverlap, inArc, rollDamage, separate } from "./combat";
import { stepBossExtras } from "./bosses";
import { stepRedactorHazards } from "./redactor";
import { stepCutscene } from "./cutscenes";
import { blockCircle, furnish, insidePillar, PILLAR, stepTraps } from "./rooms";
import {
  ARCANIST,
  ARMY,
  LINES,
  MULTI,
  ULT,
  BLINK,
  CHAIN,
  CLASSES,
  CLEAVE,
  CLOCK,
  FROST,
  LEGION,
  MARK,
  MEND,
  METEOR,
  QUAKE,
  RANGER,
  RUSH,
  VANGUARD,
  CORPSE,
  DRAIN,
  BREAK,
  COLOSSUS,
  DOMAIN,
  ECHO,
  echoCap,
  EMERGENCY,
  HIDDEN,
  KINDS,
  ORDER_TEXT,
  ORDERS,
  PARRY,
  PENALTY,
  PIERCE,
  PLAYER,
  RALLY,
  RANK_IDS,
  rankForLevel,
  RANKS,
  RITE,
  ROOM,
  SACRIFICE,
  SEALED,
  SEALED_GUARD,
  SHOT,
  SKILL_SOUND,
  SWAP,
  SKILL_RANK,
  SKILL_IDS,
  SKILLS,
  SKILL_SLOTS,
  STAGGER,
  STATUS,
  SURGE,
  TOWER,
  towerRank,
  WHIRL,
  type EnemyKind,
  type Rank,
  type SkillId,
} from "./config";
import { addTrialRoom, generateDungeon, keyDungeon, OPPOSITE, type Dungeon, type RoomNode, type Side } from "./dungeon";
import { damageEnemy, isCommitted, spawnEnemy, spawnPoint, stepEnemy } from "./enemies";
import { BOW, FURY, itemDef, PERK, perksOf, STAFF, WEAPONS } from "./items";
import { playerHit, stepEnemyPerks } from "./perks";
import {
  healPlayer,
  type Ally,
  afflict,
  blast,
  burst,
  floatText,
  hurtPlayer,
  noAilments,
  noPerks,
  sfx,
  visibleTabs,
  isCaller,
  type Enemy,
  type GateKind,
  type GateSnapshot,
  type ShotLook,
  type Player,
  type World,
} from "./state";
import {
  towerFloorCleared,
  clockFloorCleared,
  settleClock,
  settleRush,
  slotOpen,
  earnLine,
  marginCleared,
  playSpecial,
  ultimateOf,
  advanceDialogue,
  applySetting,
  bossBindChance,
  cycleBelt,
  restock,
  useBag,
  useBelt,
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
import { hoveredItem, keysButtons, hubButtons, pauseButtons, pointIn, statButton, titleButton } from "./ui";

export type { Enemy, Player, World } from "./state";

export function createWorld(rng: () => number = Math.random): World {
  const prog = newProgress();
  const d = derive(prog.stats);
  return {
    profile: newProfile(),
    run: newRun(),
    tab: "gates",
    dialogue: null,
    rebinding: null,
    cutscene: null,
    pendingDialogue: [],
    dirty: false,
    requests: [],
    sounds: [],
    settings: {
      keys: {}, sfx: 0.7, music: 0.5, shake: true, quality: "high", autoQuality: true },
    settingsDirty: false,
    today: 0,
    gateKind: "normal",
    sealed: false,
    coldT: 0,
    emergency: null,
    penaltyT: 0,
    patches: [],
    rallyT: 0,
    rallyTarget: null,
    domainT: 0,
    turnedT: 0,
    pillars: [],
    traps: [],
    trapClock: 0,
    allies: [],
    armyOrder: "hunt",
    armyAway: false,
    armyCd: 0,
    legionT: 0,
    blasts: [],
    clockT: 0,
    rushIdx: 0,
    rushTime: 0,
    skillPage: 0,
    slotPick: 0,
    beastPage: 0,
    bossLull: 0,
    lastSkill: null,
    glyphs: [],
    glyphNext: 0,
    stillT: 0,
    attackLatched: false,
    hoverItem: null,
    erasure: null,
    sweeps: [],
    bars: [],
    arenaR: 0,
    sting: null,
    allyShots: [],
    remnants: [],
    corpses: [],
    towerFloor: 0,
    towerRest: 0,
    riteWave: 0,
    breakT: 0,
    breakSpawn: 0,
    bossDead: false,
    remnantHold: false,
    layoutRev: 0,
    invPage: 0,
    belt: 0,
    wardReady: false,
    hiddenChance: HIDDEN.chance,
    specialScenes: false,
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
      skillCd: noCooldowns(),
      ail: noAilments(),
      weapon: null,
      perks: noPerks(),
      powers: [],
      furyT: 0,
      swapCd: 0,
      hits: 0,
      healOwed: 0,
      drinkCd: 0,
      aimX: ROOM.w / 2 + 100,
      aimY: ROOM.h / 2,
      lungeT: 0,
      lungePower: 1,
      lungeX: 1,
      lungeY: 0,
      surgeT: 0,
      parryT: 0,
      drainT: 0,
      bulwarkT: 0,
      overflowT: 0,
      drawT: 0,
      ultCd: 0,
      mantleT: 0,
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
  w.corpses = [];
  w.patches = [];
  w.rallyT = 0;
  w.rallyTarget = null;
  w.domainT = 0;
  w.turnedT = 0;
  w.blasts = [];
  w.legionT = 0;
  w.bossLull = 0;
  w.glyphs = [];
  w.glyphNext = 0;
  w.stillT = 0;
  w.erasure = null;
  w.sweeps = [];
  w.bars = [];
  w.arenaR = 0;
}

function noCooldowns(): Record<SkillId, number> {
  return Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>;
}

/** Bring the active echoes onto the field, in a ring round the player. */
function deployAllies(w: World): void {
  const p = w.player;
  // Sent away: they stay away until called. Only an Echo Caller has an army at all.
  if (w.armyAway || !isCaller(w.profile)) {
    w.allies = [];
    return;
  }
  const squad = w.profile.echoes.filter((e) => e.active).slice(0, echoCap(p.prog.level));
  w.allies = squad.map((echo, i) => {
    const a = (i / Math.max(1, squad.length)) * Math.PI * 2;
    // The Crown of the Hollow makes every echo hit harder.
    const base = p.d.damage * (p.powers.includes("hollow_crown") ? 1.25 : 1);
    return makeAlly(echo, p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46, base);
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
  p.skillCd = noCooldowns();
  p.parryT = 0;
  p.drainT = 0;
  p.bulwarkT = 0;
  p.overflowT = 0;
  p.drawT = 0;
  p.mantleT = 0;
  // The ultimate's wait is carried from gate to gate; only the hold on the string lets go.
  p.ail = noAilments();
  p.furyT = 0;
  p.swapCd = 0;
  p.hits = 0;
  p.drinkCd = 0;
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
  w.towerFloor = 0;
  w.towerRest = 0;
  w.clockT = 0;
  w.rushIdx = 0;
  w.rushTime = 0;
  w.breakT = 0;
  w.breakSpawn = 0;
  w.allies = [];
  w.armyOrder = "hunt";
  w.armyAway = false;
  w.armyCd = 0;
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
  const pr = w.profile;
  // Luck alone could hide sealed gates for ever, so the sixth gate without one always is.
  const sealed = opts.sealed ?? (w.rng() < SEALED.chance || pr.sealedPity >= SEALED.pity - 1);
  if (sealed) pr.sealedPity = 0;
  else if (opts.sealed === undefined) pr.sealedPity += 1;
  beginGate(w, rank, dungeon, "normal", sealed);
  w.run.overLevel = w.player.prog.level < RANKS[rank].minLevel;
  enterRoom(w, dungeon.startId, null);
  if (sealed) {
    playSpecial(w, "sealed");
    w.notices.push({ title: "SEALED GATE", body: "No way out. Its master is awake. Double reward, and a prize.", life: 6 });
    floatText(w, w.player.x, w.player.y, "SEALED", "#ff3355", true);
    sfx(w, "alarm");
    w.shake = Math.max(w.shake, 12);
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

/**
 * The masters of a boss floor: the rank's own, and on every tenth floor from
 * floor 20 one or two more from the ranks below.
 */
function floorBosses(w: World, floor: number): EnemyKind[] {
  const rank = towerRank(floor);
  const out: EnemyKind[] = [RANKS[rank].boss];
  const extra = floor % MULTI.every !== 0 ? 0 : floor >= MULTI.trioFrom ? 2 : floor >= MULTI.pairFrom ? 1 : 0;
  const below = RANK_IDS.slice(0, RANK_IDS.indexOf(rank)).map((r) => RANKS[r].boss);
  for (let i = 0; i < extra && below.length > 0; i++) out.push(below.splice(Math.floor(w.rng() * below.length), 1)[0]);
  return out;
}

/** Begin a tower floor: a pack, or on every fifth floor the rank's boss. */
function startFloor(w: World, floor: number): void {
  w.towerFloor = floor;
  w.towerRest = 0;
  w.rank = towerRank(floor);
  const def = RANKS[w.rank];
  if (floor % TOWER.bossEvery === 0) spawnPack(w, floorBosses(w, floor));
  else {
    const size = Math.min(TOWER.maxPack, Math.floor(TOWER.pack + floor * TOWER.packGrow));
    const kinds = def.kinds.filter((k) => k !== "totem");
    spawnPack(w, Array.from({ length: size }, () => kinds[Math.min(kinds.length - 1, Math.floor(w.rng() * kinds.length))]));
  }
  // Within a rank, every floor is a little tougher than the one below.
  const harder = 1 + TOWER.perFloor * ((floor - 1) % TOWER.floorsPerRank);
  for (const e of w.enemies) {
    e.maxHp = Math.round(e.maxHp * harder);
    e.hp = e.maxHp;
    e.dmg *= harder;
  }
  sfx(w, floor % TOWER.bossEvery === 0 ? "alarm" : "door");
  w.notices.push({ title: `${w.gateKind === "clock" ? "TIME TRIAL" : "THE TOWER"}  ·  FLOOR ${floor}`, body: floor % TOWER.bossEvery === 0 ? "A master holds this floor." : `Rank ${w.rank} strength.`, life: 2.5 });
}

/** The tower: climb until you fall or leave. Nothing is restocked on the way up. */
export function enterTower(w: World): void {
  beginArena(w, "E", "tower", false);
  startFloor(w, 1);
  playSpecial(w, "tower");
}

/** The time trial: the tower's floors against a clock. */
export function enterClock(w: World): void {
  beginArena(w, "E", "clock", false);
  w.clockT = CLOCK.start;
  startFloor(w, 1);
  playSpecial(w, "clock");
}

/** Bring on the boss rush's next master, at Rank S strength. */
function startRush(w: World, i: number): void {
  w.rushIdx = i;
  w.towerRest = 0;
  w.rank = "S";
  const kinds = RUSH.rounds[i].map((r) => RANKS[r].boss);
  spawnPack(w, kinds);
  sfx(w, "alarm");
  w.notices.push({ title: `BOSS RUSH  ·  ${i + 1} OF ${RUSH.rounds.length}`, body: kinds.map((k) => KINDS[k].name).join("  ·  "), life: 2.5 });
}

/** The boss rush: every rank's master, one after another. */
export function enterRush(w: World): void {
  beginArena(w, "S", "rush", false);
  startRush(w, 0);
  playSpecial(w, "rush");
}

/** The glyph stones' order: square, circle, cross, triangle. The struck lines tell it. */
export const GLYPH_ORDER = [2, 0, 3, 1];

/** Floor 13 cleared with all five lines held: four faint stones wake in the corners. */
function wakeGlyphs(w: World): void {
  const pr = w.profile;
  if (pr.lines.length < LINES.count) return;
  if (w.player.prog.level < LINES.level) {
    w.notices.push({ title: "FAINT MARKS", body: "Something is scratched into the floor here, but it does not wake for you yet.", life: 5 });
    return;
  }
  const spots = [
    [260, 220],
    [ROOM.w - 260, 220],
    [260, ROOM.h - 220],
    [ROOM.w - 260, ROOM.h - 220],
  ];
  // The corners are shuffled: the order is in the glyphs, not in where they stand.
  const glyphs = [0, 1, 2, 3];
  for (let i = glyphs.length - 1; i > 0; i--) {
    const j = Math.floor(w.rng() * (i + 1));
    [glyphs[i], glyphs[j]] = [glyphs[j], glyphs[i]];
  }
  w.glyphs = spots.map(([x, y], i) => ({ x, y, glyph: glyphs[i], lit: false }));
  w.glyphNext = 0;
  w.towerRest = LINES.rest;
  sfx(w, "chime");
  w.notices.push({ title: "THE FLOOR REMEMBERS", body: "Four stones, faintly marked. The lines you carry know their order.", life: 6 });
}

/** Walking onto a stone strikes it. The right order opens the margin; a wrong one puts them all out. */
function stepGlyphs(w: World): void {
  if (w.glyphs.length === 0) return;
  const p = w.player;
  for (const g of w.glyphs) {
    if (g.lit || Math.hypot(g.x - p.x, g.y - p.y) > LINES.stoneRadius + p.radius) continue;
    if (g.glyph !== GLYPH_ORDER[w.glyphNext]) {
      for (const o of w.glyphs) o.lit = false;
      w.glyphNext = 0;
      sfx(w, "deny");
      floatText(w, g.x, g.y, "THE LINE BREAKS", "#ff5a60", true);
      // Step off before it counts again.
      p.x += (p.x - g.x) * 0.6 + 1;
      return;
    }
    g.lit = true;
    w.glyphNext += 1;
    sfx(w, "chime");
    w.fx.push({ kind: "column", x: g.x, y: g.y, radius: 40, t: 0.8, total: 0.8, color: "#e8e8f0" });
    if (w.glyphNext >= GLYPH_ORDER.length) {
      w.profile.marginFound = true;
      w.dirty = true;
      enterMargin(w);
    }
    return;
  }
}

/** Standing quite still in an empty room of a gate, for one of the lines. */
function stepStill(w: World, dt: number): void {
  const p = w.player;
  const quiet = (w.gateKind === "normal" || w.gateKind === "key") && w.enemies.length === 0 && w.spawnQueue.length === 0;
  if (!quiet || p.moving || p.attackCd > 0 || p.dashT > 0 || p.drawT > 0) {
    w.stillT = 0;
    return;
  }
  w.stillT += dt;
  if (w.stillT >= LINES.stillFor) {
    w.stillT = 0;
    earnLine(w, 4);
  }
}

/** The margin: a bare white room and the Redactor. Rank S, no echoes but what you bring. */
export function enterMargin(w: World): void {
  beginArena(w, "S", "margin", false);
  const e = spawnEnemy(w, "redactor", ROOM.w / 2, 220);
  e.t = 2;
  w.enemies.push(e);
  w.arenaR = 0;
  playSpecial(w, "margin");
}

/** A gate break: hold out against packs of your own rank until it closes. */
export function enterBreak(w: World): void {
  beginArena(w, w.profile.hunterRank, "break", false);
  w.breakT = BREAK.time;
  w.breakSpawn = 0;
  w.notices.push({ title: "GATE BREAK", body: `Hold for ${BREAK.time} seconds. They keep coming.`, life: 5 });
  playSpecial(w, "gatebreak");
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
  // The first gate is over, however it ended: so are its tips.
  if (w.dungeon && w.gateKind === "normal" && w.profile.tips) {
    w.profile.tips = false;
    w.dirty = true;
  }
  w.mode = "select";
  w.dungeon = null;
  w.gateKind = "normal";
  w.sealed = false;
  w.emergency = null;
  w.bossDead = false;
  w.remnantHold = false;
  w.allies = [];
  clearField(w);
  w.pillars = [];
  w.traps = [];
  w.fx = [];
  w.texts = [];
  w.particles = [];
  resetPlayer(w.player);
  w.player.x = ROOM.w / 2;
  w.player.y = ROOM.h / 2;
  w.tab = "gates";
  restock(w);
  nextDialogue(w);
}

/** Move into a room. `from` is the side of the new room the player arrives at. */
export function enterRoom(w: World, id: number, from: Side | null): void {
  const room = w.dungeon!.rooms[id];
  const p = w.player;
  w.roomId = id;
  clearField(w);
  // Only a gate's own rooms are furnished: arenas, the rite and the tower stay bare.
  const furniture = furnish(w.rank, w.gateKind === "normal" || w.gateKind === "key" ? room : null);
  w.pillars = furniture.pillars;
  w.traps = furniture.traps;
  w.trapClock = 0;
  const inset = 70;
  if (from === "n") [p.x, p.y] = [ROOM.w / 2, inset];
  else if (from === "s") [p.x, p.y] = [ROOM.w / 2, ROOM.h - inset];
  else if (from === "w") [p.x, p.y] = [inset, ROOM.h / 2];
  else if (from === "e") [p.x, p.y] = [ROOM.w - inset, ROOM.h / 2];
  else [p.x, p.y] = [ROOM.w / 2, ROOM.h / 2];
  p.dashT = 0;
  p.lungeT = 0;
  deployAllies(w);
  w.wardReady = p.powers.includes("untouched_mantle");
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
  // A sealed gate's master is awake before you arrive, and does not wait alone.
  const boss = w.enemies.find((e) => e.boss);
  if (boss && w.sealed && w.gateKind === "normal" && room.kind !== "trial") {
    boss.phase = 2;
    boss.maxHp = Math.round(boss.maxHp * SEALED.bossHp);
    boss.hp = boss.maxHp;
    for (let i = 0; i < SEALED.guards; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const g = spawnEnemy(w, SEALED_GUARD[w.rank], boss.x + side * (boss.radius + 110), boss.y + 40);
      g.maxHp = Math.round(g.maxHp * SEALED.guardHp);
      g.hp = g.maxHp;
      g.t = 1;
      w.enemies.push(g);
      burst(w, g.x, g.y, "#ff3355", 10, 160);
    }
  }
  w.emergency = null;
  if (room.kind === "normal" && w.rng() < EMERGENCY.chance) {
    const t = EMERGENCY.base + EMERGENCY.perEnemy * room.spawns.length;
    w.emergency = { t, total: t, bonus: Math.round(reward * EMERGENCY.bonus) };
    sfx(w, "alarm");
    w.notices.push({ title: "EMERGENCY QUEST", body: `Kill every enemy within ${t} seconds, or be punished.`, life: 4 });
    playSpecial(w, "emergency");
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
  w.fx.push({ kind: "column", x: p.x, y: p.y, radius: 60, t: 1.4, total: 1.4, color: "#ffd84a" });
}

/** Damage, speed and attack rate after temporary effects. */
export function effective(p: Player): { damage: number; moveSpeed: number; attackCooldown: number } {
  const on = p.surgeT > 0;
  // Breakwater: desperate strength when nearly dead.
  const desperate = p.powers.includes("breakwater") && p.hp / p.d.maxHp < 0.3 ? 2 : 1;
  return {
    damage: p.d.damage * (on ? SURGE.damage : 1) * (p.furyT > 0 ? FURY.damage : 1) * desperate * (p.bulwarkT > 0 ? VANGUARD.damage : 1),
    moveSpeed: p.d.moveSpeed * (on ? SURGE.speed : 1),
    attackCooldown: p.d.attackCooldown / (on ? SURGE.speed : 1),
  };
}

export function skillReady(p: Player, id: SkillId): boolean {
  const s = SKILLS[id];
  return p.prog.level >= s.level && p.skillCd[id] <= 0 && p.mana >= s.mana;
}

function strike(w: World, e: Enemy, mult: number, knock: number, heavy = true): boolean {
  const p = w.player;
  const roll = rollDamage(effective(p).damage * mult, p.d.critChance, p.d.critMult, w.rng);
  // What it was doing before the blow: the blow itself may knock it out of that.
  const was = e.state;
  const landed = playerHit(w, e, roll.amount, roll.crit, p.x, p.y, knock);
  if (landed && heavy) stagger(w, e, was);
  // Blood Price: a share of every blow comes back as health.
  if (landed && p.drainT > 0) healPlayer(w, roll.amount * DRAIN.share);
  return landed;
}

/** States in which an enemy is drawing back to strike, and can be stopped. */
const WINDING = new Set(["windup", "dwind", "blinkwind", "cast", "spit"]);

/** A heavy blow stops a small enemy's attack before it lands. */
function stagger(w: World, e: Enemy, was: string): void {
  if (e.boss || e.hp <= 0 || e.radius > STAGGER.maxRadius || !WINDING.has(was)) return;
  e.state = "recover";
  e.t = STAGGER.time;
  floatText(w, e.x, e.y, "STAGGERED", "#ffd84a");
}

/** A basic attack landing: counted, for Twin Fang's every-fifth-hit second strike. */
function basicHit(w: World, e: Enemy, mult: number): void {
  const p = w.player;
  // A sword or a spear lands heavily; a dagger does not.
  const heavy = p.weapon === "sword" || p.weapon === "spear";
  if (!strike(w, e, mult, 300, heavy)) return;
  p.hits += 1;
  if (p.powers.includes("twin_fang") && p.hits % 5 === 0 && e.hp > 0) strike(w, e, mult, 0, false);
}

/** The weapon in hand, or a dagger's reach and pace for bare hands. */
export function weaponOf(p: Player): (typeof WEAPONS)["dagger"] {
  return p.weapon ? WEAPONS[p.weapon] : { ...WEAPONS.dagger, crit: 0 };
}

function useSkill(w: World, id: SkillId): void {
  const p = w.player;
  if (!skillReady(p, id)) return;
  // Each rank from a skill book adds power and trims the cooldown; an Arcanist's Overflow adds more.
  const extra = w.profile.skillRanks[id] - 1;
  const power = (1 + SKILL_RANK.power * extra) * (p.overflowT > 0 ? ARCANIST.power : 1);
  p.mana -= SKILLS[id].mana;
  p.skillCd[id] = SKILLS[id].cooldown * (1 - SKILL_RANK.cooldown * extra);
  p.attackT = 0;
  p.swingId += 1;
  sfx(w, SKILL_SOUND[id] ?? id);
  // The echo nearest the cursor, for the two skills that spend one.
  const nearestAlly = (): Ally | null => {
    let best: Ally | null = null;
    let d = Infinity;
    for (const a of w.allies) {
      const n = Math.hypot(a.x - p.aimX, a.y - p.aimY);
      if (a.anim <= 0 && n < d) {
        d = n;
        best = a;
      }
    }
    return best;
  };
  const refund = () => {
    p.mana += SKILLS[id].mana;
    p.skillCd[id] = 0;
    sfx(w, "deny");
    floatText(w, p.x, p.y, "NO ECHO", "#b9a4ff");
  };
  w.lastSkill = id;
  if (useNewSkill(w, id, power, extra)) return;
  if (id === "legion" && w.allies.length === 0) return refund();
  if (id === "swap") {
    const a = nearestAlly();
    if (!a) return refund();
    for (const at of [p, a]) w.fx.push({ kind: "ring", x: at.x, y: at.y, radius: 44, t: 0.3, total: 0.3, color: "#b9a4ff" });
    [p.x, p.y, a.x, a.y] = [a.x, a.y, p.x, p.y];
    p.dashT = 0;
    p.lungeT = 0;
    p.kx = 0;
    p.ky = 0;
    p.iframes = Math.max(p.iframes, SWAP.iframes);
  } else if (id === "sacrifice") {
    const a = nearestAlly();
    if (!a) return refund();
    for (const e of w.enemies) {
      if (Math.hypot(e.x - a.x, e.y - a.y) <= SACRIFICE.radius + e.radius) damageEnemy(w, e, effective(p).damage * SACRIFICE.mult * p.d.skillPower * power, false, a.x, a.y, 380);
    }
    w.fx.push({ kind: "blast", x: a.x, y: a.y, radius: SACRIFICE.radius, t: 0.35, total: 0.35, color: "#8a6cff" });
    burst(w, a.x, a.y, "#8a6cff", 30, 360);
    w.shake = Math.max(w.shake, 9);
    // It is spent for this room; the echo itself is not lost.
    w.allies = w.allies.filter((x) => x !== a);
  } else if (id === "parry") {
    p.parryT = PARRY.time;
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 46, t: PARRY.time, total: PARRY.time, color: "#ffd84a" });
  } else if (id === "shot") {
    const dx = Math.cos(p.facing);
    const dy = Math.sin(p.facing);
    for (const e of w.enemies) {
      const along = (e.x - p.x) * dx + (e.y - p.y) * dy;
      const off = Math.abs((e.x - p.x) * dy - (e.y - p.y) * dx);
      if (along > 0 && along < SHOT.range + e.radius && off < SHOT.width + e.radius) strike(w, e, SHOT.mult * p.d.skillPower * power, 240);
    }
    w.fx.push({ kind: "beam", x: p.x, y: p.y, angle: p.facing, radius: SHOT.range, t: 0.35, total: 0.35, color: "#5ee6ff" });
    w.shake = Math.max(w.shake, 6);
  } else if (id === "ward") {
    w.wardReady = true;
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 60, t: 0.5, total: 0.5, color: "#ffd84a" });
    floatText(w, p.x, p.y, "WARDED", "#ffd84a");
  } else if (id === "drain") {
    p.drainT = DRAIN.time + extra;
    burst(w, p.x, p.y, "#ff5a60", 18, 220);
  } else if (id === "pierce") {
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
    w.fx.push({ kind: "swirl", x: p.x, y: p.y, radius: WHIRL.radius, t: 0.35, total: 0.35, color: "#9ff6ff" });
    w.shake = Math.max(w.shake, 5);
  } else if (id === "surge") {
    p.surgeT = SURGE.time + SKILL_RANK.surgeTime * extra;
    burst(w, p.x, p.y, "#ffd84a", 20, 260);
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 80, t: 0.4, total: 0.4, color: "#ffd84a" });
  } else if (id === "rally") {
    // Every echo drops what it is doing and goes for the enemy nearest the cursor.
    let best: Enemy | null = null;
    let d = Infinity;
    for (const e of w.enemies) {
      const n = Math.hypot(e.x - p.aimX, e.y - p.aimY);
      if (e.hp > 0 && n < d) {
        d = n;
        best = e;
      }
    }
    w.rallyTarget = best;
    w.rallyT = RALLY.time + 2 * extra;
    if (best) w.fx.push({ kind: "ring", x: best.x, y: best.y, radius: best.radius + 30, t: 0.5, total: 0.5, color: "#b9a4ff" });
  } else if (id === "blink") {
    const dx = p.aimX - p.x;
    const dy = p.aimY - p.y;
    const reach = Math.min(BLINK.range, Math.hypot(dx, dy));
    const dir = norm(dx, dy);
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 40, t: 0.3, total: 0.3, color: "#5ee6ff" });
    // It never crosses a wall: the far end is kept inside the room.
    p.x = clamp(p.x + dir.x * reach, p.radius, ROOM.w - p.radius);
    p.y = clamp(p.y + dir.y * reach, p.radius, ROOM.h - p.radius);
    p.dashT = 0;
    p.lungeT = 0;
    p.kx = 0;
    p.ky = 0;
    p.iframes = Math.max(p.iframes, BLINK.iframes);
    for (const e of w.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) <= BLINK.radius + e.radius) strike(w, e, BLINK.mult * p.d.skillPower * power, 260);
    }
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: BLINK.radius, t: 0.3, total: 0.3, color: "#5ee6ff" });
  } else {
    w.domainT = DOMAIN.time + extra;
    for (const e of w.enemies) e.slowT = w.domainT;
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 600, t: 0.6, total: 0.6, color: "#4f7bff" });
    w.shake = Math.max(w.shake, 4);
  }
}

/** The enemy nearest a point, alive and not untouchable, within `reach`. */
function enemyNear(w: World, x: number, y: number, reach: number, skip: Set<Enemy> = new Set()): Enemy | null {
  let best: Enemy | null = null;
  let d = reach;
  for (const e of w.enemies) {
    if (e.hp <= 0 || e.immortal || skip.has(e)) continue;
    const n = Math.hypot(e.x - x, e.y - y) - e.radius;
    if (n < d) {
      d = n;
      best = e;
    }
  }
  return best;
}

/** Stop a common enemy in its tracks for a while. Bosses shrug it off. */
function stun(w: World, e: Enemy, time: number): void {
  if (e.boss || e.hp <= 0) return;
  e.state = "recover";
  e.t = Math.max(e.t, time);
  floatText(w, e.x, e.y, "STUNNED", "#ffd84a");
}

/**
 * The skills added in the second skill set. Returns true if `id` was one of
 * them (mana and cooldown are already paid by the caller).
 */
function useNewSkill(w: World, id: SkillId, power: number, extra: number): boolean {
  const p = w.player;
  const sp = p.d.skillPower * power;
  if (id === "cleave") {
    for (const e of w.enemies) {
      if (inArc(p.x, p.y, p.facing, CLEAVE.half, CLEAVE.range, e)) strike(w, e, CLEAVE.mult * sp, CLEAVE.knock);
    }
    w.fx.push({ kind: "ring", x: p.x + Math.cos(p.facing) * 60, y: p.y + Math.sin(p.facing) * 60, radius: CLEAVE.range * 0.7, t: 0.22, total: 0.22, color: "#cfe4ff" });
    w.shake = Math.max(w.shake, 5);
  } else if (id === "quake") {
    for (let i = 0; i < QUAKE.count; i++) {
      const d = QUAKE.step * (i + 1);
      w.blasts.push({
        x: clamp(p.x + Math.cos(p.facing) * d, 20, ROOM.w - 20),
        y: clamp(p.y + Math.sin(p.facing) * d, 20, ROOM.h - 20),
        radius: QUAKE.radius,
        t: QUAKE.first + QUAKE.gap * i,
        mult: QUAKE.mult * sp,
        color: "#ff9a4a",
        stun: QUAKE.stun,
        show: "spikes",
      });
    }
  } else if (id === "mend") {
    healPlayer(w, Math.round(p.d.maxHp * MEND.heal * power));
    burst(w, p.x, p.y, "#7dffb0", 22, 220);
    w.fx.push({ kind: "column", x: p.x, y: p.y, radius: 46, t: 0.9, total: 0.9, color: "#7dffb0" });
  } else if (id === "frost") {
    for (const e of w.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) > FROST.radius + e.radius) continue;
      strike(w, e, FROST.mult * sp, 120, false);
      e.chillT = Math.max(e.chillT, FROST.chill + extra);
    }
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: FROST.radius, t: 0.35, total: 0.35, color: "#9fe8ff" });
    w.fx.push({ kind: "frost", x: p.x, y: p.y, radius: FROST.radius, t: 0.8, total: 0.8, color: "#bff2ff" });
    burst(w, p.x, p.y, "#9fe8ff", 30, 320);
  } else if (id === "chain") {
    const hit = new Set<Enemy>();
    let from = { x: p.x, y: p.y };
    let target = enemyNear(w, p.aimX, p.aimY, CHAIN.reach);
    for (let i = 0; i < CHAIN.jumps + extra && target; i++) {
      hit.add(target);
      w.fx.push({ kind: "bolt", x: from.x, y: from.y, x2: target.x, y2: target.y, radius: 6, t: 0.35, total: 0.35, color: "#bfe0ff" });
      strike(w, target, CHAIN.mult * sp, 80, false);
      from = { x: target.x, y: target.y };
      target = enemyNear(w, from.x, from.y, CHAIN.leap, hit);
    }
    if (hit.size === 0) {
      // Nothing to reach: the mana and the wait come back.
      p.mana += SKILLS.chain.mana;
      p.skillCd.chain = 0;
      sfx(w, "deny");
    }
  } else if (id === "mark") {
    const e = enemyNear(w, p.aimX, p.aimY, 400);
    if (!e) {
      p.mana += SKILLS.mark.mana;
      p.skillCd.mark = 0;
      sfx(w, "deny");
      return true;
    }
    e.markT = MARK.time + 2 * extra;
    floatText(w, e.x, e.y, "MARKED", "#ff5a60", true);
    w.fx.push({ kind: "sigil", x: e.x, y: e.y, radius: e.radius + 24, t: 0.6, total: 0.6, color: "#ff5a60" });
  } else if (id === "meteor") {
    const x = clamp(p.aimX, 30, ROOM.w - 30);
    const y = clamp(p.aimY, 30, ROOM.h - 30);
    w.blasts.push({ x, y, radius: METEOR.radius, t: METEOR.delay, mult: METEOR.mult * sp, color: "#ffb04a", show: "star" });
    w.fx.push({ kind: "ring", x, y, radius: METEOR.radius, t: METEOR.delay, total: METEOR.delay, color: "#ffb04a" });
  } else if (id === "legion") {
    if (w.allies.length === 0) return false;
    w.legionT = LEGION.time + 2 * extra;
    for (const a of w.allies) burst(w, a.x, a.y, "#b9a4ff", 10, 200);
    w.fx.push({ kind: "spiral", x: p.x, y: p.y, radius: 140, t: 1, total: 1, color: "#b9a4ff" });
    floatText(w, p.x, p.y, "ECHO FURY", "#b9a4ff", true);
  } else return false;
  return true;
}

/** H: the power of the class in use. Nothing before the rite. */
function classPower(w: World): void {
  const pr = w.profile;
  const p = w.player;
  if (!pr.classUnlocked) return;
  if (pr.cls === "echo") return toggleArmy(w);
  if (w.armyCd > 0) {
    sfx(w, "deny");
    return;
  }
  w.armyCd = CLASSES[pr.cls].cooldown;
  if (pr.cls === "vanguard") {
    p.bulwarkT = VANGUARD.time;
    // Everything close is thrown clear first: a breath of room, no damage.
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > VANGUARD.radius + e.radius || e.boss) continue;
      const n = norm(e.x - p.x, e.y - p.y);
      e.kx = (n.x || 1) * VANGUARD.knock;
      e.ky = n.y * VANGUARD.knock;
    }
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: VANGUARD.radius, t: 0.4, total: 0.4, color: "#ffd84a" });
    w.fx.push({ kind: "dome", x: p.x, y: p.y, radius: 48, t: VANGUARD.time, total: VANGUARD.time, color: "#ffd84a" });
    floatText(w, p.x, p.y, "BULWARK", "#ffd84a", true);
    w.shake = Math.max(w.shake, 7);
    sfx(w, "block");
  } else if (pr.cls === "ranger") {
    const x = clamp(p.aimX, 30, ROOM.w - 30);
    const y = clamp(p.aimY, 30, ROOM.h - 30);
    for (let i = 0; i < RANGER.arrows; i++) {
      const a = w.rng() * Math.PI * 2;
      const r = Math.sqrt(w.rng()) * RANGER.spread;
      w.blasts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, radius: RANGER.radius, t: RANGER.delay + RANGER.gap * i, mult: RANGER.mult * p.d.skillPower, color: "#7dffb0", show: "arrow" });
    }
    w.fx.push({ kind: "ring", x, y, radius: RANGER.spread + RANGER.radius, t: RANGER.delay, total: RANGER.delay, color: "#7dffb0" });
    sfx(w, "pierce");
  } else {
    p.overflowT = ARCANIST.time;
    p.mana = p.d.maxMana;
    for (const id of SKILL_IDS) p.skillCd[id] = 0;
    w.fx.push({ kind: "spiral", x: p.x, y: p.y, radius: 110, t: 1.2, total: 1.2, color: "#6f9bff" });
    burst(w, p.x, p.y, "#4f7bff", 30, 300);
    floatText(w, p.x, p.y, "OVERFLOW", "#9fc8ff", true);
    sfx(w, "surge");
  }
}

/** The hunter's delayed blasts: each lands once, on enemies only. */
function stepBlasts(w: World, dt: number): void {
  const p = w.player;
  const left: typeof w.blasts = [];
  for (const b of w.blasts) {
    b.t -= dt;
    if (b.t > 0) {
      left.push(b);
      continue;
    }
    for (const e of w.enemies) {
      if (Math.hypot(e.x - b.x, e.y - b.y) > b.radius + e.radius) continue;
      const roll = rollDamage(effective(p).damage * b.mult, p.d.critChance, p.d.critMult, w.rng);
      damageEnemy(w, e, roll.amount, roll.crit, b.x, b.y, 160);
      if (b.stun) stun(w, e, b.stun);
    }
    if (b.show === "spikes") w.fx.push({ kind: "spikes", x: b.x, y: b.y, radius: b.radius, t: 0.6, total: 0.6, color: b.color });
    if (b.show === "star") w.fx.push({ kind: "column", x: b.x, y: b.y, radius: b.radius * 0.7, t: 0.5, total: 0.5, color: "#ffd890" });
    if (b.quiet) continue;
    w.fx.push({ kind: "blast", x: b.x, y: b.y, radius: b.radius, t: 0.3, total: 0.3, color: b.color });
    burst(w, b.x, b.y, b.color, 10, 220);
    w.shake = Math.max(w.shake, 4);
  }
  w.blasts = left;
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
/** The look of a staff's bolt: the element of the staff in hand. */
function boltLook(w: World): ShotLook {
  const held = w.profile.equipped[w.profile.activeWeapon === 1 ? "weapon2" : "weapon"];
  if (!held) return "orb";
  if (itemDef(held)?.power === "blank_quill") return "quill";
  const looks: [string, ShotLook][] = [
    ["burn", "fire"],
    ["frost", "ice"],
    ["chain", "bolt"],
    ["poison", "venom"],
    ["bleed", "blood"],
    ["lifesteal", "blood"],
  ];
  const perks = perksOf(held);
  return looks.find(([perk]) => perks.includes(perk as never))?.[1] ?? "orb";
}

/** A staff's bolt: slower than an arrow, and it bursts where it lands. */
function fireBolt(w: World): void {
  const p = w.player;
  const wd = WEAPONS.staff;
  const roll = rollDamage(effective(p).damage * wd.damage, p.d.critChance, p.d.critMult, w.rng);
  w.allyShots.push({
    x: p.x + Math.cos(p.facing) * p.radius,
    y: p.y + Math.sin(p.facing) * p.radius,
    radius: STAFF.radius,
    vx: Math.cos(p.facing) * STAFF.speed,
    vy: Math.sin(p.facing) * STAFF.speed,
    damage: roll.amount,
    life: wd.range / STAFF.speed,
    mine: true,
    crit: roll.crit,
    look: boltLook(w),
    splash: STAFF.splash,
  });
  sfx(w, "surge");
}

/**
 * Whether the hunter is pressing attack. A button still held from a click
 * outside the field is ignored until it is let go.
 */
function attackPressed(w: World, input: Controls): boolean {
  const tapped = input.consume("Mouse0");
  if (w.attackLatched) return false;
  return tapped || input.attackHeld;
}

/**
 * The bow. Holding the attack draws the string; letting go looses the arrow.
 * A draw held to the full looses a charged shot that pierces everything in
 * line. A tap is a quick, ordinary arrow.
 */
function stepBow(w: World, input: Controls, dt: number): void {
  const p = w.player;
  const held = attackPressed(w, input);
  const busy = p.dashT > 0 || p.lungeT > 0;
  if (held && !busy && (p.drawT > 0 || p.attackCd <= 0)) {
    p.drawT += dt;
    return;
  }
  if (p.drawT <= 0 || busy) return;
  const charged = p.drawT >= BOW.charge;
  p.drawT = 0;
  p.attackCd = effective(p).attackCooldown;
  p.attackFacing = p.facing;
  p.swingId += 1;
  w.run.swings += 1;
  const wd = WEAPONS.bow;
  const roll = rollDamage(effective(p).damage * wd.damage * (charged ? BOW.chargeMult : 1), p.d.critChance, p.d.critMult, w.rng);
  const speed = charged ? BOW.chargeSpeed : BOW.arrowSpeed;
  w.allyShots.push({
    x: p.x + Math.cos(p.facing) * p.radius,
    y: p.y + Math.sin(p.facing) * p.radius,
    radius: charged ? 10 : 6,
    vx: Math.cos(p.facing) * speed,
    vy: Math.sin(p.facing) * speed,
    damage: roll.amount,
    life: wd.range / speed,
    mine: true,
    crit: roll.crit,
    look: charged ? "charged" : "arrow",
    pierce: charged,
    hits: [],
  });
  if (charged) {
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: 46, t: 0.25, total: 0.25, color: "#5ee6ff" });
    w.shake = Math.max(w.shake, 4);
  }
  sfx(w, charged ? "pierce" : "shot");
}

/** Line blasts of the ultimates: a slash from one point to another that lands after a delay. */
function slashLine(w: World, x1: number, y1: number, x2: number, y2: number, width: number, mult: number, delay: number, color: string): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(len / width));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    w.blasts.push({ x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k, radius: width, t: delay, mult: mult / (steps + 1), color, quiet: true });
  }
  w.fx.push({ kind: "slash", x: x1, y: y1, x2, y2, radius: width, t: delay + 0.35, total: delay + 0.35, color });
}

/** Y: the ultimate of the mythic in use. Nothing without one, or while it recharges. */
function useUltimate(w: World): void {
  const p = w.player;
  const power = ultimateOf(w.profile);
  if (!power) return;
  if (p.ultCd > 0) {
    sfx(w, "deny");
    floatText(w, p.x, p.y, `ULTIMATE ${Math.ceil(p.ultCd)} s`, "#ff8fa3");
    return;
  }
  const sp = p.d.skillPower;
  const cx = ROOM.w / 2;
  const cy = ROOM.h / 2;
  const alive = w.enemies.filter((e) => e.hp > 0 && !e.immortal);
  if (power === "ashen_wake") {
    // Five burning cuts across the room, each through an enemy if there is one.
    p.iframes = Math.max(p.iframes, ULT.ashen.iframes);
    for (let i = 0; i < ULT.ashen.slashes; i++) {
      const e = alive[i % Math.max(1, alive.length)];
      const at = e ? { x: e.x, y: e.y } : { x: cx, y: cy };
      const a = w.rng() * Math.PI;
      const dx = Math.cos(a) * 900;
      const dy = Math.sin(a) * 900;
      slashLine(w, clamp(at.x - dx, 0, ROOM.w), clamp(at.y - dy, 0, ROOM.h), clamp(at.x + dx, 0, ROOM.w), clamp(at.y + dy, 0, ROOM.h), ULT.ashen.width, ULT.ashen.mult * sp * 6, 0.15 + i * ULT.ashen.gap, "#ff6a20");
    }
  } else if (power === "twin_fang") {
    const near = alive.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < ULT.twin.reach);
    for (let i = 0; i < ULT.twin.strikes; i++) {
      const e = near[i % Math.max(1, near.length)];
      if (!e) break;
      w.blasts.push({ x: e.x, y: e.y, radius: ULT.twin.radius, t: 0.1 + i * ULT.twin.gap, mult: ULT.twin.mult * sp, color: "#ffd84a" });
    }
    w.fx.push({ kind: "swirl", x: p.x, y: p.y, radius: ULT.twin.reach, t: 0.9, total: 0.9, color: "#ffd84a" });
  } else if (power === "trials_end") {
    const dx = Math.cos(p.facing);
    const dy = Math.sin(p.facing);
    slashLine(w, p.x, p.y, clamp(p.x + dx * 1700, 0, ROOM.w), clamp(p.y + dy * 1700, 0, ROOM.h), ULT.trial.width, ULT.trial.mult * sp * 12, ULT.trial.delay, "#cfe4ff");
  } else if (power === "hollow_crown") {
    if (w.profile.echoes.length === 0) {
      sfx(w, "deny");
      floatText(w, p.x, p.y, "NO ECHOES", "#b9a4ff");
      return;
    }
    const on = new Set(w.allies.map((a) => a.kind));
    w.profile.echoes.forEach((echo, i) => {
      if (echo.active && on.has(echo.kind) && isCaller(w.profile)) return;
      const a = (i / w.profile.echoes.length) * Math.PI * 2;
      const ally = makeAlly(echo, clamp(p.x + Math.cos(a) * 90, 30, ROOM.w - 30), clamp(p.y + Math.sin(a) * 90, 30, ROOM.h - 30), p.d.damage);
      ally.anim = ARMY.rise;
      ally.temp = ULT.crown.time;
      w.allies.push(ally);
    });
    w.fx.push({ kind: "spiral", x: p.x, y: p.y, radius: 220, t: 1.2, total: 1.2, color: "#8a6cff" });
  } else if (power === "seal_breaker") {
    for (const e of alive) {
      e.guard = 0;
      e.slowT = 0;
      if (e.boss) e.extraCd += ULT.seal.delay;
      else stun(w, e, ULT.seal.stun);
      w.fx.push({ kind: "shatter", x: e.x, y: e.y, radius: e.radius + 30, t: 0.6, total: 0.6, color: "#ffd84a" });
    }
  } else if (power === "untouched_mantle") {
    p.mantleT = ULT.mantle.time;
    for (const e of alive) {
      if (e.boss || Math.hypot(e.x - p.x, e.y - p.y) > ULT.mantle.radius) continue;
      const n = norm(e.x - p.x, e.y - p.y);
      e.kx = (n.x || 1) * ULT.mantle.knock;
      e.ky = n.y * ULT.mantle.knock;
    }
    w.fx.push({ kind: "dome", x: p.x, y: p.y, radius: 60, t: ULT.mantle.time, total: ULT.mantle.time, color: "#cfe4ff" });
  } else if (power === "breakwater") {
    const low = 1 - p.hp / p.d.maxHp;
    const mult = (ULT.wave.base + ULT.wave.low * low) * sp;
    for (const e of alive) w.blasts.push({ x: e.x, y: e.y, radius: e.radius + 4, t: ULT.wave.delay + (e.x / ROOM.w) * 0.3, mult, color: "#5ec8ff", quiet: true });
    w.fx.push({ kind: "wave", x: 0, y: cy, radius: ROOM.h, t: ULT.wave.delay + 0.5, total: ULT.wave.delay + 0.5, color: "#5ec8ff" });
  } else if (power === "ledgers_favour") {
    p.hp = p.d.maxHp;
    w.profile.flask.charges = w.profile.flask.size;
    p.mana = p.d.maxMana;
    for (const e of alive) e.markT = Math.max(e.markT, ULT.favour.mark);
    w.fx.push({ kind: "column", x: p.x, y: p.y, radius: 70, t: 1.2, total: 1.2, color: "#ffd84a" });
    for (const e of alive) w.fx.push({ kind: "sigil", x: e.x, y: e.y, radius: e.radius + 20, t: 1.2, total: 1.2, color: "#ff5a60" });
  } else {
    // The Blank Quill: the Redactor's own Erasure, turned on the enemy.
    for (const e of alive) w.blasts.push({ x: e.x, y: e.y, radius: e.radius + 4, t: ULT.quill.delay, mult: ULT.quill.mult * sp, color: "#e8e8f0", quiet: true });
    w.fx.push({ kind: "ink", x: cx, y: cy, radius: 900, t: ULT.quill.delay + 0.4, total: ULT.quill.delay + 0.4, color: "#101018" });
  }
  p.ultCd = ULT.charge;
  w.shake = Math.max(w.shake, 10);
  floatText(w, p.x, p.y, "ULTIMATE", "#ff8fa3", true);
  sfx(w, "phase");
}

/** Gates a Return Stone can leave. */
export const LEAVABLE = new Set<GateKind>(["normal", "key", "tower", "clock", "rush", "margin"]);

function tryLeave(w: World): void {
  if (!LEAVABLE.has(w.gateKind) || w.clearT > 0) return;
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
  if (!isCaller(pr)) return;
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
  fireQuest(w, { type: "bind", echoes: pr.echoes.length, boss });
  // An echo with room in the squad rises where it fell and fights at once.
  if (echo.active && !w.armyAway) w.allies.push(makeAlly(echo, r.x, r.y, p.d.damage));
}

/**
 * H: send the army back into the ground, or call it up again. Echoes that
 * are away cannot be hurt, cannot be turned by Dominion, and do not fight.
 */
export function toggleArmy(w: World): void {
  const p = w.player;
  if (!isCaller(w.profile) || w.armyCd > 0) return;
  if (!w.profile.echoes.some((e) => e.active)) {
    sfx(w, "deny");
    floatText(w, p.x, p.y, "NO ECHOES", "#b9a4ff");
    return;
  }
  w.armyCd = ARMY.cooldown;
  const mark = (a: { x: number; y: number; radius: number }) => {
    w.fx.push({ kind: "ring", x: a.x, y: a.y, radius: a.radius + 26, t: 0.5, total: 0.5, color: "#8a6cff" });
    burst(w, a.x, a.y, "#8a6cff", 10, 180);
  };
  if (!w.armyAway) {
    w.armyAway = true;
    for (const a of w.allies) {
      a.out = true;
      a.anim = ARMY.leave;
      mark(a);
    }
    sfx(w, "door");
    floatText(w, p.x, p.y, "DISMISSED", "#b9a4ff", true);
    return;
  }
  w.armyAway = false;
  deployAllies(w);
  for (const a of w.allies) {
    a.anim = ARMY.rise;
    a.facing = p.facing;
    mark(a);
  }
  sfx(w, "summon");
  floatText(w, p.x, p.y, "ARISE", "#b9a4ff", true);
}

function stepPlayer(w: World, input: Controls, dt: number): void {
  const p = w.player;
  const eff = effective(p);
  p.facing = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  p.aimX = input.aimX;
  p.aimY = input.aimY;

  const axis = input.axis();
  const move = norm(axis.x, axis.y);
  p.moving = move.x !== 0 || move.y !== 0;

  // Each open slot fires whatever skill the player put in it.
  w.profile.loadout.forEach((id, i) => {
    if (SKILL_SLOTS[i] && slotOpen(w.profile, i) && input.consume(SKILL_SLOTS[i].code) && id) useSkill(w, id);
  });
  if (input.consume("KeyF")) usePotion(w);
  if (input.consume("KeyV")) useBag(w, "mana");
  if (input.consume("KeyZ")) cycleBelt(w);
  if (input.consume("KeyB")) useBelt(w);
  // X: take the other weapon in hand.
  if (input.consume("KeyX") && p.swapCd <= 0) {
    const other = w.profile.activeWeapon === 1 ? "weapon" : "weapon2";
    if (w.profile.equipped[other]) {
      w.profile.activeWeapon = w.profile.activeWeapon === 1 ? 0 : 1;
      refreshDerived(w);
      p.swapCd = 0.8;
      p.attackT = 0;
      w.dirty = true;
      sfx(w, "click");
      floatText(w, p.x, p.y, (p.weapon ?? "dagger").toUpperCase(), "#cfe4ff");
    }
  }
  // Drink without being asked, if the player set it up.
  const drink = w.profile.autoDrink;
  if (drink.on && p.drinkCd <= 0 && p.hp / p.d.maxHp < drink.at && w.profile.potions > 0) {
    usePotion(w);
    p.drinkCd = 1;
  }
  if (input.consume("KeyG")) tryBind(w);
  if (input.consume("KeyH")) classPower(w);
  if (input.consume("KeyY")) useUltimate(w);
  if (input.consume("KeyJ") && isCaller(w.profile)) {
    w.armyOrder = ORDERS[(ORDERS.indexOf(w.armyOrder) + 1) % ORDERS.length];
    floatText(w, p.x, p.y, ORDER_TEXT[w.armyOrder], "#b9a4ff", true);
    sfx(w, "click");
  }
  w.armyCd = Math.max(0, w.armyCd - dt);
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
    p.dashCd = PLAYER.dashCooldown * (w.profile.classUnlocked && w.profile.cls === "ranger" ? RANGER.dash : 1);
    p.iframes = Math.max(p.iframes, PLAYER.dashIframes);
    p.attackT = 0;
    // A fresh id, so Ashen Wake cuts each enemy once per dash.
    p.swingId += 1;
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
    if (p.powers.includes("ashen_wake")) {
      for (const e of w.enemies) {
        if (e.lastSwing === p.swingId || !circlesOverlap(e, { x: p.x, y: p.y, radius: p.radius + 18 })) continue;
        e.lastSwing = p.swingId;
        strike(w, e, 1.5, 120);
      }
    }
  } else {
    // A drawn bow slows the feet.
    const drawing = p.weapon === "bow" && input.attackHeld ? BOW.drawSpeed : 1;
    const slowed = (p.ail.slowT > 0 ? STATUS.slow.speed : 1) * drawing;
    p.x += move.x * eff.moveSpeed * slowed * dt;
    p.y += move.y * eff.moveSpeed * slowed * dt;
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

  if (p.weapon === "bow") stepBow(w, input, dt);
  else if (p.attackCd <= 0 && p.dashT <= 0 && p.lungeT <= 0 && attackPressed(w, input)) {
    p.attackCd = eff.attackCooldown;
    p.attackFacing = p.facing;
    p.swingId += 1;
    w.run.swings += 1;
    const wd = weaponOf(p);
    if (p.weapon === "staff") fireBolt(w);
    else if (wd.ranged) {
      // An arrow: rolled now, landed by whatever it reaches first.
      const roll = rollDamage(eff.damage * wd.damage, p.d.critChance, p.d.critMult, w.rng);
      w.allyShots.push({
        x: p.x + Math.cos(p.facing) * p.radius,
        y: p.y + Math.sin(p.facing) * p.radius,
        radius: 6,
        vx: Math.cos(p.facing) * BOW.arrowSpeed,
        vy: Math.sin(p.facing) * BOW.arrowSpeed,
        damage: roll.amount,
        life: wd.range / BOW.arrowSpeed,
        mine: true,
        crit: roll.crit,
      });
      sfx(w, "shot");
    } else {
      p.attackT = PLAYER.attackActive;
      sfx(w, "swing");
    }
  }

  if (p.attackT > 0) {
    const wd = weaponOf(p);
    for (const e of w.enemies) {
      if (e.lastSwing === p.swingId) continue;
      if (!inArc(p.x, p.y, p.attackFacing, wd.halfAngle, wd.range, e)) continue;
      e.lastSwing = p.swingId;
      basicHit(w, e, wd.damage);
    }
  }
  p.furyT = Math.max(0, p.furyT - dt);
  p.swapCd = Math.max(0, p.swapCd - dt);
  p.drinkCd = Math.max(0, p.drinkCd - dt);

  p.dashT = Math.max(0, p.dashT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.lungeT = Math.max(0, p.lungeT - dt);
  p.surgeT = Math.max(0, p.surgeT - dt);
  p.attackT = Math.max(0, p.attackT - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  const regen = w.profile.classUnlocked && w.profile.cls === "arcanist" ? ARCANIST.regen : 1;
  p.mana = Math.min(p.d.maxMana, p.mana + PLAYER.manaRegen * regen * dt);
  for (const id of SKILL_IDS) p.skillCd[id] = Math.max(0, p.skillCd[id] - dt);
  p.parryT = Math.max(0, p.parryT - dt);
  p.drainT = Math.max(0, p.drainT - dt);
  p.bulwarkT = Math.max(0, p.bulwarkT - dt);
  p.overflowT = Math.max(0, p.overflowT - dt);
  p.mantleT = Math.max(0, p.mantleT - dt);
  p.ultCd = Math.max(0, p.ultCd - dt);
}

/**
 * Poison and burn wear health down a point at a time; they ignore the brief
 * invulnerability of a dash, and they can kill.
 */
function stepAilments(w: World, dt: number): void {
  const p = w.player;
  const a = p.ail;
  let share = 0;
  if (a.poisonT > 0) {
    share += a.poison * STATUS.poison.dps;
    a.poisonT -= dt;
    if (a.poisonT <= 0) a.poison = 0;
  }
  if (a.burnT > 0) {
    share += STATUS.burn.dps;
    a.burnT -= dt;
  }
  a.slowT = Math.max(0, a.slowT - dt);
  a.immune = Math.max(0, a.immune - dt);
  if (share <= 0) {
    a.owed = 0;
    return;
  }
  a.owed += share * p.d.maxHp * dt;
  if (a.owed < 1) return;
  const points = Math.floor(a.owed);
  a.owed -= points;
  p.hp = Math.max(0, p.hp - points);
  w.run.tookDamage = true;
  if (p.hp <= 0 && w.mode === "gate") {
    w.mode = "dead";
    sfx(w, "death");
  }
}

function stepHazards(w: World, dt: number): void {
  const p = w.player;

  for (const s of w.projectiles) {
    if (s.home) {
      // A homing quill turns toward the hunter, but only so fast: it can be outrun sideways.
      const want = Math.atan2(p.y - s.y, p.x - s.x);
      const now = Math.atan2(s.vy, s.vx);
      let d = want - now;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const a = now + clamp(d, -s.home * dt, s.home * dt);
      const v = Math.hypot(s.vx, s.vy);
      s.vx = Math.cos(a) * v;
      s.vy = Math.sin(a) * v;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.x < 0 || s.x > ROOM.w || s.y < 0 || s.y > ROOM.h) s.life = 0;
    // A shot passes through a dashing player and keeps flying.
    if (s.life > 0 && circlesOverlap(s, p) && hurtPlayer(w, s.damage, s.status)) s.life = 0;
  }
  w.projectiles = w.projectiles.filter((s) => s.life > 0);

  for (const z of w.zones) {
    if (z.owner && z.owner.hp <= 0) {
      z.t = -1;
      continue;
    }
    z.t -= dt;
    if (z.t <= 0) {
      blast(w, z.x, z.y, z.radius, z.damage, z.status === "burn" ? "#ff8a3c" : "#ff5a60", z.status);
      if (z.patch) {
        // The ground stays alight. Only so many patches at once: the oldest goes out.
        w.patches.push({ x: z.x, y: z.y, radius: COLOSSUS.patchRadius, life: z.patch, status: z.status ?? "burn" });
        if (w.patches.length > COLOSSUS.maxPatches) w.patches.shift();
      }
      z.t = -1;
    }
  }
  w.zones = w.zones.filter((z) => z.t > 0);

  for (const patch of w.patches) {
    patch.life -= dt;
    if (Math.hypot(p.x - patch.x, p.y - patch.y) < patch.radius && w.mode === "gate") afflict(w, patch.status);
  }
  w.patches = w.patches.filter((patch) => patch.life > 0);

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

  w.hoverItem = hoveredItem(w, input.mouseX, input.mouseY);
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
  else if (enter === "tower") enterTower(w);
  else if (enter === "clock") enterClock(w);
  else if (enter === "rush") enterRush(w);
  else if (enter === "margin") enterMargin(w);
  else if (enter === "sealed") enterGate(w, w.profile.redGate.rank, { sealed: true });
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

/** The controls window: click an action, then press the key it should be on. */
function stepKeys(w: World, input: Controls): void {
  // While a key is awaited the shell takes the next press; nothing here may eat it.
  if (w.rebinding) return;
  if (input.consume("Escape")) {
    w.menu = w.mode === "gate" ? "pause" : "none";
    return;
  }
  if (!input.consume("Mouse0")) return;
  const hit = keysButtons(w).find((b) => pointIn(b.rect, input.mouseX, input.mouseY));
  if (!hit) return;
  sfx(w, "click");
  if (hit.id === "keys:close") w.menu = w.mode === "gate" ? "pause" : "none";
  else if (hit.id === "keys:reset") applySetting(w, "keys-reset");
  else w.rebinding = hit.id.slice(5);
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
  for (const c of w.corpses) c.t -= dt;
  if (w.corpses.some((c) => c.t <= 0)) w.corpses = w.corpses.filter((c) => c.t > 0);
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

/** How many System notices show at once. More than this hides the fight. */
export const NOTICES_SHOWN = 3;

/** Note where everything stands before it moves, for drawing between steps. */
function rememberPositions(w: World): void {
  const p = w.player;
  p.px = p.x;
  p.py = p.y;
  for (const list of [w.enemies, w.allies, w.projectiles, w.allyShots]) {
    for (const c of list) {
      c.px = c.x;
      c.py = c.y;
    }
  }
}

/** Advance the simulation by one fixed step. */
export function step(w: World, input: Controls, dt: number): void {
  rememberPositions(w);
  // Only the notices on screen age; the rest wait their turn behind them.
  for (const n of w.notices.slice(0, NOTICES_SHOWN)) n.life -= dt;
  w.notices = w.notices.filter((n) => n.life > 0);

  // Outside the field, any press of the attack button belongs to something else.
  if (w.mode !== "gate" || w.cutscene || w.menu !== "none") w.attackLatched = input.attackHeld;
  else if (!input.attackHeld) w.attackLatched = false;
  if (w.mode === "title") return stepTitle(w, input);
  if (w.sting) {
    w.sting.t -= dt;
    if (w.sting.t <= 0) w.sting = null;
  }
  // A cutscene holds the stage until it ends or is skipped.
  if (w.cutscene) return stepCutscene(w, input, dt);

  // The status window and the pause menu stop everything behind them.
  const canMenu = (w.mode === "gate" || w.mode === "select") && w.menu !== "pause" && w.menu !== "keys";
  if (canMenu && input.consume("KeyC", "Tab")) w.menu = w.menu === "status" ? "none" : "status";
  if (w.menu === "status") {
    if (input.consume("Escape")) w.menu = "none";
    else stepStatus(w, input);
    return;
  }
  if (w.menu === "pause") return stepPause(w, input);
  if (w.menu === "keys") return stepKeys(w, input);
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

  // An enemy under the player's Domain lives at half speed.
  for (const e of w.enemies) {
    // Domain halves its pace; a frost perk takes a further bite.
    const pace = (e.slowT > 0 ? DOMAIN.slow : 1) * (e.chillT > 0 ? PERK.frost.speed : 1);
    stepEnemy(w, e, dt * pace);
    if (e.boss) stepBossExtras(w, e, dt * pace);
    e.slowT = Math.max(0, e.slowT - dt);
    e.markT = Math.max(0, e.markT - dt);
    stepEnemyPerks(e, dt);
  }
  stepBlasts(w, dt);
  w.legionT = Math.max(0, w.legionT - dt);
  w.rallyT = Math.max(0, w.rallyT - dt);
  w.domainT = Math.max(0, w.domainT - dt);
  w.turnedT = Math.max(0, w.turnedT - dt);
  if (w.rallyTarget && (w.rallyT <= 0 || w.rallyTarget.hp <= 0)) w.rallyTarget = null;
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

  // Pillars stop everyone. One that runs into a pillar mid-charge is dazed by it.
  if (w.pillars.length > 0) {
    blockCircle(p, w.pillars);
    for (const e of w.enemies) {
      const charging = e.state === "charge" || e.state === "lunge";
      if (!blockCircle(e, w.pillars) || e.boss || !charging) continue;
      e.state = "recover";
      e.t = PILLAR.stun;
      floatText(w, e.x, e.y, "DAZED", "#ffd84a");
      sfx(w, "block");
    }
  }
  for (const a of w.allies) {
    stepAlly(w, a, dt);
    // An echo raised by the Crown for a while sinks again when its time is up.
    if (a.temp !== undefined && !a.out) {
      a.temp -= dt;
      if (a.temp <= 0) {
        a.out = true;
        a.anim = ARMY.leave;
      }
    }
  }
  stepRedactorHazards(w, dt);
  stepGlyphs(w);
  stepStill(w, dt);
  w.bossLull = Math.max(0, w.bossLull - dt);
  if (w.gateKind === "margin" && (w.mode as string) === "gate" && w.enemies.length === 0 && w.spawnQueue.length === 0) {
    clearField(w);
    marginCleared(w);
    w.mode = "cleared";
    return;
  }
  if (w.pillars.length > 0) {
    for (const a of w.allies) blockCircle(a, w.pillars);
    for (const s of [...w.projectiles, ...w.allyShots]) if (insidePillar(s.x, s.y, w.pillars)) s.life = 0;
  }
  stepTraps(w, dt);
  // An echo that has finished sinking is gone.
  if (w.allies.some((a) => a.out && a.anim <= 0)) w.allies = w.allies.filter((a) => !(a.out && a.anim <= 0));
  stepAllyShots(w, dt);
  for (const r of w.remnants) r.life -= dt;
  w.remnants = w.remnants.filter((r) => r.life > 0);

  stepHazards(w, dt);
  stepAilments(w, dt);
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
    w.corpses.push({ kind: e.kind, x: e.x, y: e.y, radius: e.radius, facing: e.facing, t: CORPSE.time });
    // What the gear gives for a kill.
    if (p.perks.siphon > 0) p.mana = Math.min(p.d.maxMana, p.mana + PERK.siphon * p.perks.siphon);
    if (p.powers.includes("trials_end")) p.skillCd.pierce = 0;
    if (e.xp > 0) grantXp(w, e.xp);
    p.ultCd = Math.max(0, p.ultCd - ULT.perKill);
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
    // Luck alone could keep the door shut for ever, so the fifth boss without one always opens it.
    // (A chance of zero switches hidden doors off altogether: tests and the bot use that.)
    const mayOpen = !trial && w.gateKind === "normal" && !w.bossDead;
    const opens = mayOpen && (w.rng() < w.hiddenChance || (w.hiddenChance > 0 && w.profile.trialPity >= HIDDEN.pity - 1));
    if (mayOpen) w.profile.trialPity = opens ? 0 : w.profile.trialPity + 1;
    const hidden = opens ? addTrialRoom(w.dungeon!, w.rng) : null;
    if (hidden) {
      w.bossDead = true;
      w.layoutRev += 1;
      w.notices.push({ title: "A HIDDEN DOOR", body: "Something waits behind it. Enter, or press T to leave with what you have.", life: 6 });
      playSpecial(w, "hidden");
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
    // The Ledger's Favour: a cleared room puts a sip back in the flask.
    const flask = w.profile.flask;
    if (p.powers.includes("ledgers_favour") && flask.charges < flask.size) flask.charges += 1;
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

  // The time trial's clock runs while a floor is fought. At zero the climb ends, all earned kept.
  if (w.gateKind === "clock" && (w.mode as string) === "gate" && w.towerRest <= 0) {
    w.clockT = Math.max(0, w.clockT - dt);
    if (w.clockT <= 0) {
      clearField(w);
      settleClock(w);
      w.mode = "cleared";
      sfx(w, "alarm");
      return;
    }
  }

  // The boss rush: a breath and a little health after each master, then the next.
  if (w.gateKind === "rush" && (w.mode as string) === "gate") {
    w.rushTime += dt;
    if (w.towerRest > 0) {
      w.towerRest -= dt;
      if (w.towerRest <= 0) startRush(w, w.rushIdx + 1);
    } else if (w.enemies.length === 0 && w.spawnQueue.length === 0) {
      if (w.rushIdx + 1 >= RUSH.rounds.length) {
        clearField(w);
        settleRush(w);
        w.mode = "cleared";
        sfx(w, "quest");
        return;
      }
      healPlayer(w, Math.round(p.d.maxHp * RUSH.heal));
      w.towerRest = RUSH.rest;
      floatText(w, p.x, p.y, "MASTER FALLEN", "#ffd84a", true);
      sfx(w, "roomclear");
    }
  }

  // The tower: a breath after the last enemy falls, then the next floor.
  if ((w.gateKind === "tower" || w.gateKind === "clock") && (w.mode as string) === "gate") {
    if (w.towerRest > 0) {
      w.towerRest -= dt;
      if (w.towerRest <= 0) startFloor(w, w.towerFloor + 1);
    } else if (w.enemies.length === 0) {
      if (w.gateKind === "clock") clockFloorCleared(w);
      else towerFloorCleared(w);
      w.towerRest = TOWER.rest;
      if (w.gateKind === "tower" && w.towerFloor === LINES.floor) wakeGlyphs(w);
      floatText(w, p.x, p.y, `FLOOR ${w.towerFloor} CLEARED`, "#ffd84a", true);
      sfx(w, "roomclear");
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
