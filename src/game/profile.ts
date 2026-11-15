import { seeded } from "../engine/rng";
import { seenScenes, startCutscene } from "./cutscenes";
import { clamp } from "../engine/vec";
import {
  BINDABLE,
  bossEchoCap,
  BREAK,
  dailyGoals,
  DEFAULT_LOADOUT,
  ECHO,
  echoCap,
  HIDDEN,
  KEYS,
  KINDS,
  NGPLUS,
  RANK_IDS,
  RANKS,
  RESET,
  SKILL_IDS,
  SKILL_RANK,
  SKILLS,
  TOWER,
  type Rank,
  type SkillId,
} from "./config";
import {
  ANTIDOTE,
  BAG,
  BAG_IDS,
  baseOf,
  BOSS_DROP,
  BOSS_MYTHIC,
  DROP_WEIGHT,
  DROPS,
  EQUIP_SLOTS,
  FLASK,
  FURY,
  gearBonus,
  gearPerks,
  gearPowers,
  itemDef,
  itemName,
  ITEMS,
  makeItem,
  MYTHIC_ODDS,
  POTION,
  POWERS,
  RANK_WEIGHT,
  rollDrop,
  rollPerks,
  rollStock,
  sellValue,
  SHOP_POOL,
  STONE,
  SUPPLY_IDS,
  TITLES,
  TRIAL_DROP,
  WEAPONS,
  type BagId,
  type EquipSlot,
  type PowerId,
  type SupplyId,
} from "./items";
import { MAIN, newQuests, questEvent, type QuestEvent, type Reward } from "./quests";
import {
  burst,
  floatText,
  healPlayer,
  noAilments,
  QUALITIES,
  sfx,
  visibleTabs,
  type Enemy,
  type HubTab,
  type Profile,
  type Run,
  type Ending,
  type World,
} from "./state";
import { BASE_STAT, CRIT_CAP, derive, STAT_KEYS, xpToNext } from "./stats";
import { DIALOGUES } from "./story";

/** Everything that outlives a gate: gold, gear, titles, quests, dialogue. */

export const DEATH = { goldLoss: 0.2, xpLoss: 0.1 };

export function newProfile(): Profile {
  return {
    gold: 0,
    potions: 1,
    inventory: [],
    equipped: {},
    activeWeapon: 0,
    bag: { greater: 0, mana: 0, fury: 0, antidote: 0 },
    flask: { size: FLASK.start, charges: FLASK.start },
    autoBuy: { potion: false, stone: false, greater: false, mana: false, fury: false, antidote: false },
    goldFloor: 0,
    autoDrink: { on: false, at: 0.3 },
    bossKills: {},
    dailiesDone: 0,
    mythics: [],
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
    hunterRank: "E",
    skillRanks: Object.fromEntries(SKILL_IDS.map((id) => [id, 1])) as Record<SkillId, number>,
    loadout: [...DEFAULT_LOADOUT],
    classUnlocked: false,
    echoes: [],
    lastClear: 0,
    breakPending: false,
    ending: null,
    trialPity: 0,
    breakPity: 0,
    cycle: 0,
    towerBest: 0,
    tips: true,
    sealedPity: 0,
    redGate: { day: 0, rank: "E", done: false },
  };
}

export function newRun(): Run {
  return {
    gold: 0,
    items: [],
    keys: 0,
    books: [],
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
  const pr = w.profile;
  const next = derive(p.prog.stats, gearBonus(pr.equipped, pr.title, pr.activeWeapon));
  // The weapon in hand sets the pace of attacks and, for a dagger, adds crit.
  const held = pr.equipped[pr.activeWeapon === 1 ? "weapon2" : "weapon"];
  p.weapon = held ? (itemDef(held)?.weapon ?? null) : null;
  if (p.weapon) {
    const wd = WEAPONS[p.weapon];
    next.attackCooldown *= wd.cooldown / WEAPONS.dagger.cooldown;
    next.critChance = Math.min(CRIT_CAP, next.critChance + wd.crit);
  }
  p.perks = gearPerks(pr.equipped, pr.activeWeapon);
  p.powers = gearPowers(pr.equipped, pr.activeWeapon);
  p.hp = clamp(p.hp + (next.maxHp - p.d.maxHp), 1, next.maxHp);
  p.mana = clamp(p.mana + (next.maxMana - p.d.maxMana), 0, next.maxMana);
  p.d = next;
}

/** Whether the hunter has an item of this base, worn or in the bag, whatever its perks. */
export function owns(profile: Profile, id: string): boolean {
  const base = baseOf(id);
  return profile.inventory.some((x) => baseOf(x) === base) || EQUIP_SLOTS.some((s) => profile.equipped[s] && baseOf(profile.equipped[s]!) === base);
}

/** Find an owned item in a list by position ("3"), exact text, or base id. */
function pick(list: string[], arg: string): number {
  if (/^\d+$/.test(arg)) return Number(arg) < list.length ? Number(arg) : -1;
  const exact = list.indexOf(arg);
  return exact >= 0 ? exact : list.findIndex((x) => baseOf(x) === arg);
}

/** The shop's stock for the current day and reset count, skipping owned items. */
function stockFor(w: World): string[] {
  const pr = w.profile;
  const owned = [...pr.inventory, ...EQUIP_SLOTS.map((s) => pr.equipped[s]).filter((id): id is string => !!id)].map(baseOf);
  const rng = seeded(w.today * 7919 + pr.shop.rerolls * 104729 + 17);
  const bases = rollStock(rng, owned, RANK_WEIGHT[pr.hunterRank]);
  // Now and then a Rank A hunter or better finds a legendary on the shelf.
  // In New Game+ there is one every day.
  const high = RANK_IDS.indexOf(pr.hunterRank) >= RANK_IDS.indexOf("A");
  if (bases.length > 0 && (pr.cycle > 0 || (high && w.today % DROPS.legendaryDayEvery === 0))) {
    const legends = SHOP_POOL.filter((id) => ITEMS[id].rarity === "legendary" && !owned.includes(id));
    if (legends.length > 0) bases[bases.length - 1] = legends[Math.min(legends.length - 1, Math.floor(rng() * legends.length))];
  }
  return bases.map((id) => makeItem(id, rollPerks(id, rng)));
}

/** An item found in a gate: it joins the run's loot, kept only if the hunter gets out. */
function found(w: World, owned: string): void {
  w.run.items.push(owned);
  sfx(w, "chime");
  const def = itemDef(owned)!;
  w.notices.push({ title: def.rarity === "mythic" ? "MYTHIC FOUND" : "ITEM FOUND", body: `${itemName(owned)}  ·  ${def.unique ? "unique" : def.rarity}`, life: 4 });
}

/**
 * Award a mythic, once. Into the bag at once when earned by finishing
 * something; into the run's loot when dropped mid-gate, to be kept on leaving.
 */
export function grantMythic(w: World, id: PowerId, intoRun: boolean): boolean {
  const pr = w.profile;
  if (pr.mythics.includes(id) || w.run.items.some((x) => baseOf(x) === id)) return false;
  const owned = makeItem(id, rollPerks(id, w.rng));
  if (intoRun) found(w, owned);
  else {
    pr.mythics.push(id);
    pr.inventory.push(owned);
    sfx(w, "quest");
    w.notices.push({ title: "MYTHIC EARNED", body: `${itemName(owned)}  ·  ${POWERS[id]}`, life: 7 });
  }
  w.dirty = true;
  return true;
}

/** Chance that one try binds a boss: better with Intelligence, never certain. */
export function bossBindChance(w: World): number {
  const bonus = (w.player.prog.stats.int - BASE_STAT) * ECHO.bossChancePerInt;
  return Math.min(0.95, ECHO.bossChance + Math.max(0, bonus));
}

/** True while the rite of echoes is the open main quest. */
/** The tower opens to hunters of Rank C and above. */
export function towerOpen(profile: Profile): boolean {
  return RANK_IDS.indexOf(profile.hunterRank) >= RANK_IDS.indexOf(TOWER.openRank);
}

/**
 * A tower floor is clear. The record and the reward are banked on the spot,
 * so a death higher up cannot take them back.
 */
export function towerFloorCleared(w: World): void {
  const pr = w.profile;
  const floor = w.towerFloor;
  if (floor > pr.towerBest) pr.towerBest = floor;
  if (floor % TOWER.bossEvery === 0) {
    const gold = TOWER.gold * floor;
    const item = rollDrop(w.rank, w.rng);
    pr.gold += gold;
    if (pr.inventory.length < DROPS.bagSize) pr.inventory.push(item);
    else pr.gold += sellValue(item);
    w.notices.push({ title: `FLOOR ${floor} CLEARED`, body: `+${gold} gold  ·  ${itemName(item)}`, life: 4 });
    sfx(w, "quest");
  }
  if (floor >= 25) earnTitle(w, "tower_25");
  if (floor >= 50) earnTitle(w, "tower_50");
  w.dirty = true;
}

/** Whether today's sealed gate is still standing on the board. */
export function redGateOpen(w: World): boolean {
  const red = w.profile.redGate;
  return w.today > 0 && red.day === w.today && !red.done;
}

/** A sealed gate's prize is never less than epic, whatever the rank usually drops. */
function sealedPrize(w: World): string {
  const usual = DROP_WEIGHT[w.rank];
  return rollDrop(w.rank, w.rng, { common: 0, uncommon: 0, rare: 0, epic: Math.max(1, usual.epic), legendary: usual.legendary, mythic: 0 });
}

export function riteOpen(profile: Profile): boolean {
  return MAIN[profile.quests.main]?.id === "m6" && !profile.classUnlocked;
}

/** Echoes currently set to fight. */
export function activeEchoes(profile: Profile): number {
  return profile.echoes.filter((e) => e.active).length;
}

/** Whether one more echo of this kind may be set active. Only one boss echo at a time. */
export function canActivate(w: World, kind: Enemy["kind"]): boolean {
  const pr = w.profile;
  const level = w.player.prog.level;
  if (activeEchoes(pr) >= echoCap(level)) return false;
  if (!KINDS[kind].boss) return true;
  return pr.echoes.filter((e) => e.active && KINDS[e.kind].boss).length < bossEchoCap(level);
}

/** A skill book for a skill that can still improve, counting books already found. */
function pickBook(w: World): SkillId | null {
  const open = SKILL_IDS.filter(
    (id) => w.profile.skillRanks[id] + w.run.books.filter((b) => b === id).length < SKILL_RANK.max,
  );
  return open.length ? open[Math.min(open.length - 1, Math.floor(w.rng() * open.length))] : null;
}

function findBook(w: World): void {
  const id = pickBook(w);
  if (!id) return;
  w.run.books.push(id);
  sfx(w, "chime");
  w.notices.push({ title: "SKILL BOOK FOUND", body: `${SKILLS[id].name}  ·  yours if you leave alive`, life: 4 });
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
    // With the Ledger burnt, nothing is left to punish a missed day.
    if (pr.daily.day > 0 && !pr.daily.done && !pr.penaltyPending && pr.ending !== "unwritten") {
      pr.penaltyPending = true;
      penalty = true;
      w.pendingDialogue.push("penalty");
    }
    pr.daily = { day: w.today, kills: 0, rooms: 0, gates: 0, done: false };
    w.dirty = true;
  }
  if (pr.shop.day !== w.today) {
    pr.shop = { day: w.today, rerolls: 0, stock: [] };
    pr.shop.stock = stockFor(w);
    w.dirty = true;
  }
  // Each day one sealed gate stands on the board, never more than a rank above the hunter.
  if (pr.redGate.day !== w.today) {
    const ranks = RANK_IDS.slice(0, Math.min(RANK_IDS.length, RANK_IDS.indexOf(pr.hunterRank) + 2));
    pr.redGate = { day: w.today, rank: ranks[Math.min(ranks.length - 1, Math.floor(w.rng() * ranks.length))], done: false };
    w.dirty = true;
  }
  // The hunter's own gate, left alone too long, breaks open.
  if (pr.lastClear === 0) {
    pr.lastClear = w.today;
    w.dirty = true;
  } else if (w.today - pr.lastClear >= BREAK.days && !pr.breakPending) {
    pr.breakPending = true;
    w.pendingDialogue.push("break");
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

/** Show the next waiting cutscene or dialogue, if the board is free. */
export function nextDialogue(w: World): void {
  if (w.dialogue || w.cutscene || w.mode !== "select") return;
  const id = w.pendingDialogue.shift();
  if (!id) return;
  // A beat with a cutscene plays that; whatever follows it is queued behind.
  if (startCutscene(w, id)) w.pendingDialogue.unshift(`${id}_after`);
  else startDialogue(w, id);
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
  if (w.profile.introSeen) return;
  startCutscene(w, "intro");
  w.pendingDialogue.unshift("intro_after");
}

/** Whether the story can be begun again with everything kept. */
export function canNewGamePlus(profile: Profile): boolean {
  return profile.ending !== null && profile.cycle < NGPLUS.max;
}

/**
 * New Game+: the main quest starts over and the last page is unwritten again,
 * so the other ending can be chosen. Level, gear, echoes, titles, rank and
 * the tower record all stay. Every enemy is stronger for it.
 */
export function newGamePlus(w: World): boolean {
  const pr = w.profile;
  if (!canNewGamePlus(pr)) return false;
  pr.cycle += 1;
  pr.ending = null;
  pr.quests.main = 0;
  for (const q of MAIN) delete pr.quests.progress[q.id];
  // Today's shelf is rolled again, for the legendary a new cycle brings.
  pr.shop.stock = stockFor(w);
  w.pendingDialogue = [];
  w.notices.push({ title: `NEW GAME+  ${pr.cycle}`, body: `The Ledger opens at its first page. Enemies are ${Math.round(NGPLUS.harder * pr.cycle * 100)}% stronger.`, life: 6 });
  w.dirty = true;
  // Steps already met (a level, a following of echoes) pass at once.
  fireQuest(w, { type: "level", level: w.player.prog.level });
  return true;
}

/** Sign the last page or burn it. Once chosen, it stays chosen. */
export function chooseEnding(w: World, ending: Ending): boolean {
  const pr = w.profile;
  if (pr.ending || MAIN[pr.quests.main]?.id !== "m10") return false;
  pr.ending = ending;
  // A penalty already owed dies with the Ledger.
  if (ending === "unwritten") pr.penaltyPending = false;
  w.pendingDialogue.push(`end_${ending}`);
  earnTitle(w, ending);
  fireQuest(w, { type: "ending" });
  w.dirty = true;
  return true;
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
  if (d.done || d.day === 0 || d.day !== w.today || w.gateKind === "penalty" || w.gateKind === "rite") return;
  if (ev.type === "kill") d.kills += 1;
  else if (ev.type === "room") d.rooms += 1;
  else if (ev.type === "gate") d.gates += 1;
  else return;
  w.dirty = true;
  const goal = dailyGoals(w.profile.hunterRank);
  if (d.kills < goal.kills || d.rooms < goal.rooms || d.gates < goal.gates) return;
  d.done = true;
  w.profile.dailiesDone += 1;
  if (w.profile.dailiesDone >= 30) grantMythic(w, "ledgers_favour", false);
  w.player.prog.points += goal.points;
  w.profile.potions = POTION.max;
  w.notices.push({ title: "DAILY QUEST COMPLETE", body: `+${goal.points} stat points  ·  potions refilled`, life: 5 });
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
  if (pr.echoes.length > 0) fireQuest(w, { type: "bind", echoes: pr.echoes.length, boss: pr.echoes.some((e) => KINDS[e.kind].boss) });
  // An Echo Caller on a second telling has no rite left to undergo.
  if (pr.classUnlocked && pr.cycle > 0) fireQuest(w, { type: "rite" });
  nextDialogue(w);
}

/** Loot and quest credit for a kill. */
export function onKill(w: World, e: Enemy): void {
  // Summoned minions carry no experience and so no gold either.
  const gilded = 1 + 0.25 * w.player.perks.gilded;
  if (e.xp > 0) w.run.gold += Math.round(e.xp * (e.boss ? 0.5 : 0.6) * gilded);
  fireQuest(w, { type: "kill", kind: e.kind });
  // An Echo Caller can bind what falls. Summoned minions leave nothing.
  const field = w.gateKind === "normal" || w.gateKind === "key" || w.gateKind === "break";
  if (w.profile.classUnlocked && field && (e.xp > 0 || e.boss)) {
    w.remnants.push({
      x: e.x,
      y: e.y,
      kind: e.kind,
      rank: w.rank,
      life: e.boss ? ECHO.bossRemnantLife : ECHO.remnantLife,
      tries: e.boss ? ECHO.bossTries : 1,
    });
  }
  if (!e.boss) {
    if (e.xp > 0 && field && w.rng() < DROPS.chance) found(w, rollDrop(w.rank, w.rng));
    if (e.xp > 0 && w.gateKind === "normal" && w.rng() < KEYS.dropChance) {
      w.run.keys += 1;
      sfx(w, "chime");
      w.notices.push({ title: "KEY FOUND", body: "It opens a key dungeon, if you get out alive.", life: 4 });
    }
    return;
  }
  if (w.gateKind !== "normal") return;
  if (e.kind === "warden") earnTitle(w, "giant_feller");
  if (w.rng() < SKILL_RANK.bossDrop) findBook(w);
  const drop = BOSS_DROP[e.kind];
  if (drop && !owns(w.profile, drop) && !w.run.items.includes(drop)) found(w, drop);
  // A boss always leaves one piece of gear, a tier better than its gate's commoners drop.
  const up = RANK_IDS[Math.min(RANK_IDS.length - 1, RANK_IDS.indexOf(w.rank) + 1)];
  found(w, rollDrop(w.rank, w.rng, DROP_WEIGHT[up]));
  // The three late bosses each guard a mythic: a chance per kill, certain by the fifth.
  const myth = BOSS_MYTHIC[e.kind];
  if (myth) {
    const kills = (w.profile.bossKills[e.kind] ?? 0) + 1;
    w.profile.bossKills[e.kind] = kills;
    if (kills >= MYTHIC_ODDS.pity || w.rng() < MYTHIC_ODDS.chance) grantMythic(w, myth, true);
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
  findBook(w);
  found(w, rollDrop(w.rank, w.rng));
  if (w.rank === "S") grantMythic(w, "trials_end", true);
}

/** What the B key can use, in the order Z cycles through. */
export type BeltId = "flask" | "greater" | "fury" | "antidote";
export const BELT: BeltId[] = ["flask", "greater", "fury", "antidote"];

export function beltCount(profile: Profile, id: BeltId): number {
  return id === "flask" ? profile.flask.charges : profile.bag[id];
}

/** Use a consumable from the bag. Nothing is spent if it would do nothing. */
export function useBag(w: World, id: BagId): boolean {
  const p = w.player;
  const pr = w.profile;
  if (pr.bag[id] <= 0) return false;
  if (id === "greater") {
    if (p.hp >= p.d.maxHp || healPlayer(w, p.d.maxHp) <= 0) return false;
    w.run.usedPotion = true;
    floatText(w, p.x, p.y, "FULL HEALTH", "#6dff9c", true);
  } else if (id === "mana") {
    if (p.mana >= p.d.maxMana) return false;
    p.mana = p.d.maxMana;
    floatText(w, p.x, p.y, "FULL MANA", "#4f7bff", true);
  } else if (id === "fury") {
    p.furyT = FURY.time;
    floatText(w, p.x, p.y, "FURY", "#ff8a3c", true);
  } else {
    p.ail = noAilments();
    p.ail.immune = ANTIDOTE.immune;
    floatText(w, p.x, p.y, "CLEANSED", "#c8e060", true);
  }
  pr.bag[id] -= 1;
  sfx(w, "potion");
  burst(w, p.x, p.y, "#6dff9c", 12, 200);
  w.dirty = true;
  return true;
}

/** A sip from the flask: free, a few to a gate, refilled at the board. */
export function useFlask(w: World): boolean {
  const p = w.player;
  const f = w.profile.flask;
  if (f.charges <= 0 || p.hp >= p.d.maxHp) return false;
  const healed = healPlayer(w, p.d.maxHp * FLASK.heal);
  if (healed <= 0) return false;
  f.charges -= 1;
  sfx(w, "potion");
  floatText(w, p.x, p.y, `+${healed}`, "#6dff9c", true);
  w.dirty = true;
  return true;
}

export function useBelt(w: World): boolean {
  const id = BELT[w.belt % BELT.length];
  return id === "flask" ? useFlask(w) : useBag(w, id);
}

/** Move the belt to the next thing there is any of. */
export function cycleBelt(w: World): void {
  for (let i = 1; i <= BELT.length; i++) {
    const next = (w.belt + i) % BELT.length;
    if (beltCount(w.profile, BELT[next]) > 0 || i === BELT.length) {
      w.belt = next;
      return;
    }
  }
}

function supplyInfo(profile: Profile, id: SupplyId): { have: number; max: number; price: number; allowed: boolean } {
  if (id === "potion") return { have: profile.potions, max: POTION.max, price: POTION.price, allowed: true };
  if (id === "stone") return { have: profile.stones, max: STONE.max, price: STONE.price, allowed: true };
  const def = BAG[id];
  const allowed = !def.rank || RANK_IDS.indexOf(profile.hunterRank) >= RANK_IDS.indexOf(def.rank);
  return { have: profile.bag[id], max: def.max, price: def.price, allowed };
}

/** Buy one of a supply, if there is room, gold above `floor`, and the rank for it. */
function buySupply(profile: Profile, id: SupplyId, floor = 0): boolean {
  const info = supplyInfo(profile, id);
  if (!info.allowed || info.have >= info.max || profile.gold - info.price < floor) return false;
  profile.gold -= info.price;
  if (id === "potion") profile.potions += 1;
  else if (id === "stone") profile.stones += 1;
  else profile.bag[id] += 1;
  return true;
}

/**
 * Back at the board: refill the flask, then top up everything set to
 * auto-buy, cheapest first, never dipping below the gold floor.
 */
export function restock(w: World): void {
  const pr = w.profile;
  pr.flask.charges = pr.flask.size;
  const before = pr.gold;
  const wanted = SUPPLY_IDS.filter((id) => pr.autoBuy[id]).sort((a, b) => supplyInfo(pr, a).price - supplyInfo(pr, b).price);
  for (const id of wanted) while (buySupply(pr, id, pr.goldFloor)) {}
  if (pr.gold < before) {
    w.notices.push({ title: "AUTO-BUY", body: `Restocked for ${before - pr.gold} gold`, life: 3 });
    w.dirty = true;
  }
}

export function usePotion(w: World): void {
  const p = w.player;
  if (w.profile.potions <= 0 || p.hp >= p.d.maxHp) return;
  const heal = healPlayer(w, p.d.maxHp * POTION.heal);
  if (heal <= 0) return;
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
  const sold: string[] = [];
  for (const owned of run.items) {
    const def = itemDef(owned);
    if (def?.power && !pr.mythics.includes(def.power)) pr.mythics.push(def.power);
    // A full bag turns the overflow straight into gold. Mythics always fit.
    if (pr.inventory.length >= DROPS.bagSize && def?.rarity !== "mythic") {
      pr.gold += sellValue(owned);
      sold.push(`Bag full: sold ${itemName(owned)} for ${sellValue(owned)} gold`);
    } else pr.inventory.push(owned);
  }
  pr.keys += run.keys;
  const learned: string[] = [];
  for (const id of run.books) {
    if (pr.skillRanks[id] >= SKILL_RANK.max) continue;
    pr.skillRanks[id] += 1;
    learned.push(`${SKILLS[id].name} improved to rank ${pr.skillRanks[id]}`);
  }
  return [
    `+${run.gold} gold`,
    ...run.items.slice(0, 5).map((id) => `Found: ${itemName(id)}`),
    ...(run.items.length > 5 ? [`and ${run.items.length - 5} more items`] : []),
    ...sold.slice(0, 2),
    ...(run.keys > 0 ? [`+${run.keys} key${run.keys > 1 ? "s" : ""}`] : []),
    ...learned,
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
  if (w.gateKind === "rite") {
    pr.classUnlocked = true;
    run.summary = ["Class granted: Echo Caller", "Press G near a fallen enemy's remnant to bind it."];
    fireQuest(w, { type: "rite" });
    return;
  }
  if (w.gateKind === "break") {
    pr.breakPending = false;
    pr.lastClear = w.today;
    run.gold += Math.round(BREAK.gold * RANKS[w.rank].xpMult);
    run.summary = ["The break is contained.", ...bank(w)];
    if (w.rank === "S") grantMythic(w, "breakwater", false);
    return;
  }
  if (w.gateKind === "key") {
    // A key dungeon always holds a skill book, if any skill can still improve.
    const book = pickBook(w);
    if (book) run.books.push(book);
    run.items.push(rollDrop(w.rank, w.rng));
    run.gold += Math.round(KEYS.gold * RANKS[w.rank].xpMult);
    pr.potions = Math.min(POTION.max, pr.potions + 1);
    w.player.prog.points += KEYS.points;
    run.summary = [...bank(w), "+1 potion", `+${KEYS.points} stat point`];
    return;
  }

  if (w.sealed) {
    const prize = sealedPrize(w);
    run.items.push(prize);
    w.notices.push({ title: "SEALED GATE PRIZE", body: itemName(prize), life: 5 });
    // Today's sealed gate on the board is done once one of its rank is cleared.
    if (pr.redGate.day === w.today && pr.redGate.rank === w.rank) pr.redGate.done = true;
  }
  run.summary = bank(w);
  pr.gatesCleared += 1;
  // Closing gates builds pressure: every so many, one breaks open in the street.
  pr.breakPity += 1;
  if (pr.breakPity >= BREAK.afterGates && !pr.breakPending) {
    pr.breakPity = 0;
    pr.breakPending = true;
    w.pendingDialogue.push("break_surge");
  }
  // Clearing a gate above your rank is the re-evaluation.
  if (RANK_IDS.indexOf(w.rank) > RANK_IDS.indexOf(pr.hunterRank)) {
    pr.hunterRank = w.rank;
    run.summary.push(`Re-evaluated: you are now Rank ${w.rank}`);
    w.notices.push({ title: "RANK RE-EVALUATED", body: `You are now a Rank ${w.rank} hunter.`, life: 5 });
    w.pendingDialogue.push(`rank${w.rank}`);
  }
  if (RANK_IDS.indexOf(w.rank) >= RANK_IDS.indexOf(pr.hunterRank)) pr.lastClear = w.today;
  earnTitle(w, "first_gate");
  if (!run.tookDamage) earnTitle(w, "untouched");
  if (run.overLevel) earnTitle(w, "overreacher");
  const high = (rank: Rank) => RANK_IDS.indexOf(w.rank) >= RANK_IDS.indexOf(rank);
  if (w.sealed && high("A")) grantMythic(w, "seal_breaker", false);
  if (!run.tookDamage && high("B")) grantMythic(w, "untouched_mantle", false);
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
  run.books = [];
  if (w.gateKind === "tower") run.summary.unshift(`You fell on floor ${w.towerFloor} of the tower. Best: floor ${pr.towerBest}.`);
  // Dying in the penalty zone still settles the debt; so does a lost break.
  if (w.gateKind === "penalty") pr.penaltyPending = false;
  if (w.gateKind === "break") {
    pr.breakPending = false;
    pr.lastClear = w.today;
  }
  w.dirty = true;
}

/** Change one setting: "sfx+", "sfx-", "music+", "music-" or "shake". */
export function applySetting(w: World, arg: string): void {
  const s = w.settings;
  const nudge = (v: number, up: boolean) => Math.round(Math.min(1, Math.max(0, v + (up ? 0.1 : -0.1))) * 10) / 10;
  if (arg === "sfx+" || arg === "sfx-") s.sfx = nudge(s.sfx, arg.endsWith("+"));
  else if (arg === "music+" || arg === "music-") s.music = nudge(s.music, arg.endsWith("+"));
  else if (arg === "shake") s.shake = !s.shake;
  else if (arg === "quality") {
    // Choosing a level by hand also stops the game changing it.
    s.quality = QUALITIES[(QUALITIES.indexOf(s.quality) + 1) % QUALITIES.length];
    s.autoQuality = false;
  } else if (arg === "autoq") s.autoQuality = !s.autoQuality;
  else if (arg === "tips") {
    w.profile.tips = !w.profile.tips;
    w.dirty = true;
  } else if (arg === "keys") {
    w.menu = "keys";
    w.rebinding = null;
  } else if (arg === "keys-reset") s.keys = {};
  else return;
  w.settingsDirty = true;
  // Play something so the new volume can be heard at once.
  sfx(w, "click");
}

/** The key an action is on now. */
export function boundKey(w: World, action: string): string {
  return w.settings.keys[action] ?? action;
}

/** A key's name as shown to the player. */
export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  return code.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

/**
 * Put an action on a key. If another action was on that key, the two trade,
 * so no action is ever left without one and no key does two things.
 */
export function bindKey(w: World, action: string, code: string): void {
  if (code === "Escape" || !BINDABLE.some(([a]) => a === action)) return;
  const keys = w.settings.keys;
  const old = boundKey(w, action);
  const other = BINDABLE.map(([a]) => a).find((a) => a !== action && boundKey(w, a) === code);
  if (other) keys[other] = old;
  keys[action] = code;
  // An action back on its own key needs no entry.
  for (const [a] of BINDABLE) if (keys[a] === a) delete keys[a];
  w.settingsDirty = true;
  sfx(w, "click");
}

/** The tip shown in a new hunter's first gate: one thing per room. */
export function tutorialTip(w: World): string | null {
  if (!w.profile.tips || w.mode !== "gate" || w.gateKind !== "normal" || !w.dungeon) return null;
  const k = (action: string) => keyName(boundKey(w, action));
  const seen = w.dungeon.rooms.filter((r) => r.visited).length;
  const tips = [
    `${k("KeyW")} ${k("KeyA")} ${k("KeyS")} ${k("KeyD")} to move. Walk through a glowing doorway to find the enemies.`,
    "CLICK to attack where the mouse points. Red marks on the floor show where a blow will land: step out of them.",
    `${k("Space")} dashes. Nothing can hurt you mid-dash, so dash THROUGH an attack, not away from it.`,
    `${k("KeyF")} drinks a potion. ${k("KeyB")} sips the flask, which refills for free back at the board.`,
    `Doors lock until a room is clear. The boss waits behind the red door. ${k("KeyT")} uses a Return Stone to leave with your loot.`,
    `${k("KeyC")} opens your status: spend stat points there. Tips end with this gate. Good hunting.`,
  ];
  return tips[Math.min(tips.length, seen) - 1] ?? null;
}

/** What a gate-board action asks the caller to start, if anything. */
export type Enter = Rank | "key" | "rite" | "sealed" | "tower" | null;

/** Perform a gate-board action by id. */
export function hubAction(w: World, id: string): Enter {
  const pr = w.profile;
  const [verb, arg, extra] = id.split(":");
  const gold = pr.gold;
  const wasDirty = w.dirty;
  w.dirty = false;
  const result = hubActionInner(w, verb, arg, extra);
  const worked = w.dirty || verb === "tab" || verb === "save" || result !== null;
  w.dirty = w.dirty || wasDirty;
  // A purchase or sale sounds like coins; anything else that worked, a click.
  if (verb !== "set") sfx(w, pr.gold !== gold ? "buy" : worked ? "click" : "deny");
  return result;
}

function hubActionInner(w: World, verb: string, arg: string, extra: string | undefined): Enter {
  const pr = w.profile;
  switch (verb) {
    case "set":
      applySetting(w, arg);
      return null;
    case "ngplus":
      newGamePlus(w);
      return null;
    case "ending":
      if (arg === "keeper" || arg === "unwritten") chooseEnding(w, arg);
      return null;
    case "scene":
      // Replay a scene already reached, from the Story tab.
      if (seenScenes(pr).includes(arg) && startCutscene(w, arg)) w.dirty = true;
      return null;
    case "tab":
      if (visibleTabs(w).includes(arg as HubTab)) w.tab = arg as HubTab;
      return null;
    case "gate":
      if (arg === "key") return pr.keys > 0 ? "key" : null;
      if (arg === "rite") return riteOpen(pr) ? "rite" : null;
      if (arg === "sealed") return redGateOpen(w) ? "sealed" : null;
      if (arg === "tower") return towerOpen(pr) ? "tower" : null;
      return RANK_IDS.includes(arg as Rank) ? (arg as Rank) : null;
    case "buy":
      if (arg === "potion") {
        if (pr.gold < POTION.price || pr.potions >= POTION.max) return null;
        pr.gold -= POTION.price;
        pr.potions += 1;
      } else if (arg === "reset") {
        // A Blank Page: every spent stat point comes back.
        const prog = w.player.prog;
        const spent = STAT_KEYS.reduce((n, k) => n + prog.stats[k] - BASE_STAT, 0);
        if (spent <= 0 || pr.gold < RESET.price) return null;
        pr.gold -= RESET.price;
        for (const k of STAT_KEYS) prog.stats[k] = BASE_STAT;
        prog.points += spent;
        refreshDerived(w);
      } else if (arg === "stone") {
        if (pr.gold < STONE.price || pr.stones >= STONE.max) return null;
        pr.gold -= STONE.price;
        pr.stones += 1;
      } else if (BAG_IDS.includes(arg as BagId)) {
        if (!buySupply(pr, arg as BagId)) return null;
      } else {
        const i = pick(pr.shop.stock, arg);
        const def = i < 0 ? undefined : itemDef(pr.shop.stock[i]);
        if (!def || owns(pr, def.id) || pr.gold < def.price || pr.inventory.length >= DROPS.bagSize) return null;
        pr.gold -= def.price;
        pr.inventory.push(pr.shop.stock[i]);
      }
      break;
    case "flask": {
      // Each upgrade adds a charge, at a rising price.
      const cost = FLASK.cost[pr.flask.size - FLASK.start];
      if (arg !== "upgrade" || pr.flask.size >= FLASK.max || cost === undefined || pr.gold < cost) return null;
      pr.gold -= cost;
      pr.flask.size += 1;
      pr.flask.charges = pr.flask.size;
      break;
    }
    case "auto":
      if (!SUPPLY_IDS.includes(arg as SupplyId)) return null;
      pr.autoBuy[arg as SupplyId] = !pr.autoBuy[arg as SupplyId];
      break;
    case "floor":
      if (arg !== "+" && arg !== "-") return null;
      pr.goldFloor = Math.max(0, pr.goldFloor + (arg === "+" ? 100 : -100));
      break;
    case "drink":
      if (arg === "toggle") pr.autoDrink.on = !pr.autoDrink.on;
      else if (arg === "+" || arg === "-") pr.autoDrink.at = Math.round(Math.min(0.6, Math.max(0.1, pr.autoDrink.at + (arg === "+" ? 0.1 : -0.1))) * 10) / 10;
      else return null;
      break;
    case "weapon": {
      // Take the other weapon in hand, if there is one.
      const other = pr.activeWeapon === 1 ? "weapon" : "weapon2";
      if (arg !== "swap" || !pr.equipped[other]) return null;
      pr.activeWeapon = pr.activeWeapon === 1 ? 0 : 1;
      refreshDerived(w);
      break;
    }
    case "page":
      if (arg !== "+" && arg !== "-") return null;
      w.invPage = Math.max(0, w.invPage + (arg === "+" ? 1 : -1));
      return null;
    case "slot": {
      // Put a skill in a slot. If it sat in another slot, the two trade places.
      const i = Number(arg);
      const id = extra as SkillId;
      if (!(i >= 0 && i < pr.loadout.length) || !SKILL_IDS.includes(id)) return null;
      const from = pr.loadout.indexOf(id);
      if (from === i) pr.loadout[i] = null;
      else {
        if (from >= 0) pr.loadout[from] = pr.loadout[i];
        pr.loadout[i] = id;
      }
      break;
    }
    case "echo": {
      const i = Number(extra);
      const echo = pr.echoes[i];
      if (!echo) return null;
      if (arg === "release") pr.echoes.splice(i, 1);
      else if (arg === "toggle") {
        if (echo.active) echo.active = false;
        else if (canActivate(w, echo.kind)) echo.active = true;
        else return null;
      } else return null;
      break;
    }
    case "shop":
      // One free reset of the stock each day.
      if (arg !== "reroll" || pr.shop.rerolls >= 1) return null;
      pr.shop.rerolls += 1;
      pr.shop.stock = stockFor(w);
      break;
    case "sell": {
      const i = pick(pr.inventory, arg);
      // A mythic has no price: it cannot be sold.
      if (i < 0 || sellValue(pr.inventory[i]) <= 0) return null;
      const [gone] = pr.inventory.splice(i, 1);
      pr.gold += sellValue(gone);
      break;
    }
    case "equip": {
      const i = pick(pr.inventory, arg);
      const def = i < 0 ? undefined : itemDef(pr.inventory[i]);
      if (!def) return null;
      // A weapon fills the first empty weapon slot; with both full it replaces the one in hand.
      let slot: EquipSlot = def.slot;
      if (def.slot === "weapon") {
        slot = !pr.equipped.weapon ? "weapon" : !pr.equipped.weapon2 ? "weapon2" : pr.activeWeapon === 1 ? "weapon2" : "weapon";
      }
      const [worn] = pr.inventory.splice(i, 1);
      const old = pr.equipped[slot];
      if (old) pr.inventory.push(old);
      pr.equipped[slot] = worn;
      refreshDerived(w);
      break;
    }
    case "unequip": {
      const slot = arg as EquipSlot;
      const old = EQUIP_SLOTS.includes(slot) ? pr.equipped[slot] : undefined;
      if (!old) return null;
      delete pr.equipped[slot];
      pr.inventory.push(old);
      // Never left holding an empty hand while the other slot has a weapon.
      const held = pr.activeWeapon === 1 ? "weapon2" : "weapon";
      const other = pr.activeWeapon === 1 ? "weapon" : "weapon2";
      if (!pr.equipped[held] && pr.equipped[other]) pr.activeWeapon = pr.activeWeapon === 1 ? 0 : 1;
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
      } else if (arg === "reset") w.requests.push(arg);
      // Export and import are done by the shell inside the click itself: see fileButtonAt.
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
