import { ECHO, KINDS, RANK_IDS, SKILL_IDS, SKILL_RANK, type EnemyKind, type Rank, type SkillId } from "./config";
import { SIDES, type Dungeon, type RoomNode } from "./dungeon";
import { ITEMS, SHOP_POOL, SLOTS, STONE, TITLES } from "./items";
import { newProfile, newRun, refreshDerived } from "./profile";
import { MAIN, SIDE } from "./quests";
import type { GateSnapshot, Profile, World } from "./state";
import { BASE_STAT, LEVEL_CAP, newProgress, STAT_KEYS, type Progress } from "./stats";
import { resumeGate, snapshotGate } from "./world";

/** Save format, validation and migration. Storage itself lives in the shell. */

/** 2 adds hunter rank, skill ranks, the class, echoes and gate breaks. */
/** 3 adds ranks B to S, three more skills and the skill loadout. */
export const SAVE_VERSION = 3;
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
  run.items = [...new Set(strings(rr.items))].filter((id) => ITEMS[id]);
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
    profile.shop.stock = [...new Set(strings(rf.shop.stock))].filter((id) => SHOP_POOL.includes(id));
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
  for (const slot of SLOTS) {
    const id = re[slot];
    if (typeof id === "string" && ITEMS[id]?.slot === slot) profile.equipped[slot] = id;
  }
  // One of each item at most, and never both worn and in the bag.
  const worn = new Set(Object.values(profile.equipped));
  profile.inventory = [...new Set(strings(rf.inventory))].filter((id) => ITEMS[id] && !worn.has(id));

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
