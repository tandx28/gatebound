import { VIEW_H, VIEW_W } from "../game/config";

/** What the simulation reads from the player. Tests supply a fake. */
export interface Controls {
  /** Cursor in view coordinates, for menus. */
  mouseX: number;
  mouseY: number;
  /** Cursor on the ground, in world coordinates, for aiming. */
  aimX: number;
  aimY: number;
  attackHeld: boolean;
  axis(): { x: number; y: number };
  consume(...codes: string[]): boolean;
}

/**
 * Keyboard and mouse state. One-shot actions (dash, restart) are queued on
 * key-down and consumed by the simulation, so a press is never lost between
 * fixed steps.
 */
export class Input implements Controls {
  private keys = new Set<string>();
  private queued = new Set<string>();
  /** Mouse position in view coordinates (0..VIEW_W, 0..VIEW_H). */
  mouseX = VIEW_W / 2;
  mouseY = VIEW_H / 2;
  aimX = 0;
  aimY = 0;
  attackHeld = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.queued.add(e.code);
      if (e.code === "Space" || e.code === "Tab") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.attackHeld = false;
    });
    const track = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * VIEW_W;
      this.mouseY = ((e.clientY - r.top) / r.height) * VIEW_H;
    };
    canvas.addEventListener("mousemove", track);
    canvas.addEventListener("mousedown", (e) => {
      // A press can arrive without a preceding move (touchpads, automation).
      track(e);
      if (e.button === 0) {
        this.attackHeld = true;
        // Also queue the press, so a click shorter than one frame still swings.
        this.queued.add("Mouse0");
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.attackHeld = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Movement axis from WASD or arrow keys, each component in -1..1. */
  axis(): { x: number; y: number } {
    const k = this.keys;
    const x =
      (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const y =
      (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    return { x, y };
  }

  /** True once per key press. */
  consume(...codes: string[]): boolean {
    let hit = false;
    for (const c of codes) if (this.queued.delete(c)) hit = true;
    return hit;
  }

  /** Drop presses that nothing consumed this frame. */
  endFrame(): void {
    this.queued.clear();
  }
}
