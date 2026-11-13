import { seeded } from "../engine/rng";
import { clamp } from "../engine/vec";
import { DAILY, HIDDEN, KEYS, KINDS, RANK_IDS, RANKS, type Rank } from "./config";
import { BOSS_DROP, gearBonus, ITEMS, POTION, rollStock, sellValue, SLOTS, STONE, TITLES, TRIAL_DROP, type Slot } from "./items";
import { newQuests, questEvent, type QuestEvent, type Reward } from "./quests";
import { burst, floatText, HUB_TABS, sfx, type Enemy, type HubTab, type Profile, type Run, type World } from "./state";
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
    keys: 0,
    stones: 0,
    shop: { day: 0, rerolls: 0, stock: rollStock(seeded(1)) },
    daily: { day: 0, kills: 0, rooms: 0, gates: 0, done: false },
    penaltyPending: false,
  };
}

export function newRun(): Run {
  return {
    gold: 0,
    items: [],
    keys: 0,
    usedPotion: false,
    tookDamage: false,
    overLevel: false,
    retreated: false,
    settled: false,
    summary: [],
  };
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

/** The shop's stock for the current day and reset count, skipping owned items. */
function stockFor(w: World): string[] {
  const pr = w.profile;
  const owned = [...pr.inventory, ...SLOTS.map((s) => pr.equipped[s]).filter((id): id is string => !!id)];
  return rollStock(seeded(w.today * 7919 + pr.shop.rerolls * 104729 + 17), owned);
}

/**
 * Roll over to a new calendar day: a fresh daily quest and shop. A daily
 * quest left unfinished means the penalty zone is owed. Returns true when
 * a penalty was newly incurred.
 */
export function syncDay(w: World): boolean {
  if (w.today <= 0) return false;
  const pr = w.profile;
  let penalty = false;
  if (pr.daily.day !== w.today) {
    if (pr.daily.day > 0 && !pr.daily.done && !pr.penaltyPending) {
      pr.penaltyPending = true;
      penalty = true;
    }
    pr.daily = { day: w.today, kills: 0, rooms: 0, gates: 0, done: false };
    w.dirty = true;
  }
  if (pr.shop.day !== w.today) {
    pr.shop = { day: w.today, rerolls: 0, stock: [] };
    pr.shop.stock = stockFor(w);
    w.dirty = true;
  }
  return penalty;
}

function earnTitle(w: World, id: string): void {
  const pr = w.profile;
  if (pr.titles.includes(id)) return;
  const def = TITLES.find((t) => t.id === id)!;
  pr.titles.push(id);
  w.notices.push({ title: "TITLE EARNED", body: def.name, life: 4 });
  sfx(w, "quest");
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
  sfx(w, "tick");
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

function rewardText(r: Reward): string {
  const plural = (n: number, word: string) => `+${n} ${word}${n > 1 ? "s" : ""}`;
  return [
    `+${r.gold} gold`,
    r.potions ? plural(r.potions, "potion") : "",
    r.points ? plural(r.points, "stat point") : "",
    r.keys ? plural(r.keys, "key") : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
}

/** Count an event toward today's daily quest and pay it out when all goals are met. */
function dailyEvent(w: World, ev: QuestEvent): void {
  const d = w.profile.daily;
  if (d.done || d.day === 0 || d.day !== w.today || w.gateKind === "penalty") return;
  if (ev.type === "kill") d.kills += 1;
  else if (ev.type === "room") d.rooms += 1;
  else if (ev.type === "gate") d.gates += 1;
  else return;
  w.dirty = true;
  if (d.kills < DAILY.kills || d.rooms < DAILY.rooms || d.gates < DAILY.gates) return;
  d.done = true;
  w.player.prog.points += DAILY.points;
  w.profile.potions = POTION.max;
  w.notices.push({ title: "DAILY QUEST COMPLETE", body: `+${DAILY.points} stat points  ·  potions refilled`, life: 5 });
  sfx(w, "quest");
}

/** Report something that happened to the quest logs, and pay out what it completes. */
export function fireQuest(w: World, ev: QuestEvent): void {
  dailyEvent(w, ev);
  const done = questEvent(w.profile.quests, ev);
  if (done.length === 0) return;
  const pr = w.profile;
  for (const q of done) {
    pr.gold += q.reward.gold;
    pr.potions = Math.min(POTION.max, pr.potions + (q.reward.potions ?? 0));
    pr.keys += q.reward.keys ?? 0;
    w.player.prog.points += q.reward.points ?? 0;
    w.notices.push({ title: "QUEST COMPLETE", body: `${q.title}  ·  ${rewardText(q.reward)}`, life: 4 });
    if (q.id.startsWith("m")) w.pendingDialogue.push(q.id);
  }
  sfx(w, "quest");
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
  if (!e.boss) {
    if (e.xp > 0 && w.gateKind === "normal" && w.rng() < KEYS.dropChance) {
      w.run.keys += 1;
      sfx(w, "chime");
      w.notices.push({ title: "KEY FOUND", body: "It opens a key dungeon, if you get out alive.", life: 4 });
    }
    return;
  }
  if (e.kind === "warden") earnTitle(w, "giant_feller");
  const drop = BOSS_DROP[e.kind];
  if (drop && !owns(w.profile, drop) && !w.run.items.includes(drop)) {
    w.run.items.push(drop);
    sfx(w, "chime");
    w.notices.push({ title: "ITEM FOUND", body: ITEMS[drop].name, life: 4 });
  }
}

/** Reward for beating the hidden trial: its unique item once, gold after that. */
export function trialReward(w: World): void {
  if (!owns(w.profile, TRIAL_DROP) && !w.run.items.includes(TRIAL_DROP)) {
    w.run.items.push(TRIAL_DROP);
    w.notices.push({ title: "TRIAL COMPLETE", body: `Found: ${ITEMS[TRIAL_DROP].name}`, life: 5 });
  } else {
    const gold = Math.round(HIDDEN.gold * RANKS[w.rank].xpMult);
    w.run.gold += gold;
    w.notices.push({ title: "TRIAL COMPLETE", body: `+${gold} gold`, life: 5 });
  }
}

export function usePotion(w: World): void {
  const p = w.player;
  if (w.profile.potions <= 0 || p.hp >= p.d.maxHp) return;
  const heal = Math.min(p.d.maxHp - p.hp, Math.round(p.d.maxHp * POTION.heal));
  p.hp += heal;
  w.profile.potions -= 1;
  sfx(w, "potion");
  w.run.usedPotion = true;
  w.dirty = true;
  floatText(w, p.x, p.y, `+${heal}`, "#6dff9c", true);
  burst(w, p.x, p.y, "#6dff9c", 14, 200);
}

/** Move the run's loot into the profile. */
function bank(w: World): string[] {
  const pr = w.profile;
  const run = w.run;
  pr.gold += run.gold;
  pr.inventory.push(...run.items);
  pr.keys += run.keys;
  return [
    `+${run.gold} gold`,
    ...run.items.map((id) => `Found: ${ITEMS[id].name}`),
    ...(run.keys > 0 ? [`+${run.keys} key${run.keys > 1 ? "s" : ""}`] : []),
  ];
}

/** The gate ended in the player's favour: pay out according to its kind. */
export function settleClear(w: World): void {
  if (w.run.settled) return;
  const pr = w.profile;
  const run = w.run;
  run.settled = true;
  w.dirty = true;

  if (w.gateKind === "penalty") {
    pr.penaltyPending = false;
    run.summary = ["You endured the penalty zone.", "Nothing was taken."];
    return;
  }
  if (w.gateKind === "key") {
    run.gold += Math.round(KEYS.gold * RANKS[w.rank].xpMult);
    pr.potions = Math.min(POTION.max, pr.potions + 1);
    w.player.prog.points += KEYS.points;
    run.summary = [...bank(w), "+1 potion", `+${KEYS.points} stat point`];
    return;
  }

  run.summary = bank(w);
  pr.gatesCleared += 1;
  earnTitle(w, "first_gate");
  if (!run.tookDamage) earnTitle(w, "untouched");
  if (run.overLevel) earnTitle(w, "overreacher");
  fireQuest(w, { type: "gate", rank: w.rank, noPotion: !run.usedPotion, noDamage: !run.tookDamage });
}

/** Left by Return Stone: the loot comes along, but the gate is not cleared. */
export function settleRetreat(w: World): void {
  if (w.run.settled) return;
  w.run.settled = true;
  w.run.retreated = true;
  w.run.summary = ["The stone pulled you out.", ...bank(w)];
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
  const lost = run.items.length + run.keys;
  run.summary = [
    `Gate loot lost: ${run.gold} gold${lost ? `, ${lost} item${lost > 1 ? "s" : ""}` : ""}`,
    `-${gold} gold`,
    `-${xp} experience`,
  ];
  run.gold = 0;
  run.items = [];
  run.keys = 0;
  // Dying in the penalty zone still settles the debt.
  if (w.gateKind === "penalty") pr.penaltyPending = false;
  w.dirty = true;
}

/** Change one setting: "sfx+", "sfx-", "music+", "music-" or "shake". */
export function applySetting(w: World, arg: string): void {
  const s = w.settings;
  const nudge = (v: number, up: boolean) => Math.round(Math.min(1, Math.max(0, v + (up ? 0.1 : -0.1))) * 10) / 10;
  if (arg === "sfx+" || arg === "sfx-") s.sfx = nudge(s.sfx, arg.endsWith("+"));
  else if (arg === "music+" || arg === "music-") s.music = nudge(s.music, arg.endsWith("+"));
  else if (arg === "shake") s.shake = !s.shake;
  else return;
  w.settingsDirty = true;
  // Play something so the new volume can be heard at once.
  sfx(w, "click");
}

/** What a gate-board action asks the caller to start, if anything. */
export type Enter = Rank | "key" | null;

/** Perform a gate-board action by id. */
export function hubAction(w: World, id: string): Enter {
  const pr = w.profile;
  const [verb, arg] = id.split(":");
  const gold = pr.gold;
  const wasDirty = w.dirty;
  w.dirty = false;
  const result = hubActionInner(w, verb, arg);
  const worked = w.dirty || verb === "tab" || verb === "save" || result !== null;
  w.dirty = w.dirty || wasDirty;
  // A purchase or sale sounds like coins; anything else that worked, a click.
  if (verb !== "set") sfx(w, pr.gold !== gold ? "buy" : worked ? "click" : "deny");
  return result;
}

function hubActionInner(w: World, verb: string, arg: string): Enter {
  const pr = w.profile;
  switch (verb) {
    case "set":
      applySetting(w, arg);
      return null;
    case "tab":
      if (HUB_TABS.includes(arg as HubTab)) w.tab = arg as HubTab;
      return null;
    case "gate":
      if (arg === "key") return pr.keys > 0 ? "key" : null;
      return RANK_IDS.includes(arg as Rank) ? (arg as Rank) : null;
    case "buy":
      if (arg === "potion") {
        if (pr.gold < POTION.price || pr.potions >= POTION.max) return null;
        pr.gold -= POTION.price;
        pr.potions += 1;
      } else if (arg === "stone") {
        if (pr.gold < STONE.price || pr.stones >= STONE.max) return null;
        pr.gold -= STONE.price;
        pr.stones += 1;
      } else {
        const item = ITEMS[arg];
        if (!item || !pr.shop.stock.includes(arg) || owns(pr, arg) || pr.gold < item.price) return null;
        pr.gold -= item.price;
        pr.inventory.push(arg);
      }
      break;
    case "shop":
      // One free reset of the stock each day.
      if (arg !== "reroll" || pr.shop.rerolls >= 1) return null;
      pr.shop.rerolls += 1;
      pr.shop.stock = stockFor(w);
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
      if (arg === "exit") {
        w.afterTitle = "select";
        w.mode = "title";
      } else w.requests.push(arg);
      return null;
    default:
      return null;
  }
  w.dirty = true;
  return null;
}

/** Name of a boss for display, hidden until met. */
export function bossName(rank: Rank, known: boolean): string {
  return known ? KINDS[RANKS[rank].boss].name : "???";
}
