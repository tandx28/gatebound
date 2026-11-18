import * as THREE from "three";
import { VIEW_H, VIEW_W } from "../game/config";
import { itemDef } from "../game/items";
import type { Rect } from "../game/ui";
import { animateWeapon, lookOf, weaponModel } from "./weapons";

/**
 * The turning weapon on the board's shop and gear tabs. It has its own small
 * scene and lights, drawn by the main renderer into one box of the screen
 * after the world is drawn, so it needs no second WebGL context and never
 * changes the light count of the world itself.
 */
export class WeaponPreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 1, 400);
  private pivot = new THREE.Group();
  private model: THREE.Group | null = null;
  private made = "";

  constructor() {
    this.scene.background = new THREE.Color(0x070b14);
    this.scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x101420, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(30, 40, 50);
    const rim = new THREE.DirectionalLight(0x5ee6ff, 1.6);
    rim.position.set(-40, 10, -30);
    this.scene.add(key, rim, this.pivot);
    this.camera.position.set(0, 0, 90);
    this.camera.lookAt(0, 0, 0);
  }

  /** Build the model for an owned weapon, centred and sized to fill the box. */
  private show(owned: string): void {
    if (owned === this.made) return;
    this.made = owned;
    this.clear();
    const type = itemDef(owned)?.weapon;
    if (!type) return;
    const model = weaponModel(type, lookOf(owned, 0.8));
    // Point first, up and to the right, so the long weapons fit the box.
    const holder = new THREE.Group();
    holder.add(model);
    model.rotation.z = Math.PI + (type === "bow" ? Math.PI / 2 : -0.55);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    model.position.sub(centre);
    holder.scale.setScalar(36 / Math.max(size.x, size.y, size.z, 1));
    this.model = holder;
    this.pivot.add(holder);
  }

  private clear(): void {
    if (!this.model) return;
    this.pivot.remove(this.model);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !mat.userData.shared) mat.dispose();
    });
    this.model = null;
  }

  /**
   * Draw the weapon, turning, into `rect` (view coordinates) on a canvas
   * `cssW` wide. Nothing to show draws nothing.
   */
  draw(renderer: THREE.WebGLRenderer, owned: string | null, rect: Rect, cssW: number, cssH: number, clock: number): void {
    if (!owned) {
      this.made = "";
      this.clear();
      return;
    }
    this.show(owned);
    if (!this.model) return;
    this.pivot.rotation.y = clock * 0.8;
    animateWeapon(this.model, clock);
    const sx = cssW / VIEW_W;
    const sy = cssH / VIEW_H;
    const x = rect.x * sx;
    const y = cssH - (rect.y + rect.h) * sy;
    this.camera.aspect = rect.w / rect.h;
    this.camera.updateProjectionMatrix();
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, rect.w * sx, rect.h * sy);
    renderer.setViewport(x, y, rect.w * sx, rect.h * sy);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cssW, cssH);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.clear();
  }
}
