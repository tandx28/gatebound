import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { seeded } from "../engine/rng";
import { generateDungeon } from "../game/dungeon";
import { ALL_RARITIES, PERK_IDS, type WeaponType } from "../game/items";
import { roomTheme, THEMES } from "../game/rooms";
import { dress, pillarFor } from "./decor";
import { ELEMENT, lookKey, weaponModel } from "./weapons";

const TYPES: WeaponType[] = ["dagger", "sword", "spear", "bow"];

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

  it("a finer make has more to it, and an element adds its own parts", () => {
    const parts = (g: THREE.Object3D) => {
      let n = 0;
      g.traverse((o) => ((o as THREE.Mesh).isMesh ? (n += 1) : 0));
      return n;
    };
    for (const type of TYPES) {
      expect(parts(weaponModel(type, { rarity: "mythic", element: null }))).toBeGreaterThan(parts(weaponModel(type, { rarity: "common", element: null })));
      for (const element of Object.keys(ELEMENT) as (keyof typeof ELEMENT)[]) {
        expect(parts(weaponModel(type, { rarity: "common", element })), `${type} ${element}`).toBeGreaterThan(parts(weaponModel(type, { rarity: "common", element: null })));
      }
    }
  });

  it("the weapon is rebuilt only when its type, rarity or element changes", () => {
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

  it("every kind dresses a room, lights no more torches than allowed, and puts nothing in a doorway", () => {
    const tex = new THREE.Texture();
    for (const theme of [...THEMES, "gate", "throne"] as const) {
      for (const lights of [0, 2, 6]) {
        const group = new THREE.Group();
        const torches = dress(group, theme, 7, { n: 1, w: 2 }, 0x3aa0ff, lights, 80);
        expect(group.children.length, theme).toBeGreaterThan(4);
        expect(torches.filter((t) => t.light).length).toBeLessThanOrEqual(lights);
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
