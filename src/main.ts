import { Input } from "./engine/input";
import { STEP, VIEW_H, VIEW_W } from "./game/config";
import { beginStory, refreshDerived } from "./game/profile";
import { applySave, parseSave, SAVE_KEY, toSave } from "./game/save";
import { createWorld, step } from "./game/world";
import { drawHud } from "./render/hud";
import { Scene3D } from "./render/scene3d";

const stage = document.getElementById("stage") as HTMLDivElement;
const view = document.getElementById("view") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLCanvasElement;
const ctx = hud.getContext("2d")!;
// The HUD canvas sits on top, so it receives the mouse.
const input = new Input(hud);
const scene = new Scene3D(view);
const world = createWorld();

/** Storage can be unavailable (private windows, blocked site data): never throw. */
function readStored(): unknown {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function writeStored(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(world)));
  } catch {
    // Nothing useful to do: the game keeps running without a save.
  }
}

const stored = parseSave(readStored());
if (stored) applySave(world, stored);
beginStory(world);

/** Start over in place, keeping the same world object the loop holds. */
function resetProgress(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignored for the same reason as above.
  }
  const fresh = createWorld();
  world.profile = fresh.profile;
  world.player.prog = fresh.player.prog;
  world.pendingDialogue = [];
  world.kills = 0;
  refreshDerived(world);
  world.player.hp = world.player.d.maxHp;
  world.player.mana = world.player.d.maxMana;
  beginStory(world);
}

function exportSave(): void {
  const blob = new Blob([JSON.stringify(toSave(world), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gatebound-save.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSave(): void {
  const pick = document.createElement("input");
  pick.type = "file";
  pick.accept = "application/json,.json";
  pick.onchange = async () => {
    const file = pick.files?.[0];
    if (!file) return;
    let data = null;
    try {
      data = parseSave(JSON.parse(await file.text()));
    } catch {
      data = null;
    }
    if (!data) {
      world.notices.push({ title: "IMPORT FAILED", body: "That file is not a Gatebound save.", life: 4 });
      return;
    }
    applySave(world, data);
    world.dirty = true;
    world.notices.push({ title: "SAVE IMPORTED", body: `Level ${data.prog.level}  ·  ${data.profile.gold} gold`, life: 4 });
  };
  pick.click();
}

/** Carry out what the gate board asked for, then save if anything changed. */
function serviceWorld(): void {
  for (const req of world.requests.splice(0)) {
    if (req === "export") exportSave();
    else if (req === "import") importSave();
    else if (req === "reset" && window.confirm("Erase all progress and start again? This cannot be undone.")) resetProgress();
  }
  if (world.dirty) {
    world.dirty = false;
    writeStored();
  }
}

/** Fit the fixed 16:9 view inside the window, sharp on high-density screens. */
function resize(): void {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  const cssW = VIEW_W * scale;
  const cssH = VIEW_H * scale;
  stage.style.width = `${cssW}px`;
  stage.style.height = `${cssH}px`;
  hud.width = Math.round(cssW * dpr);
  hud.height = Math.round(cssH * dpr);
  ctx.setTransform(hud.width / VIEW_W, 0, 0, hud.height / VIEW_H, 0, 0);
  scene.resize(cssW, cssH, dpr);
}
window.addEventListener("resize", resize);
resize();

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  // Cap the frame time so a background tab does not cause a burst of steps.
  const elapsed = Math.min(0.1, (now - last) / 1000);
  acc += elapsed;
  last = now;

  // Aim at the ground point under the cursor, using last frame's camera.
  const aim = scene.groundPoint(input.mouseX, input.mouseY);
  input.aimX = aim.x;
  input.aimY = aim.y;

  let stepped = false;
  while (acc >= STEP) {
    step(world, input, STEP);
    acc -= STEP;
    stepped = true;
  }
  // On fast displays a frame can run zero steps. Keep queued presses until
  // the simulation has had a chance to read them.
  if (stepped) input.endFrame();
  serviceWorld();

  scene.render(world, elapsed);
  drawHud(ctx, world, input.mouseX, input.mouseY, (x, y, h) => scene.project(x, y, h));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Dev-only handle for inspecting state from the browser console.
  // `__advance` runs the simulation for a span of game time and redraws,
  // independent of how often the browser delivers frames.
  Object.assign(window, {
    __world: world,
    __input: input,
    __advance: (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / STEP); i++) step(world, input, STEP);
      scene.render(world, Math.min(0.1, seconds));
      drawHud(ctx, world, input.mouseX, input.mouseY, (x, y, h) => scene.project(x, y, h));
    },
  });
}
