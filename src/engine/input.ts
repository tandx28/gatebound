import { BINDABLE, VIEW_H, VIEW_W } from "../game/config";

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
  /** Whether a key is down right now. Only a real keyboard needs to answer. */
  held?(code: string): boolean;
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
  /** Set to take the very next key press instead of playing it: used to choose a new key. */
  captureNext: ((code: string) => void) | null = null;
  /** The key pressed, to the action it now performs. `null`: that key has been given away. */
  private remap = new Map<string, string | null>();

  /** Tell the keyboard which keys the player has moved. */
  setBindings(keys: Record<string, string>): void {
    this.remap.clear();
    // A default key whose action has moved elsewhere does nothing, unless another action took it.
    for (const [action] of BINDABLE) if (keys[action] && keys[action] !== action) this.remap.set(action, null);
    for (const [action] of BINDABLE) if (keys[action]) this.remap.set(keys[action], action);
    this.keys.clear();
  }

  /** The action a physical key stands for, or null if it stands for none. */
  private logical(code: string): string | null {
    return this.remap.has(code) ? this.remap.get(code)! : code;
  }

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Tab") e.preventDefault();
      if (this.captureNext) {
        const take = this.captureNext;
        this.captureNext = null;
        take(e.code);
        return;
      }
      const code = this.logical(e.code);
      if (!code) return;
      this.keys.add(code);
      this.queued.add(code);
    });
    window.addEventListener("keyup", (e) => {
      const code = this.logical(e.code);
      if (code) this.keys.delete(code);
    });
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
      // The right button is the fourth skill slot.
      if (e.button === 2) this.queued.add("Mouse2");
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

  held(code: string): boolean {
    return this.keys.has(code);
  }

  /** Drop presses that nothing consumed this frame. */
  endFrame(): void {
    this.queued.clear();
  }
}
