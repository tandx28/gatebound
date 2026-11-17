import type { Pillar, Trap } from "./rooms";
import type { CutsceneState } from "./cutscenes";
import { applyDamage, type Circle } from "./combat";
import { type ArmyOrder, type ClassId, PARRY, PLAYER, STATUS, TOTEM, VANGUARD, type EnemyKind, type Rank, type SkillId, type StatusId } from "./config";
import type { Dungeon } from "./dungeon";
import { PERK, PERK_IDS, type BagId, type EquipSlot, type PerkId, type PowerId, type SupplyId, type WeaponType } from "./items";
import type { QuestState } from "./quests";
import type { Line } from "./story";
import type { Derived, Progress } from "./stats";

/** Shared simulation state and the small helpers every system needs. */

export interface Player extends Circle {
  hp: number;
  mana: number;
  prog: Progress;
  /** Combat values derived from stats. */
  d: Derived;
  facing: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  iframes: number;
  attackCd: number;
  attackT: number;
  attackFacing: number;
  /** Identifies the current swing or skill so each enemy is hit once by it. */
  swingId: number;
  hurtFlash: number;
  skillCd: Record<SkillId, number>;
  /** Pierce in flight. */
  lungeT: number;
  /** Damage multiplier of the Pierce in flight, from its skill rank. */
  lungePower: number;
  lungeX: number;
  lungeY: number;
  surgeT: number;
  /** Seconds left in which a blow will be parried. */
  parryT: number;
  /** Seconds left of Blood Price: blows heal. */
  drainT: number;
  /** Seconds left of a Vanguard's Bulwark, and of an Arcanist's Overflow. */
  bulwarkT: number;
  overflowT: number;
  /** Seconds the bow has been drawn while the attack is held; 0 when not drawing. */
  drawT: number;
  /** Seconds until the mythic's ultimate is ready again. Carried from gate to gate. */
  ultCd: number;
  /** Seconds left of the Untouched Mantle's ultimate: nothing can hurt the hunter. */
  mantleT: number;
  moving: boolean;
  /** Velocity from being thrown, decays quickly. */
  kx: number;
  ky: number;
  ail: Ailments;
  /** Type of the weapon in hand; null fights bare-handed, like a dagger. */
  weapon: WeaponType | null;
  /** How many of each perk the worn gear carries. */
  perks: Record<PerkId, number>;
  /** Mythic powers the worn gear grants. */
  powers: PowerId[];
  /** Seconds left of an Elixir of Fury. */
  furyT: number;
  swapCd: number;
  /** Basic hits landed, for powers that count them. */
  hits: number;
  /** Healing too small to be a whole point yet. */
  healOwed: number;
  /** Seconds until the next automatic drink is allowed. */
  drinkCd: number;
  /** Where the cursor points on the ground, for skills aimed at a spot. */
  aimX: number;
  aimY: number;
}

/** Ailments on the player. Damage over time builds up in `owed` until it is a whole point. */
export interface Ailments {
  /** Poison stacks, and the time they have left. */
  poison: number;
  poisonT: number;
  burnT: number;
  slowT: number;
  /** Seconds during which no new ailment can take hold. */
  immune: number;
  owed: number;
}

export function noAilments(): Ailments {
  return { poison: 0, poisonT: 0, burnT: 0, slowT: 0, immune: 0, owed: 0 };
}

export interface Enemy extends Circle {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** Contact or attack damage, already scaled by gate rank. */
  dmg: number;
  xp: number;
  boss: boolean;
  /** A boss's stage (0 fresh, 1 hurt, 2 nearly dead), and seconds until its next extra move. */
  stage: number;
  extraCd: number;
  phase: number;
  state: string;
  /** Time left in the current state. */
  t: number;
  /** General cooldowns; meaning depends on kind. */
  cd: number;
  cd2: number;
  /** General counter; meaning depends on kind. */
  n: number;
  dirX: number;
  dirY: number;
  facing: number;
  /** Knockback velocity, decays quickly. */
  kx: number;
  ky: number;
  lastSwing: number;
  flash: number;
  hasHit: boolean;
  /** Seconds of invulnerability left. */
  inv: number;
  /** Cannot be damaged at all (penalty zone). */
  immortal?: boolean;
  /** A point it is heading for, and where it set off from. */
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  /** Guard left before it is broken (knights). */
  guard: number;
  /** Seconds left slowed by the player's Domain. */
  slowT: number;
  /** Damage per second from poison or bleed, and how long it lasts. */
  dot: number;
  dotT: number;
  /** Seconds left chilled by a frost perk. */
  chillT: number;
  /** Seconds left under a Death Mark: it takes more damage from everything. */
  markT: number;
}

export interface Projectile extends Circle {
  vx: number;
  vy: number;
  damage: number;
  life: number;
  status?: StatusId;
  /** An arrow of the player's own: it carries their perks, and may be a crit. */
  mine?: boolean;
  crit?: boolean;
  /** How it looks: a plain or charged arrow, or a staff bolt of some element. */
  look?: ShotLook;
  /** Passes through enemies instead of stopping at the first, striking each once. */
  pierce?: boolean;
  hits?: Enemy[];
  /** Bursts where it lands, catching enemies this close at a share of the blow. */
  splash?: number;
  /** Turns toward the hunter at this many radians a second (the Redactor's quills). */
  home?: number;
}

export type ShotLook = "arrow" | "charged" | "orb" | "fire" | "ice" | "bolt" | "venom" | "blood" | "quill";

/** Ground that keeps hurting whoever stands on it. */
export interface Patch {
  x: number;
  y: number;
  radius: number;
  life: number;
  status: StatusId;
}

/** A telegraphed blast: it goes off when `t` reaches zero. */
export interface Zone {
  x: number;
  y: number;
  radius: number;
  t: number;
  total: number;
  damage: number;
  /** If set and dead before the blast, the blast is cancelled. */
  owner?: Enemy;
  status?: StatusId;
  /** Leaves burning ground behind for this many seconds. */
  patch?: number;
}

/** A blast of the hunter's own that lands after a short delay. It hurts only enemies. */
export interface Blast {
  x: number;
  y: number;
  radius: number;
  /** Seconds until it lands. */
  t: number;
  /** Damage as a multiple of the hunter's blow. */
  mult: number;
  color: string;
  /** Seconds it stuns what it hits (not bosses). */
  stun?: number;
  /** Part of a larger effect drawn on its own: lands without a blast mark of its own. */
  quiet?: boolean;
  /** How the view draws it on the way down: a falling star, a falling arrow, or rock spikes when it lands. */
  show?: "star" | "arrow" | "spikes";
}

/** A glyph stone of the margin's lock. Walking onto it strikes it. */
export interface Glyph {
  x: number;
  y: number;
  /** Which glyph it bears: 0 circle, 1 triangle, 2 square, 3 cross. */
  glyph: number;
  lit: boolean;
}

/** The Redactor's Erasure: the whole floor goes, except the safe circles. */
export interface Erasure {
  t: number;
  total: number;
  safe: { x: number; y: number }[];
}

/** A wall of ink sweeping across the room: along x if `axis` is "x", else along y. */
export interface Sweep {
  axis: "x" | "y";
  /** Where the wall stands now, and which way it moves (+1 or -1). */
  at: number;
  dir: number;
  /** Seconds of warning left before it moves. */
  wait: number;
}

/** A black bar slammed across the floor: warned, then it lands once. */
export interface Bar {
  x: number;
  y: number;
  angle: number;
  len: number;
  width: number;
  t: number;
  total: number;
  damage: number;
}

/** An expanding ring that must be dashed through. */
export interface Shockwave {
  x: number;
  y: number;
  /** Seconds of warning left before the ring starts to move. */
  wait: number;
  r: number;
  speed: number;
  maxR: number;
  damage: number;
  hit: boolean;
}

/** A purely visual ground effect. */
/**
 * Effects drawn in 3D by the view, beyond the floor marks: a falling star,
 * rock spikes, lightning, a dome, raining arrows and so on. The simulation
 * only says what and where; the view decides how it looks.
 */
export type FxShow =
  | "star"
  | "spikes"
  | "bolt"
  | "dome"
  | "arrows"
  | "sigil"
  | "spiral"
  | "wave"
  | "ink"
  | "column"
  | "loot"
  | "frost"
  | "slash"
  | "swirl"
  | "shatter";

export interface Fx {
  /** A beam runs from (x, y) along `angle` for `radius`. */
  kind: "ring" | "blast" | "beam" | FxShow;
  angle?: number;
  x: number;
  y: number;
  radius: number;
  t: number;
  total: number;
  color: string;
  /** Far end, for effects that run from one point to another (lightning, a slash). */
  x2?: number;
  y2?: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  big: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/** A System message shown briefly at the top of the screen. */
export interface Notice {
  title: string;
  body: string;
  life: number;
}

/** Everything that persists between gates and is written to the save. */
export interface Profile {
  gold: number;
  potions: number;
  /** Owned items not currently equipped. */
  inventory: string[];
  equipped: Partial<Record<EquipSlot, string>>;
  /** Which weapon slot is in hand: 0 or 1. */
  activeWeapon: number;
  /** Consumables other than the health potion and the stone. */
  bag: Record<BagId, number>;
  /** The flask: how many charges it holds, and how many are left. */
  flask: { size: number; charges: number };
  /** Which supplies are topped up on every return to the board. */
  autoBuy: Record<SupplyId, boolean>;
  /** Auto-buy never takes gold below this. */
  goldFloor: number;
  /** Drink a health potion without being asked, below this share of health. */
  autoDrink: { on: boolean; at: number };
  /** Kills of each late boss, for the mythic it must eventually give. */
  bossKills: Partial<Record<EnemyKind, number>>;
  dailiesDone: number;
  /** Mythics already earned; each comes only once. */
  mythics: PowerId[];
  /** Earned title ids. */
  titles: string[];
  /** The one title in use. */
  title: string | null;
  quests: QuestState;
  introSeen: boolean;
  gatesCleared: number;
  /** Keys held for key dungeons. */
  keys: number;
  /** Return Stones held: each leaves a gate at once, loot kept. */
  stones: number;
  /** Today's shop. `day` is the day it was rolled for; one free reset a day. */
  shop: { day: number; rerolls: number; stock: string[] };
  /** Today's daily quest progress. `day` 0 means none has been issued yet. */
  daily: { day: number; kills: number; rooms: number; gates: number; done: boolean };
  /** A daily quest was missed: the penalty zone is owed. */
  penaltyPending: boolean;
  /** Official hunter rank: raised by clearing a gate above it. */
  hunterRank: Rank;
  /** Rank of each skill, 1 to 3, raised by skill books. */
  skillRanks: Record<SkillId, number>;
  /** The class-change rite is done: echoes can be bound. */
  classUnlocked: boolean;
  echoes: Echo[];
  /** Day a gate of the hunter's own rank or higher was last cleared. 0 = not yet tracked. */
  lastClear: number;
  /** The hunter's own gate was neglected: a gate break is owed. */
  breakPending: boolean;
  /** Which skill sits in each of the four slots. */
  loadout: (SkillId | null)[];
  /** Nightmare can be switched on, and whether it is. */
  nightmareUnlocked: boolean;
  nightmare: boolean;
  /** How many times the story has been begun again with everything kept. */
  cycle: number;
  /** The highest tower floor ever cleared. */
  towerBest: number;
  /** Show the first gate's tips. On for a new game, off once that gate is over. */
  tips: boolean;
  /** Bosses killed since a hidden door last opened, and gates closed since the last break. */
  trialPity: number;
  breakPity: number;
  /** Gates entered since the last sealed one: the sixth in a row is always sealed. */
  sealedPity: number;
  /** Today's sealed gate on the board: its rank, and whether it has been cleared. */
  redGate: { day: number; rank: Rank; done: boolean };
  /** How the story ended, once the last page is signed or burnt. */
  ending: Ending | null;
  /** The class in use once the rite is done. H is its power. */
  cls: ClassId;
  /** Highest floor reached in a time trial. */
  clockBest: number;
  /** Fastest boss rush, in whole seconds; 0 until one is finished. */
  rushBest: number;
  /** Kills of each enemy kind, for the bestiary: lore, then extra damage to that kind. */
  kills: Partial<Record<EnemyKind, number>>;
  /** Which of the five struck lines (0 to 4) have been found. */
  lines: number[];
  /** Story scenes replayed from the Story tab, for one of the lines. */
  replayed: string[];
  /** The margin has been opened at least once: the Redactor can be fought again from the Trials tab. */
  marginFound: boolean;
  /** Special-gate scenes already seen in full; after that they play as a short title. */
  scenesSeen: string[];
}

export type Ending = "keeper" | "unwritten";

/** A bound enemy. Active ones fight beside the player in every gate. */
export interface Echo {
  kind: EnemyKind;
  rank: Rank;
  active: boolean;
}

/** An echo on the field. Enemies cannot see or harm it. */
export interface Ally extends Circle {
  kind: EnemyKind;
  rank: Rank;
  dmg: number;
  cd: number;
  facing: number;
  flash: number;
  /** Seconds left of rising from the ground, or of sinking back into it. */
  anim: number;
  /** Sinking: gone when `anim` runs out. */
  out: boolean;
  /** Seconds left for an echo raised only for a while (the Crown's ultimate); absent for a lasting one. */
  temp?: number;
}

/** A fallen enemy, shown for a moment where it died. Nothing can touch it. */
export interface Corpse extends Circle {
  kind: EnemyKind;
  facing: number;
  /** Seconds left. */
  t: number;
}

/** What an enemy leaves behind for a moment, for an Echo Caller to bind. */
export interface Remnant {
  x: number;
  y: number;
  kind: EnemyKind;
  rank: Rank;
  life: number;
  /** Binding attempts left. */
  tries: number;
}

/** Loot and facts about the gate in progress. Lost on death. */
export interface Run {
  gold: number;
  items: string[];
  usedPotion: boolean;
  tookDamage: boolean;
  /** The player entered below the gate's suggested level. */
  overLevel: boolean;
  keys: number;
  /** Skill books found: each raises that skill a rank when banked. */
  books: SkillId[];
  /** Left through the entrance instead of clearing. */
  retreated: boolean;
  /** Set once the result has been applied to the profile. */
  settled: boolean;
  /** Lines for the result screen. */
  summary: string[];
  /** Basic attacks made in this gate, for the line earned without any. */
  swings: number;
}

/** Player preferences. Kept apart from the save: they belong to the device. */
export interface Settings {
  /** Effects volume, 0 to 1. */
  sfx: number;
  /** Music volume, 0 to 1. */
  music: number;
  shake: boolean;
  /** How much the 3D view spends on looks. */
  quality: Quality;
  /** Lower the quality without being asked if the frame rate sags. */
  autoQuality: boolean;
  /** Keys the player has moved: the action's default key to the key now used. */
  keys: Record<string, string>;
}

export type Quality = "high" | "medium" | "low";
export const QUALITIES: Quality[] = ["high", "medium", "low"];

export type HubTab = "gates" | "trials" | "shop" | "supplies" | "gear" | "skills" | "hunter" | "bestiary" | "quests" | "story" | "echoes" | "system";
export const HUB_TABS: HubTab[] = ["gates", "trials", "shop", "supplies", "gear", "skills", "hunter", "bestiary", "quests", "story", "echoes", "system"];

/** Tabs on show: the Echoes tab appears once the class is earned. */
export function visibleTabs(w: World): HubTab[] {
  return HUB_TABS.filter((t) => t !== "echoes" || isCaller(w.profile));
}

/** The rite is done and the class in use is Echo Caller: echoes can be bound and fight. */
export function isCaller(pr: Profile): boolean {
  return pr.classUnlocked && pr.cls === "echo";
}

export type Menu = "none" | "status" | "pause" | "keys";
export type Mode = "title" | "select" | "gate" | "cleared" | "dead";
export type GateKind = "normal" | "key" | "penalty" | "rite" | "break" | "tower" | "clock" | "rush" | "margin";

/** Enough of a gate in progress to resume it from the current room. */
export interface GateSnapshot {
  rank: Rank;
  kind: "normal" | "key";
  sealed: boolean;
  bossDead: boolean;
  dungeon: Dungeon;
  roomId: number;
  run: Run;
  hp: number;
  mana: number;
}

export interface World {
  profile: Profile;
  run: Run;
  tab: HubTab;
  /** Dialogue on screen, if any. It blocks the gate board. */
  dialogue: { lines: Line[]; i: number } | null;
  /** The action (by its default key) waiting for the player to press its new key. */
  rebinding: string | null;
  /** A cutscene on screen, if any. It stops everything else. */
  cutscene: CutsceneState | null;
  /** Dialogue and cutscene ids waiting for the next visit to the gate board. */
  pendingDialogue: string[];
  /** True when the profile changed and should be saved. */
  dirty: boolean;
  /** Side effects the browser shell must perform: export, import, reset. */
  requests: string[];
  /** Sound effect ids raised this frame; the shell plays and clears them. */
  sounds: string[];
  settings: Settings;
  settingsDirty: boolean;
  /** Calendar day number, supplied by the shell. 0 means no calendar (tests). */
  today: number;
  gateKind: GateKind;
  /** This gate turned out to be sealed. */
  sealed: boolean;
  coldT: number;
  /** A timed order in the current room. */
  emergency: { t: number; total: number; bonus: number } | null;
  /** Seconds left to survive in the penalty zone. */
  penaltyT: number;
  patches: Patch[];
  /** Rally: seconds left, and the enemy every echo is sent at. */
  rallyT: number;
  rallyTarget: Enemy | null;
  /** Seconds left of the player's Domain. */
  domainT: number;
  /** Seconds the player's echoes are turned against them. */
  turnedT: number;
  /** Pillars and floor traps of the current room, and how long it has been occupied. */
  pillars: Pillar[];
  traps: Trap[];
  trapClock: number;
  /** Echoes fighting in the current room. */
  allies: Ally[];
  /** What the echoes on the field have been told to do. J changes it. */
  armyOrder: ArmyOrder;
  /** The army has been sent away for now; H calls it back. */
  armyAway: boolean;
  /** Seconds until the class power on H (the army, for an Echo Caller) can be used again. */
  armyCd: number;
  /** Seconds left of Echo Fury: every echo hits harder. */
  legionT: number;
  /** The hunter's own delayed blasts: Falling Star, Earthbreaker, Arrow Storm. */
  blasts: Blast[];
  /** Seconds left on a time trial's clock. */
  clockT: number;
  /** Which master of the boss rush is being fought (0 to 5), and seconds spent so far. */
  rushIdx: number;
  rushTime: number;
  /** Seconds before any boss may start another big move: bosses take turns. */
  bossLull: number;
  /** The last skill the hunter used, for the Redactor's Footnote. */
  lastSkill: SkillId | null;
  /** Glyph stones on the thirteenth floor, while the five lines are held. */
  glyphs: Glyph[];
  /** Which stone comes next in the order (0 to 3). */
  glyphNext: number;
  /** Seconds the hunter has stood still in an empty room, for one of the lines. */
  stillT: number;
  /** The Redactor's hazards: the floor about to be erased, walls sweeping across, bars about to fall. */
  erasure: Erasure | null;
  sweeps: Sweep[];
  bars: Bar[];
  /** The closing floor of the Redactor's last stage: its radius now, 0 when not closing. */
  arenaR: number;
  /** A short title card for a special gate already seen in full. */
  sting: { title: string; sub: string; t: number } | null;
  allyShots: Projectile[];
  remnants: Remnant[];
  corpses: Corpse[];
  /** The tower floor being fought, and seconds until the next one begins (0 while fighting). */
  towerFloor: number;
  towerRest: number;
  /** Current wave of the rite, from 0. */
  riteWave: number;
  /** Seconds left in a gate break, and until its next pack arrives. */
  breakT: number;
  breakSpawn: number;
  /** The gate's boss is dead but a hidden door keeps the gate open. */
  bossDead: boolean;
  /** The boss's remnant is waiting to be bound: the gate stays open for it. */
  remnantHold: boolean;
  /** Bumped when the current room's doors change, so the view rebuilds. */
  layoutRev: number;
  /** Which page of the bag the board is showing. */
  invPage: number;
  /** Which page of the skills tab is showing, and the slot a skill click fills. */
  skillPage: number;
  slotPick: number;
  /** Which page of the bestiary is showing. */
  beastPage: number;
  /** Which belt item the B key uses. */
  belt: number;
  /** The Untouched Mantle's ward: ready to swallow one hit in this room. */
  wardReady: boolean;
  /** Chance of a hidden door after a boss kill. Tests override it. */
  hiddenChance: number;
  /**
   * Play special gates' scenes in full the first time. The shell turns this on;
   * tests and the bot leave it off and see only the title card, so a scene
   * never stands still in the middle of their play.
   */
  specialScenes: boolean;
  /** Where the title screen's Play button leads. */
  afterTitle: "select" | "gate";
  mode: Mode;
  menu: Menu;
  notices: Notice[];
  player: Player;
  enemies: Enemy[];
  /** Enemies created mid-step; added once the enemy loop finishes. */
  spawnQueue: Enemy[];
  projectiles: Projectile[];
  zones: Zone[];
  shockwaves: Shockwave[];
  fx: Fx[];
  texts: FloatText[];
  particles: Particle[];
  dungeon: Dungeon | null;
  roomId: number;
  rank: Rank;
  doorsOpen: boolean;
  /** Countdown from the boss kill to the cleared screen. */
  clearT: number;
  kills: number;
  shake: number;
  hitstop: number;
  rng: () => number;
}

/** Ask for a sound effect. The simulation never touches audio itself. */
export function sfx(w: World, id: string): void {
  // Capped so a world nobody is listening to cannot grow without bound.
  if (w.sounds.length < 64) w.sounds.push(id);
}

export function burst(w: World, x: number, y: number, color: string, n: number, speed: number): void {
  for (let i = 0; i < n; i++) {
    const a = w.rng() * Math.PI * 2;
    const s = speed * (0.4 + w.rng() * 0.6);
    w.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + w.rng() * 0.3, color });
  }
}

export function floatText(w: World, x: number, y: number, text: string, color: string, big = false): void {
  w.texts.push({ x, y, text, life: big ? 0.8 : 0.6, color, big });
}

/** Give the player an ailment, unless they are immune for the moment. */
export function noPerks(): Record<PerkId, number> {
  return Object.fromEntries(PERK_IDS.map((p) => [p, 0])) as Record<PerkId, number>;
}

/**
 * Heal the player by a possibly fractional amount; whole points are applied
 * and the remainder carried. Returns the points healed.
 */
export function healPlayer(w: World, amount: number): number {
  const p = w.player;
  // Breakwater: its strength at low health comes at this price.
  if (p.powers.includes("breakwater") && p.hp / p.d.maxHp < 0.3) return 0;
  p.healOwed += amount;
  const points = Math.min(p.d.maxHp - p.hp, Math.floor(p.healOwed));
  p.healOwed -= Math.floor(p.healOwed);
  if (points > 0) p.hp += points;
  return Math.max(0, points);
}

export function afflict(w: World, id: StatusId): void {
  const a = w.player.ail;
  if (a.immune > 0 || w.player.powers.includes("seal_breaker")) return;
  if (id === "poison") {
    a.poison = Math.min(STATUS.poison.max, a.poison + 1);
    a.poisonT = STATUS.poison.time;
  } else if (id === "burn") a.burnT = STATUS.burn.time;
  else a.slowT = STATUS.slow.time;
}

/** Damage the player unless invulnerable. Returns true when the hit landed. */
export function hurtPlayer(w: World, amount: number, status?: StatusId): boolean {
  const p = w.player;
  if (p.iframes > 0 || p.mantleT > 0 || w.mode !== "gate") return false;
  // Parry: the blow is turned, and everything close pays for it.
  if (p.parryT > 0) {
    p.parryT = 0;
    p.iframes = 0.4;
    floatText(w, p.x, p.y, "PARRIED", "#ffd84a", true);
    sfx(w, "block");
    w.fx.push({ kind: "ring", x: p.x, y: p.y, radius: PARRY.radius, t: 0.3, total: 0.3, color: "#ffd84a" });
    for (const e of w.enemies) {
      if (e.immortal || Math.hypot(e.x - p.x, e.y - p.y) > PARRY.radius + e.radius) continue;
      const back = Math.round(p.d.damage * PARRY.mult * p.d.skillPower);
      e.hp = Math.max(0, e.hp - back);
      e.flash = 0.12;
      floatText(w, e.x, e.y, String(back), "#ffd84a");
      if (!e.boss) {
        e.state = "recover";
        e.t = PARRY.stun;
      }
    }
    return false;
  }
  // The Untouched Mantle swallows the first hit in each room.
  if (w.wardReady) {
    w.wardReady = false;
    p.iframes = PLAYER.hurtIframes;
    floatText(w, p.x, p.y, "WARDED", "#ffd84a", true);
    sfx(w, "block");
    return false;
  }
  if (p.perks.dodge > 0 && w.rng() < PERK.dodge * p.perks.dodge) {
    p.iframes = 0.25;
    floatText(w, p.x, p.y, "DODGE", "#9fc8ff");
    return false;
  }
  // A standing totem makes everything in the room hit harder.
  const boost = w.enemies.some((e) => e.kind === "totem" && e.hp > 0) ? TOTEM.damage : 1;
  // A Vanguard stands firmer always, and far firmer behind Bulwark.
  const guard = (w.profile.classUnlocked && w.profile.cls === "vanguard" ? VANGUARD.guard : 1) * (p.bulwarkT > 0 ? VANGUARD.taken : 1);
  const dmg = Math.round(amount * boost * guard);
  if (status) afflict(w, status);
  p.hp = applyDamage(p.hp, dmg);
  if (dmg > 0) w.run.tookDamage = true;
  p.iframes = PLAYER.hurtIframes;
  p.hurtFlash = 0.25;
  w.shake = Math.max(w.shake, 10);
  w.hitstop = Math.max(w.hitstop, 0.07);
  floatText(w, p.x, p.y, `-${dmg}`, "#ff5a60", true);
  burst(w, p.x, p.y, "#5ee6ff", 10, 220);
  sfx(w, p.hp <= 0 ? "death" : "hurt");
  if (p.perks.thorns > 0) {
    // Thorns: whatever stands close when the player is hit pays for it.
    for (const e of w.enemies) {
      if (e.immortal || e.inv > 0 || Math.hypot(e.x - p.x, e.y - p.y) > PERK.thorns.radius + e.radius) continue;
      const back = Math.round(p.d.damage * p.perks.thorns);
      e.hp = Math.max(0, e.hp - back);
      e.flash = 0.1;
      floatText(w, e.x, e.y, String(back), "#c8e060");
    }
  }
  if (p.hp <= 0) w.mode = "dead";
  return true;
}

/** An immediate blast: visual, plus damage if the player is inside. */
export function blast(w: World, x: number, y: number, radius: number, damage: number, color = "#ff5a60", status?: StatusId): void {
  w.fx.push({ kind: "blast", x, y, radius, t: 0.3, total: 0.3, color });
  sfx(w, "blast");
  burst(w, x, y, color, 14, 300);
  w.shake = Math.max(w.shake, 5);
  const p = w.player;
  if (Math.hypot(p.x - x, p.y - y) < radius + p.radius * 0.5) hurtPlayer(w, damage, status);
}
