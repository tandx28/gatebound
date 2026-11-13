import { ITEMS, SLOTS, TITLES } from "./items";
import { newProfile, refreshDerived } from "./profile";
import { MAIN, SIDE } from "./quests";
import type { Profile, World } from "./state";
import { BASE_STAT, LEVEL_CAP, newProgress, STAT_KEYS, type Progress } from "./stats";

/** Save format, validation and migration. Storage itself lives in the shell. */

export const SAVE_VERSION = 1;
export const SAVE_KEY = "gatebound.save";

export interface SaveData {
  v: number;
  prog: Progress;
  profile: Profile;
}

export function toSave(w: World): SaveData {
  return JSON.parse(JSON.stringify({ v: SAVE_VERSION, prog: w.player.prog, profile: w.profile }));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A whole number within bounds, or the fallback when the value is unusable. */
function int(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Turn untrusted data (storage, an imported file) into a valid save.
 * Unknown items and out-of-range numbers are dropped or clamped; data from a
 * newer version, or that is not a save at all, gives null.
 */
export function parseSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || typeof raw.v !== "number" || raw.v < 1 || raw.v > SAVE_VERSION) return null;
  if (!isObj(raw.prog) || !isObj(raw.profile)) return null;
  // Future versions migrate older shapes here before validation.

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

  return { v: SAVE_VERSION, prog, profile };
}

/** Load a save into the world. The player arrives rested. */
export function applySave(w: World, data: SaveData): void {
  w.player.prog = data.prog;
  w.profile = data.profile;
  refreshDerived(w);
  w.player.hp = w.player.d.maxHp;
  w.player.mana = w.player.d.maxMana;
}
