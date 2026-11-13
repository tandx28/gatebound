import { PLAYER, ROOM, SWARMER, VIEW_H, VIEW_W } from "../game/config";
import type { Enemy, World } from "../game/world";

const BLUE = "#3aa0ff";
const CYAN = "#5ee6ff";
const FONT = '"SF Mono", Menlo, Consolas, monospace';

export function render(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.fillStyle = "#04060b";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  const sx = (Math.random() - 0.5) * w.shake;
  const sy = (Math.random() - 0.5) * w.shake;
  ctx.translate(Math.round(-w.camX + sx), Math.round(-w.camY + sy));

  drawRoom(ctx);
  for (const pt of w.particles) {
    ctx.globalAlpha = Math.min(1, pt.life * 4);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  for (const e of w.enemies) drawEnemy(ctx, e);
  drawPlayer(ctx, w);

  ctx.textAlign = "center";
  for (const t of w.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 3);
    ctx.font = `bold ${t.big ? 22 : 15}px ${FONT}`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud(ctx, w);
  if (w.dead) drawDeath(ctx, w);
}

function drawRoom(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#0a0f1d";
  ctx.fillRect(0, 0, ROOM.w, ROOM.h);
  ctx.strokeStyle = "rgba(80,140,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 80; x < ROOM.w; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ROOM.h);
  }
  for (let y = 80; y < ROOM.h; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(ROOM.w, y);
  }
  ctx.stroke();
  ctx.shadowColor = BLUE;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, ROOM.w, ROOM.h);
  ctx.shadowBlur = 0;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
  let color = "#e5484d";
  if (e.state === "recover") color = "#7d2d33";
  if (e.state === "lunge") color = "#ffb0b4";

  if (e.state === "windup") {
    // Telegraph: a closing ring and a line along the coming lunge.
    const k = 1 - e.t / SWARMER.windup;
    ctx.strokeStyle = `rgba(255,220,120,${0.35 + 0.5 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius + 22 * (1 - k), 0, Math.PI * 2);
    ctx.stroke();
    const reach = SWARMER.lungeSpeed * SWARMER.lungeTime;
    ctx.strokeStyle = `rgba(255,90,96,${0.15 + 0.45 * k})`;
    ctx.lineWidth = e.radius * 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + e.dirX * reach, e.y + e.dirY * reach);
    ctx.stroke();
    ctx.lineCap = "butt";
    color = k > 0.7 ? "#ffffff" : "#ff8a5c";
  }
  if (e.flash > 0) color = "#ffffff";

  ctx.shadowColor = "#e5484d";
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (e.hp < SWARMER.maxHp) {
    const bw = 30;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw, 4);
    ctx.fillStyle = "#e5484d";
    ctx.fillRect(e.x - bw / 2, e.y - e.radius - 10, bw * (e.hp / SWARMER.maxHp), 4);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;

  if (p.attackT > 0) {
    const k = p.attackT / PLAYER.attackActive;
    ctx.fillStyle = `rgba(94,230,255,${0.15 + 0.4 * k})`;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(
      p.x,
      p.y,
      PLAYER.attackRange,
      p.attackFacing - PLAYER.attackHalfAngle,
      p.attackFacing + PLAYER.attackHalfAngle,
    );
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * k})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      p.x,
      p.y,
      PLAYER.attackRange,
      p.attackFacing - PLAYER.attackHalfAngle,
      p.attackFacing + PLAYER.attackHalfAngle,
    );
    ctx.stroke();
  }

  // Blink while invulnerable after a hit (not during a dash).
  const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(p.iframes * 20) % 2 === 0;
  ctx.globalAlpha = blink ? 0.35 : 1;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = p.dashT > 0 ? 28 : 14;
  ctx.fillStyle = p.hurtFlash > 0 ? "#ff5a60" : p.dashT > 0 ? "#ffffff" : CYAN;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Facing marker.
  ctx.fillStyle = "#04060b";
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.facing) * 7, p.y + Math.sin(p.facing) * 7, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(8,16,34,0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function drawHud(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;
  panel(ctx, 20, 20, 280, 74);
  ctx.textAlign = "left";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText(`HP  ${p.hp} / ${PLAYER.maxHp}`, 34, 42);
  ctx.fillStyle = "#1a2540";
  ctx.fillRect(34, 50, 252, 10);
  ctx.fillStyle = p.hp / PLAYER.maxHp > 0.34 ? "#ff5a60" : "#ff2030";
  ctx.fillRect(34, 50, 252 * (p.hp / PLAYER.maxHp), 10);

  ctx.fillStyle = "#1a2540";
  ctx.fillRect(34, 70, 252, 6);
  ctx.fillStyle = p.dashCd > 0 ? "#2f6f8f" : CYAN;
  ctx.fillRect(34, 70, 252 * (1 - p.dashCd / PLAYER.dashCooldown), 6);
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = "#6f8fbf";
  ctx.fillText("DASH", 34, 88);

  panel(ctx, VIEW_W - 200, 20, 180, 58);
  ctx.textAlign = "right";
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillStyle = "#cfe4ff";
  ctx.fillText(`WAVE ${w.wave}`, VIEW_W - 34, 44);
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText(`KILLS ${w.kills}`, VIEW_W - 34, 64);

  ctx.textAlign = "center";
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(159,200,255,0.55)";
  ctx.fillText("WASD move   ·   MOUSE aim   ·   CLICK attack   ·   SPACE dash", VIEW_W / 2, VIEW_H - 18);
}

function drawDeath(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.fillStyle = "rgba(4,6,11,0.72)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, VIEW_W / 2 - 230, VIEW_H / 2 - 90, 460, 180);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff5a60";
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText("YOU DIED", VIEW_W / 2, VIEW_H / 2 - 28);
  ctx.fillStyle = "#cfe4ff";
  ctx.font = `15px ${FONT}`;
  ctx.fillText(`Wave ${w.wave}   ·   ${w.kills} kills`, VIEW_W / 2, VIEW_H / 2 + 10);
  ctx.fillStyle = "#9fc8ff";
  ctx.fillText("Press R to try again", VIEW_W / 2, VIEW_H / 2 + 48);
}
