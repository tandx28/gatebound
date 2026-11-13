import { echoCap, KINDS, RANK_IDS, RESET, VIEW_H, VIEW_W, type Rank } from "./config";
import { describeBonus, ITEMS, POTION, sellValue, SLOTS, STONE, TITLES, type Rarity } from "./items";
import { activeEchoes, canActivate, riteOpen } from "./profile";
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

/** Gate card `i` on the gate board. */
export function gateCard(i: number): Rect {
  const w = 260;
  const gap = 40;
  const x0 = VIEW_W / 2 - (w * 3 + gap * 2) / 2;
  return { x: x0 + i * (w + gap), y: 236, w, h: 290 };
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

/** A row for an item, named in its rarity colour. */
function itemRow(col: number, i: number, id: string, itemId: string, label: string, enabled: boolean): Button {
  const item = ITEMS[itemId];
  const b = row(col, i, id, label, enabled, item.name, `${item.rarity}  ·  ${describeBonus(item.bonus)}`);
  b.rarity = item.rarity;
  return b;
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
  return out;
}

export const PAUSE_PANEL: Rect = { x: VIEW_W / 2 - 220, y: 130, w: 440, h: 460 };

/** Buttons of the pause menu: actions on top, settings below. */
export function pauseButtons(w: World): Button[] {
  const labels: [string, string][] = [
    ["resume", "RESUME"],
    ["save", "SAVE GAME"],
    ["exit", "SAVE AND EXIT"],
  ];
  const actions: Button[] = labels.map(([id, label], i) => ({
    rect: { x: VIEW_W / 2 - 130, y: 200 + i * 52, w: 260, h: 40 },
    id: `pause:${id}`,
    label,
    enabled: true,
    kind: "plain" as const,
  }));
  return [...actions, ...settingsButtons(w, PAUSE_PANEL.x + 40, PAUSE_PANEL.x + 256, 384)];
}

/** Section headings on the current tab, positioned to match the rows. */
export function hubHeadings(w: World): { x: number; y: number; text: string }[] {
  const y = TOP - 14;
  if (w.tab === "shop") return [{ x: LEFT, y, text: "TODAY'S STOCK" }, { x: RIGHT, y, text: "YOUR ITEMS" }];
  if (w.tab === "echoes") {
    return [{ x: LEFT, y, text: `YOUR ECHOES   ·   fighting ${activeEchoes(w.profile)} of ${echoCap(w.player.prog.level)}   ·   only one boss echo at a time` }];
  }
  if (w.tab === "gear") {
    return [
      { x: LEFT, y, text: "EQUIPPED" },
      { x: LEFT, y: y + 4 * ROW_H, text: "TITLES" },
      { x: RIGHT, y, text: "YOUR ITEMS" },
    ];
  }
  return [];
}

/** Every button on the gate board for the current tab. */
export function hubButtons(w: World): Button[] {
  const pr = w.profile;
  const out: Button[] = [];

  const tabs = visibleTabs(w);
  const tw = 150;
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
      rect: { x: VIEW_W / 2 - 150, y: 542, w: 300, h: 36 },
      id: "gate:key",
      label: `KEY DUNGEON   (keys: ${pr.keys})`,
      enabled: pr.keys > 0,
      kind: "plain",
    });
    if (riteOpen(pr)) {
      out.push({ rect: { x: VIEW_W / 2 - 150, y: 586, w: 300, h: 36 }, id: "gate:rite", label: "RITE OF ECHOES", enabled: true, kind: "plain", on: true });
    }
  } else if (w.tab === "shop") {
    pr.shop.stock.forEach((id, i) => {
      const owned = pr.inventory.includes(id) || SLOTS.some((s) => pr.equipped[s] === id);
      out.push(itemRow(LEFT, i, `buy:${id}`, id, owned ? "OWNED" : `${ITEMS[id].price} G`, !owned && pr.gold >= ITEMS[id].price));
    });
    const n = pr.shop.stock.length;
    const full = pr.potions >= POTION.max;
    out.push(
      row(LEFT, n, "buy:potion", full ? "FULL" : `${POTION.price} G`, !full && pr.gold >= POTION.price, `Health Potion  (${pr.potions}/${POTION.max})`, "restores half health"),
    );
    const stoned = pr.stones >= STONE.max;
    out.push(
      row(LEFT, n + 1, "buy:stone", stoned ? "FULL" : `${STONE.price} G`, !stoned && pr.gold >= STONE.price, `Return Stone  (${pr.stones}/${STONE.max})`, "leave a gate with your loot; fails in sealed gates"),
    );
    const spent = STAT_KEYS.reduce((sum, k) => sum + w.player.prog.stats[k] - BASE_STAT, 0);
    out.push(
      row(LEFT, n + 2, "buy:reset", spent > 0 ? `${RESET.price} G` : "NO NEED", spent > 0 && pr.gold >= RESET.price, "Blank Page", "refunds every spent stat point"),
    );
    const used = pr.shop.rerolls >= 1;
    out.push({
      rect: { x: LEFT, y: TOP + (n + 3) * ROW_H + 8, w: 460, h: 32 },
      id: "shop:reroll",
      label: used ? "STOCK RESET USED  ·  new stock tomorrow" : "RESET STOCK  ·  free, once a day",
      enabled: !used,
      kind: "plain",
    });
    pr.inventory.forEach((id, i) => {
      out.push(itemRow(RIGHT, i, `sell:${id}`, id, `+${sellValue(id)} G`, true));
    });
  } else if (w.tab === "gear") {
    SLOTS.forEach((slot, i) => {
      const id = pr.equipped[slot];
      out.push(
        row(LEFT, i, `unequip:${slot}`, "REMOVE", !!id, `${slot.toUpperCase()}: ${id ? ITEMS[id].name : "none"}`, id ? describeBonus(ITEMS[id].bonus) : ""),
      );
    });
    TITLES.forEach((t, i) => {
      const have = pr.titles.includes(t.id);
      const on = pr.title === t.id;
      out.push(row(LEFT, 4 + i, `title:${t.id}`, on ? "ACTIVE" : have ? "USE" : "LOCKED", have, have ? t.name : "???", have ? describeBonus(t.bonus) : t.how, on));
    });
    pr.inventory.forEach((id, i) => {
      out.push(itemRow(RIGHT, i, `equip:${id}`, id, "EQUIP", true));
    });
  } else if (w.tab === "echoes") {
    pr.echoes.forEach((e, i) => {
      const boss = KINDS[e.kind].boss;
      const b = row(LEFT, i, `echo:toggle:${i}`, e.active ? "FIGHTING" : "RESERVE", e.active || canActivate(w, e.kind), `${KINDS[e.kind].name} echo`, `Rank ${e.rank}${boss ? "  ·  boss" : ""}`, e.active);
      if (boss) b.rarity = "epic";
      out.push(b);
      out.push({ rect: { x: LEFT + 470, y: TOP + i * ROW_H, w: 90, h: 28 }, id: `echo:release:${i}`, label: "RELEASE", enabled: true, kind: "plain" });
    });
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
