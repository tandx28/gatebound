import { VIEW_H, VIEW_W } from "./config";

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
  return { x: x0 + i * (w + gap), y: 210, w, h: 300 };
}
