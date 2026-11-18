import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { seeded } from "../engine/rng";
import { generateDungeon } from "../game/dungeon";
import { ALL_RARITIES, ITEMS, PERK_IDS, type WeaponType } from "../game/items";
import { roomTheme, THEMES } from "../game/rooms";
import { dress, pillarFor } from "./decor";
import { animateWeapon, ELEMENT, FORMS, formOf, lookKey, weaponModel } from "./weapons";

const TYPES: WeaponType[] = ["dagger", "sword", "spear", "bow", "staff"];

describe("weapons in the hand", () => {
  it("every type builds for every rarity and every perk, with no bad numbers", () => {
    for (const type of TYPES) {
      for (const rarity of [null, ...ALL_RARITIES]) {
        for (const element of [null, ...PERK_IDS]) {
          const g = weaponModel(type, { rarity, element });
          g.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(g);
          for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v), `${type} ${rarity} ${element}`).toBe(true);
          expect(box.max.y - box.min.y).toBeGreaterThan(8);
        }
      }
    }
  });

  // Rarity no longer adds parts to a plain weapon; each named form has its own,
  // and a mythic adds moving ones (tested below).
  it("an element adds its own parts", () => {
    const parts = (g: THREE.Object3D) => {
      let n = 0;
      g.traverse((o) => ((o as THREE.Mesh).isMesh ? (n += 1) : 0));
      return n;
    };
    for (const type of TYPES) {
      for (const element of Object.keys(ELEMENT) as (keyof typeof ELEMENT)[]) {
        expect(parts(weaponModel(type, { rarity: "common", element })), `${type} ${element}`).toBeGreaterThan(parts(weaponModel(type, { rarity: "common", element: null })));
      }
    }
  });

  it("every weapon item has a form of its own type, and no two share one", () => {
    const weapons = Object.values(ITEMS).filter((d) => d.weapon);
    for (const d of weapons) expect(formOf(d.weapon!, d.id), d.id).toBe(FORMS[d.id]);
    expect(new Set(weapons.map((d) => FORMS[d.id])).size).toBe(weapons.length);
  });

  it("every named weapon builds with finite bounds, and shapes differ within a type", () => {
    const sizes = new Map<WeaponType, Set<string>>();
    for (const d of Object.values(ITEMS)) {
      if (!d.weapon) continue;
      const g = weaponModel(d.weapon, { base: d.id, rarity: d.rarity, element: null });
      animateWeapon(g, 1.3);
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) expect(Number.isFinite(v), d.id).toBe(true);
      const s = box.getSize(new THREE.Vector3());
      const key = `${s.x.toFixed(1)}:${s.y.toFixed(1)}:${s.z.toFixed(1)}`;
      if (!sizes.has(d.weapon)) sizes.set(d.weapon, new Set());
      sizes.get(d.weapon)!.add(key);
    }
    for (const [type, seen] of sizes) expect(seen.size, type).toBeGreaterThanOrEqual(5);
  });

  it("a mythic has parts that move on their own; its common-rarity copy does not", () => {
    const moving = (g: THREE.Object3D) => {
      let n = 0;
      g.traverse((o) => (o.userData.orbit || o.userData.spin !== undefined ? (n += 1) : 0));
      return n;
    };
    for (const [id, type] of [["ashen_wake", "dagger"], ["twin_fang", "sword"], ["trials_end", "spear"], ["blank_quill", "staff"]] as const) {
      expect(moving(weaponModel(type, { base: id, rarity: "mythic", element: null })), id).toBeGreaterThan(0);
      expect(moving(weaponModel(type, { base: id, rarity: "common", element: null })), id).toBe(0);
    }
  });

  it("the weapon is rebuilt only when its type, rarity or element changes", () => {
    expect(lookKey("sword", { base: "falchion", rarity: "rare", element: null })).not.toBe(lookKey("sword", { base: "dusk_blade", rarity: "rare", element: null }));
    const a = lookKey("sword", { rarity: "rare", element: "burn" });
    expect(lookKey("sword", { rarity: "rare", element: "burn" })).toBe(a);
    expect(lookKey("sword", { rarity: "epic", element: "burn" })).not.toBe(a);
    expect(lookKey("sword", { rarity: "rare", element: "frost" })).not.toBe(a);
    expect(lookKey("dagger", { rarity: "rare", element: "burn" })).not.toBe(a);
  });
});

describe("rooms of different kinds", () => {
  const rooms = Array.from({ length: 40 }, (_, i) => generateDungeon("C", seeded(i + 1)).rooms).flat();

  it("the entrance and the boss room are always the same kind; the rest are drawn from five", () => {
    const seen = new Set<string>();
    for (const room of rooms) {
      const theme = roomTheme("C", room);
      expect(roomTheme("C", room)).toBe(theme);
      if (room.kind === "start") expect(theme).toBe("gate");
      else if (room.kind === "boss") expect(theme).toBe("throne");
      else seen.add(theme);
    }
    expect([...seen].sort()).toEqual([...THEMES].sort());
  });

  it("every kind dresses a room, makes no lights of its own, and puts nothing in a doorway", () => {
    const tex = new THREE.Texture();
    for (const theme of [...THEMES, "gate", "throne"] as const) {
      {
        const group = new THREE.Group();
        const torches = dress(group, theme, 7, { n: 1, w: 2 }, 0x3aa0ff, 80);
        expect(group.children.length, theme).toBeGreaterThan(4);
        // A light made per room would change the scene's light count, and stall the GPU.
        let lights = 0;
        group.traverse((o) => ((o as THREE.Light).isLight ? (lights += 1) : 0));
        expect(lights, theme).toBe(0);
        for (const t of torches) expect([t.x, t.y, t.z].every(Number.isFinite)).toBe(true);
        group.updateMatrixWorld(true);
        for (const child of group.children) {
          const p = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
          // The north door is at the middle of the far wall, the west door at the middle of the left one.
          const inNorthDoor = p.z < 60 && Math.abs(p.x - 700) < 80;
          const inWestDoor = p.x < 60 && Math.abs(p.z - 450) < 80;
          expect(inNorthDoor || inWestDoor, `${theme}: something stands in a doorway`).toBe(false);
        }
      }
      expect(pillarFor(theme, { x: 300, y: 300, radius: 34 }, tex, 0x3aa0ff).children.length).toBeGreaterThan(0);
    }
  });
});
