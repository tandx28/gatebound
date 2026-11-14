import { musicState } from "./audio/director";
import { Music } from "./audio/music";
import { Sfx } from "./audio/sfx";
import { Input } from "./engine/input";
import { STEP, VIEW_H, VIEW_W } from "./game/config";
import { beginStory, refreshDerived } from "./game/profile";
import { applySave, parseSave, SAVE_KEY, toSave } from "./game/save";
import { createWorld, step, toSelect } from "./game/world";
import { drawHud } from "./render/hud";
import { loadModels } from "./render/models";
import { Scene3D } from "./render/scene3d";

const stage = document.getElementById("stage") as HTMLDivElement;
let view = document.getElementById("view") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLCanvasElement;
const ctx = hud.getContext("2d")!;
// The HUD canvas sits on top, so it receives the mouse.
const input = new Input(hud);
let scene = new Scene3D(view);
const world = createWorld();

// The game starts with built figures and swaps to the models when they arrive;
// if they never do, it carries on as it is.
loadModels(`${import.meta.env.BASE_URL}models/`).then(
  () => scene.refreshFigures(),
  (err) => console.warn("Models did not load; using built figures.", err),
);

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

/** Local calendar day number, so daily content turns over at local midnight. */
function today(): number {
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

world.today = today();
const SETTINGS_KEY = "gatebound.settings";
const audio = new Sfx();
const music = new Music();
// Audio may only start from a user gesture.
window.addEventListener("keydown", () => audio.unlock());
window.addEventListener("mousedown", () => audio.unlock());

/** Settings live apart from the save: they describe the device, not the hunter. */
function loadSettings(): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return;
    const r = raw as Record<string, unknown>;
    const vol = (v: unknown, fallback: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : fallback);
    world.settings.sfx = vol(r.sfx, world.settings.sfx);
    world.settings.music = vol(r.music, world.settings.music);
    if (typeof r.shake === "boolean") world.settings.shake = r.shake;
    if (r.quality === "high" || r.quality === "medium" || r.quality === "low") world.settings.quality = r.quality;
    if (typeof r.autoQuality === "boolean") world.settings.autoQuality = r.autoQuality;
  } catch {
    // Unreadable settings fall back to the defaults.
  }
}
loadSettings();

const stored = parseSave(readStored());
if (stored) applySave(world, stored);
beginStory(world);
// Always open on the title screen; Play continues where the save left off.
world.afterTitle = world.mode === "gate" ? "gate" : "select";
world.mode = "title";

/** Start over in place, keeping the same world object the loop holds. */
function resetProgress(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignored for the same reason as above.
  }
  const fresh = createWorld();
  toSelect(world);
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
    toSelect(world);
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
  if (world.settingsDirty) {
    world.settingsDirty = false;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(world.settings));
    } catch {
      // Settings simply will not persist on this device.
    }
  }
  audio.setVolume(world.settings.sfx);
  for (const id of world.sounds.splice(0)) audio.play(id);
  music.update(audio.context(), musicState(world), world.settings.music);
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

const ERROR_KEY = "gatebound.lastError";
let lastReport = 0;

/**
 * Something threw. Keep a trace on this device (never sent anywhere), tell
 * the player, and carry on: one bad frame must not freeze the game.
 */
function reportError(where: string, err: unknown, quiet = false): void {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[gatebound] ${where}`, err);
  try {
    const trace = {
      at: new Date().toISOString(),
      where,
      message,
      stack: err instanceof Error ? (err.stack ?? "").slice(0, 1500) : "",
      mode: world.mode,
      gate: world.gateKind,
      rank: world.rank,
      enemies: world.enemies.map((e) => `${e.kind}:${e.state}`).slice(0, 20),
    };
    localStorage.setItem(ERROR_KEY, JSON.stringify(trace));
  } catch {
    // The trace is a convenience; losing it changes nothing.
  }
  const now = performance.now();
  if (!quiet && now - lastReport > 5000) {
    lastReport = now;
    world.notices.push({ title: "SOMETHING WENT WRONG", body: `${message.slice(0, 60)}  ·  details saved, game continues`, life: 6 });
  }
}

/** How long to wait for the browser to hand the graphics context back. */
const CONTEXT_PATIENCE = 2500;

/**
 * The browser took the graphics context and did not return it. Start again
 * on a brand-new canvas: a fresh context usually works where the old one is dead.
 */
function rebuildView(): void {
  if (!scene.isLost) return;
  try {
    const fresh = document.createElement("canvas");
    fresh.id = "view";
    view.replaceWith(fresh);
    view = fresh;
    scene.dispose();
    scene = new Scene3D(view);
    watchContext();
    resize();
    world.notices.push({ title: "GRAPHICS RESTORED", body: "The 3D view was rebuilt.", life: 4 });
  } catch (err) {
    reportError("rebuilding the 3D view", err, true);
    world.notices.push({ title: "GRAPHICS LOST", body: "Could not restart the 3D view. Your progress is saved: reload the page.", life: 30 });
  }
}

function watchContext(): void {
  scene.onContext = (state) => {
    reportError(`graphics context ${state}`, new Error(`graphics context ${state}`), true);
    if (state === "lost") {
      world.notices.push({ title: "GRAPHICS LOST", body: "The browser dropped the 3D view. Restarting it.", life: 4 });
      window.setTimeout(rebuildView, CONTEXT_PATIENCE);
    } else {
      world.notices.push({ title: "GRAPHICS RESTORED", body: "The 3D view is back.", life: 4 });
    }
  };
}
watchContext();

/** Frames and seconds counted toward the next frame-rate check. */
const pace = { frames: 0, seconds: 0, settle: 4, best: 0 };

/**
 * If the game cannot hold a fair share of this screen's refresh rate for a
 * few seconds, step the graphics down a level. Never when the player has
 * switched that off, and never while the tab is hidden or just woke up.
 */
function watchFrameRate(elapsed: number): void {
  if (document.visibilityState !== "visible" || elapsed >= 0.1) {
    pace.frames = 0;
    pace.seconds = 0;
    pace.settle = 2;
    return;
  }
  if (pace.settle > 0) {
    pace.settle -= elapsed;
    return;
  }
  pace.frames += 1;
  pace.seconds += elapsed;
  if (pace.seconds < 3) return;
  const fps = pace.frames / pace.seconds;
  pace.frames = 0;
  pace.seconds = 0;
  // The best rate seen stands in for the screen's refresh rate.
  pace.best = Math.max(pace.best, fps);
  const s = world.settings;
  if (!s.autoQuality || s.quality === "low") return;
  if (fps < Math.max(40, pace.best * 0.6)) {
    s.quality = s.quality === "high" ? "medium" : "low";
    world.settingsDirty = true;
    pace.settle = 3;
    world.notices.push({ title: "GRAPHICS LOWERED", body: `Set to ${s.quality} to keep the game smooth. Change it under System.`, life: 5 });
  }
}

function frame(now: number): void {
  // Each stage is guarded on its own, so a fault in one cannot stop the others,
  // and the next frame is always scheduled.
  const elapsed = Math.min(0.1, (now - last) / 1000);
  acc += elapsed;
  last = now;

  try {
    // Aim at the ground point under the cursor, using last frame's camera.
    const aim = scene.groundPoint(input.mouseX, input.mouseY);
    if (Number.isFinite(aim.x) && Number.isFinite(aim.y)) {
      input.aimX = aim.x;
      input.aimY = aim.y;
    }

    world.today = today();
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
  } catch (err) {
    acc = 0;
    reportError("simulation", err);
  }

  try {
    scene.setQuality(world.settings.quality);
    // Draw part-way between the last two steps, so motion is smooth at any refresh rate.
    scene.render(world, elapsed, acc / STEP);
    watchFrameRate(elapsed);
  } catch (err) {
    reportError("3D view", err);
  }
  try {
    drawHud(ctx, world, input.mouseX, input.mouseY, (x, y, h) => scene.project(x, y, h));
  } catch (err) {
    reportError("overlay", err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // A getter, since the view can be rebuilt and replaced while the page lives.
  Object.defineProperty(window, "__scene", { get: () => scene });
  // Dev-only handle for inspecting state from the browser console.
  // `__advance` runs the simulation for a span of game time and redraws,
  // independent of how often the browser delivers frames.
  Object.assign(window, {
    __world: world,
    __input: input,
    __audio: audio,
    __music: music,
    __advance: (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / STEP); i++) step(world, input, STEP);
      scene.render(world, Math.min(0.1, seconds));
      drawHud(ctx, world, input.mouseX, input.mouseY, (x, y, h) => scene.project(x, y, h));
    },
  });
}
