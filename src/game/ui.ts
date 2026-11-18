import { BINDABLE, bossEchoCap, CLASS_IDS, CLASSES, CLOCK, echoCap, NGPLUS, KINDS, RANK_IDS, RESET, RUSH, SKILL_GROUPS, SKILL_RANK, SKILL_SLOTS, SKILLS, VIEW_H, VIEW_W, type Rank } from "./config";
import {
  ALL_RARITIES,
  BAG,
  describeBonus,
  describeItem,
  EQUIP_SLOTS,
  FLASK,
  itemDef,
  itemName,
  POTION,
  sellValue,
  STONE,
  SUPPLY_IDS,
  TITLES,
  WEAPONS,
  type Rarity,
  type SupplyId,
} from "./items";
import { CUTSCENES, seenScenes } from "./cutscenes";
import { BEAST_ORDER, BEAST_PAGE } from "./bestiary";
import { activeEchoes, boundKey, canActivate, canNewGamePlus, classOpen, keyName, owns, redGateOpen, riteOpen, rushOpen, slotOpen, towerOpen } from "./profile";
import { MAIN } from "./quests";
import { CHAPTERS } from "./story";
import { isCaller, visibleTabs, type BagKind, type BagSort, type World } from "./state";
import { BASE_STAT, STAT_KEYS } from "./stats";

/** Layout shared by the renderer and the click handling, so they agree. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STATUS_PANEL: Rect = { x: VIEW_W / 2 - 280, y: VIEW_H / 2 - 230, w: 560, h: 460 };

/** Vertical position of stat row `i` inside the status window. */
export function statRowY(i: number): number {
  return STATUS_PANEL.y + 190 + i * 40;
}

/** The [+] button on stat row `i`. */
export function statButton(i: number): Rect {
  return { x: STATUS_PANEL.x + 300, y: statRowY(i) - 19, w: 28, h: 26 };
}

export function pointIn(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Gate card `i` on the gate board: six ranks, three to a row. */
export function gateCard(i: number): Rect {
  const w = 280;
  const h = 146;
  const gap = 24;
  const x0 = VIEW_W / 2 - (w * 3 + gap * 2) / 2;
  return { x: x0 + (i % 3) * (w + gap), y: 226 + Math.floor(i / 3) * (h + 16), w, h };
}

/**
 * A clickable thing on the gate board. `id` is the action it performs.
 * Rows carry the text drawn to the left of their button.
 */
export interface Button {
  rect: Rect;
  id: string;
  label: string;
  enabled: boolean;
  kind: "tab" | "card" | "row" | "plain" | "setting";
  text?: string;
  sub?: string;
  /** A third line under `sub`, for rows that need it (classes, trials). */
  sub2?: string;
  textX?: number;
  /** Highlighted: the current tab, an active title. */
  on?: boolean;
  /** Drawn in red: a sealed gate. */
  danger?: boolean;
  /** Item rarity, which colours the row's name. */
  rarity?: Rarity;
  rank?: Rank;
  /** The owned item this row stands for, so hovering it can show it. */
  item?: string;
}

const LEFT = 150;
const RIGHT = 680;
const ROW_H = 36;
const TOP = 250;

function row(col: number, i: number, id: string, label: string, enabled: boolean, text: string, sub: string, on = false): Button {
  const x = col + 370;
  return { rect: { x, y: TOP + i * ROW_H, w: 90, h: 28 }, id, label, enabled, kind: "row", text, sub, textX: col, on };
}

/** A row for an owned item, named in its rarity colour, with its perks. */
function itemRow(col: number, i: number, id: string, owned: string, label: string, enabled: boolean): Button {
  const b = row(col, i, id, label, enabled, itemName(owned), describeItem(owned));
  b.rarity = itemDef(owned)?.rarity;
  b.item = owned;
  return b;
}

/**
 * The turning weapon preview on the shop and gear tabs: under the left
 * column, clear of every row. The 3D view draws into it; the board leaves
 * the inside clear.
 */
export const PREVIEW: Rect = { x: LEFT, y: 524, w: 460, h: 160 };
/** The part of the preview the weapon turns in; the name and make sit to its left. */
export const PREVIEW_VIEW: Rect = { x: LEFT + 190, y: 530, w: 264, h: 148 };

/** The item row under the cursor, anywhere along the row and not only on its button. */
export function hoveredItem(w: World, x: number, y: number): string | null {
  if (w.tab !== "shop" && w.tab !== "gear") return null;
  for (const b of hubButtons(w)) {
    if (!b.item) continue;
    const left = b.textX ?? b.rect.x;
    if (x >= left && x <= b.rect.x + b.rect.w && y >= b.rect.y - 4 && y <= b.rect.y + b.rect.h + 4) return b.item;
  }
  return null;
}

/**
 * What the preview shows: the last row pointed at if it is a weapon or
 * carries an ultimate, else the weapon in hand.
 */
export function previewItem(w: World): string | null {
  if (w.mode !== "select" || (w.tab !== "shop" && w.tab !== "gear") || w.dialogue) return null;
  const def = w.hoverItem ? itemDef(w.hoverItem) : undefined;
  if (w.hoverItem && (def?.weapon || def?.power)) return w.hoverItem;
  const pr = w.profile;
  const held = pr.equipped[pr.activeWeapon === 1 ? "weapon2" : "weapon"];
  return held && itemDef(held)?.weapon ? held : null;
}

/** The weapon model the preview turns, if what it shows has one. */
export function previewWeapon(w: World): string | null {
  const owned = previewItem(w);
  return owned && itemDef(owned)?.weapon ? owned : null;
}

/** The button in the preview that takes a mythic's ultimate to the practice room. */
export const ULT_BUTTON: Rect = { x: PREVIEW.x + 12, y: PREVIEW.y + 130, w: 166, h: 24 };

/** "See ultimate", when the preview shows a mythic. */
function ultButton(w: World): Button[] {
  const owned = previewItem(w);
  const power = owned ? itemDef(owned)?.power : undefined;
  return power ? [{ rect: ULT_BUTTON, id: `ult:${power}`, label: "SEE ULTIMATE", enabled: true, kind: "plain" }] : [];
}

/** How many bag items the board shows at once. */
export const BAG_PAGE = 7;

const KIND_LABEL: Record<BagKind, string> = { all: "ALL KINDS", weapon: "WEAPONS", armour: "ARMOUR", accessory: "ACCESSORIES" };
const SLOT_ORDER: Record<string, number> = { weapon: 0, armour: 1, accessory: 2 };
const WEAPON_ORDER: Record<string, number> = { dagger: 0, sword: 1, spear: 2, bow: 3, staff: 4 };

/** The bag as the board shows it: filtered and sorted, each item with its true position. */
export function bagView(w: World): { owned: string; index: number }[] {
  const tier = (o: string) => ALL_RARITIES.indexOf(itemDef(o)?.rarity ?? "common");
  const list = w.profile.inventory
    .map((owned, index) => ({ owned, index }))
    .filter(({ owned }) => {
      const def = itemDef(owned);
      if (!def) return w.bagKind === "all" && w.bagRarity === 0;
      return (w.bagKind === "all" || def.slot === w.bagKind) && tier(owned) >= w.bagRarity;
    });
  const newest = (a: { index: number }, b: { index: number }) => b.index - a.index;
  const by: Record<BagSort, (a: { owned: string; index: number }, b: { owned: string; index: number }) => number> = {
    newest,
    rarity: (a, b) => tier(b.owned) - tier(a.owned) || newest(a, b),
    name: (a, b) => itemName(a.owned).localeCompare(itemName(b.owned)) || newest(a, b),
    kind: (a, b) => {
      const da = itemDef(a.owned);
      const db = itemDef(b.owned);
      const slot = (SLOT_ORDER[da?.slot ?? ""] ?? 3) - (SLOT_ORDER[db?.slot ?? ""] ?? 3);
      const weapon = (WEAPON_ORDER[da?.weapon ?? ""] ?? 0) - (WEAPON_ORDER[db?.weapon ?? ""] ?? 0);
      return slot || weapon || tier(b.owned) - tier(a.owned) || newest(a, b);
    },
  };
  return list.sort(by[w.bagSort]);
}

/** The slice of the bag on show, with each item's true position. */
export function bagPage(w: World): { items: { owned: string; index: number }[]; page: number; pages: number; shown: number } {
  const all = bagView(w);
  const pages = Math.max(1, Math.ceil(all.length / BAG_PAGE));
  const page = Math.min(w.invPage, pages - 1);
  const items = all.slice(page * BAG_PAGE, (page + 1) * BAG_PAGE);
  return { items, page, pages, shown: all.length };
}

/**
 * Rows for the bag in the right column, each with one action, and under
 * them one strip: page back, the three filter and sort switches, page on.
 */
function bagRows(w: World, verb: string, label: (owned: string) => string, enabled: (owned: string) => boolean): Button[] {
  const { items, page, pages } = bagPage(w);
  const out = items.map(({ owned, index }, i) => itemRow(RIGHT, i, `${verb}:${index}`, owned, label(owned), enabled(owned)));
  if (w.profile.inventory.length === 0) return out;
  const y = TOP + BAG_PAGE * ROW_H + 6;
  out.push({ rect: { x: RIGHT, y, w: 44, h: 26 }, id: "page:-", label: "<", enabled: page > 0, kind: "plain" });
  const rarity = w.bagRarity === 0 ? "ANY RARITY" : `${ALL_RARITIES[w.bagRarity].toUpperCase()}+`;
  const switches: [string, string, boolean][] = [
    ["bag:kind", KIND_LABEL[w.bagKind], w.bagKind !== "all"],
    ["bag:rarity", rarity, w.bagRarity !== 0],
    ["bag:sort", `SORT ${w.bagSort.toUpperCase()}`, w.bagSort !== "newest"],
  ];
  switches.forEach(([id, text, on], i) => out.push({ rect: { x: RIGHT + 50 + i * 118, y, w: 112, h: 26 }, id, label: text, enabled: true, kind: "plain", on }));
  out.push({ rect: { x: RIGHT + 416, y, w: 44, h: 26 }, id: "page:+", label: ">", enabled: page < pages - 1, kind: "plain" });
  return out;
}

function supplyRow(w: World, id: SupplyId, i: number): Button[] {
  const pr = w.profile;
  const have = id === "potion" ? pr.potions : id === "stone" ? pr.stones : pr.bag[id];
  const def =
    id === "potion"
      ? { name: "Health Potion", about: "restores half health   [F]", price: POTION.price, max: POTION.max, rank: undefined }
      : id === "stone"
        ? { name: "Return Stone", about: "leave a gate with your loot; not sealed ones   [T]", price: STONE.price, max: STONE.max, rank: undefined }
        : { ...BAG[id], about: `${BAG[id].about}   [${id === "mana" ? "V" : "B"}]` };
  const locked = !!def.rank && RANK_IDS.indexOf(pr.hunterRank) < RANK_IDS.indexOf(def.rank);
  const full = have >= def.max;
  const label = locked ? `RANK ${def.rank}` : full ? "FULL" : `${def.price} G`;
  const buy = row(LEFT, i, `buy:${id}`, label, !locked && !full && pr.gold >= def.price, `${def.name}  (${have}/${def.max})`, def.about);
  const auto: Button = {
    rect: { x: LEFT + 470, y: TOP + i * ROW_H, w: 96, h: 28 },
    id: `auto:${id}`,
    label: pr.autoBuy[id] ? "AUTO ON" : "AUTO OFF",
    enabled: true,
    kind: "plain",
    on: pr.autoBuy[id],
  };
  return [buy, auto];
}

/** The Play button on the title screen. */
export function titleButton(): Rect {
  return { x: VIEW_W / 2 - 130, y: 400, w: 260, h: 52 };
}

/**
 * The three settings rows: effects volume, music volume, screen shake.
 * `labelX` is where the row's name starts and `ctlX` where its controls do.
 */
export function settingsButtons(w: World, labelX: number, ctlX: number, top: number): Button[] {
  const s = w.settings;
  const out: Button[] = [];
  const volumes: ["sfx" | "music", string][] = [
    ["sfx", "EFFECTS VOLUME"],
    ["music", "MUSIC VOLUME"],
  ];
  volumes.forEach(([key, name], i) => {
    const y = top + i * 40;
    const value = `${Math.round(s[key] * 100)}%`;
    out.push({ rect: { x: ctlX, y, w: 34, h: 28 }, id: `set:${key}-`, label: "-", enabled: s[key] > 0, kind: "setting", text: name, sub: value, textX: labelX });
    out.push({ rect: { x: ctlX + 110, y, w: 34, h: 28 }, id: `set:${key}+`, label: "+", enabled: s[key] < 1, kind: "plain" });
  });
  out.push({
    rect: { x: ctlX, y: top + 80, w: 144, h: 28 },
    id: "set:shake",
    label: s.shake ? "ON" : "OFF",
    enabled: true,
    kind: "setting",
    text: "SCREEN SHAKE",
    textX: labelX,
    on: s.shake,
  });
  out.push({ rect: { x: ctlX, y: top + 120, w: 144, h: 28 }, id: "set:quality", label: s.quality.toUpperCase(), enabled: true, kind: "setting", text: "GRAPHICS", textX: labelX });
  out.push({
    rect: { x: ctlX, y: top + 160, w: 144, h: 28 },
    id: "set:autoq",
    label: s.autoQuality ? "ON" : "OFF",
    enabled: true,
    kind: "setting",
    text: "LOWER IF SLOW",
    textX: labelX,
    on: s.autoQuality,
  });
  out.push({
    rect: { x: ctlX, y: top + 200, w: 144, h: 28 },
    id: "set:tips",
    label: w.profile.tips ? "ON" : "OFF",
    enabled: true,
    kind: "setting",
    text: "FIRST-GATE TIPS",
    textX: labelX,
    on: w.profile.tips,
  });
  out.push({ rect: { x: ctlX, y: top + 240, w: 144, h: 28 }, id: "set:keys", label: "CHANGE KEYS", enabled: true, kind: "setting", text: "CONTROLS", textX: labelX });
  return out;
}

export const KEYS_PANEL: Rect = { x: VIEW_W / 2 - 380, y: 50, w: 760, h: 620 };

/** The controls window: every action that can be moved, in two columns. */
export function keysButtons(w: World): Button[] {
  const p = KEYS_PANEL;
  const half = Math.ceil(BINDABLE.length / 2);
  const out: Button[] = BINDABLE.map(([action, name], i) => {
    const col = i < half ? 0 : 1;
    const x = p.x + 40 + col * 360;
    const waiting = w.rebinding === action;
    return {
      rect: { x: x + 180, y: p.y + 80 + (i % half) * 42, w: 130, h: 30 },
      id: `keys:${action}`,
      label: waiting ? "PRESS A KEY" : keyName(boundKey(w, action)),
      enabled: true,
      kind: "setting",
      text: name.toUpperCase(),
      textX: x,
      on: waiting,
    };
  });
  out.push({ rect: { x: p.x + 40, y: p.y + p.h - 60, w: 220, h: 34 }, id: "keys:reset", label: "RESET TO DEFAULT", enabled: Object.keys(w.settings.keys).length > 0, kind: "plain" });
  out.push({ rect: { x: p.x + p.w - 260, y: p.y + p.h - 60, w: 220, h: 34 }, id: "keys:close", label: "DONE", enabled: true, kind: "plain" });
  return out;
}

export const PAUSE_PANEL: Rect = { x: VIEW_W / 2 - 220, y: 60, w: 440, h: 630 };

/** Buttons of the pause menu: actions on top, settings below. */
export function pauseButtons(w: World): Button[] {
  const labels: [string, string][] = [
    ["resume", "RESUME"],
    ["save", "SAVE GAME"],
    ["exit", "SAVE AND EXIT"],
  ];
  const actions: Button[] = labels.map(([id, label], i) => ({
    rect: { x: VIEW_W / 2 - 130, y: 150 + i * 52, w: 260, h: 40 },
    id: `pause:${id}`,
    label,
    enabled: true,
    kind: "plain" as const,
  }));
  return [...actions, ...settingsButtons(w, PAUSE_PANEL.x + 40, PAUSE_PANEL.x + 256, 334)];
}

/** Section headings on the current tab, positioned to match the rows. */
export function hubHeadings(w: World): { x: number; y: number; text: string }[] {
  const y = TOP - 14;
  const view = bagPage(w);
  const total = w.profile.inventory.length;
  const count = view.shown === total ? `${total} items` : `${view.shown} of ${total} items`;
  const bag = `YOUR BAG   ·   ${count}${view.pages > 1 ? `   ·   page ${view.page + 1} of ${view.pages}` : ""}`;
  if (w.tab === "shop") return [{ x: LEFT, y, text: "TODAY'S STOCK" }, { x: RIGHT, y, text: bag }];
  if (w.tab === "supplies") {
    return [
      { x: LEFT, y, text: "SUPPLIES   ·   AUTO refills that item each time you return here" },
      { x: 760, y, text: "AUTOMATION" },
    ];
  }
  if (w.tab === "echoes") {
    const level = w.player.prog.level;
    return [{ x: LEFT, y, text: `YOUR ECHOES   ·   fighting ${activeEchoes(w.profile)} of ${echoCap(level)}   ·   boss echoes at once: ${bossEchoCap(level)}` }];
  }
  if (w.tab === "story") {
    return [
      { x: STORY.chapterX, y, text: "THE STORY" },
      { x: STORY.sceneX, y, text: "SCENES   ·   replay any you have reached" },
    ];
  }
  if (w.tab === "skills") {
    const open = SKILL_SLOTS.filter((_, i) => slotOpen(w.profile, i)).length;
    return [
      { x: SLOT_X0, y: y + 4, text: `SKILL SLOTS   ·   ${open} of ${SKILL_SLOTS.length} open   ·   pick a slot, then click a skill below to put it there` },
      { x: GROUP_X + SKILL_GROUPS.length * (GROUP_W + 10) + 10, y: GROUP_Y + 19, text: SKILL_GROUPS[w.skillPage]?.about.toUpperCase() ?? "" },
    ];
  }
  if (w.tab === "gear") {
    return [
      { x: LEFT, y, text: "EQUIPPED   ·   X swaps the weapon in hand" },
      { x: RIGHT, y, text: bag },
    ];
  }
  if (w.tab === "hunter") {
    return [
      { x: HUNTER.classX, y, text: w.profile.classUnlocked ? "CLASS   ·   H uses its power   ·   change it here at any time" : "CLASS   ·   opens with the Rite of Echoes" },
      { x: HUNTER.titleX, y, text: `TITLES   ·   ${w.profile.titles.length} of ${TITLES.length}   ·   one in use at a time` },
    ];
  }
  if (w.tab === "trials") return [{ x: LEFT, y, text: "TRIALS   ·   ways to keep climbing once the gates are behind you" }];
  if (w.tab === "bestiary") {
    const known = BEAST_ORDER.filter((k) => (w.profile.kills[k] ?? 0) > 0).length;
    return [{ x: BEAST.x, y, text: `BESTIARY   ·   ${known} of ${BEAST_ORDER.length} kinds met   ·   lore at 10 kills; +10%, +20%, +30% damage at 50, 150, 500 (bosses: a tenth)` }];
  }
  return [];
}

/**
 * Whether a click at this point is on the board's export or import button.
 * Browsers only open a file dialog from inside the click itself, so the shell
 * asks this in its click handler instead of waiting for the next step.
 */
export function fileButtonAt(w: World, x: number, y: number): "export" | "import" | null {
  if (w.mode !== "select" || w.menu !== "none" || w.dialogue || w.cutscene || w.tab !== "system") return null;
  const hit = hubButtons(w).find((b) => b.enabled && pointIn(b.rect, x, y));
  return hit?.id === "save:export" ? "export" : hit?.id === "save:import" ? "import" : null;
}

/** Where the Story tab draws: chapters on the left, scenes on the right. */
export const STORY = { chapterX: 150, sceneX: 660, top: TOP + 10, rowH: 58, sceneRow: 34, perColumn: 9, columnW: 310 };

/** Where the struck lines are listed on the Story tab, under the scenes. */
export const LINES_AT = { x: 660, y: 590 };

/** Buttons on the Story tab: replay each scene reached, and the last choice. */
function storyButtons(w: World): Button[] {
  const pr = w.profile;
  const out: Button[] = [];
  seenScenes(pr).forEach((id, i) => {
    const col = Math.floor(i / STORY.perColumn);
    const x = STORY.sceneX + col * STORY.columnW;
    out.push({
      rect: { x: x + 206, y: STORY.top + (i % STORY.perColumn) * STORY.sceneRow, w: 86, h: 26 },
      id: `scene:${id}`,
      label: "REPLAY",
      enabled: true,
      kind: "setting",
      text: CUTSCENES[id].title,
      textX: x,
    });
  });
  if (pr.nightmareUnlocked) {
    const y = STORY.top + CHAPTERS.length * STORY.rowH + 36;
    out.push({
      rect: { x: STORY.chapterX, y, w: 480, h: 36 },
      id: "nightmare",
      label: pr.nightmare ? "NIGHTMARE IS ON   ·   click to end it" : "NIGHTMARE   ·   stronger enemies, angrier bosses, double pay",
      enabled: true,
      kind: "plain",
      danger: true,
    });
  }
  if (canNewGamePlus(pr)) {
    const y = STORY.top + CHAPTERS.length * STORY.rowH + 36;
    out.push({
      rect: { x: STORY.chapterX, y, w: 480, h: 36 },
      id: "ngplus",
      label: `NEW GAME+  ${pr.cycle + 1} of ${NGPLUS.max}   ·   keep everything, face stronger gates`,
      enabled: true,
      kind: "plain",
    });
  }
  if (!pr.ending && MAIN[pr.quests.main]?.id === "m10") {
    const y = STORY.top + CHAPTERS.length * STORY.rowH + 12;
    out.push({ rect: { x: STORY.chapterX, y, w: 230, h: 40 }, id: "ending:keeper", label: "SIGN THE LEDGER", enabled: true, kind: "plain" });
    out.push({ rect: { x: STORY.chapterX + 250, y, w: 230, h: 40 }, id: "ending:unwritten", label: "BURN THE LEDGER", enabled: true, kind: "plain" });
  }
  return out;
}

/** The skills tab: slot strip on top, group pages, then the group's skills. */
const SLOT_W = 146;
const SLOT_X0 = VIEW_W / 2 - (SLOT_W * SKILL_SLOTS.length + 10 * (SKILL_SLOTS.length - 1)) / 2;
const GROUP_X = 150;
const GROUP_Y = 306;
const GROUP_W = 130;
export const SKILL_ROWS = { top: 356, rowH: 50 };

function skillButtons(w: World): Button[] {
  const pr = w.profile;
  const level = w.player.prog.level;
  const out: Button[] = [];
  // Never leave the pick on a locked slot.
  const pick = slotOpen(pr, w.slotPick) ? w.slotPick : 0;
  const pk = SKILL_SLOTS[pick].key;
  SKILL_SLOTS.forEach((slot, j) => {
    const open = slotOpen(pr, j);
    const id = pr.loadout[j];
    out.push({
      rect: { x: SLOT_X0 + j * (SLOT_W + 10), y: 248, w: SLOT_W, h: 40 },
      id: `pick:${j}`,
      label: open ? `${slot.key}  ${id ? SKILLS[id].name : "empty"}` : `${slot.key}  NG+ ${slot.cycle}`,
      enabled: open,
      kind: "plain",
      on: open && j === pick,
    });
  });
  SKILL_GROUPS.forEach((g, i) => {
    out.push({ rect: { x: GROUP_X + i * (GROUP_W + 10), y: GROUP_Y, w: GROUP_W, h: 28 }, id: `skillpage:${i}`, label: g.name, enabled: true, kind: "plain", on: w.skillPage === i });
  });
  const group = SKILL_GROUPS[w.skillPage] ?? SKILL_GROUPS[0];
  group.skills.forEach((id, i) => {
    const s = SKILLS[id];
    const open = level >= s.level;
    const rank = pr.skillRanks[id];
    const at = pr.loadout.indexOf(id);
    const label = !open ? `LEVEL ${s.level}` : at === pick ? `IN ${pk}  ·  CLEAR` : at >= 0 ? `${SKILL_SLOTS[at].key} TO ${pk}` : `SET ${pk}`;
    const echoOnly = group.name === "ECHO" && !isCaller(pr);
    out.push({
      rect: { x: 1000, y: SKILL_ROWS.top + i * SKILL_ROWS.rowH, w: 140, h: 30 },
      id: `slot:${pick}:${id}`,
      label,
      enabled: open,
      kind: "row",
      text: `${s.name}${rank > 1 ? `  ${"I".repeat(rank)}` : ""}${at >= 0 ? `   ·   on ${SKILL_SLOTS[at].key}` : ""}${echoOnly ? "   ·   Echo Caller only" : ""}`,
      sub: open ? `${s.about}   ·   ${s.mana} mana   ·   ${s.cooldown} s   ·   rank ${rank} of ${SKILL_RANK.max}` : `${s.about}   ·   unlocks at level ${s.level}`,
      textX: GROUP_X,
      on: at === pick,
    });
  });
  return out;
}

/** Where the Hunter tab draws: classes on the left, titles on the right. */
export const HUNTER = { classX: 60, classH: 66, titleX: 660, titleH: 28 };

function hunterButtons(w: World): Button[] {
  const pr = w.profile;
  const out: Button[] = [];
  CLASS_IDS.forEach((id, i) => {
    const c = CLASSES[id];
    const open = classOpen(pr, id);
    const on = pr.classUnlocked && pr.cls === id;
    out.push({
      rect: { x: HUNTER.classX + 440, y: TOP + i * HUNTER.classH, w: 110, h: 28 },
      id: `class:${id}`,
      label: on ? "IN USE" : open ? "TAKE UP" : pr.classUnlocked ? `NG+ ${c.cycle}` : "AFTER RITE",
      enabled: open && !on,
      kind: "row",
      text: `${c.name.toUpperCase()}   ·   H  ${c.power}`,
      sub: c.powerAbout,
      sub2: c.passive,
      textX: HUNTER.classX,
      on,
    });
  });
  TITLES.forEach((t, i) => {
    const have = pr.titles.includes(t.id);
    const on = pr.title === t.id;
    const b = row(HUNTER.titleX, i, `title:${t.id}`, on ? "ACTIVE" : have ? "USE" : "LOCKED", have, have ? t.name : "???", have ? describeBonus(t.bonus) : t.how, on);
    b.rect = { x: HUNTER.titleX + 440, y: TOP + i * HUNTER.titleH, w: 90, h: 24 };
    out.push(b);
  });
  return out;
}

/** Where the bestiary draws: two columns of six kinds a page, with page buttons. */
export const BEAST = { x: 60, colW: 600, top: TOP + 6, rowH: 66 };

/** The kinds on the bestiary's current page, each with its spot. */
export function beastRows(w: World): { kind: (typeof BEAST_ORDER)[number]; x: number; y: number }[] {
  const pages = Math.ceil(BEAST_ORDER.length / BEAST_PAGE);
  const page = Math.min(w.beastPage, pages - 1);
  return BEAST_ORDER.slice(page * BEAST_PAGE, (page + 1) * BEAST_PAGE).map((kind, i) => ({
    kind,
    x: BEAST.x + Math.floor(i / (BEAST_PAGE / 2)) * BEAST.colW,
    y: BEAST.top + (i % (BEAST_PAGE / 2)) * BEAST.rowH,
  }));
}

/** The Trials tab: the tower, the time trial and the boss rush. */
export const TRIALS = { top: TOP + 6, rowH: 96 };

function trialButtons(w: World): Button[] {
  const pr = w.profile;
  const rush = pr.rushBest > 0 ? `${Math.floor(pr.rushBest / 60)}:${String(pr.rushBest % 60).padStart(2, "0")}` : "none yet";
  const rows: [string, string, boolean, string, string, string, string][] = [
    ["gate:tower", "THE TOWER", towerOpen(pr), "RANK C", "Climb floor after floor until you fall or leave. Every fifth floor a master holds, and pays.", "Nothing is restocked on the way up. A Return Stone takes you out with what you found.", `Best floor ${pr.towerBest}`],
    ["gate:clock", "TIME TRIAL", towerOpen(pr), "RANK C", `The tower against a clock: ${CLOCK.start} s to start, +${CLOCK.perFloor} s a floor, +${CLOCK.perBoss} s a master's floor.`, "When the clock runs out the climb ends, and everything found is kept.", `Best floor ${pr.clockBest}   ·   floor ${CLOCK.title} earns a title`],
    ["gate:rush", "BOSS RUSH", rushOpen(pr), "END THE STORY", `Every rank's master in turn, then two at once, then three: ${RUSH.rounds.length} rounds.`, `A breath and ${RUSH.heal * 100}% health between them. ${RUSH.gold} gold and a Rank S prize at the end.`, `Best time ${rush}`],
  ];
  if (pr.marginFound) {
    rows.push(["gate:margin", "THE MARGIN", true, "", "The Redactor waits where struck lines go. The hardest fight there is.", "Stand in the circles when the page is erased; cross the line before it crosses you.", pr.titles.includes("unstruck") ? "Struck out" : "Not yet beaten"]);
  }
  return rows.map(([id, name, open, need, sub, sub2, record], i) => ({
    rect: { x: 980, y: TRIALS.top + i * TRIALS.rowH + 6, w: 150, h: 36 },
    id,
    label: open ? "ENTER" : need,
    enabled: open,
    kind: "row" as const,
    text: `${name}   ·   ${record}`,
    sub,
    sub2,
    textX: LEFT,
  }));
}

/** Every button on the gate board for the current tab. */
export function hubButtons(w: World): Button[] {
  const pr = w.profile;
  const out: Button[] = [];

  const tabs = visibleTabs(w);
  // As many tabs as there are, each as wide as the row allows, never wider than 140.
  const gap = 8;
  const tw = Math.min(140, Math.floor((VIEW_W - 60 - gap * (tabs.length - 1)) / tabs.length));
  const x0 = VIEW_W / 2 - (tw * tabs.length + gap * (tabs.length - 1)) / 2;
  tabs.forEach((tab, i) => {
    out.push({
      rect: { x: x0 + i * (tw + gap), y: 180, w: tw, h: 32 },
      id: `tab:${tab}`,
      label: tab.toUpperCase(),
      enabled: true,
      kind: "tab",
      on: w.tab === tab,
    });
  });

  if (w.tab === "gates") {
    RANK_IDS.forEach((rank, i) => {
      out.push({ rect: gateCard(i), id: `gate:${rank}`, label: rank, enabled: true, kind: "card", rank });
    });
    out.push({
      rect: { x: VIEW_W / 2 - 310, y: 556, w: 300, h: 36 },
      id: "gate:key",
      label: `KEY DUNGEON   (keys: ${pr.keys})`,
      enabled: pr.keys > 0,
      kind: "plain",
    });
    if (redGateOpen(w)) {
      out.push({
        rect: { x: VIEW_W / 2 - 310, y: 600, w: 620, h: 36 },
        id: "gate:sealed",
        label: `SEALED GATE   ·   RANK ${pr.redGate.rank}   ·   no way out, double reward, a prize   ·   today only`,
        enabled: true,
        kind: "plain",
        danger: true,
      });
    }
    if (riteOpen(pr)) {
      out.push({ rect: { x: VIEW_W / 2 + 10, y: 556, w: 300, h: 36 }, id: "gate:rite", label: "RITE OF ECHOES", enabled: true, kind: "plain", on: true });
    }
  } else if (w.tab === "shop") {
    pr.shop.stock.forEach((owned, i) => {
      const def = itemDef(owned)!;
      const have = owns(pr, def.id);
      out.push(itemRow(LEFT, i, `buy:${i}`, owned, have ? "OWNED" : `${def.price} G`, !have && pr.gold >= def.price));
    });
    const used = pr.shop.rerolls >= 1;
    out.push({
      rect: { x: LEFT, y: TOP + pr.shop.stock.length * ROW_H + 8, w: 460, h: 32 },
      id: "shop:reroll",
      label: used ? "STOCK RESET USED  ·  new stock tomorrow" : "RESET STOCK  ·  free, once a day",
      enabled: !used,
      kind: "plain",
    });
    out.push(...bagRows(w, "sell", (o) => (sellValue(o) > 0 ? `+${sellValue(o)} G` : "KEEP"), (o) => sellValue(o) > 0));
    out.push(...ultButton(w));
  } else if (w.tab === "supplies") {
    SUPPLY_IDS.forEach((id, i) => out.push(...supplyRow(w, id, i)));
    const n = SUPPLY_IDS.length;
    const cost = FLASK.cost[pr.flask.size - FLASK.start];
    const maxed = pr.flask.size >= FLASK.max;
    out.push(
      row(LEFT, n, "flask:upgrade", maxed ? "MAX" : `${cost} G`, !maxed && pr.gold >= cost, `Flask  (${pr.flask.charges}/${pr.flask.size} sips)`, `a sip restores ${FLASK.heal * 100}% health; refills free here   [B]`),
    );
    const spent = STAT_KEYS.reduce((sum, k) => sum + w.player.prog.stats[k] - BASE_STAT, 0);
    out.push(
      row(LEFT, n + 1, "buy:reset", spent > 0 ? `${RESET.price} G` : "NO NEED", spent > 0 && pr.gold >= RESET.price, "Blank Page", "refunds every spent stat point"),
    );
    // Right column: how auto-buy and auto-drink behave.
    const ax = 760;
    const cx = 1010;
    out.push({ rect: { x: cx, y: TOP, w: 34, h: 28 }, id: "floor:-", label: "-", enabled: pr.goldFloor > 0, kind: "setting", text: "KEEP AT LEAST (gold)", sub: String(pr.goldFloor), textX: ax });
    out.push({ rect: { x: cx + 110, y: TOP, w: 34, h: 28 }, id: "floor:+", label: "+", enabled: true, kind: "plain" });
    out.push({ rect: { x: cx, y: TOP + 44, w: 144, h: 28 }, id: "drink:toggle", label: pr.autoDrink.on ? "ON" : "OFF", enabled: true, kind: "setting", text: "AUTO-DRINK POTION", textX: ax, on: pr.autoDrink.on });
    out.push({ rect: { x: cx, y: TOP + 88, w: 34, h: 28 }, id: "drink:-", label: "-", enabled: pr.autoDrink.at > 0.1, kind: "setting", text: "WHEN HEALTH BELOW", sub: `${Math.round(pr.autoDrink.at * 100)}%`, textX: ax });
    out.push({ rect: { x: cx + 110, y: TOP + 88, w: 34, h: 28 }, id: "drink:+", label: "+", enabled: pr.autoDrink.at < 0.6, kind: "plain" });
  } else if (w.tab === "gear") {
    EQUIP_SLOTS.forEach((slot, i) => {
      const owned = pr.equipped[slot];
      const inHand = slot === (pr.activeWeapon === 1 ? "weapon2" : "weapon");
      const name = slot === "weapon2" ? "WEAPON 2" : slot.toUpperCase();
      const def = owned ? itemDef(owned) : undefined;
      const b = row(LEFT, i, `unequip:${slot}`, "REMOVE", !!owned, `${name}${slot.startsWith("weapon") && inHand ? " (in hand)" : ""}: ${owned ? itemName(owned) : "none"}`, owned ? describeItem(owned) : "", slot.startsWith("weapon") && inHand && !!owned);
      b.rarity = def?.rarity;
      if (owned) b.item = owned;
      out.push(b);
    });
    const other = pr.equipped[pr.activeWeapon === 1 ? "weapon" : "weapon2"];
    // Narrow, so it stays clear of the bag column beside it.
    out.push({ rect: { x: LEFT + 466, y: TOP, w: 56, h: 28 }, id: "weapon:swap", label: "SWAP", enabled: !!other, kind: "plain" });
    out.push(...ultButton(w));
    out.push(...bagRows(w, "equip", (o) => (itemDef(o)?.weapon ? WEAPONS[itemDef(o)!.weapon!].name.toUpperCase() : "EQUIP"), () => true));
  } else if (w.tab === "skills") {
    out.push(...skillButtons(w));
  } else if (w.tab === "hunter") {
    out.push(...hunterButtons(w));
  } else if (w.tab === "trials") {
    out.push(...trialButtons(w));
  } else if (w.tab === "bestiary") {
    const pages = Math.ceil(BEAST_ORDER.length / BEAST_PAGE);
    out.push({ rect: { x: BEAST.x, y: BEAST.top + 6 * BEAST.rowH + 4, w: 110, h: 28 }, id: "beast:-", label: "< PREV", enabled: w.beastPage > 0, kind: "plain" });
    out.push({ rect: { x: VIEW_W - BEAST.x - 110, y: BEAST.top + 6 * BEAST.rowH + 4, w: 110, h: 28 }, id: "beast:+", label: "NEXT >", enabled: w.beastPage < pages - 1, kind: "plain" });
  } else if (w.tab === "echoes") {
    // Two columns of ten.
    pr.echoes.forEach((e, i) => {
      const boss = KINDS[e.kind].boss;
      const col = i < 10 ? 60 : 660;
      const r = i % 10;
      const b = row(col, r, `echo:toggle:${i}`, e.active ? "FIGHTING" : "RESERVE", e.active || canActivate(w, e.kind), `${KINDS[e.kind].name} echo`, `Rank ${e.rank}${boss ? "  ·  boss" : ""}`, e.active);
      b.rect = { x: col + 330, y: TOP + r * ROW_H, w: 90, h: 28 };
      if (boss) b.rarity = "epic";
      out.push(b);
      out.push({ rect: { x: col + 430, y: TOP + r * ROW_H, w: 90, h: 28 }, id: `echo:release:${i}`, label: "RELEASE", enabled: true, kind: "plain" });
    });
  } else if (w.tab === "story") {
    out.push(...storyButtons(w));
  } else if (w.tab === "system") {
    const labels: [string, string][] = [
      ["export", "EXPORT SAVE"],
      ["import", "IMPORT SAVE"],
      ["reset", "RESET PROGRESS"],
    ];
    labels.push(["exit", "EXIT TO TITLE"]);
    labels.forEach(([id, label], i) => {
      out.push({ rect: { x: 720, y: 262 + i * 54, w: 260, h: 40 }, id: `save:${id}`, label, enabled: true, kind: "plain" });
    });
    out.push(...settingsButtons(w, 300, 500, 268));
  }
  return out;
}
