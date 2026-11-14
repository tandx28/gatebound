import { ECHO, KINDS, RANK_IDS, SKILL_IDS, SKILL_RANK, type EnemyKind, type Rank, type SkillId } from "./config";
import { SIDES, type Dungeon, type RoomNode } from "./dungeon";
import {
  BAG,
  BAG_IDS,
  baseOf,
  DROPS,
  EQUIP_SLOTS,
  FLASK,
  itemDef,
  makeItem,
  MYTHICS,
  PERK_COUNT,
  PERKS,
  perksOf,
  SHOP_POOL,
  STONE,
  SUPPLY_IDS,
  TITLES,
  type PowerId,
} from "./items";
import { newProfile, newRun, refreshDerived } from "./profile";
import { MAIN, SIDE } from "./quests";
import type { GateSnapshot, Profile, World } from "./state";
import { BASE_STAT, LEVEL_CAP, newProgress, STAT_KEYS, type Progress } from "./stats";
import { resumeGate, snapshotGate } from "./world";

/** Save format, validation and migration. Storage itself lives in the shell. */

/** 2 adds hunter rank, skill ranks, the class, echoes and gate breaks. */
/** 4 adds perked items, a second weapon slot, more consumables, the flask and mythics. */
export const SAVE_VERSION = 4;
export const SAVE_KEY = "gatebound.save";

export interface SaveData {
  v: number;
  prog: Progress;
  profile: Profile;
  /** A gate in progress, resumed from the start of its current room. */
  gate: GateSnapshot | null;
}

export function toSave(w: World): SaveData {
  return JSON.parse(JSON.stringify({ v: SAVE_VERSION, prog: w.player.prog, profile: w.profile, gate: snapshotGate(w) }));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A whole number within bounds, or the fallback when the value is unusable. */
function int(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * An owned item as it should be: a known base, and only perks that exist,
 * fit its slot, and number no more than its rarity allows. Null if the base is unknown.
 */
function cleanItem(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const def = itemDef(raw);
  if (!def) return null;
  const perks = [...new Set(perksOf(raw))].filter((p) => PERKS[p].slots.includes(def.slot));
  return makeItem(def.id, def.unique ? [] : perks.slice(0, PERK_COUNT[def.rarity]));
}

const cleanItems = (v: unknown): string[] => (Array.isArray(v) ? v.map(cleanItem).filter((x): x is string => x !== null) : []);

/** A gate in progress, or null if any part of it does not hold together. */
function parseGate(raw: unknown): GateSnapshot | null {
  if (!isObj(raw) || !isObj(raw.dungeon) || !isObj(raw.run)) return null;
  const rank = raw.rank as Rank;
  if (!RANK_IDS.includes(rank) || (raw.kind !== "normal" && raw.kind !== "key")) return null;
  const rd = raw.dungeon;
  if (!Array.isArray(rd.rooms) || rd.rooms.length === 0 || rd.rooms.length > 64) return null;

  const count = rd.rooms.length;
  const kinds = ["start", "normal", "boss", "trial"];
  const rooms: RoomNode[] = [];
  for (let i = 0; i < count; i++) {
    const r: unknown = rd.rooms[i];
    if (!isObj(r) || r.id !== i || !kinds.includes(r.kind as string) || !isObj(r.doors)) return null;
    const doors: RoomNode["doors"] = {};
    for (const s of SIDES) {
      const to = r.doors[s];
      if (to === undefined) continue;
      if (typeof to !== "number" || !Number.isInteger(to) || to < 0 || to >= count || to === i) return null;
      doors[s] = to;
    }
    const spawns = strings(r.spawns);
    if (spawns.length > 12 || spawns.some((k) => !KINDS[k as EnemyKind])) return null;
    rooms.push({
      id: i,
      gx: int(r.gx, -99, 99, 0),
      gy: int(r.gy, -99, 99, 0),
      doors,
      kind: r.kind as RoomNode["kind"],
      depth: int(r.depth, 0, 99, 0),
      cleared: r.cleared === true,
      visited: r.visited === true,
      spawns: spawns as EnemyKind[],
    });
  }
  const dungeon: Dungeon = { rank, rooms, startId: int(rd.startId, 0, count - 1, 0), bossId: int(rd.bossId, -1, count - 1, -1) };
  const roomId = raw.roomId;
  if (typeof roomId !== "number" || !Number.isInteger(roomId) || roomId < 0 || roomId >= count) return null;

  const rr = raw.run;
  const run = newRun();
  run.gold = int(rr.gold, 0, 1e9, 0);
  run.keys = int(rr.keys, 0, 99, 0);
  run.items = cleanItems(rr.items).slice(0, DROPS.bagSize);
  run.usedPotion = rr.usedPotion === true;
  run.tookDamage = rr.tookDamage === true;
  run.overLevel = rr.overLevel === true;

  return {
    rank,
    kind: raw.kind,
    sealed: raw.sealed === true,
    bossDead: raw.bossDead === true,
    dungeon,
    roomId,
    run,
    hp: int(raw.hp, 1, 1e6, 1),
    mana: int(raw.mana, 0, 1e6, 0),
  };
}

/**
 * Turn untrusted data (storage, an imported file) into a valid save.
 * Unknown items and out-of-range numbers are dropped or clamped; data from a
 * newer version, or that is not a save at all, gives null.
 */
export function parseSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || typeof raw.v !== "number" || raw.v < 1 || raw.v > SAVE_VERSION) return null;
  if (!isObj(raw.prog) || !isObj(raw.profile)) return null;
  // Version 1 saves simply lack the version 2 fields, which then take their
  // defaults below: Rank E, skills at rank 1, no class, no echoes.

  const rp = raw.prog;
  const prog = newProgress();
  prog.level = int(rp.level, 1, LEVEL_CAP, 1);
  prog.xp = prog.level >= LEVEL_CAP ? 0 : int(rp.xp, 0, 1e9, 0);
  prog.points = int(rp.points, 0, 999, 0);
  const rs = isObj(rp.stats) ? rp.stats : {};
  for (const k of STAT_KEYS) prog.stats[k] = int(rs[k], BASE_STAT, 999, BASE_STAT);

  const rf = raw.profile;
  const profile = newProfile();
  profile.gold = int(rf.gold, 0, 1e9, 0);
  profile.potions = int(rf.potions, 0, 99, 0);
  profile.introSeen = rf.introSeen === true;
  profile.gatesCleared = int(rf.gatesCleared, 0, 1e9, 0);
  profile.keys = int(rf.keys, 0, 99, 0);
  profile.stones = int(rf.stones, 0, STONE.max, 0);
  profile.penaltyPending = rf.penaltyPending === true;
  profile.breakPending = rf.breakPending === true;
  profile.lastClear = int(rf.lastClear, 0, 1e7, 0);
  profile.classUnlocked = rf.classUnlocked === true;
  if (RANK_IDS.includes(rf.hunterRank as Rank)) profile.hunterRank = rf.hunterRank as Rank;
  const rsk = isObj(rf.skillRanks) ? rf.skillRanks : {};
  for (const id of SKILL_IDS) profile.skillRanks[id] = int(rsk[id], 1, SKILL_RANK.max, 1);
  if (Array.isArray(rf.echoes)) {
    for (const e of rf.echoes.slice(0, ECHO.roster) as unknown[]) {
      if (!isObj(e) || !KINDS[e.kind as EnemyKind] || !RANK_IDS.includes(e.rank as Rank)) continue;
      profile.echoes.push({ kind: e.kind as EnemyKind, rank: e.rank as Rank, active: e.active === true });
    }
  }
  // The loadout: four slots, each a known skill or empty, no skill twice.
  if (Array.isArray(rf.loadout)) {
    const seen = new Set<string>();
    profile.loadout = profile.loadout.map((_, i) => {
      const id = (rf.loadout as unknown[])[i];
      if (typeof id !== "string" || !SKILL_IDS.includes(id as SkillId) || seen.has(id)) return null;
      seen.add(id);
      return id as SkillId;
    });
  }
  // Echoes need the class; without it a save cannot hold any.
  if (!profile.classUnlocked) profile.echoes = [];

  // Older saves have no shop or daily quest: they keep the defaults, and the
  // first day rollover fills them in.
  if (isObj(rf.shop)) {
    profile.shop.day = int(rf.shop.day, 0, 1e7, 0);
    profile.shop.rerolls = int(rf.shop.rerolls, 0, 99, 0);
    profile.shop.stock = cleanItems(rf.shop.stock).filter((x) => SHOP_POOL.includes(baseOf(x)));
  }
  if (isObj(rf.daily)) {
    profile.daily = {
      day: int(rf.daily.day, 0, 1e7, 0),
      kills: int(rf.daily.kills, 0, 1e6, 0),
      rooms: int(rf.daily.rooms, 0, 1e6, 0),
      gates: int(rf.daily.gates, 0, 1e6, 0),
      done: rf.daily.done === true,
    };
  }

  const re = isObj(rf.equipped) ? rf.equipped : {};
  for (const slot of EQUIP_SLOTS) {
    const owned = cleanItem(re[slot]);
    // Both weapon slots take weapons; the others take their own kind.
    if (owned && itemDef(owned)!.slot === (slot === "weapon2" ? "weapon" : slot)) profile.equipped[slot] = owned;
  }
  profile.activeWeapon = rf.activeWeapon === 1 && profile.equipped.weapon2 ? 1 : 0;
  if (!profile.equipped.weapon && profile.equipped.weapon2) profile.activeWeapon = 1;
  // Drops can repeat, so the bag may hold several of one thing; it only has a size.
  profile.inventory = cleanItems(rf.inventory).slice(0, DROPS.bagSize);

  const rb = isObj(rf.bag) ? rf.bag : {};
  for (const id of BAG_IDS) profile.bag[id] = int(rb[id], 0, BAG[id].max, 0);
  if (isObj(rf.flask)) {
    profile.flask.size = int(rf.flask.size, FLASK.start, FLASK.max, FLASK.start);
    profile.flask.charges = int(rf.flask.charges, 0, profile.flask.size, profile.flask.size);
  }
  const ra = isObj(rf.autoBuy) ? rf.autoBuy : {};
  for (const id of SUPPLY_IDS) profile.autoBuy[id] = ra[id] === true;
  profile.goldFloor = int(rf.goldFloor, 0, 1e9, 0);
  if (isObj(rf.autoDrink)) {
    const at = typeof rf.autoDrink.at === "number" && Number.isFinite(rf.autoDrink.at) ? rf.autoDrink.at : 0.3;
    profile.autoDrink = { on: rf.autoDrink.on === true, at: Math.round(Math.min(0.6, Math.max(0.1, at)) * 10) / 10 };
  }
  const rk = isObj(rf.bossKills) ? rf.bossKills : {};
  for (const kind of Object.keys(rk)) {
    if (KINDS[kind as EnemyKind]?.boss) profile.bossKills[kind as EnemyKind] = int(rk[kind], 0, 1e6, 0);
  }
  profile.dailiesDone = int(rf.dailiesDone, 0, 1e6, 0);
  const powers = new Set<string>(MYTHICS.map((m) => m.id));
  profile.mythics = [...new Set(strings(rf.mythics))].filter((id): id is PowerId => powers.has(id));
  // Any mythic actually held counts as earned, whatever the list says.
  for (const owned of [...profile.inventory, ...Object.values(profile.equipped)]) {
    const power = itemDef(owned)?.power;
    if (power && !profile.mythics.includes(power)) profile.mythics.push(power);
  }

  const known = new Set(TITLES.map((t) => t.id));
  profile.titles = [...new Set(strings(rf.titles))].filter((id) => known.has(id));
  profile.title = typeof rf.title === "string" && profile.titles.includes(rf.title) ? rf.title : null;

  const rq = isObj(rf.quests) ? rf.quests : {};
  profile.quests.main = int(rq.main, 0, MAIN.length, 0);
  const sides = new Set(SIDE.map((s) => s.id));
  profile.quests.done = [...new Set(strings(rq.done))].filter((id) => sides.has(id));
  const rprog = isObj(rq.progress) ? rq.progress : {};
  for (const def of [...MAIN, ...SIDE]) {
    const n = int(rprog[def.id], 0, 1e9, 0);
    if (n > 0) profile.quests.progress[def.id] = n;
  }

  return { v: SAVE_VERSION, prog, profile, gate: parseGate(raw.gate) };
}

/** Load a save into the world: back in its gate if it had one, else rested on the board. */
export function applySave(w: World, data: SaveData): void {
  w.player.prog = data.prog;
  w.profile = data.profile;
  refreshDerived(w);
  w.player.hp = w.player.d.maxHp;
  w.player.mana = w.player.d.maxMana;
  if (data.gate) resumeGate(w, data.gate);
}
