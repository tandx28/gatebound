import * as THREE from "three";
import type { PerkId, Rarity, WeaponType } from "../game/items";
import { flame } from "./fire";

/**
 * The hunter's weapons as they look in the hand. The type gives the shape;
 * the rarity gives the make (plain iron up to a blade that burns with its
 * own light); the item's first elemental perk gives it fire, frost, venom,
 * lightning or blood.
 *
 * Built as the game's other held things are: hanging down from the grip at
 * the origin, for a figure 46 units tall.
 */

export interface WeaponLook {
  rarity: Rarity | null;
  element: PerkId | null;
}

const TIER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const METAL = [0x8e96a3, 0xb4c0d2, 0x9fbcf0, 0xc3a2f5, 0xffd98a, 0xff8fa3];
const SHINE = [0, 0, 0.35, 0.8, 1.3, 1.9];
/** The colour each elemental perk burns. Perks that are not elements leave the blade its own. */
export const ELEMENT: Partial<Record<PerkId, number>> = { burn: 0xff6a20, frost: 0x9fe8ff, poison: 0x6dff5a, chain: 0xfff27a, bleed: 0xc81e2e, lifesteal: 0xff3a6a };

/** A string that changes whenever the weapon should be rebuilt. */
export function lookKey(type: WeaponType, look: WeaponLook): string {
  return `${type}:${look.rarity}:${look.element}`;
}

const box = (w: number, h: number, d: number, mat: THREE.Material, y: number, x = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

export function weaponModel(type: WeaponType, look: WeaponLook): THREE.Group {
  const g = new THREE.Group();
  const tier = look.rarity ? TIER[look.rarity] : 0;
  const hue = (look.element && ELEMENT[look.element]) || (tier >= 2 ? METAL[tier] : 0x5ee6ff);
  const glowing = Math.max(SHINE[tier], look.element && ELEMENT[look.element] ? 0.9 : 0.25);
  const steel = new THREE.MeshStandardMaterial({ color: METAL[tier], roughness: 0.32, metalness: 0.85, emissive: hue, emissiveIntensity: glowing * 0.5 });
  const edge = new THREE.MeshStandardMaterial({ color: hue, emissive: hue, emissiveIntensity: 1.4 + glowing });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.9 });
  const fitting = new THREE.MeshStandardMaterial({ color: tier >= 4 ? 0xe9b84a : 0x5a606c, roughness: 0.4, metalness: 0.9 });
  const size = 1 + tier * 0.05;

  // Where along the weapon the element shows, from the hand outward.
  let from = -3;
  let to = -12;

  if (type === "dagger" || type === "sword") {
    const len = (type === "dagger" ? 12 : 29) * size;
    const wide = (type === "dagger" ? 2.6 : 3.4) * (tier >= 5 ? 1.25 : 1);
    g.add(box(1.2, len, wide, steel, -len / 2 - 1.5));
    // A point, so it reads as a blade and not a bar.
    const tip = new THREE.Mesh(new THREE.ConeGeometry(wide / 2, wide * 1.4, 4), steel);
    tip.scale.x = 0.45;
    tip.rotation.x = Math.PI;
    tip.position.y = -len - 1.5 - wide * 0.7;
    g.add(tip);
    g.add(box(1.6, type === "dagger" ? 3.5 : 5, 1.6, grip, 1.5));
    if (tier >= 1) g.add(box(1.9, 1.5, wide * (type === "dagger" ? 1.9 : 2.5), fitting, -1));
    // A line of light down the blade from rare upward, or whenever it carries an element.
    if (tier >= 2 || look.element) g.add(box(1.5, len * 0.82, 0.7, edge, -len / 2 - 1.5));
    if (tier >= 3) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), edge);
      gem.position.y = type === "dagger" ? 4.2 : 5.5;
      g.add(gem);
    }
    if (tier >= 5) for (const z of [-1, 1]) g.add(box(1, len * 0.5, 0.9, edge, -len * 0.35, 0, z * wide * 0.62));
    from = -3;
    to = -len;
  } else if (type === "spear") {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 54, 7), grip);
    shaft.position.y = -12;
    g.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(2.2 * size, 11 * size, 4), steel);
    head.scale.x = 0.5;
    head.rotation.x = Math.PI;
    head.position.y = -44;
    head.castShadow = true;
    g.add(head);
    if (tier >= 1) g.add(box(2.2, 1.6, 6 + tier, fitting, -38));
    if (tier >= 2 || look.element) g.add(box(0.9, 8 * size, 0.7, edge, -43));
    if (tier >= 4) for (const z of [-1, 1]) g.add(box(0.8, 6, 2.4, steel, -40, 0, z * 3.2));
    from = -37;
    to = -49;
  } else {
    const limbs = new THREE.Mesh(new THREE.TorusGeometry(11 * size, 0.75 + tier * 0.08, 6, 16, Math.PI), tier >= 2 ? steel : grip);
    limbs.rotation.z = -Math.PI / 2;
    limbs.castShadow = true;
    g.add(limbs);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 22 * size, 4), edge);
    g.add(string);
    if (tier >= 1) g.add(box(1.8, 5, 1.8, fitting, 0, 11 * size));
    if (tier >= 3) for (const y of [-1, 1]) g.add(box(1.4, 2.4, 1.4, edge, y * 11 * size));
    from = 8;
    to = -8;
  }

  // The element itself, along the working part.
  const el = look.element;
  if (el === "burn") {
    for (let i = 0; i < 4; i++) {
      const f = flame(ELEMENT.burn!, 2.4, 9 + (i % 2) * 3);
      f.position.y = from + ((to - from) * (i + 0.5)) / 4;
      // Flames lick up the blade toward the hand, whichever way it is held.
      f.rotation.x = Math.PI;
      g.add(f);
    }
  } else if (el === "frost") {
    const ice = new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: ELEMENT.frost!, emissiveIntensity: 0.9, roughness: 0.1, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 5; i++) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4 + (i % 3), 4), ice);
      shard.position.set(0, from + ((to - from) * (i + 0.5)) / 5, (i % 2 ? 1 : -1) * 1.9);
      shard.rotation.x = (i % 2 ? 1 : -1) * 1.9;
      g.add(shard);
    }
  } else if (el === "poison") {
    for (let i = 0; i < 5; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.75 + (i % 2) * 0.35, 6, 5), edge);
      drop.position.set((i % 2 ? 0.9 : -0.9), from + ((to - from) * (i + 0.5)) / 5, (i % 3) - 1);
      g.add(drop);
    }
  } else if (el === "chain") {
    // A crooked line of light, like a spark held still.
    for (let i = 0; i < 6; i++) {
      const arc = box(0.5, Math.abs(to - from) / 5, 0.5, edge, from + ((to - from) * (i + 0.5)) / 6, 0, (i % 2 ? 1 : -1) * 1.5);
      arc.rotation.x = (i % 2 ? 1 : -1) * 0.7;
      arc.castShadow = false;
      g.add(arc);
    }
  } else if (el === "bleed" || el === "lifesteal") {
    for (let i = 0; i < 3; i++) {
      const drip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 5), edge);
      drip.position.set(0, to + 2 + i * 3, (i - 1) * 1.2);
      drip.rotation.x = Math.PI;
      g.add(drip);
    }
  }
  // The finest make burns outright.
  if (tier >= 5) {
    const f = flame(METAL[5], 3.2, Math.abs(to - from) * 0.9);
    f.position.y = from;
    f.rotation.x = Math.PI;
    g.add(f);
  }
  return g;
}
