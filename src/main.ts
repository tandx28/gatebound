import { Input } from "./engine/input";
import { STEP, VIEW_H, VIEW_W } from "./game/config";
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
