import {
  KINDS,
  PLAYER,
  RANKS,
  SKILL_IDS,
  SKILLS,
  VIEW_H,
  VIEW_W,
} from "../game/config";
import type { World } from "../game/state";
import { POTION, TITLES } from "../game/items";
import { activeQuests, MAIN, questProgress } from "../game/quests";
import { STAT_KEYS, STAT_NAMES, xpToNext, type StatKey } from "../game/stats";
import { hubButtons, hubHeadings, pointIn, STATUS_PANEL, statButton, statRowY, type Button } from "../game/ui";

/** 2D overlay drawn on top of the 3D view: bars, labels, windows. */

const BLUE = "#3aa0ff";
const CYAN = "#5ee6ff";
const GOLD = "#ffd84a";
const FONT = '"SF Mono", Menlo, Consolas, monospace';
const RANK_CSS = { E: "#3aa0ff", D: "#35e0a0", C: "#b070ff" } as const;
const RANK_KEY = { E: 1, D: 2, C: 3 } as const;

type Ctx = CanvasRenderingContext2D;
/** Sim position and height to view coordinates. */
export type Project = (x: number, y: number, height?: number) => { x: number; y: number };

/** Cursor position in view coordinates, for hover states. */
const mouse = { x: 0, y: 0 };

function panel(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(8,16,34,0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  ctx.fillStyle = "#1a2540";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function drawWorldLabels(ctx: Ctx, w: World, project: Project): void {
  for (const e of w.enemies) {
    if (e.boss || e.hp >= e.maxHp) continue;
    const s = project(e.x, e.y, e.radius * 2 + 26);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(s.x - 17, s.y - 3, 34, 5);
    ctx.fillStyle = "#ff5a60";
    ctx.fillRect(s.x - 16, s.y - 2, 32 * (e.hp / e.maxHp), 3);
  }
  ctx.textAlign = "center";
  for (const t of w.texts) {
    const s = project(t.x, t.y, 46);
    ctx.globalAlpha = Math.min(1, t.life * 3);
    ctx.font = `bold ${t.big ? 22 : 15}px ${FONT}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(4,6,11,0.8)";
    ctx.strokeText(t.text, s.x, s.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, s.x, s.y);
  }
  ctx.globalAlpha = 1;
}

function drawVitals(ctx: Ctx, w: World): void {
  const p = w.player;
  const need = xpToNext(p.prog.level);
  panel(ctx, 20, 20, 280, 112);
  ctx.textAlign = "left";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText(`LV ${p.prog.level}`, 34, 42);
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText(`HP ${p.hp} / ${p.d.maxHp}`, 96, 42);
  bar(ctx, 34, 50, 252, 10, p.hp / p.d.maxHp, p.hp / p.d.maxHp > 0.34 ? "#ff5a60" : "#ff2030");
  bar(ctx, 34, 66, 252, 6, p.mana / p.d.maxMana, "#4f7bff");
  bar(ctx, 34, 78, 252, 4, 1 - p.dashCd / PLAYER.dashCooldown, p.dashCd > 0 ? "#2f6f8f" : CYAN);
  bar(ctx, 34, 88, 252, 4, need === Infinity ? 1 : p.prog.xp / need, GOLD);
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(need === Infinity ? "MAX LEVEL" : `EXP ${p.prog.xp} / ${need}`, 34, 108);
  if (p.prog.points > 0) {
    // Pulse so unspent points are hard to miss.
    ctx.fillStyle = `rgba(255,216,74,${0.6 + 0.4 * Math.sin(performance.now() / 180)})`;
    ctx.textAlign = "right";
    ctx.fillText(`[C] ${p.prog.points} POINTS`, 286, 108);
  }
}

function drawSkills(ctx: Ctx, w: World): void {
  const p = w.player;
  const size = 58;
  const gap = 12;
  const x0 = VIEW_W / 2 - (size * 3 + gap * 2) / 2;
  const y = VIEW_H - 96;
  SKILL_IDS.forEach((id, i) => {
    const s = SKILLS[id];
    const x = x0 + i * (size + gap);
    const locked = p.prog.level < s.level;
    const cd = p.skillCd[id];
    const poor = p.mana < s.mana;
    panel(ctx, x, y, size, size);
    ctx.textAlign = "center";
    if (locked) {
      ctx.fillStyle = "#4a5f85";
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillText("LOCKED", x + size / 2, y + 28);
      ctx.font = `10px ${FONT}`;
      ctx.fillText(`LV ${s.level}`, x + size / 2, y + 44);
      return;
    }
    if (cd > 0) {
      ctx.fillStyle = "rgba(4,6,11,0.7)";
      const h = size * (cd / s.cooldown);
      ctx.fillRect(x + 1, y + size - h, size - 1, h);
    }
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = cd > 0 || poor ? "#56719c" : id === "surge" && p.surgeT > 0 ? GOLD : "#cfe4ff";
    ctx.fillText(s.key, x + size / 2, y + 28);
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = poor ? "#ff5a60" : "#6f8fbf";
    ctx.fillText(cd > 0 ? cd.toFixed(1) : s.name.toUpperCase(), x + size / 2, y + 46);
  });
}

function drawMinimap(ctx: Ctx, w: World): void {
  const d = w.dungeon;
  if (!d || d.rooms.length < 2) return;
  const cw = 26;
  const ch = 18;
  const gap = 6;
  const xs = d.rooms.map((r) => r.gx);
  const ys = d.rooms.map((r) => r.gy);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const cols = Math.max(...xs) - minX + 1;
  const rows = Math.max(...ys) - minY + 1;
  const pw = Math.max(118, cols * (cw + gap) + 22);
  const ph = rows * (ch + gap) + 44;
  const px = VIEW_W - 20 - pw;
  panel(ctx, px, 20, pw, ph);
  ctx.textAlign = "left";
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillStyle = RANK_CSS[w.rank];
  ctx.fillText(`RANK ${w.rank} GATE`, px + 12, 38);

  for (const r of d.rooms) {
    // Only rooms seen, or next to one seen, are drawn.
    const known = r.visited || Object.values(r.doors).some((id) => d.rooms[id!].visited);
    if (!known) continue;
    const x = px + 12 + (r.gx - minX) * (cw + gap);
    const y = 48 + (r.gy - minY) * (ch + gap);
    const here = r.id === w.roomId;
    ctx.fillStyle = here ? CYAN : r.kind === "boss" ? "#ff3355" : r.visited ? "#34507f" : "#182338";
    ctx.fillRect(x, y, cw, ch);
    if (r.kind === "boss" && !here) {
      ctx.fillStyle = "#04060b";
      ctx.textAlign = "center";
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillText("!", x + cw / 2, y + 13);
    }
    ctx.fillStyle = "#34507f";
    if (r.doors.e !== undefined) ctx.fillRect(x + cw, y + ch / 2 - 1, gap, 2);
    if (r.doors.s !== undefined) ctx.fillRect(x + cw / 2 - 1, y + ch, 2, gap);
  }
}

function drawBossBar(ctx: Ctx, w: World): void {
  const boss = w.enemies.find((e) => e.boss);
  if (!boss) return;
  const bw = 520;
  const x = VIEW_W / 2 - bw / 2;
  ctx.textAlign = "center";
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = "#ffd0d4";
  ctx.fillText(KINDS[boss.kind].name.toUpperCase(), VIEW_W / 2, 38);
  ctx.fillStyle = "rgba(4,6,11,0.8)";
  ctx.fillRect(x - 2, 46, bw + 4, 14);
  bar(ctx, x, 48, bw, 10, boss.hp / boss.maxHp, boss.phase === 2 ? "#ff2030" : "#ff5a60");
  // Tick at the phase change.
  ctx.fillStyle = "#04060b";
  ctx.fillRect(x + bw / 2 - 1, 48, 2, 10);
}

function drawNotices(ctx: Ctx, w: World): void {
  w.notices.forEach((n, i) => {
    const y = 130 + i * 84;
    ctx.globalAlpha = Math.min(1, n.life * 2);
    panel(ctx, VIEW_W / 2 - 250, y, 500, 70);
    ctx.textAlign = "center";
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(n.title, VIEW_W / 2, y + 28);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#cfe4ff";
    ctx.fillText(n.body, VIEW_W / 2, y + 52);
  });
  ctx.globalAlpha = 1;
}

function drawStatus(ctx: Ctx, w: World): void {
  const p = w.player;
  const s = STATUS_PANEL;
  const need = xpToNext(p.prog.level);
  ctx.fillStyle = "rgba(4,6,11,0.72)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 24;
  panel(ctx, s.x, s.y, s.w, s.h);
  ctx.shadowBlur = 0;

  const left = s.x + 36;
  const right = s.x + s.w - 36;
  ctx.textAlign = "center";
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText("STATUS", VIEW_W / 2, s.y + 44);
  ctx.strokeStyle = "rgba(58,160,255,0.4)";
  ctx.beginPath();
  ctx.moveTo(left, s.y + 60);
  ctx.lineTo(right, s.y + 60);
  ctx.stroke();

  ctx.font = `14px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText(`LEVEL  ${p.prog.level}`, left, s.y + 92);
  ctx.fillText(`RANK   E`, left, s.y + 116);
  ctx.fillText(`HP  ${p.hp} / ${p.d.maxHp}`, left + 200, s.y + 92);
  ctx.fillText(`MP  ${Math.floor(p.mana)} / ${p.d.maxMana}`, left + 200, s.y + 116);
  ctx.fillText(need === Infinity ? "EXP  MAX" : `EXP  ${p.prog.xp} / ${need}`, left, s.y + 140);

  const readouts: Record<StatKey, string> = {
    str: `${Math.round(p.d.damage)} damage`,
    agi: `${Math.round(p.d.moveSpeed)} speed`,
    vit: `${p.d.maxHp} health`,
    sen: `${Math.round(p.d.critChance * 100)}% crit`,
    int: `${p.d.maxMana} mana`,
  };
  STAT_KEYS.forEach((key, i) => {
    const y = statRowY(i);
    ctx.textAlign = "left";
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(String(i + 1), left, y);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = "#cfe4ff";
    ctx.fillText(STAT_NAMES[key], left + 20, y);
    ctx.textAlign = "right";
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(String(p.prog.stats[key]), s.x + 280, y);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(readouts[key], right, y);

    if (p.prog.points > 0) {
      const b = statButton(i);
      const hover = pointIn(b, mouse.x, mouse.y);
      ctx.fillStyle = hover ? "rgba(255,216,74,0.25)" : "rgba(58,160,255,0.12)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = hover ? GOLD : BLUE;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
      ctx.textAlign = "center";
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = hover ? GOLD : "#cfe4ff";
      ctx.fillText("+", b.x + b.w / 2, b.y + 19);
    }
  });

  ctx.textAlign = "left";
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = p.prog.points > 0 ? GOLD : "#6f8fbf";
  ctx.fillText(`AVAILABLE POINTS  ${p.prog.points}`, left, s.y + s.h - 56);
  ctx.textAlign = "center";
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(159,200,255,0.6)";
  ctx.fillText("1-5 or click [+] to spend a point   ·   C to close", VIEW_W / 2, s.y + s.h - 24);
}

/** Break text into lines no wider than `max` pixels, using the current font. */
function wrap(ctx: Ctx, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawGateCard(ctx: Ctx, w: World, b: Button, hover: boolean): void {
  const r = b.rect;
  const rank = b.rank!;
  const def = RANKS[rank];
  const over = w.player.prog.level < def.minLevel;
  ctx.shadowColor = RANK_CSS[rank];
  ctx.shadowBlur = hover ? 30 : 10;
  ctx.fillStyle = hover ? "rgba(14,26,52,0.95)" : "rgba(8,16,34,0.9)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = RANK_CSS[rank];
  ctx.lineWidth = hover ? 2.5 : 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

  const cx = r.x + r.w / 2;
  ctx.textAlign = "center";
  ctx.font = `bold 84px ${FONT}`;
  ctx.fillStyle = RANK_CSS[rank];
  ctx.fillText(rank, cx, r.y + 104);
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText(`RANK ${rank} GATE`, cx, r.y + 138);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText(`Suited to level ${def.minLevel}+`, cx, r.y + 166);
  ctx.fillText(`${def.rooms} rooms`, cx, r.y + 186);
  ctx.fillText(def.kinds.map((k) => KINDS[k].name).join(" · "), cx, r.y + 206);
  if (over) {
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = "#ff5a60";
    ctx.fillText("DANGER: ABOVE YOUR LEVEL", cx, r.y + 238);
  }
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(`press ${RANK_KEY[rank]} or click`, cx, r.y + r.h - 16);
}

function drawButton(ctx: Ctx, w: World, b: Button): void {
  const r = b.rect;
  const hover = b.enabled && pointIn(r, mouse.x, mouse.y);
  if (b.kind === "card") return drawGateCard(ctx, w, b, hover);

  if (b.kind === "row" && b.text !== undefined) {
    ctx.textAlign = "left";
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = b.on ? GOLD : "#cfe4ff";
    ctx.fillText(b.text, b.textX!, r.y + 13);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(b.sub ?? "", b.textX!, r.y + 27);
  }

  const edge = b.on ? GOLD : !b.enabled ? "#2a3a5c" : hover ? GOLD : BLUE;
  ctx.fillStyle = b.on ? "rgba(255,216,74,0.14)" : hover ? "rgba(255,216,74,0.2)" : "rgba(8,16,34,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  ctx.textAlign = "center";
  ctx.font = `bold ${b.kind === "row" ? 11 : 13}px ${FONT}`;
  ctx.fillStyle = b.on ? GOLD : !b.enabled ? "#4a5f85" : hover ? GOLD : "#cfe4ff";
  ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 4.5);
}

function drawQuests(ctx: Ctx, w: World): void {
  const q = w.profile.quests;
  const x = 240;
  let y = 262;
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(`MAIN QUEST  ${Math.min(q.main + 1, MAIN.length)} / ${MAIN.length}`, x, y - 22);
  const open = activeQuests(q);
  if (open.length === 0) {
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = "#cfe4ff";
    ctx.fillText("Every quest is complete.", x, y + 10);
    return;
  }
  open.forEach((def, i) => {
    const main = MAIN.includes(def);
    if (!main && (i === 0 || MAIN.includes(open[i - 1]))) {
      y += 8;
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillStyle = "#6f8fbf";
      ctx.fillText("SIDE QUESTS", x, y);
      y += 22;
    }
    const got = questProgress(q, def);
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = main ? GOLD : "#cfe4ff";
    ctx.fillText(def.title, x, y);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#9fc8ff";
    ctx.fillText(def.desc, x, y + 19);
    const r = def.reward;
    const reward = [`${r.gold} gold`, r.potions ? `${r.potions} potion${r.potions > 1 ? "s" : ""}` : "", r.points ? `${r.points} stat points` : ""]
      .filter(Boolean)
      .join(", ");
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`Reward: ${reward}`, x, y + 37);
    bar(ctx, x + 520, y - 8, 200, 8, got / def.goal, main ? GOLD : BLUE);
    ctx.textAlign = "right";
    ctx.fillStyle = "#cfe4ff";
    ctx.fillText(`${got} / ${def.goal}`, x + 800, y);
    ctx.textAlign = "left";
    y += 68;
  });
}

function drawDialogue(ctx: Ctx, w: World): void {
  const d = w.dialogue;
  if (!d) return;
  const line = d.lines[d.i];
  ctx.fillStyle = "rgba(4,6,11,0.78)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const x = VIEW_W / 2 - 400;
  const y = VIEW_H - 250;
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 20;
  panel(ctx, x, y, 800, 180);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  const system = line.speaker === "THE LEDGER";
  if (line.speaker) {
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = system ? CYAN : GOLD;
    ctx.fillText(line.speaker, x + 30, y + 36);
  }
  ctx.font = `${system ? "bold " : ""}16px ${FONT}`;
  ctx.fillStyle = system ? CYAN : "#cfe4ff";
  wrap(ctx, line.text, 740).forEach((t, i) => ctx.fillText(t, x + 30, y + (line.speaker ? 68 : 52) + i * 24));
  ctx.textAlign = "right";
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(`${d.i + 1} / ${d.lines.length}   ·   SPACE continue   ·   ESC skip`, x + 770, y + 164);
}

function drawHub(ctx: Ctx, w: World): void {
  const pr = w.profile;
  ctx.fillStyle = "rgba(4,6,11,0.6)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 22;
  ctx.fillText("GATEBOUND", VIEW_W / 2, 104);
  ctx.shadowBlur = 0;
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = GOLD;
  const title = TITLES.find((t) => t.id === pr.title);
  ctx.fillText(
    `${pr.gold} GOLD   ·   POTIONS ${pr.potions}/${POTION.max}${title ? `   ·   ${title.name.toUpperCase()}` : ""}`,
    VIEW_W / 2,
    146,
  );

  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  for (const h of hubHeadings(w)) ctx.fillText(h.text, h.x, h.y);
  for (const b of hubButtons(w)) drawButton(ctx, w, b);

  ctx.textAlign = "center";
  if (w.tab === "quests") drawQuests(ctx, w);
  if (w.tab === "system") {
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#9fc8ff";
    ctx.fillText("Progress is saved in this browser after every gate and every change here.", VIEW_W / 2, 244);
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`Gates cleared: ${pr.gatesCleared}   ·   Kills this session: ${w.kills}`, VIEW_W / 2, 480);
  }
  if ((w.tab === "shop" || w.tab === "gear") && pr.inventory.length === 0) {
    ctx.textAlign = "left";
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#4a5f85";
    ctx.fillText("Nothing in your bag.", 680, 268);
  }
  ctx.textAlign = "center";
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(159,200,255,0.6)";
  ctx.fillText("Q / E  switch tab   ·   C  status and stat points", VIEW_W / 2, VIEW_H - 40);
}

function drawPurse(ctx: Ctx, w: World): void {
  panel(ctx, 20, 140, 280, 30);
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(`GOLD ${w.profile.gold}${w.run.gold > 0 ? `  +${w.run.gold}` : ""}`, 34, 160);
  ctx.textAlign = "right";
  ctx.fillStyle = w.profile.potions > 0 ? "#6dff9c" : "#4a5f85";
  ctx.fillText(`[F] POTION x${w.profile.potions}`, 286, 160);
}

function drawEnd(ctx: Ctx, w: World): void {
  const dead = w.mode === "dead";
  const lines = w.run.summary;
  const h = 170 + lines.length * 24;
  const top = VIEW_H / 2 - h / 2;
  ctx.fillStyle = "rgba(4,6,11,0.72)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, VIEW_W / 2 - 260, top, 520, h);
  ctx.textAlign = "center";
  ctx.fillStyle = dead ? "#ff5a60" : GOLD;
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText(dead ? "YOU DIED" : "GATE CLEARED", VIEW_W / 2, top + 58);
  ctx.fillStyle = "#9fc8ff";
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`Rank ${w.rank} gate   ·   level ${w.player.prog.level}`, VIEW_W / 2, top + 86);
  ctx.font = `15px ${FONT}`;
  lines.forEach((t, i) => {
    ctx.fillStyle = dead ? "#ffb0b4" : "#cfe4ff";
    ctx.fillText(t, VIEW_W / 2, top + 122 + i * 24);
  });
  ctx.fillStyle = "#6f8fbf";
  ctx.font = `13px ${FONT}`;
  ctx.fillText("Press Enter to return to the gate board", VIEW_W / 2, top + h - 24);
}

export function drawHud(ctx: Ctx, w: World, mouseX: number, mouseY: number, project: Project): void {
  mouse.x = mouseX;
  mouse.y = mouseY;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (w.mode === "select") {
    drawHub(ctx, w);
    drawVitals(ctx, w);
  } else {
    drawWorldLabels(ctx, w, project);
    drawVitals(ctx, w);
    drawPurse(ctx, w);
    drawSkills(ctx, w);
    drawMinimap(ctx, w);
    drawBossBar(ctx, w);
    ctx.textAlign = "center";
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "rgba(159,200,255,0.55)";
    ctx.fillText("WASD move  ·  MOUSE aim  ·  CLICK attack  ·  SPACE dash  ·  Q E R skills  ·  F potion  ·  C status", VIEW_W / 2, VIEW_H - 14);
  }
  drawNotices(ctx, w);
  if (w.menu === "status") drawStatus(ctx, w);
  if (w.mode === "dead" || w.mode === "cleared") drawEnd(ctx, w);
  if (w.mode === "select" && w.menu === "none") drawDialogue(ctx, w);
}
