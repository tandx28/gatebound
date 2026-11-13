import type { EnemyKind, Rank } from "./config";

/** Quest definitions and progress. Pure: the world feeds it events. */

export type QuestEvent =
  | { type: "kill"; kind: EnemyKind }
  | { type: "room"; rank: Rank }
  | { type: "gate"; rank: Rank; noPotion: boolean; noDamage: boolean }
  | { type: "level"; level: number };

export interface Reward {
  gold: number;
  potions?: number;
  points?: number;
  keys?: number;
}

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  goal: number;
  reward: Reward;
  /** How much an event adds to progress. */
  count: (ev: QuestEvent) => number;
  /** When set, the event value replaces progress instead of adding to it. */
  absolute?: boolean;
}

const gateOf = (rank: Rank) => (ev: QuestEvent) => (ev.type === "gate" && ev.rank === rank ? 1 : 0);

/** The main chain, done in order. */
export const MAIN: QuestDef[] = [
  { id: "m1", title: "Entered in the Ledger", desc: "Clear one room in a Rank E gate", goal: 1, reward: { gold: 30, potions: 1 }, count: (ev) => (ev.type === "room" && ev.rank === "E" ? 1 : 0) },
  { id: "m2", title: "Tanner Row", desc: "Clear a Rank E gate", goal: 1, reward: { gold: 80, points: 2 }, count: gateOf("E") },
  { id: "m3", title: "No Longer Carrying Bags", desc: "Reach level 6", goal: 6, reward: { gold: 120, potions: 2, keys: 1 }, count: (ev) => (ev.type === "level" ? ev.level : 0), absolute: true },
  { id: "m4", title: "The Choir Below", desc: "Clear a Rank D gate", goal: 1, reward: { gold: 250, points: 3 }, count: gateOf("D") },
  { id: "m5", title: "What the Mirror Shows", desc: "Clear a Rank C gate", goal: 1, reward: { gold: 600, points: 5 }, count: gateOf("C") },
];

/** Side quests, all open from the start. */
export const SIDE: QuestDef[] = [
  { id: "s1", title: "Pest Control", desc: "Kill 30 Swarmers", goal: 30, reward: { gold: 60 }, count: (ev) => (ev.type === "kill" && ev.kind === "swarmer" ? 1 : 0) },
  { id: "s2", title: "Mind the Shield", desc: "Kill 5 Brutes", goal: 5, reward: { gold: 120, potions: 1 }, count: (ev) => (ev.type === "kill" && ev.kind === "brute" ? 1 : 0) },
  { id: "s3", title: "Clean Hands", desc: "Clear a gate without drinking a potion", goal: 1, reward: { gold: 100, points: 1 }, count: (ev) => (ev.type === "gate" && ev.noPotion ? 1 : 0) },
];

export interface QuestState {
  /** Index of the current main quest; MAIN.length when the chain is done. */
  main: number;
  progress: Record<string, number>;
  /** Completed side quest ids. */
  done: string[];
}

export function newQuests(): QuestState {
  return { main: 0, progress: {}, done: [] };
}

/** Quests currently open: the current main step and unfinished side quests. */
export function activeQuests(q: QuestState): QuestDef[] {
  const out: QuestDef[] = [];
  if (q.main < MAIN.length) out.push(MAIN[q.main]);
  for (const s of SIDE) if (!q.done.includes(s.id)) out.push(s);
  return out;
}

export function questProgress(q: QuestState, def: QuestDef): number {
  return Math.min(def.goal, q.progress[def.id] ?? 0);
}

/** Feed one event. Returns the quests it completed. */
export function questEvent(q: QuestState, ev: QuestEvent): QuestDef[] {
  const completed: QuestDef[] = [];
  for (const def of activeQuests(q)) {
    const n = def.count(ev);
    if (n <= 0) continue;
    const before = q.progress[def.id] ?? 0;
    q.progress[def.id] = def.absolute ? Math.max(before, n) : before + n;
    if (q.progress[def.id] < def.goal) continue;
    completed.push(def);
    if (MAIN[q.main] === def) q.main += 1;
    else q.done.push(def.id);
  }
  return completed;
}
