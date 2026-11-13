import { clamp } from "../engine/vec";
import { KINDS, RANK_IDS, type Rank } from "./config";
import { BOSS_DROP, gearBonus, ITEMS, POTION, sellValue, SLOTS, TITLES, type Slot } from "./items";
import { newQuests, questEvent, type QuestEvent } from "./quests";
import { burst, floatText, HUB_TABS, type Enemy, type HubTab, type Profile, type Run, type World } from "./state";
import { derive, xpToNext } from "./stats";
import { DIALOGUES } from "./story";

/** Everything that outlives a gate: gold, gear, titles, quests, dialogue. */

export const DEATH = { goldLoss: 0.2, xpLoss: 0.1 };

export function newProfile(): Profile {
  return {
    gold: 0,
    potions: 1,
    inventory: [],
    equipped: {},
    titles: [],
    title: null,
    quests: newQuests(),
    introSeen: false,
    gatesCleared: 0,
  };
}

export function newRun(): Run {
  return { gold: 0, items: [], usedPotion: false, tookDamage: false, overLevel: false, settled: false, summary: [] };
}

/** Recompute derived values after stats or gear change, keeping gains in max HP and mana. */
export function refreshDerived(w: World): void {
  const p = w.player;
  const next = derive(p.prog.stats, gearBonus(w.profile.equipped, w.profile.title));
  p.hp = clamp(p.hp + (next.maxHp - p.d.maxHp), 1, next.maxHp);
  p.mana = clamp(p.mana + (next.maxMana - p.d.maxMana), 0, next.maxMana);
  p.d = next;
}

export function owns(profile: Profile, id: string): boolean {
  return profile.inventory.includes(id) || SLOTS.some((s) => profile.equipped[s] === id);
}

function earnTitle(w: World, id: string): void {
  const pr = w.profile;
  if (pr.titles.includes(id)) return;
  const def = TITLES.find((t) => t.id === id)!;
  pr.titles.push(id);
  w.notices.push({ title: "TITLE EARNED", body: def.name, life: 4 });
  if (pr.title === null) {
    pr.title = id;
    refreshDerived(w);
  }
  w.dirty = true;
}

export function startDialogue(w: World, id: string): void {
  const lines = DIALOGUES[id];
  if (lines && lines.length > 0) w.dialogue = { lines, i: 0 };
}

/** Show the next waiting dialogue, if the board is free. */
export function nextDialogue(w: World): void {
  if (w.dialogue || w.mode !== "select") return;
  const id = w.pendingDialogue.shift();
  if (id) startDialogue(w, id);
}

/** Move to the next line, or close the dialogue when `skip` is set or it ends. */
export function advanceDialogue(w: World, skip: boolean): void {
  const d = w.dialogue;
  if (!d) return;
  d.i += 1;
  if (!skip && d.i < d.lines.length) return;
  w.dialogue = null;
  if (!w.profile.introSeen) {
    w.profile.introSeen = true;
    w.dirty = true;
  }
  nextDialogue(w);
}

/** New game: play the opening. */
export function beginStory(w: World): void {
  if (!w.profile.introSeen) startDialogue(w, "intro");
}

/** Report something that happened to the quest log, and pay out what it completes. */
export function fireQuest(w: World, ev: QuestEvent): void {
  const done = questEvent(w.profile.quests, ev);
  if (done.length === 0) return;
  const pr = w.profile;
  for (const q of done) {
    pr.gold += q.reward.gold;
    pr.potions = Math.min(POTION.max, pr.potions + (q.reward.potions ?? 0));
    w.player.prog.points += q.reward.points ?? 0;
    const extra = [
      `+${q.reward.gold} gold`,
      q.reward.potions ? `+${q.reward.potions} potion${q.reward.potions > 1 ? "s" : ""}` : "",
      q.reward.points ? `+${q.reward.points} stat points` : "",
    ].filter(Boolean);
    w.notices.push({ title: "QUEST COMPLETE", body: `${q.title}  ·  ${extra.join("  ·  ")}`, life: 4 });
    if (q.id.startsWith("m")) w.pendingDialogue.push(q.id);
  }
  w.dirty = true;
  // A newly opened step may already be satisfied (a level goal, say).
  fireQuest(w, { type: "level", level: w.player.prog.level });
  nextDialogue(w);
}

/** Loot and quest credit for a kill. */
export function onKill(w: World, e: Enemy): void {
  // Summoned minions carry no experience and so no gold either.
  if (e.xp > 0) w.run.gold += Math.round(e.xp * (e.boss ? 0.5 : 0.6));
  fireQuest(w, { type: "kill", kind: e.kind });
  if (!e.boss) return;
  if (e.kind === "warden") earnTitle(w, "giant_feller");
  const drop = BOSS_DROP[e.kind];
  if (drop && !owns(w.profile, drop) && !w.run.items.includes(drop)) {
    w.run.items.push(drop);
    w.notices.push({ title: "ITEM FOUND", body: ITEMS[drop].name, life: 4 });
  }
}

export function usePotion(w: World): void {
  const p = w.player;
  if (w.profile.potions <= 0 || p.hp >= p.d.maxHp) return;
  const heal = Math.min(p.d.maxHp - p.hp, Math.round(p.d.maxHp * POTION.heal));
  p.hp += heal;
  w.profile.potions -= 1;
  w.run.usedPotion = true;
  w.dirty = true;
  floatText(w, p.x, p.y, `+${heal}`, "#6dff9c", true);
  burst(w, p.x, p.y, "#6dff9c", 14, 200);
}

/** Gate cleared: bank the loot, award titles, credit quests. */
export function settleClear(w: World): void {
  if (w.run.settled) return;
  const pr = w.profile;
  const run = w.run;
  run.settled = true;
  pr.gold += run.gold;
  pr.inventory.push(...run.items);
  pr.gatesCleared += 1;
  run.summary = [`+${run.gold} gold`, ...run.items.map((id) => `Found: ${ITEMS[id].name}`)];
  earnTitle(w, "first_gate");
  if (!run.tookDamage) earnTitle(w, "untouched");
  if (run.overLevel) earnTitle(w, "overreacher");
  fireQuest(w, { type: "gate", rank: w.rank, noPotion: !run.usedPotion, noDamage: !run.tookDamage });
  w.dirty = true;
}

/** Death: the gate's loot is gone, plus a share of gold and level progress. */
export function settleDeath(w: World): void {
  if (w.run.settled) return;
  const pr = w.profile;
  const prog = w.player.prog;
  const run = w.run;
  run.settled = true;
  const gold = Math.floor(pr.gold * DEATH.goldLoss);
  const need = xpToNext(prog.level);
  const xp = need === Infinity ? 0 : Math.min(prog.xp, Math.floor(need * DEATH.xpLoss));
  pr.gold -= gold;
  prog.xp -= xp;
  run.summary = [
    `Gate loot lost: ${run.gold} gold${run.items.length ? `, ${run.items.length} item${run.items.length > 1 ? "s" : ""}` : ""}`,
    `-${gold} gold`,
    `-${xp} experience`,
  ];
  run.gold = 0;
  run.items = [];
  w.dirty = true;
}

/**
 * Perform a gate-board action by id. Returns a rank when the action is to
 * enter a gate, so the caller can start it.
 */
export function hubAction(w: World, id: string): Rank | null {
  const pr = w.profile;
  const [verb, arg] = id.split(":");
  switch (verb) {
    case "tab":
      if (HUB_TABS.includes(arg as HubTab)) w.tab = arg as HubTab;
      return null;
    case "gate":
      return RANK_IDS.includes(arg as Rank) ? (arg as Rank) : null;
    case "buy":
      if (arg === "potion") {
        if (pr.gold < POTION.price || pr.potions >= POTION.max) return null;
        pr.gold -= POTION.price;
        pr.potions += 1;
      } else {
        const item = ITEMS[arg];
        if (!item || item.unique || owns(pr, arg) || pr.gold < item.price) return null;
        pr.gold -= item.price;
        pr.inventory.push(arg);
      }
      break;
    case "sell": {
      const i = pr.inventory.indexOf(arg);
      if (i < 0) return null;
      pr.inventory.splice(i, 1);
      pr.gold += sellValue(arg);
      break;
    }
    case "equip": {
      const i = pr.inventory.indexOf(arg);
      if (i < 0) return null;
      const slot = ITEMS[arg].slot;
      pr.inventory.splice(i, 1);
      const old = pr.equipped[slot];
      if (old) pr.inventory.push(old);
      pr.equipped[slot] = arg;
      refreshDerived(w);
      break;
    }
    case "unequip": {
      const slot = arg as Slot;
      const old = pr.equipped[slot];
      if (!old) return null;
      delete pr.equipped[slot];
      pr.inventory.push(old);
      refreshDerived(w);
      break;
    }
    case "title":
      if (!pr.titles.includes(arg)) return null;
      pr.title = pr.title === arg ? null : arg;
      refreshDerived(w);
      break;
    case "save":
      w.requests.push(arg);
      return null;
    default:
      return null;
  }
  w.dirty = true;
  return null;
}

/** Name of a boss for display, hidden until met. */
export function bossName(rank: Rank, known: boolean): string {
  const map = { E: "warden", D: "summoner", C: "duellist" } as const;
  return known ? KINDS[map[rank]].name : "???";
}
