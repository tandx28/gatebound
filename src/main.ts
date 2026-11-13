import { Input } from "./engine/input";
import { STEP, VIEW_H, VIEW_W } from "./game/config";
import { createWorld, step } from "./game/world";
import { render } from "./render/render";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const input = new Input(canvas);
let world = createWorld();

/** Fit the fixed 16:9 view inside the window, sharp on high-density screens. */
function resize(): void {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  canvas.width = Math.round(VIEW_W * scale * dpr);
  canvas.height = Math.round(VIEW_H * scale * dpr);
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
}
window.addEventListener("resize", resize);
resize();

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  // Cap the frame time so a background tab does not cause a burst of steps.
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;

  if (world.dead && input.consume("KeyR")) world = createWorld();
  let stepped = false;
  while (acc >= STEP) {
    step(world, input, STEP);
    acc -= STEP;
    stepped = true;
  }
  // On fast displays a frame can run zero steps. Keep queued presses until
  // the simulation has had a chance to read them.
  if (stepped) input.endFrame();

  render(ctx, world, input.mouseX, input.mouseY);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Dev-only handle for inspecting state from the browser console.
  Object.defineProperty(window, "__world", { get: () => world });
}
