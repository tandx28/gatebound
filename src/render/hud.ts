import {
  BREAK,
  CLASSES,
  CLOCK,
  dailyGoals,
  NGPLUS,
  ECHO,
  KINDS,
  ORDER_TEXT,
  PENALTY,
  PLAYER,
  RANKS,
  PHASES,
  RITE,
  RUSH,
  ULT,
  SKILL_SLOTS,
  STATUS,
  SKILLS,
  VIEW_H,
  VIEW_W,
} from "../game/config";
import type { Rank } from "../game/config";
import { isCaller, type World } from "../game/state";
import { LEAVABLE, NOTICES_SHOWN } from "../game/world";
import { FURY, itemDef, itemName, MYTHICS, POTION, POWERS, STONE, TITLES, ULTIMATES, WEAPONS, type Rarity } from "../game/items";
import { BELT, beltCount, boundKey, keyName, slotOpen, STING, STRUCK_LINES, tutorialTip, ultimateOf } from "../game/profile";
import { huntBonus, huntTier, LORE, tierKills } from "../game/bestiary";
import { CUT, CUTSCENES, SKIP_HOLD } from "../game/cutscenes";
import { activeQuests, MAIN, questProgress } from "../game/quests";
import { CHAPTERS } from "../game/story";
import { STAT_KEYS, STAT_NAMES, xpToNext, type StatKey } from "../game/stats";
import {
  bagPage,
  hubButtons,
  hubHeadings,
  BEAST,
  beastRows,
  LINES_AT,
  HUNTER,
  KEYS_PANEL,
  keysButtons,
  PREVIEW,
  PREVIEW_VIEW,
  previewItem,
  PAUSE_PANEL,
  pauseButtons,
  pointIn,
  STATUS_PANEL,
  statButton,
  statRowY,
  STORY,
  titleButton,
  type Button,
} from "../game/ui";

/** 2D overlay drawn on top of the 3D view: bars, labels, windows. */

const BLUE = "#3aa0ff";
const CYAN = "#5ee6ff";
const GOLD = "#ffd84a";
/** Sealed gates, and nothing else. */
const RED = "#ff3355";
const FONT = '"SF Mono", Menlo, Consolas, monospace';
const RANK_CSS: Record<Rank, string> = { E: "#3aa0ff", D: "#35e0a0", C: "#b070ff", B: "#ff9a3c", A: "#ff4f6a", S: "#ffe9a0" };
const RANK_KEY: Record<Rank, number> = { E: 1, D: 2, C: 3, B: 4, A: 5, S: 6 };
/** The game's name as it is shown on the title screen and the board. */
const GAME_NAME = "UNTITLED LEVELLING GAME";

const RARITY_CSS: Record<Rarity, string> = {
  common: "#cfd8e6",
  uncommon: "#6dff9c",
  rare: "#5aa8ff",
  epic: "#c58bff",
  legendary: "#ffb347",
  mythic: "#ff5a8a",
};

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
  // Remnants: a prompt to bind, with the time and tries left.
  ctx.textAlign = "center";
  for (const r of w.remnants) {
    const s = project(r.x, r.y, 40);
    const near = Math.hypot(r.x - w.player.x, r.y - w.player.y) <= ECHO.bindRange;
    ctx.globalAlpha = Math.min(1, r.life);
    ctx.font = `bold ${near ? 14 : 11}px ${FONT}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(4,6,11,0.8)";
    const label = near ? `[G] BIND${r.tries > 1 ? `  (${r.tries} tries)` : ""}` : "remnant";
    ctx.strokeText(label, s.x, s.y);
    ctx.fillStyle = near ? "#d8ccff" : "#8a6cff";
    ctx.fillText(label, s.x, s.y);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  for (const t of w.texts) {
    const s = project(t.x, t.y, 46);
    ctx.globalAlpha = Math.min(1, t.life * 3);
    // Bigger hits make bigger numbers; a crit pops in large and settles.
    const n = Number(t.text);
    const weight = Number.isFinite(n) && n > 0 ? Math.min(12, Math.log10(n) * 3.2) : 0;
    const pop = t.big ? 1 + Math.max(0, t.life - 0.6) * 1.2 : 1;
    ctx.font = `bold ${Math.round(((t.big ? 20 : 13) + weight) * pop)}px ${FONT}`;
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
    ctx.fillText(`[C] ${p.prog.points} POINT${p.prog.points > 1 ? "S" : ""}`, 286, 108);
  }
}

/** Ailments on the player, as small labelled chips by the health panel. */
function drawAilments(ctx: Ctx, w: World): void {
  const a = w.player.ail;
  const chips: [string, string][] = [];
  if (a.poison > 0) chips.push([`POISON x${a.poison}`, "#8fe04a"]);
  if (a.burnT > 0) chips.push(["BURN", "#ff8a3c"]);
  if (a.slowT > 0) chips.push([`SLOW -${Math.round((1 - STATUS.slow.speed) * 100)}%`, "#40e0ff"]);
  if (w.turnedT > 0) chips.push(["ECHOES TURNED", "#ff5a60"]);
  if (a.immune > 0) chips.push([`WARDED ${Math.ceil(a.immune)}s`, "#c8e060"]);
  if (w.player.furyT > 0) chips.push([`FURY +${Math.round((FURY.damage - 1) * 100)}%  ${Math.ceil(w.player.furyT)}s`, "#ff8a3c"]);
  if (w.wardReady) chips.push(["MANTLE READY", GOLD]);
  // Under the purse, clear of the boss bar.
  let x = 20;
  ctx.textAlign = "left";
  ctx.font = `bold 11px ${FONT}`;
  for (const [label, color] of chips) {
    const cw = ctx.measureText(label).width + 16;
    ctx.fillStyle = "rgba(4,6,11,0.8)";
    ctx.fillRect(x, 234, cw, 22);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, 234.5, cw, 22);
    ctx.fillStyle = color;
    ctx.fillText(label, x + 8, 249);
    x += cw + 8;
  }
}

function drawSkills(ctx: Ctx, w: World): void {
  const p = w.player;
  const size = 58;
  const gap = 12;
  // Only the open slots, then the class power on H once there is a class.
  const open = w.profile.loadout.map((id, i) => ({ id, i })).filter(({ i }) => slotOpen(w.profile, i));
  const power = w.profile.classUnlocked;
  const ult = w.practice?.power ?? ultimateOf(w.profile);
  const count = open.length + (power ? 1 : 0) + (ult ? 1 : 0);
  if (ult) {
    // The mythic's ultimate on Y: rose-red, and burning when ready.
    const x = VIEW_W / 2 + (size * count + gap * (count - 1)) / 2 - size;
    const yy = VIEW_H - 96;
    panel(ctx, x, yy, size, size);
    const cd = w.player.ultCd;
    if (cd > 0) {
      ctx.fillStyle = "rgba(4,6,11,0.7)";
      const h = size * Math.min(1, cd / ULT.charge);
      ctx.fillRect(x + 1, yy + size - h, size - 1, h);
    } else {
      ctx.strokeStyle = `rgba(255,90,122,${0.5 + 0.5 * Math.sin(performance.now() / 160)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, yy + 1.5, size - 2, size - 2);
    }
    ctx.textAlign = "center";
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = cd > 0 ? "#56719c" : "#ff8fa3";
    ctx.fillText(keyName(boundKey(w, "KeyY")), x + size / 2, yy + 28);
    ctx.font = `9px ${FONT}`;
    ctx.fillStyle = "#c07088";
    ctx.fillText(cd > 0 ? `${Math.ceil(cd)} s` : "ULTIMATE", x + size / 2, yy + 46);
  }
  const x0 = VIEW_W / 2 - (size * count + gap * (count - 1)) / 2;
  const y = VIEW_H - 96;
  if (power) {
    const x = x0 + open.length * (size + gap);
    const c = CLASSES[w.profile.cls];
    panel(ctx, x, y, size, size);
    const cd = w.armyCd;
    if (cd > 0) {
      ctx.fillStyle = "rgba(4,6,11,0.7)";
      const h = size * Math.min(1, cd / c.cooldown);
      ctx.fillRect(x + 1, y + size - h, size - 1, h);
    }
    const lit = w.player.bulwarkT > 0 || w.player.overflowT > 0 || w.legionT > 0;
    ctx.textAlign = "center";
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = cd > 0 ? "#56719c" : lit ? GOLD : "#b9a4ff";
    ctx.fillText(keyName(boundKey(w, "KeyH")), x + size / 2, y + 28);
    // The power's whole name, shrunk to fit the box like the skills' names.
    const label = cd > 0 ? cd.toFixed(1) : c.power.toUpperCase();
    ctx.font = `10px ${FONT}`;
    if (ctx.measureText(label).width > size - 6) ctx.font = `${Math.max(6, Math.floor((10 * (size - 6)) / ctx.measureText(label).width))}px ${FONT}`;
    ctx.fillStyle = "#8f80c8";
    ctx.fillText(label, x + size / 2, y + 46);
  }
  open.forEach(({ id, i }, n) => {
    const x = x0 + n * (size + gap);
    panel(ctx, x, y, size, size);
    ctx.textAlign = "center";
    if (!id) {
      ctx.fillStyle = "#34507f";
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText(SKILL_SLOTS[i].key, x + size / 2, y + 28);
      ctx.font = `10px ${FONT}`;
      ctx.fillText("EMPTY", x + size / 2, y + 44);
      return;
    }
    const s = SKILLS[id];
    const locked = p.prog.level < s.level;
    const cd = p.skillCd[id];
    const poor = p.mana < s.mana;
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
      const h = size * Math.min(1, cd / s.cooldown);
      ctx.fillRect(x + 1, y + size - h, size - 1, h);
    }
    const lit = (id === "surge" && p.surgeT > 0) || (id === "rally" && w.rallyT > 0) || (id === "domain" && w.domainT > 0);
    ctx.font = `bold ${SKILL_SLOTS[i].key.length > 1 ? 14 : 20}px ${FONT}`;
    ctx.fillStyle = cd > 0 || poor ? "#56719c" : lit ? GOLD : "#cfe4ff";
    ctx.fillText(SKILL_SLOTS[i].key, x + size / 2, y + 28);
    // Skill rank, raised by skill books.
    const rank = w.profile.skillRanks[id];
    if (rank > 1) {
      ctx.textAlign = "right";
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillStyle = GOLD;
      ctx.fillText(rank === 2 ? "II" : "III", x + size - 5, y + 13);
      ctx.textAlign = "center";
    }
    const label = cd > 0 ? cd.toFixed(1) : s.name.toUpperCase();
    // Long names shrink to fit the box rather than spill into the next one.
    ctx.font = `10px ${FONT}`;
    if (ctx.measureText(label).width > size - 6) ctx.font = `${Math.max(6, Math.floor((10 * (size - 6)) / ctx.measureText(label).width))}px ${FONT}`;
    ctx.fillStyle = poor ? "#ff5a60" : "#6f8fbf";
    ctx.fillText(label, x + size / 2, y + 46);
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
  // A tick at each phase change.
  ctx.fillStyle = "#04060b";
  const phases = PHASES[boss.kind] ?? 2;
  for (let i = 1; i < phases; i++) ctx.fillRect(x + (bw * i) / phases - 1, 48, 2, 10);
  if (boss.guard > 0) {
    ctx.textAlign = "center";
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillStyle = "#d0d8e8";
    ctx.fillText("GUARD UP: break it", VIEW_W / 2, 72);
  }
}

function drawNotices(ctx: Ctx, w: World): void {
  w.notices.slice(0, NOTICES_SHOWN).forEach((n, i) => {
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
  // Two columns that never meet: who the hunter is on the left, the gauges on the right.
  const col = s.x + 290;
  ctx.fillText(`LEVEL  ${p.prog.level}`, left, s.y + 92);
  ctx.fillText(`RANK   ${w.profile.hunterRank}`, left, s.y + 116);
  ctx.fillText(`CLASS  ${w.profile.classUnlocked ? CLASSES[w.profile.cls].name.toUpperCase() : "NONE YET"}`, left, s.y + 140);
  ctx.fillText(`HP   ${p.hp} / ${p.d.maxHp}`, col, s.y + 92);
  ctx.fillText(`MP   ${Math.floor(p.mana)} / ${p.d.maxMana}`, col, s.y + 116);
  ctx.fillText(need === Infinity ? "EXP  MAX" : `EXP  ${p.prog.xp} / ${need}`, col, s.y + 140);

  const readouts: Record<StatKey, string> = {
    str: `${Math.round(p.d.damage)} damage`,
    agi: `${Math.round(p.d.moveSpeed)} speed`,
    vit: `${p.d.maxHp} health`,
    // Past the cap, the spill shows as crit damage.
    sen: `${Math.round(p.d.critChance * 100)}% crit  x${p.d.critMult.toFixed(2)}`,
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
  ctx.shadowBlur = hover ? 26 : 8;
  ctx.fillStyle = hover ? "rgba(14,26,52,0.95)" : "rgba(8,16,34,0.9)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = RANK_CSS[rank];
  ctx.lineWidth = hover ? 2.5 : 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);

  // The rank letter on the left, the details beside it.
  ctx.textAlign = "center";
  ctx.font = `bold 72px ${FONT}`;
  ctx.fillStyle = RANK_CSS[rank];
  ctx.fillText(rank, r.x + 52, r.y + 96);
  const x = r.x + 104;
  ctx.textAlign = "left";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText(`RANK ${rank} GATE`, x, r.y + 30);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText(`Level ${def.minLevel}+   ·   ${def.rooms} rooms`, x, r.y + 52);
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  // Two names to a line, so long ones stay inside the card.
  const names = [...new Set(def.kinds.map((k) => KINDS[k].name))];
  for (let i = 0; i < names.length; i += 2) ctx.fillText(names.slice(i, i + 2).join(" · "), x, r.y + 72 + (i / 2) * 14);
  if (over) {
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = "#ff5a60";
    ctx.fillText("ABOVE YOUR LEVEL", x, r.y + 118);
  }
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(`press ${RANK_KEY[rank]} or click`, x, r.y + r.h - 12);
}

function drawButton(ctx: Ctx, w: World, b: Button): void {
  const r = b.rect;
  const hover = b.enabled && pointIn(r, mouse.x, mouse.y);
  if (b.kind === "card") return drawGateCard(ctx, w, b, hover);

  if (b.kind === "setting") {
    // A settings row: its name on the left, its value between - and +.
    ctx.textAlign = "left";
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#9fc8ff";
    ctx.fillText(b.text ?? "", b.textX!, r.y + 19);
    if (b.sub) {
      ctx.textAlign = "center";
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = "#cfe4ff";
      ctx.fillText(b.sub, r.x + 72, r.y + 19);
    }
  }

  if (b.kind === "row" && b.text !== undefined) {
    ctx.textAlign = "left";
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = b.on ? GOLD : b.rarity ? RARITY_CSS[b.rarity] : "#cfe4ff";
    // Long names and descriptions are cut off at the button, never drawn under it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.textX!, r.y - 4, r.x - b.textX! - 10, b.sub2 ? 56 : 40);
    ctx.clip();
    ctx.fillText(b.text, b.textX!, r.y + 13);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(b.sub ?? "", b.textX!, r.y + 27);
    if (b.sub2) {
      ctx.fillStyle = "#4f6a94";
      ctx.fillText(b.sub2, b.textX!, r.y + 42);
    }
    ctx.restore();
  }

  const edge = b.danger ? RED : b.on ? GOLD : !b.enabled ? "#2a3a5c" : hover ? GOLD : BLUE;
  ctx.fillStyle = b.danger ? `rgba(255,51,85,${hover ? 0.3 : 0.14})` : b.on ? "rgba(255,216,74,0.14)" : hover ? "rgba(255,216,74,0.2)" : "rgba(8,16,34,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  ctx.textAlign = "center";
  ctx.font = `bold ${b.kind === "row" ? 11 : 13}px ${FONT}`;
  ctx.fillStyle = b.danger ? "#ff8a9c" : b.on ? GOLD : !b.enabled ? "#4a5f85" : hover ? GOLD : "#cfe4ff";
  ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 4.5);
}

function drawQuests(ctx: Ctx, w: World): void {
  const q = w.profile.quests;
  const x = 240;
  let y = 262;

  // Daily quest: three goals, all needed, reset at midnight.
  const d = w.profile.daily;
  if (d.day > 0) {
    ctx.textAlign = "left";
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = d.done ? "#6dff9c" : CYAN;
    ctx.fillText(d.done ? "DAILY QUEST  ·  COMPLETE" : "DAILY QUEST  ·  miss it and the penalty zone follows", x, y - 22);
    const goal = dailyGoals(w.profile.hunterRank);
    const goals: [string, number, number][] = [
      ["Kill enemies", d.kills, goal.kills],
      ["Clear rooms", d.rooms, goal.rooms],
      [goal.gates > 1 ? "Clear gates" : "Clear a gate", d.gates, goal.gates],
    ];
    goals.forEach(([label, got, goal], i) => {
      const gx = x + i * 270;
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = "#9fc8ff";
      ctx.fillText(`${label}  ${Math.min(got, goal)} / ${goal}`, gx, y);
      bar(ctx, gx, y + 7, 230, 5, got / goal, d.done ? "#6dff9c" : CYAN);
    });
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`Reward: ${goal.points} stat points, potions refilled`, x, y + 32);
    y += 78;
  }
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
    const some = (n: number | undefined, word: string) => (n ? `${n} ${word}${n > 1 ? "s" : ""}` : "");
    const reward = [`${r.gold} gold`, some(r.potions, "potion"), some(r.points, "stat point"), some(r.keys, "key")]
      .filter(Boolean)
      .join(", ");
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`Reward: ${reward}`, x, y + 37);
    bar(ctx, x + 520, y - 8, 200, 8, got / def.goal, main ? GOLD : BLUE);
    ctx.textAlign = "right";
    ctx.fillStyle = "#cfe4ff";
    ctx.fillText(`${got} / ${def.goal}`, x + 800, y);
    ctx.textAlign = "left";
    y += 62;
  });
}

/** The Story tab: six chapters, where the player stands in them, and how it ended. */
function drawStory(ctx: Ctx, w: World): void {
  const pr = w.profile;
  const at = pr.quests.main;
  const x = STORY.chapterX;
  ctx.textAlign = "left";
  CHAPTERS.forEach((ch, i) => {
    const y = STORY.top + i * STORY.rowH;
    const index = ch.quests.map((id) => MAIN.findIndex((q) => q.id === id));
    const done = index.every((n) => n < at);
    const current = !done && index.some((n) => n === at);
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`CHAPTER ${i + 1}`, x, y + 6);
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = current ? GOLD : done ? "#cfe4ff" : "#4a5f85";
    ctx.fillText(done || current ? ch.title : "· · ·", x + 96, y + 7);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = done ? "#6dff9c" : current ? "#9fc8ff" : "#4a5f85";
    const step = MAIN[at];
    const line = done ? "Complete" : current ? `${step.title}:  ${step.desc}` : "Not yet reached";
    // Kept clear of the scene list beside it.
    ctx.fillText(wrap(ctx, line, STORY.sceneX - x - 120)[0], x + 96, y + 27);
  });
  const y = STORY.top + CHAPTERS.length * STORY.rowH + 12;
  ctx.font = `13px ${FONT}`;
  if (pr.ending) {
    ctx.fillStyle = GOLD;
    ctx.fillText(pr.ending === "keeper" ? "You signed the last page. You are the Keeper." : "You burnt the last page. You are Unwritten.", x, y + 14);
  } else if (MAIN[at]?.id === "m10") {
    ctx.fillStyle = "#ff9a9a";
    ctx.fillText("One page remains. The choice cannot be undone.", x + 500, y + 25);
  }
}

/** The ultimate showcase: between black bars, the ultimate's name and what it does. */
function drawShowcase(ctx: Ctx, w: World): void {
  const show = w.practice!;
  const ult = ULTIMATES[show.power];
  const top = 64;
  const bottom = 130;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, VIEW_W, top);
  ctx.fillRect(0, VIEW_H - bottom, VIEW_W, bottom);
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText("ULTIMATE", 40, 38);
  ctx.textAlign = "right";
  ctx.font = `11px ${FONT}`;
  ctx.fillText("SPACE / ENTER / click  back to the board", VIEW_W - 40, 38);
  // The name fades in, then the line under it.
  const k = Math.min(1, show.age / 0.6);
  ctx.textAlign = "center";
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = `rgba(255,216,74,${k})`;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 14 * k;
  ctx.fillText(ult.name.toUpperCase(), VIEW_W / 2, VIEW_H - bottom + 48);
  ctx.shadowBlur = 0;
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = `rgba(207,228,255,${Math.min(1, Math.max(0, (show.age - 0.4) / 0.6))})`;
  ctx.fillText(ult.about, VIEW_W / 2, VIEW_H - bottom + 80);
}

/** A cutscene: the stage between two black bars, with the line being spoken below. */
function drawCutscene(ctx: Ctx, w: World): void {
  const cs = w.cutscene!;
  const scene = CUTSCENES[cs.id];
  const beat = scene.beats[cs.beat];
  const top = 64;
  const bottom = 150;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, VIEW_W, top);
  ctx.fillRect(0, VIEW_H - bottom, VIEW_W, bottom);
  if (cs.flash > 0) {
    ctx.fillStyle = `rgba(220,240,255,${(cs.flash / CUT.flash) * 0.85})`;
    ctx.fillRect(0, top, VIEW_W, VIEW_H - top - bottom);
  }

  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(`CHAPTER ${scene.chapter}   ·   ${scene.title.toUpperCase()}`, 40, 38);
  ctx.textAlign = "right";
  ctx.font = `11px ${FONT}`;
  ctx.fillText("SPACE  next   ·   hold ESC  skip", VIEW_W - 40, 38);
  if (cs.hold > 0) bar(ctx, VIEW_W - 250, 46, 210, 4, cs.hold / SKIP_HOLD, GOLD);

  const system = beat.speaker === "THE LEDGER";
  const y = VIEW_H - bottom + 40;
  ctx.textAlign = "center";
  if (beat.speaker) {
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = system ? CYAN : GOLD;
    ctx.fillText(beat.speaker.toUpperCase(), VIEW_W / 2, y);
  }
  ctx.font = `${system ? "bold " : ""}17px ${FONT}`;
  ctx.fillStyle = system ? CYAN : "#e6efff";
  wrap(ctx, beat.text, 980).forEach((t, i) => ctx.fillText(t, VIEW_W / 2, y + (beat.speaker ? 30 : 12) + i * 25));
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
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 22;
  ctx.fillText(GAME_NAME, VIEW_W / 2 + 140, 72);
  ctx.shadowBlur = 0;
  drawPurseStrip(ctx, w);

  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  for (const h of hubHeadings(w)) ctx.fillText(h.text, h.x, h.y);
  // The preview's panel first, so its own button is drawn on top of it.
  if (w.tab === "shop" || w.tab === "gear") drawPreview(ctx, w);
  for (const b of hubButtons(w)) drawButton(ctx, w, b);

  ctx.textAlign = "center";
  if (w.tab === "quests") drawQuests(ctx, w);
  if (w.tab === "story") {
    drawStory(ctx, w);
    drawLines(ctx, w);
  }
  if (w.tab === "bestiary") drawBestiary(ctx, w);
  if (w.tab === "system") {
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#9fc8ff";
    ctx.fillText("Progress is saved in this browser after every gate and every change here.", VIEW_W / 2, 244);
    ctx.textAlign = "left";
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText("SETTINGS", 300, 258);
    ctx.textAlign = "center";
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`Gates cleared: ${pr.gatesCleared}   ·   Kills this session: ${w.kills}`, VIEW_W / 2, 590);
  }
  if (w.tab === "hunter") {
    // What New Game+ has opened so far, under the classes.
    const y = 250 + 4 * HUNTER.classH + 18;
    const open = SKILL_SLOTS.filter((_, i) => slotOpen(pr, i)).length;
    const lines = [
      `NEW GAME+   ·   cycle ${pr.cycle} of ${NGPLUS.max}`,
      `Skill slots open: ${open} of ${SKILL_SLOTS.length}. Each New Game+ opens one more (keys 1, 2, 3).`,
      `The Arcanist opens at New Game+ 1. Each cycle grants its own title.`,
      `Enemies +${Math.round(NGPLUS.harder * pr.cycle * 100)}%   ·   gold and experience +${Math.round(NGPLUS.reward * pr.cycle * 100)}%`,
    ];
    ctx.textAlign = "left";
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? `bold 12px ${FONT}` : `12px ${FONT}`;
      ctx.fillStyle = i === 0 ? "#6f8fbf" : "#9fc8ff";
      ctx.fillText(line, HUNTER.classX, y + i * 20);
    });
    if (pr.classUnlocked && pr.cls !== "echo" && pr.echoes.length > 0) {
      ctx.fillStyle = "#8f80c8";
      ctx.fillText(`Your ${pr.echoes.length} echoes rest until you are an Echo Caller again.`, HUNTER.classX, y + lines.length * 20);
    }
  }
  if (w.tab === "echoes" && pr.echoes.length === 0) {
    ctx.textAlign = "left";
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#4a5f85";
    ctx.fillText("No echoes yet. In a gate, stand by a fallen enemy's remnant and press G.", 150, 268);
  }
  if (w.tab === "gear") {
    // The eight mythics: what each does once earned, how to earn it until then.
    ctx.textAlign = "left";
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`MYTHICS   ·   ${pr.mythics.length} of ${MYTHICS.length} earned`, 680, 552);
    ctx.font = `11px ${FONT}`;
    MYTHICS.forEach((m, i) => {
      const have = pr.mythics.includes(m.id);
      ctx.fillStyle = have ? RARITY_CSS.mythic : "#4a5f85";
      // Below the bag's page buttons, and above the footer.
      ctx.fillText(have ? `${itemName(m.id)}:  ${POWERS[m.id]}` : `???   ${m.how}`, 680, 568 + i * 14);
    });
  }
  if ((w.tab === "shop" || w.tab === "gear") && bagPage(w).shown === 0) {
    ctx.textAlign = "left";
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#4a5f85";
    ctx.fillText(pr.inventory.length === 0 ? "Nothing in your bag." : "Nothing in your bag matches. Change the filters below.", 680, 268);
  }
  ctx.textAlign = "center";
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(159,200,255,0.6)";
  ctx.fillText("Q / E  switch tab   ·   C  status and stat points", VIEW_W / 2, VIEW_H - 24);
}

/**
 * The frame round the turning weapon, with its name and make. The 3D view
 * draws the weapon itself; the inside of its box is left clear for it.
 */
function drawPreview(ctx: Ctx, w: World): void {
  const owned = previewItem(w);
  const r = PREVIEW;
  ctx.fillStyle = "rgba(6,10,20,0.85)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "rgba(94,230,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.textAlign = "left";
  const textW = PREVIEW_VIEW.x - r.x - 16;
  if (!owned) {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#4a5f85";
    ctx.fillText("Point at a weapon", r.x + 12, r.y + 28);
    ctx.fillText("to see it here.", r.x + 12, r.y + 46);
    return;
  }
  const def = itemDef(owned);
  if (def?.weapon) ctx.clearRect(PREVIEW_VIEW.x, PREVIEW_VIEW.y, PREVIEW_VIEW.w, PREVIEW_VIEW.h);
  // A long name steps down in size until it fits beside the weapon.
  let size = 15;
  ctx.font = `bold ${size}px ${FONT}`;
  while (size > 10 && ctx.measureText(itemName(owned)).width > textW) {
    size -= 1;
    ctx.font = `bold ${size}px ${FONT}`;
  }
  ctx.fillStyle = def ? RARITY_CSS[def.rarity] : "#cfe4ff";
  ctx.fillText(itemName(owned), r.x + 12, r.y + 26);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#9fc8ff";
  const kind = def?.weapon ? WEAPONS[def.weapon].name : def?.slot ?? "";
  if (def) ctx.fillText(`${def.rarity.toUpperCase()}  ${kind.toUpperCase()}`, r.x + 12, r.y + 46);
  const pr = w.profile;
  const inHand = owned === pr.equipped[pr.activeWeapon === 1 ? "weapon2" : "weapon"];
  if (def?.power) {
    // A mythic: its ultimate, named and described, beside or instead of the model.
    const ult = ULTIMATES[def.power];
    const wide = def.weapon ? textW : r.w - 24;
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(`Y  ${ult.name.toUpperCase()}`, r.x + 12, r.y + 68);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = "#cfe4ff";
    wrap(ctx, ult.about, wide).slice(0, def.weapon ? 4 : 3).forEach((line, i) => ctx.fillText(line, r.x + 12, r.y + 84 + i * 13));
    return;
  }
  ctx.fillStyle = "#6f8fbf";
  if (inHand && w.hoverItem !== owned) ctx.fillText("in your hand", r.x + 12, r.y + 68);
}

/**
 * The board's resource strip: one boxed cell per thing held, label above
 * value, laid out to the right of the vitals panel so the two never touch.
 */
function drawPurseStrip(ctx: Ctx, w: World): void {
  const pr = w.profile;
  const title = TITLES.find((t) => t.id === pr.title);
  const cells: [string, string, number][] = [
    ["GOLD", pr.gold.toLocaleString("en-US"), 1.3],
    ["POTIONS", `${pr.potions} / ${POTION.max}`, 1],
    ["FLASK", `${pr.flask.charges} / ${pr.flask.size}`, 1],
    ["STONES", `${pr.stones} / ${STONE.max}`, 1],
    ["KEYS", String(pr.keys), 0.8],
    ["TITLE", title ? title.name : "none", 1.9],
  ];
  const x0 = 320;
  const y = 96;
  const h = 44;
  const total = VIEW_W - 20 - x0;
  const weight = cells.reduce((n, c) => n + c[2], 0);
  panel(ctx, x0, y, total, h);
  let x = x0;
  cells.forEach(([label, value, share], i) => {
    const cw = (total * share) / weight;
    if (i > 0) {
      ctx.strokeStyle = "rgba(58,160,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + 8);
      ctx.lineTo(x + 0.5, y + h - 8);
      ctx.stroke();
    }
    ctx.textAlign = "left";
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(label, x + 14, y + 17);
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = label === "TITLE" ? "#cfe4ff" : GOLD;
    // Clip to the cell so a long title never runs into its neighbour.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 10, y, cw - 16, h);
    ctx.clip();
    ctx.fillText(value, x + 14, y + 35);
    ctx.restore();
    x += cw;
  });
}

/** A special gate's title card, for a scene already seen: it slides in, holds, and fades. */
function drawSting(ctx: Ctx, w: World): void {
  const s = w.sting!;
  const age = STING - s.t;
  const a = Math.min(1, age * 4, s.t * 2);
  const slide = (1 - Math.min(1, age * 4)) * 60;
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(4,6,11,0.75)";
  ctx.fillRect(0, 250, VIEW_W, 96);
  ctx.fillStyle = s.title.includes("SEALED") || s.title.includes("EMERGENCY") ? RED : GOLD;
  ctx.fillRect(0, 250, VIEW_W, 2);
  ctx.fillRect(0, 344, VIEW_W, 2);
  ctx.textAlign = "center";
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText(s.title, VIEW_W / 2 + slide, 300);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText(s.sub, VIEW_W / 2 - slide, 328);
  ctx.globalAlpha = 1;
}

/** The bestiary: each kind met, its kills, the damage bonus earned, and its lore once known. */
function drawBestiary(ctx: Ctx, w: World): void {
  const pr = w.profile;
  ctx.textAlign = "left";
  for (const { kind, x, y } of beastRows(w)) {
    const n = pr.kills[kind] ?? 0;
    const need = tierKills(kind);
    const tier = huntTier(pr, kind);
    panel(ctx, x, y, BEAST.colW - 20, BEAST.rowH - 8);
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = n === 0 ? "#4a5f85" : KINDS[kind].boss ? RARITY_CSS.epic : "#cfe4ff";
    ctx.fillText(n === 0 ? "· · ·" : KINDS[kind].name, x + 12, y + 20);
    ctx.textAlign = "right";
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = tier > 0 ? GOLD : "#6f8fbf";
    const next = need.tiers.find((t) => n < t);
    ctx.fillText(`${n} kills${tier > 0 ? `   ·   +${Math.round(huntBonus(pr, kind) * 100)}% damage` : ""}${next ? `   ·   next at ${next}` : "   ·   mastered"}`, x + BEAST.colW - 34, y + 20);
    ctx.textAlign = "left";
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = n >= need.lore ? "#9fc8ff" : "#4a5f85";
    const lore = n >= need.lore ? LORE[kind] : n > 0 ? `Kill ${need.lore - n} more to learn what it is.` : "Not yet met.";
    ctx.fillText(wrap(ctx, lore, BEAST.colW - 50)[0], x + 12, y + 40);
    // A bar toward the next tier.
    const from = tier > 0 ? need.tiers[tier - 1] : 0;
    bar(ctx, x + 12, y + 47, BEAST.colW - 46, 3, next ? (n - from) / (next - from) : 1, tier >= 3 ? GOLD : BLUE);
  }
}

/** The struck lines on the Story tab: what each found line says, and what is still missing. */
function drawLines(ctx: Ctx, w: World): void {
  const pr = w.profile;
  if (!pr.ending && pr.cycle === 0 && pr.lines.length === 0) return;
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(`STRUCK LINES   ·   ${pr.lines.length} of ${STRUCK_LINES.length}   ·   pages of the Ledger someone crossed out`, LINES_AT.x, LINES_AT.y);
  STRUCK_LINES.forEach((line, i) => {
    const have = pr.lines.includes(i);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = have ? "#e8e8f0" : "#4a5f85";
    const text = have ? `${line.glyph}  ${line.text}` : `?  ${line.how}`;
    ctx.fillText(wrap(ctx, text, VIEW_W - LINES_AT.x - 30)[0], LINES_AT.x, LINES_AT.y + 20 + i * 18);
  });
}

function drawPurse(ctx: Ctx, w: World): void {
  const pr = w.profile;
  const p = w.player;
  panel(ctx, 20, 140, 280, 86);
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(`GOLD ${pr.gold}${w.run.gold > 0 && !w.run.settled ? `  +${w.run.gold}` : ""}`, 34, 159);
  if (w.run.keys > 0) ctx.fillText(`KEY +${w.run.keys}`, 34, 178);
  ctx.textAlign = "right";
  ctx.fillStyle = pr.potions > 0 ? "#6dff9c" : "#4a5f85";
  ctx.fillText(`[F] POTION x${pr.potions}`, 286, 159);
  // The stone is greyed out where it cannot work.
  const dead = w.sealed || !LEAVABLE.has(w.gateKind);
  ctx.fillStyle = w.bossDead || w.remnantHold ? GOLD : pr.stones > 0 && !dead ? "#9fc8ff" : "#4a5f85";
  ctx.fillText(w.bossDead || w.remnantHold ? "[T] LEAVE GATE" : `[T] STONE x${pr.stones}`, 286, 178);

  // The belt: mana on V, and whichever other item B is set to.
  ctx.textAlign = "left";
  ctx.fillStyle = pr.bag.mana > 0 ? "#4f7bff" : "#4a5f85";
  ctx.fillText(`[V] MANA x${pr.bag.mana}`, 34, 197);
  const id = BELT[w.belt % BELT.length];
  const n = beltCount(pr, id);
  const name = { flask: "FLASK", greater: "GREATER", fury: "FURY", antidote: "ANTIDOTE" }[id];
  ctx.textAlign = "right";
  ctx.fillStyle = n > 0 ? "#6dff9c" : "#4a5f85";
  ctx.fillText(`[B] ${name} x${n}  [Z]`, 286, 197);

  // The weapon in hand, and the one X would swap to.
  const other = pr.equipped[pr.activeWeapon === 1 ? "weapon" : "weapon2"];
  ctx.textAlign = "left";
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText((p.weapon ? WEAPONS[p.weapon].name : "Bare hands").toUpperCase(), 34, 216);
  if (other) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#6f8fbf";
    ctx.fillText(`[X] ${WEAPONS[itemDef(other)!.weapon ?? "dagger"].name.toUpperCase()}`, 286, 216);
  }
}

/** Timers and warnings for the gate in progress, under the boss bar. */
function drawAlerts(ctx: Ctx, w: World): void {
  const clock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.ceil(Math.max(0, t)) % 60).padStart(2, "0")}`;
  let y = 74;
  const banner = (text: string, frac: number, color: string) => {
    const bw = 420;
    const x = VIEW_W / 2 - bw / 2;
    ctx.fillStyle = "rgba(4,6,11,0.8)";
    ctx.fillRect(x, y, bw, 30);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, bw, 30);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, y, bw * Math.max(0, Math.min(1, frac)), 30);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(text, VIEW_W / 2, y + 20);
    y += 36;
  };
  if (w.gateKind === "rite" && w.mode === "gate") {
    banner(`RITE OF ECHOES   ·   wave ${Math.min(w.riteWave + 1, RITE.waves.length)} of ${RITE.waves.length}`, (w.riteWave + 1) / RITE.waves.length, "#b9a4ff");
  }
  if (w.gateKind === "tower") {
    ctx.textAlign = "center";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(`THE TOWER   ·   FLOOR ${w.towerFloor}   ·   BEST ${w.profile.towerBest}`, VIEW_W / 2, 92);
  }
  if (w.gateKind === "clock" && w.mode === "gate") {
    banner(`TIME TRIAL   ·   FLOOR ${w.towerFloor}   ·   BEST ${w.profile.clockBest}   ·   ${clock(w.clockT)}`, Math.min(1, w.clockT / CLOCK.start), w.clockT < 15 ? "#ff5a60" : GOLD);
  }
  if (w.gateKind === "rush" && w.mode === "gate") {
    ctx.textAlign = "center";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText(`BOSS RUSH   ·   ${w.rushIdx + 1} OF ${RUSH.rounds.length}   ·   ${clock(w.rushTime)}`, VIEW_W / 2, 92);
  }
  if (w.breakT > 0) banner(`GATE BREAK   ·   hold the line   ${clock(w.breakT)}`, w.breakT / BREAK.time, "#ff8a3c");
  if (w.penaltyT > 0) banner(`PENALTY ZONE   ·   survive   ${clock(w.penaltyT)}`, w.penaltyT / PENALTY.time, "#ff5a60");
  if (w.emergency) banner(`EMERGENCY QUEST   ·   kill them all   ${clock(w.emergency.t)}`, w.emergency.t / w.emergency.total, GOLD);
  if (w.profile.nightmare) {
    ctx.textAlign = "right";
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = "#c070ff";
    ctx.fillText("NIGHTMARE", VIEW_W - 20, VIEW_H - 58);
  }
  if (w.sealed) {
    // The whole screen is edged in red for as long as the gate holds you.
    const pulse = 0.2 + 0.06 * Math.sin(performance.now() / 400);
    const edge = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    edge.addColorStop(0, "rgba(255,51,85,0)");
    edge.addColorStop(1, `rgba(255,51,85,${pulse})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "right";
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = RED;
    ctx.fillText("SEALED GATE  ·  NO RETREAT  ·  COLD", VIEW_W - 20, VIEW_H - 40);
  }
}

/** The controls window. */
function drawKeys(ctx: Ctx, w: World): void {
  const p = KEYS_PANEL;
  ctx.fillStyle = "rgba(4,6,11,0.82)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 24;
  panel(ctx, p.x, p.y, p.w, p.h);
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText("CONTROLS", VIEW_W / 2, p.y + 42);
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText(w.rebinding ? "Press the new key.   ESC cancels." : "Click an action, then press the key it should be on. Mouse buttons stay as they are.", VIEW_W / 2, p.y + 62);
  for (const b of keysButtons(w)) drawButton(ctx, w, b);
}

/** A new hunter's first gate: one plain tip at a time, under the notices. */
function drawTip(ctx: Ctx, w: World): void {
  const tip = tutorialTip(w);
  if (!tip) return;
  ctx.font = `14px ${FONT}`;
  const lines = wrap(ctx, tip, 760);
  const h = 30 + lines.length * 20;
  const x = VIEW_W / 2 - 400;
  const y = VIEW_H - 150 - h;
  ctx.fillStyle = "rgba(8,16,34,0.85)";
  ctx.fillRect(x, y, 800, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, 800, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#e6efff";
  lines.forEach((t, i) => ctx.fillText(t, VIEW_W / 2, y + 26 + i * 20));
}

function drawPause(ctx: Ctx, w: World): void {
  const p = PAUSE_PANEL;
  ctx.fillStyle = "rgba(4,6,11,0.78)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 24;
  panel(ctx, p.x, p.y, p.w, p.h);
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText("PAUSED", VIEW_W / 2, p.y + 44);
  for (const b of pauseButtons(w)) drawButton(ctx, w, b);
  ctx.textAlign = "center";
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText("A saved gate resumes from the start of the current room.", VIEW_W / 2, p.y + p.h - 34);
  ctx.fillText("ESC  resume", VIEW_W / 2, p.y + p.h - 16);
}

function drawTitle(ctx: Ctx, w: World): void {
  ctx.fillStyle = "rgba(4,6,11,0.82)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.font = `bold 58px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 36;
  ctx.fillText(GAME_NAME, VIEW_W / 2, 270);
  ctx.shadowBlur = 0;
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText("Your name has been entered in the Ledger.", VIEW_W / 2, 316);

  const r = titleButton();
  const hover = pointIn(r, mouse.x, mouse.y);
  const fresh = !w.profile.introSeen;
  ctx.fillStyle = hover ? "rgba(255,216,74,0.2)" : "rgba(8,16,34,0.9)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = hover ? GOLD : BLUE;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillStyle = hover ? GOLD : "#cfe4ff";
  ctx.fillText(fresh ? "NEW GAME" : "CONTINUE", r.x + r.w / 2, r.y + 33);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  const where = w.afterTitle === "gate" && w.dungeon ? `Rank ${w.rank} gate in progress` : "At the gate board";
  if (!fresh) ctx.fillText(`Level ${w.player.prog.level}   ·   ${w.profile.gold} gold   ·   ${where}`, VIEW_W / 2, 486);
  ctx.fillText("ENTER or click to play   ·   close the tab to quit: progress is saved", VIEW_W / 2, VIEW_H - 40);
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
  const heading = dead
    ? "YOU DIED"
    : w.run.retreated
      ? "RETURNED"
      : w.gateKind === "penalty"
        ? "PENALTY SERVED"
        : w.gateKind === "key"
          ? "DUNGEON CLEARED"
          : w.gateKind === "rite"
            ? "RITE COMPLETE"
            : w.gateKind === "break"
              ? "BREAK CONTAINED"
              : "GATE CLEARED";
  ctx.fillText(heading, VIEW_W / 2, top + 58);
  ctx.fillStyle = "#9fc8ff";
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`Rank ${w.rank}${w.sealed ? " sealed" : ""} gate   ·   level ${w.player.prog.level}`, VIEW_W / 2, top + 86);
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

  if (w.mode === "title") return drawTitle(ctx, w);
  if (w.cutscene) return drawCutscene(ctx, w);
  if (w.practice && w.mode === "gate") return drawShowcase(ctx, w);

  if (w.mode === "select") {
    drawHub(ctx, w);
    drawVitals(ctx, w);
  } else {
    // Darkness at the edges of every gate: the light does not reach far.
    const gloom = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.98);
    gloom.addColorStop(0, "rgba(2,3,8,0)");
    gloom.addColorStop(1, "rgba(2,3,8,0.62)");
    ctx.fillStyle = gloom;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawWorldLabels(ctx, w, project);
    drawVitals(ctx, w);
    drawAilments(ctx, w);
    drawPurse(ctx, w);
    drawSkills(ctx, w);
    drawMinimap(ctx, w);
    drawBossBar(ctx, w);
    drawAlerts(ctx, w);
    drawTip(ctx, w);
    ctx.textAlign = "center";
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "rgba(159,200,255,0.55)";
    ctx.fillText(
      (() => {
        const k = (action: string) => keyName(boundKey(w, action));
        const move = ["KeyW", "KeyA", "KeyS", "KeyD"].map(k).join("");
        const army = isCaller(w.profile)
          ? ` · ${k("KeyG")} bind · ${k("KeyH")} army · ${k("KeyJ")} ${ORDER_TEXT[w.armyOrder].toLowerCase()}`
          : w.profile.classUnlocked
            ? ` · ${k("KeyH")} ${CLASSES[w.profile.cls].power.toLowerCase()}`
            : "";
        const ult = ultimateOf(w.profile) ? ` · ${k("KeyY")} ultimate` : "";
        return `${move} move · CLICK attack · ${k("Space")} dash · ${k("KeyQ")} ${k("KeyE")} ${k("KeyR")} RMB skills · ${k("KeyF")} potion · ${k("KeyV")} mana · ${k("KeyB")} belt · ${k("KeyX")} swap · ${k("KeyT")} stone${army}${ult} · ${k("KeyC")} status · ESC pause`;
      })(),
      VIEW_W / 2,
      VIEW_H - 14,
    );
  }
  drawNotices(ctx, w);
  if (w.sting && !w.cutscene) drawSting(ctx, w);
  if (w.menu === "status") drawStatus(ctx, w);
  if (w.menu === "pause") drawPause(ctx, w);
  if (w.menu === "keys") drawKeys(ctx, w);
  if (w.mode === "dead" || w.mode === "cleared") drawEnd(ctx, w);
  if (w.mode === "select" && w.menu === "none") drawDialogue(ctx, w);
}
