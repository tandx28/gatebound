import { bossEchoCap, echoCap, KINDS, RANK_IDS, RESET, SKILL_IDS, SKILL_RANK, SKILL_SLOTS, SKILLS, VIEW_H, VIEW_W, type Rank } from "./config";
import {
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
import { activeEchoes, canActivate, owns, riteOpen } from "./profile";
import { MAIN } from "./quests";
import { CHAPTERS } from "./story";
import { visibleTabs, type World } from "./state";
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
  textX?: number;
  /** Highlighted: the current tab, an active title. */
  on?: boolean;
  /** Item rarity, which colours the row's name. */
  rarity?: Rarity;
  rank?: Rank;
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
  return b;
}

/** How many bag items the board shows at once. */
export const BAG_PAGE = 7;

/** The slice of the bag on show, with each item's true position. */
export function bagPage(w: World): { items: { owned: string; index: number }[]; page: number; pages: number } {
  const all = w.profile.inventory;
  const pages = Math.max(1, Math.ceil(all.length / BAG_PAGE));
  const page = Math.min(w.invPage, pages - 1);
  const items = all.slice(page * BAG_PAGE, (page + 1) * BAG_PAGE).map((owned, i) => ({ owned, index: page * BAG_PAGE + i }));
  return { items, page, pages };
}

/** Rows for the bag in the right column, each with one action, and page buttons below. */
function bagRows(w: World, verb: string, label: (owned: string) => string, enabled: (owned: string) => boolean): Button[] {
  const { items, page, pages } = bagPage(w);
  const out = items.map(({ owned, index }, i) => itemRow(RIGHT, i, `${verb}:${index}`, owned, label(owned), enabled(owned)));
  if (pages > 1) {
    const y = TOP + BAG_PAGE * ROW_H + 6;
    out.push({ rect: { x: RIGHT, y, w: 90, h: 26 }, id: "page:-", label: "< PREV", enabled: page > 0, kind: "plain" });
    out.push({ rect: { x: RIGHT + 370, y, w: 90, h: 26 }, id: "page:+", label: "NEXT >", enabled: page < pages - 1, kind: "plain" });
  }
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
  return out;
}

export const PAUSE_PANEL: Rect = { x: VIEW_W / 2 - 220, y: 80, w: 440, h: 560 };

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
  const bag = `YOUR BAG   ·   ${w.profile.inventory.length} items${bagPage(w).pages > 1 ? `   ·   page ${bagPage(w).page + 1} of ${bagPage(w).pages}` : ""}`;
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
    return [{ x: LEFT, y, text: "SKILLS   ·   click a slot to put a skill in it; click it again to clear it" }];
  }
  if (w.tab === "gear") {
    return [
      { x: LEFT, y, text: "EQUIPPED   ·   X swaps the weapon in hand" },
      { x: LEFT, y: y + 5 * ROW_H, text: "TITLES" },
      { x: RIGHT, y, text: bag },
    ];
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
export const STORY = { chapterX: 150, sceneX: 700, top: TOP + 10, rowH: 58 };

/** Buttons on the Story tab: replay each scene reached, and the last choice. */
function storyButtons(w: World): Button[] {
  const pr = w.profile;
  const out: Button[] = [];
  seenScenes(pr).forEach((id, i) => {
    out.push({
      rect: { x: STORY.sceneX + 330, y: STORY.top + i * 40, w: 90, h: 28 },
      id: `scene:${id}`,
      label: "REPLAY",
      enabled: true,
      kind: "setting",
      text: CUTSCENES[id].title,
      textX: STORY.sceneX,
    });
  });
  if (!pr.ending && MAIN[pr.quests.main]?.id === "m10") {
    const y = STORY.top + CHAPTERS.length * STORY.rowH + 12;
    out.push({ rect: { x: STORY.chapterX, y, w: 230, h: 40 }, id: "ending:keeper", label: "SIGN THE LEDGER", enabled: true, kind: "plain" });
    out.push({ rect: { x: STORY.chapterX + 250, y, w: 230, h: 40 }, id: "ending:unwritten", label: "BURN THE LEDGER", enabled: true, kind: "plain" });
  }
  return out;
}

/** Every button on the gate board for the current tab. */
export function hubButtons(w: World): Button[] {
  const pr = w.profile;
  const out: Button[] = [];

  const tabs = visibleTabs(w);
  // Nine tabs only fit if each is a little narrower.
  const tw = tabs.length > 8 ? 124 : 140;
  const gap = 10;
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
      out.push(b);
    });
    const other = pr.equipped[pr.activeWeapon === 1 ? "weapon" : "weapon2"];
    // Narrow, so it stays clear of the bag column beside it.
    out.push({ rect: { x: LEFT + 466, y: TOP, w: 56, h: 28 }, id: "weapon:swap", label: "SWAP", enabled: !!other, kind: "plain" });
    TITLES.forEach((t, i) => {
      const have = pr.titles.includes(t.id);
      const on = pr.title === t.id;
      out.push(row(LEFT, 5 + i, `title:${t.id}`, on ? "ACTIVE" : have ? "USE" : "LOCKED", have, have ? t.name : "???", have ? describeBonus(t.bonus) : t.how, on));
    });
    out.push(...bagRows(w, "equip", (o) => (itemDef(o)?.weapon ? WEAPONS[itemDef(o)!.weapon!].name.toUpperCase() : "EQUIP"), () => true));
  } else if (w.tab === "skills") {
    const level = w.player.prog.level;
    SKILL_IDS.forEach((id, i) => {
      const s = SKILLS[id];
      const open = level >= s.level;
      const rank = pr.skillRanks[id];
      const y = TOP + i * 52;
      SKILL_SLOTS.forEach((slot, j) => {
        const b: Button = {
          rect: { x: LEFT + 560 + j * 76, y, w: 66, h: 30 },
          id: `slot:${j}:${id}`,
          label: slot.key,
          enabled: open,
          kind: j === 0 ? "row" : "plain",
          on: pr.loadout[j] === id,
        };
        if (j === 0) {
          b.text = `${s.name}${rank > 1 ? `  ${"I".repeat(rank)}` : ""}`;
          b.sub = open ? `${s.about}  ·  ${s.mana} mana  ·  rank ${rank} of ${SKILL_RANK.max}` : `Unlocks at level ${s.level}`;
          b.textX = LEFT;
        }
        out.push(b);
      });
    });
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
