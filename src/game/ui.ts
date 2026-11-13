import { RANK_IDS, VIEW_H, VIEW_W, type Rank } from "./config";
import { describeBonus, ITEMS, POTION, sellValue, SHOP_STOCK, SLOTS, TITLES } from "./items";
import { HUB_TABS, type World } from "./state";

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
  kind: "tab" | "card" | "row" | "plain";
  text?: string;
  sub?: string;
  textX?: number;
  /** Highlighted: the current tab, an active title. */
  on?: boolean;
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

/** Section headings on the current tab, positioned to match the rows. */
export function hubHeadings(w: World): { x: number; y: number; text: string }[] {
  const y = TOP - 14;
  if (w.tab === "shop") return [{ x: LEFT, y, text: "FOR SALE" }, { x: RIGHT, y, text: "YOUR ITEMS" }];
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

  const tw = 150;
  const gap = 10;
  const x0 = VIEW_W / 2 - (tw * HUB_TABS.length + gap * (HUB_TABS.length - 1)) / 2;
  HUB_TABS.forEach((tab, i) => {
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
  } else if (w.tab === "shop") {
    SHOP_STOCK.forEach((id, i) => {
      const item = ITEMS[id];
      const owned = pr.inventory.includes(id) || SLOTS.some((s) => pr.equipped[s] === id);
      out.push(row(LEFT, i, `buy:${id}`, owned ? "OWNED" : `${item.price} G`, !owned && pr.gold >= item.price, item.name, describeBonus(item.bonus)));
    });
    const full = pr.potions >= POTION.max;
    out.push(
      row(LEFT, SHOP_STOCK.length, "buy:potion", full ? "FULL" : `${POTION.price} G`, !full && pr.gold >= POTION.price, `Health Potion  (${pr.potions}/${POTION.max})`, "restores half health"),
    );
    pr.inventory.forEach((id, i) => {
      out.push(row(RIGHT, i, `sell:${id}`, `+${sellValue(id)} G`, true, ITEMS[id].name, describeBonus(ITEMS[id].bonus)));
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
      out.push(row(RIGHT, i, `equip:${id}`, "EQUIP", true, ITEMS[id].name, describeBonus(ITEMS[id].bonus)));
    });
  } else if (w.tab === "system") {
    const labels: [string, string][] = [
      ["export", "EXPORT SAVE"],
      ["import", "IMPORT SAVE"],
      ["reset", "RESET PROGRESS"],
    ];
    labels.forEach(([id, label], i) => {
      out.push({ rect: { x: VIEW_W / 2 - 130, y: 270 + i * 62, w: 260, h: 44 }, id: `save:${id}`, label, enabled: true, kind: "plain" });
    });
  }
  return out;
}
