import * as THREE from "three";
import { baseOf, itemDef, perksOf, type PerkId, type Rarity, type WeaponType } from "../game/items";
import { flame } from "./fire";

/**
 * The hunter's weapons as they look in the hand and in the board's preview.
 *
 * Every named weapon has its own form (FORMS): the shape of its blade, head
 * or limbs, its guard and pommel, what it is made of, and a glow of its own
 * with a pattern (steady, pulse, flicker, runes, ripple). Rarity sets how
 * much of that glow shows: common and uncommon glow only in their gems and
 * runes, rare and epic along the edge as well, legendary glows in its
 * pattern, and a mythic adds parts that move on their own. The item's first
 * elemental perk adds its colour along the working edge.
 *
 * Built as the game's other held things are: hanging down from the grip at
 * the origin, for a figure 46 units tall.
 */

export interface WeaponLook {
  rarity: Rarity | null;
  element: PerkId | null;
  /** The item's base id, which picks its form. Null or unknown: a plain one of its type. */
  base?: string | null;
  /** How strongly it glows: subtle in the hand, full in the preview. */
  bright?: number;
}

const TIER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const METAL = [0x8e96a3, 0xb4c0d2, 0x9fbcf0, 0xc3a2f5, 0xffd98a, 0xff8fa3];
/** The colour each elemental perk burns. Perks that are not elements leave the blade its own. */
export const ELEMENT: Partial<Record<PerkId, number>> = { burn: 0xff6a20, frost: 0x9fe8ff, poison: 0x6dff5a, chain: 0xfff27a, bleed: 0xc81e2e, lifesteal: 0xff3a6a };

/** How a glow moves. */
export type Pattern = "steady" | "pulse" | "flicker" | "runes" | "ripple";
type BladeKind = "straight" | "leaf" | "curved" | "wave" | "serrate" | "cleaver" | "needle" | "broad" | "fang";
type Guard = "none" | "bar" | "crescent" | "wing" | "ring" | "disc";
type Pommel = "none" | "ball" | "gem" | "ring" | "spike" | "feather";
type Stuff = "steel" | "bone" | "glass" | "obsidian" | "gold" | "mirror" | "wood";
type SpearHead = "leaf" | "pike" | "glaive" | "fork" | "crescent" | "trident";
type StaffHead = "gnarl" | "ring" | "brazier" | "crescent" | "lantern" | "quill";
type Limb = "simple" | "long" | "recurve" | "wing" | "sun";
/** Parts that move on their own: only mythics have them. */
type Extra = "ashes" | "fangs" | "rings" | "pages";

/** One named weapon's make. Only the fields its type uses are read. */
export interface Form {
  blade?: BladeKind;
  len?: number;
  width?: number;
  guard?: Guard;
  pommel?: Pommel;
  stuff?: Stuff;
  /** The grip's or shaft's colour. */
  grip?: number;
  spear?: SpearHead;
  staff?: StaffHead;
  limb?: Limb;
  /** Two blades side by side. */
  twin?: boolean;
  /** Marks along the blade or shaft that glow, one after another for `runes`. */
  runes?: number;
  glow: number;
  pattern: Pattern;
  extra?: Extra;
}

/** Each named weapon's form, by base id. */
export const FORMS: Record<string, Form> = {
  // Daggers
  iron_fang: { blade: "straight", len: 12, width: 2.6, guard: "bar", pommel: "ball", glow: 0x7fb8ff, pattern: "steady" },
  bone_shiv: { blade: "fang", len: 11, width: 2.8, guard: "none", pommel: "ring", stuff: "bone", grip: 0x4a3a2a, runes: 2, glow: 0xb8ffcf, pattern: "pulse" },
  hunters_kris: { blade: "wave", len: 13, width: 2.6, guard: "crescent", pommel: "gem", grip: 0x3a2416, glow: 0xffb04a, pattern: "pulse" },
  gale_knife: { blade: "leaf", len: 12, width: 2.8, guard: "wing", pommel: "feather", glow: 0x8affd8, pattern: "ripple" },
  voltaic_edge: { blade: "serrate", len: 13, width: 2.6, guard: "bar", pommel: "spike", runes: 3, glow: 0xfff27a, pattern: "flicker" },
  nightglass: { blade: "leaf", len: 14, width: 3, guard: "disc", pommel: "gem", stuff: "glass", glow: 0xb06aff, pattern: "pulse" },
  kingfisher: { blade: "curved", len: 15, width: 2.6, guard: "wing", pommel: "feather", grip: 0x14505a, runes: 3, glow: 0x3ae0ff, pattern: "ripple" },
  choir_baton: { blade: "needle", len: 16, width: 1.8, guard: "ring", pommel: "gem", stuff: "gold", grip: 0xf0ead8, runes: 4, glow: 0xd8a8ff, pattern: "runes" },
  mirror_edge: { blade: "broad", len: 14, width: 2.8, guard: "crescent", pommel: "gem", stuff: "mirror", glow: 0xe8f4ff, pattern: "ripple" },
  ashen_wake: { blade: "fang", len: 15, width: 3.2, guard: "crescent", pommel: "spike", stuff: "obsidian", runes: 4, glow: 0xff6a20, pattern: "flicker", extra: "ashes" },
  // Swords
  militia_sword: { blade: "straight", len: 28, width: 3.2, guard: "bar", pommel: "ball", glow: 0x7fb8ff, pattern: "steady" },
  falchion: { blade: "curved", len: 27, width: 3.8, guard: "bar", pommel: "ring", grip: 0x3a2416, glow: 0xffc46a, pattern: "steady" },
  gatecleaver: { blade: "cleaver", len: 28, width: 4, guard: "disc", pommel: "spike", runes: 4, glow: 0x5ee6ff, pattern: "runes" },
  dusk_blade: { blade: "leaf", len: 30, width: 3.6, guard: "crescent", pommel: "gem", grip: 0x2a1438, runes: 3, glow: 0xff7a4a, pattern: "pulse" },
  oathkeeper: { blade: "broad", len: 32, width: 3.8, guard: "wing", pommel: "gem", stuff: "gold", grip: 0x5a1a1a, runes: 5, glow: 0xffd84a, pattern: "runes" },
  twin_fang: { blade: "fang", len: 29, width: 2.8, guard: "wing", pommel: "spike", twin: true, runes: 4, glow: 0xff3a50, pattern: "pulse", extra: "fangs" },
  // Spears
  ash_spear: { spear: "leaf", grip: 0x7a5a3a, glow: 0x9fd8ff, pattern: "steady" },
  pike: { spear: "pike", grip: 0x4a3424, glow: 0xffb04a, pattern: "steady" },
  glaive: { spear: "glaive", grip: 0x2a2a34, runes: 3, glow: 0x6affc8, pattern: "pulse" },
  stormlance: { spear: "fork", grip: 0x1e2a44, runes: 4, glow: 0xfff27a, pattern: "flicker" },
  horizon: { spear: "crescent", grip: 0xe8d8b0, stuff: "gold", runes: 4, glow: 0xffa84a, pattern: "ripple" },
  trials_end: { spear: "trident", grip: 0x1a1a24, runes: 5, glow: 0x7af0ff, pattern: "runes", extra: "rings" },
  // Bows
  short_bow: { limb: "simple", grip: 0x7a5a3a, glow: 0x9fd8ff, pattern: "steady" },
  hunters_bow: { limb: "long", grip: 0x5a3a22, glow: 0xffc46a, pattern: "steady" },
  recurve: { limb: "recurve", grip: 0x2a2a34, runes: 2, glow: 0x5ee6ff, pattern: "pulse" },
  gale_bow: { limb: "wing", grip: 0xd8e8f0, runes: 2, glow: 0x8affd8, pattern: "ripple" },
  last_light: { limb: "sun", grip: 0xe9b84a, stuff: "gold", runes: 2, glow: 0xffe08a, pattern: "pulse" },
  // Staves
  oak_staff: { staff: "gnarl", grip: 0x6b4a2c, glow: 0x9aff7a, pattern: "pulse" },
  acolyte_rod: { staff: "ring", grip: 0xe0d8c8, glow: 0x9fd8ff, pattern: "steady" },
  ember_staff: { staff: "brazier", grip: 0x2a1a14, runes: 3, glow: 0xff6a20, pattern: "flicker" },
  starwell: { staff: "crescent", grip: 0x1e2a50, runes: 3, glow: 0xc8e0ff, pattern: "ripple" },
  veyra_lantern: { staff: "lantern", grip: 0x3a2c22, runes: 3, glow: 0x5ee6ff, pattern: "pulse" },
  blank_quill: { staff: "quill", grip: 0xf0f0f4, runes: 4, glow: 0xe8e8ff, pattern: "runes", extra: "pages" },
};

/** The plain make of each type, for an unknown or missing base. */
const PLAIN: Record<WeaponType, Form> = {
  dagger: FORMS.iron_fang,
  sword: FORMS.militia_sword,
  spear: FORMS.ash_spear,
  bow: FORMS.short_bow,
  staff: FORMS.oak_staff,
};

/** The form a weapon is built from. */
export function formOf(type: WeaponType, base: string | null | undefined): Form {
  const f = base ? FORMS[base] : undefined;
  return f && (type === "bow" ? !!f.limb : type === "spear" ? !!f.spear : type === "staff" ? !!f.staff : !!f.blade) ? f : PLAIN[type];
}

/** How strongly a weapon glows in the hand: held back, so the fight stays readable. */
export const HAND_GLOW = 0.55;

/** How an owned weapon looks: its form, rarity and first element. */
export function lookOf(owned: string, bright = 1): WeaponLook {
  return { base: baseOf(owned), rarity: itemDef(owned)?.rarity ?? null, element: perksOf(owned).find((perk) => ELEMENT[perk] !== undefined) ?? null, bright };
}

/** A string that changes whenever the weapon should be rebuilt. */
export function lookKey(type: WeaponType, look: WeaponLook): string {
  return `${type}:${look.base ?? ""}:${look.rarity}:${look.element}:${look.bright ?? 1}`;
}

const box = (w: number, h: number, d: number, mat: THREE.Material, y: number, x = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

/** What a weapon is made of, at a rarity. */
function stuffMat(stuff: Stuff, tier: number): THREE.MeshStandardMaterial {
  switch (stuff) {
    case "bone":
      return new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.75, metalness: 0 });
    case "glass":
      return new THREE.MeshStandardMaterial({ color: 0x241038, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.82 });
    case "obsidian":
      return new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.18, metalness: 0.6 });
    case "gold":
      return new THREE.MeshStandardMaterial({ color: 0xe9b84a, roughness: 0.25, metalness: 0.95 });
    case "mirror":
      return new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.04, metalness: 1 });
    case "wood":
      return new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.85 });
    default:
      return new THREE.MeshStandardMaterial({ color: METAL[tier], roughness: 0.32, metalness: 0.85 });
  }
}

/**
 * A material that glows, marked so `animateWeapon` can move its light.
 * Each glowing mesh has its own, so runes can light one after another.
 */
function glowMesh(geo: THREE.BufferGeometry, color: number, pattern: Pattern, strength: number, phase = 0): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: strength, roughness: 0.3 });
  const m = new THREE.Mesh(geo, mat);
  m.userData.glow = { pattern, base: strength, phase };
  return m;
}

/**
 * The outline of a blade, seen flat: from the hilt (`top`) to the point,
 * `len` long and about `w` wide. `scale` narrows it about its own middle,
 * for the inlay that runs down the blade.
 */
function bladeShape(kind: BladeKind, len: number, w: number, top: number, scale = 1): THREE.Shape {
  const n = 28;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = (from: number) => (t < from ? 1 : Math.max(0, (1 - t) / (1 - from)));
    let c = 0;
    let hl = w / 2;
    let hr = w / 2;
    if (kind === "straight") hl = hr = (w / 2) * taper(0.82);
    else if (kind === "leaf") hl = hr = (w / 2) * (0.6 + 0.6 * Math.sin(Math.PI * t * 0.9)) * taper(0.8);
    else if (kind === "curved") {
      c = w * 1.6 * t * t;
      hl = (w / 2) * 0.7 * taper(0.7);
      hr = (w / 2) * 1.2 * taper(0.75);
    } else if (kind === "wave") {
      c = Math.sin(t * Math.PI * 5) * w * 0.35 * (1 - 0.4 * t);
      hl = hr = (w / 2) * taper(0.75);
    } else if (kind === "serrate") {
      hl = (w / 2) * taper(0.8);
      hr = hl + (i % 2 && t < 0.8 ? w * 0.28 : 0);
    } else if (kind === "cleaver") {
      c = t * w * 0.3;
      hl = hr = (w / 2) * (0.8 + 0.8 * t) * taper(0.9);
    } else if (kind === "needle") hl = hr = (w / 2) * 0.55 * taper(0.55);
    else if (kind === "broad") hl = hr = (w / 2) * (t < 0.08 ? 1 : 1.25) * taper(0.86);
    else {
      // A fang: curving like a tooth, thick at the root.
      c = w * 1.3 * t * t;
      hl = hr = (w / 2) * (1 - 0.5 * t) * taper(0.72);
    }
    const y = top - t * len;
    left.push([c - hl * scale, y]);
    right.push([c + hr * scale, y]);
  }
  const s = new THREE.Shape();
  s.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left.slice(1)) s.lineTo(x, y);
  for (const [x, y] of right.reverse()) s.lineTo(x, y);
  s.closePath();
  return s;
}

/** A flat shape made solid, `depth` thick, with its face toward the side the blade cuts. */
function slab(shape: THREE.Shape, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

interface Kit {
  form: Form;
  tier: number;
  bright: number;
  /** The colour along the working edge: the element's, or the weapon's own. */
  edge: number;
  /** Whether the pattern moves (legendary and up); below that the glow holds still. */
  pattern: Pattern;
  metal: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  fitting: THREE.MeshStandardMaterial;
  /** Whether the edge itself glows: from rare up, or with an element. */
  edgeLit: boolean;
}

/** Glowing marks down a length, from `from` to `to`, on both faces. */
function addRunes(g: THREE.Group, k: Kit, n: number, from: number, to: number, x = 0.9, at: (y: number) => number = () => 0): void {
  for (let i = 0; i < n; i++) {
    const y = from + ((to - from) * (i + 0.5)) / n;
    for (const side of [-1, 1]) {
      const m = glowMesh(new THREE.BoxGeometry(0.3, 1.4, 0.7), k.form.glow, k.pattern, 1.4 * k.bright, i);
      m.position.set(side * x, y, at(y));
      m.rotation.x = 0.5 * (i % 2 ? 1 : -1);
      g.add(m);
    }
  }
}

/** A gem: on every weapon, common or not, so each has a little of its own light. */
function gem(k: Kit, r: number): THREE.Mesh {
  return glowMesh(new THREE.OctahedronGeometry(r), k.form.glow, k.pattern, (1.2 + k.tier * 0.15) * k.bright);
}

/** A blade and its inlay, from `top` down. Returns how far down it reaches. */
function addBlade(g: THREE.Group, k: Kit, kind: BladeKind, len: number, wide: number, top: number, z = 0, flip = false): number {
  const geo = slab(bladeShape(kind, len, wide, top), 1, 0.25);
  const blade = new THREE.Mesh(geo, k.metal);
  blade.castShadow = true;
  blade.position.z = z;
  if (flip) blade.scale.z = -1;
  g.add(blade);
  // The inlay down the middle: dark steel on a plain blade, light from rare up.
  const inlayGeo = slab(bladeShape(kind, len * 0.86, wide, top - len * 0.04, 0.3), 1.5, 0);
  const inlay = k.edgeLit ? glowMesh(inlayGeo, k.edge, k.pattern, (0.9 + 0.25 * k.tier) * k.bright) : new THREE.Mesh(inlayGeo, new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.5, metalness: 0.7 }));
  inlay.position.z = z;
  if (flip) inlay.scale.z = -1;
  g.add(inlay);
  return top - len;
}

function addGuard(g: THREE.Group, k: Kit, guard: Guard, wide: number): void {
  const m = k.fitting;
  if (guard === "bar") g.add(box(1.9, 1.4, wide * 2.4, m, -1));
  else if (guard === "disc") {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(wide * 0.9, wide * 0.9, 1, 10), m);
    d.position.y = -1;
    g.add(d);
  } else if (guard === "ring") {
    const r = new THREE.Mesh(new THREE.TorusGeometry(wide * 0.9, 0.35, 6, 14), m);
    r.position.y = -1.2;
    r.rotation.x = Math.PI / 2;
    g.add(r);
  } else if (guard === "crescent") {
    // Horns that sweep down along the blade.
    const r = new THREE.Mesh(new THREE.TorusGeometry(wide * 1.1, 0.45, 6, 12, Math.PI), m);
    r.rotation.y = Math.PI / 2;
    r.position.y = 0;
    r.rotation.z = Math.PI;
    g.add(r);
  } else if (guard === "wing") {
    for (const side of [-1, 1]) {
      const wing = box(0.8, 1.2, wide * 1.9, m, -0.4, 0, side * wide * 0.9);
      wing.rotation.x = side * 0.45;
      g.add(wing);
      const tip = box(0.6, 3, 0.8, m, 0.8, 0, side * wide * 1.8);
      tip.rotation.x = side * -0.3;
      g.add(tip);
    }
  }
}

function addPommel(g: THREE.Group, k: Kit, pommel: Pommel, gripLen: number): void {
  const y = gripLen + 1.2;
  if (pommel === "ball") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), k.fitting);
    b.position.y = y;
    g.add(b);
  } else if (pommel === "ring") {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.35, 6, 12), k.fitting);
    r.position.y = y + 0.6;
    r.rotation.y = Math.PI / 2;
    g.add(r);
  } else if (pommel === "spike") {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3, 5), k.fitting);
    c.position.y = y + 0.8;
    g.add(c);
  } else if (pommel === "feather") {
    for (const side of [-1, 1]) {
      const f = glowMesh(new THREE.BoxGeometry(0.3, 4.5, 1.4), k.form.glow, k.pattern, 0.5 * k.bright);
      f.position.set(0, y + 1.6, side * 0.8);
      f.rotation.x = side * 0.35;
      g.add(f);
    }
  }
  // Every weapon has a gem somewhere: at the pommel, else at the guard.
  const s = gem(k, pommel === "gem" ? 1.3 : 0.75);
  s.position.y = pommel === "gem" ? y : -1;
  if (pommel !== "gem") s.position.x = 1.1;
  g.add(s);
}

function buildBlade(g: THREE.Group, k: Kit, type: "dagger" | "sword"): { from: number; to: number } {
  const f = k.form;
  const size = 1 + k.tier * 0.04;
  const len = (f.len ?? (type === "dagger" ? 12 : 28)) * size;
  const wide = f.width ?? 3;
  const gripLen = type === "dagger" ? 3.5 : 5;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, gripLen, 7), k.grip);
  grip.position.y = gripLen / 2 - 0.5;
  g.add(grip);
  // A wrap round the grip, in the fitting's metal.
  for (let i = 0; i < 2; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.18, 4, 10), k.fitting);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.3 + i * (gripLen - 1.2);
    g.add(band);
  }
  const kind = f.blade ?? "straight";
  let end: number;
  if (f.twin) {
    end = addBlade(g, k, kind, len, wide * 0.8, -1.5, -wide * 0.55);
    addBlade(g, k, kind, len * 0.92, wide * 0.8, -1.5, wide * 0.55, true);
  } else end = addBlade(g, k, kind, len, wide, -1.5);
  addGuard(g, k, f.guard ?? "bar", wide);
  addPommel(g, k, f.pommel ?? "ball", gripLen);
  // A mythic's blade needs a little room for its moving parts to circle.
  if (f.runes) addRunes(g, k, f.runes, -4, -len * 0.75, 0.85, (y) => bladeCentre(kind, len, wide, -1.5, y));
  return { from: -3, to: end };
}

/** Where a blade's middle sits across its width at a height, so runes follow a curve. */
function bladeCentre(kind: BladeKind, len: number, w: number, top: number, y: number): number {
  const t = Math.max(0, Math.min(1, (top - y) / len));
  if (kind === "curved") return -w * 1.6 * t * t;
  if (kind === "fang") return -w * 1.3 * t * t;
  if (kind === "cleaver") return -t * w * 0.3;
  if (kind === "wave") return -Math.sin(t * Math.PI * 5) * w * 0.35 * (1 - 0.4 * t);
  return 0;
}

function buildSpear(g: THREE.Group, k: Kit): { from: number; to: number } {
  const f = k.form;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 54, 8), k.grip);
  shaft.position.y = -12;
  shaft.castShadow = true;
  g.add(shaft);
  // Bands along the shaft, more the finer the make.
  for (let i = 0; i < 1 + Math.min(3, k.tier); i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.25, 4, 10), k.fitting);
    band.rotation.x = Math.PI / 2;
    band.position.y = 10 - i * 9;
    g.add(band);
  }
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1, 4, 8), k.fitting);
  socket.position.y = -38;
  g.add(socket);
  const top = -40;
  const head = f.spear ?? "leaf";
  let to = -52;
  if (head === "leaf") to = addBlade(g, k, "leaf", 13, 4.4, top);
  else if (head === "pike") {
    to = addBlade(g, k, "needle", 16, 3, top);
    // A hook to one side, and a red tassel under the socket.
    const hook = new THREE.Mesh(slab(bladeShape("fang", 6, 1.6, 0), 0.8, 0.15), k.metal);
    hook.rotation.x = -Math.PI / 2;
    hook.position.set(0, top - 3, 1.2);
    g.add(hook);
    const tassel = box(0.4, 6, 1.6, new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.9 }), -35, 0, 1.2);
    tassel.rotation.x = 0.2;
    g.add(tassel);
  } else if (head === "glaive") to = addBlade(g, k, "curved", 19, 4.6, top);
  else if (head === "fork") {
    to = addBlade(g, k, "needle", 15, 3, top);
    for (const side of [-1, 1]) {
      const prong = new THREE.Group();
      addBlade(prong, k, "serrate", 8, 2, 0);
      prong.position.set(0, top - 1, side * 2.2);
      prong.rotation.x = side * -0.55;
      g.add(prong);
    }
  } else if (head === "crescent") {
    to = addBlade(g, k, "leaf", 12, 3.4, top - 2);
    const moon = new THREE.Mesh(new THREE.TorusGeometry(6, 0.9, 6, 18, Math.PI * 1.1), k.metal);
    moon.rotation.y = Math.PI / 2;
    moon.rotation.x = Math.PI;
    moon.position.y = top - 1;
    g.add(moon);
    const sun = glowMesh(new THREE.CylinderGeometry(2, 2, 0.8, 14), f.glow, k.pattern, 1.5 * k.bright);
    sun.rotation.z = Math.PI / 2;
    sun.position.y = top - 1;
    g.add(sun);
  } else {
    // Three blades: the middle long, the outer two swept wide.
    to = addBlade(g, k, "leaf", 15, 3.6, top);
    for (const side of [-1, 1]) {
      const b = new THREE.Group();
      addBlade(b, k, "fang", 10, 2.6, 0, 0, side > 0);
      b.position.set(0, top, side * 2.6);
      b.rotation.x = side * -0.4;
      g.add(b);
    }
  }
  const s = gem(k, 1);
  s.position.set(1.4, -38, 0);
  g.add(s);
  if (f.runes) addRunes(g, k, f.runes, -18, -36, 0.95);
  return { from: -38, to };
}

function buildStaff(g: THREE.Group, k: Kit): { from: number; to: number } {
  const f = k.form;
  const head = f.staff ?? "gnarl";
  const short = head === "ring";
  const len = short ? 40 : 50;
  if (head === "gnarl") {
    // Bent wood: four pieces, each a little off true.
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.85 + (i % 2) * 0.2, 1, len / 4 + 1, 6), k.grip);
      seg.position.set(i % 2 ? 0.4 : -0.2, 15 - (i + 0.5) * (len / 4), 0);
      seg.rotation.z = (i % 2 ? 1 : -1) * 0.06;
      seg.castShadow = true;
      g.add(seg);
    }
  } else {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, len, 8), k.grip);
    shaft.position.y = 15 - len / 2;
    shaft.castShadow = true;
    g.add(shaft);
  }
  const end = 15 - len;
  const top = end - 2;
  let core: THREE.Mesh;
  if (head === "gnarl") {
    const knot = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4), k.grip);
    knot.position.y = end;
    g.add(knot);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 4), leaf);
      l.scale.z = 0.3;
      l.position.set(Math.cos(a) * 2, end + 1.5, Math.sin(a) * 2);
      l.rotation.z = Math.cos(a) * 0.8;
      l.rotation.x = -Math.sin(a) * 0.8;
      g.add(l);
    }
    core = glowMesh(new THREE.IcosahedronGeometry(1.8, 1), f.glow, k.pattern, 1.6 * k.bright);
    core.position.y = top - 1;
  } else if (head === "ring") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 6, 18), k.fitting);
    ring.position.y = top - 2;
    g.add(ring);
    core = glowMesh(new THREE.IcosahedronGeometry(2, 1), f.glow, k.pattern, 1.6 * k.bright);
    core.position.y = top - 2;
  } else if (head === "brazier") {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const prong = box(0.6, 8, 0.6, k.fitting, top - 2, Math.cos(a) * 3, Math.sin(a) * 3);
      prong.rotation.z = Math.cos(a) * 0.4;
      prong.rotation.x = -Math.sin(a) * 0.4;
      g.add(prong);
    }
    const fire = flame(f.glow, 2.4, 9);
    fire.position.y = top - 6;
    fire.rotation.x = Math.PI;
    g.add(fire);
    core = glowMesh(new THREE.IcosahedronGeometry(2.2, 1), f.glow, k.pattern, 1.8 * k.bright);
    core.position.y = top - 3;
  } else if (head === "crescent") {
    const moon = new THREE.Mesh(new THREE.TorusGeometry(5, 0.8, 6, 18, Math.PI * 1.4), k.fitting);
    moon.rotation.y = Math.PI / 2;
    moon.rotation.x = Math.PI * 0.8;
    moon.position.y = top - 4;
    g.add(moon);
    // A star of two crossed points.
    // Shaped in the geometry, since the hand swells the core as it casts.
    core = glowMesh(new THREE.OctahedronGeometry(2.6).scale(0.6, 1.4, 0.6), f.glow, k.pattern, 2 * k.bright);
    core.position.y = top - 4;
    const cross = glowMesh(new THREE.OctahedronGeometry(2).scale(0.5, 0.5, 1.5), f.glow, k.pattern, 2 * k.bright);
    core.add(cross);
  } else if (head === "lantern") {
    // A crook, and a lantern hanging from it that sways.
    const crook = new THREE.Mesh(new THREE.TorusGeometry(4, 0.8, 6, 16, Math.PI), k.grip);
    crook.rotation.y = Math.PI / 2;
    crook.rotation.x = Math.PI;
    crook.position.set(0, end, 4);
    g.add(crook);
    const lantern = new THREE.Group();
    lantern.position.set(0, end, 8);
    lantern.userData.swing = true;
    const chain = box(0.3, 3, 0.3, k.fitting, -1.5);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2, 6), k.fitting);
    cap.position.y = -3.5;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 5, 6), new THREE.MeshStandardMaterial({ color: 0xbfefff, roughness: 0.05, transparent: true, opacity: 0.35 }));
    glass.position.y = -6.5;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.8, 6), k.fitting);
    foot.position.y = -9.2;
    lantern.add(chain, cap, glass, foot);
    core = glowMesh(new THREE.IcosahedronGeometry(1.4, 1), f.glow, k.pattern, 2.2 * k.bright);
    core.position.y = -6.5;
    lantern.add(core);
    g.add(lantern);
    if (f.runes) addRunes(g, k, f.runes, 0, -25, 1);
    const s = gem(k, 1);
    s.position.set(1.2, end + 3, 0);
    g.add(s);
    core.userData.orb = true;
    return { from: end - 2, to: end - 12 };
  } else {
    // The Blank Quill: a great feather, and a nib of ink with a white slit of light.
    const vane = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.6, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const feather = new THREE.Mesh(slab(bladeShape("leaf", 24, 7, 0), 0.3, 0), vane);
      feather.position.set(0, end + 22, side * 2.2);
      feather.rotation.x = side * 0.18;
      g.add(feather);
    }
    const nib = new THREE.Mesh(new THREE.ConeGeometry(2, 9, 4), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.2, metalness: 0.8 }));
    nib.rotation.x = Math.PI;
    nib.position.y = top - 3;
    g.add(nib);
    core = glowMesh(new THREE.BoxGeometry(0.3, 6, 0.5), f.glow, k.pattern, 2.2 * k.bright);
    core.position.set(1.05, top - 3, 0);
  }
  core.userData.orb = true;
  g.add(core);
  if (f.runes) addRunes(g, k, f.runes, 0, end + 4, 1);
  const s = gem(k, 1);
  s.position.set(1.2, end + 3, 0);
  g.add(s);
  return { from: end - 1, to: end - 9 };
}

function buildBow(g: THREE.Group, k: Kit): { from: number; to: number } {
  const f = k.form;
  const limb = f.limb ?? "simple";
  const size = 1 + k.tier * 0.04;
  const R = (limb === "long" ? 13 : limb === "simple" ? 11 : 12) * size;
  const thick = 0.75 + k.tier * 0.08;
  const limbMat = f.stuff === "gold" || k.tier >= 2 ? k.metal : k.grip;
  // Each limb is its own piece, so the bow can bend as it is drawn.
  const limbs = new THREE.Group();
  for (const side of [1, -1]) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(R, thick, 6, 10, Math.PI / 2), limbMat);
    l.rotation.z = side > 0 ? -Math.PI / 2 : 0;
    l.castShadow = true;
    limbs.add(l);
    if (limb === "recurve") {
      // Tips that curl back the other way.
      const curl = new THREE.Mesh(new THREE.TorusGeometry(2.6, thick * 0.9, 5, 8, Math.PI / 2), limbMat);
      curl.position.set(-2.6, side * R, 0);
      curl.rotation.z = side > 0 ? 0 : -Math.PI / 2;
      limbs.add(curl);
    } else if (limb === "wing") {
      // Feathers fanned off the back of each limb.
      for (let i = 0; i < 5; i++) {
        const a = (side * (i + 1) * Math.PI) / 12;
        const fx = Math.cos(a) * R;
        const fy = Math.sin(a) * R;
        const feather = glowMesh(new THREE.BoxGeometry(5 - i * 0.5, 0.9, 0.25), f.glow, k.pattern, 0.45 * k.bright, i);
        feather.position.set(fx + 2, fy, 0);
        feather.rotation.z = a + side * 0.4;
        limbs.add(feather);
      }
    } else if (limb === "sun") {
      // Rays from each tip.
      for (let i = 0; i < 3; i++) {
        const ray = glowMesh(new THREE.ConeGeometry(0.4, 4 + i, 4), f.glow, k.pattern, 1.2 * k.bright, i);
        ray.position.set(1 + i, side * (R + 1.5), 0);
        ray.rotation.z = side > 0 ? -0.3 * i : Math.PI + 0.3 * i;
        limbs.add(ray);
      }
    }
  }
  limbs.userData.limbs = true;
  g.add(limbs);
  if (limb === "sun") {
    // A halo behind the grip.
    const halo = glowMesh(new THREE.TorusGeometry(5, 0.35, 6, 24), f.glow, k.pattern, 1.4 * k.bright);
    halo.rotation.y = Math.PI / 2;
    halo.position.x = R + 1;
    g.add(halo);
  }
  // The string: two halves meeting at the nock, pulled back as the bow is drawn.
  const strung = k.edgeLit ? glowMesh(new THREE.CylinderGeometry(0.16, 0.16, R, 4), k.edge, k.pattern, 1.2 * k.bright) : null;
  const nock = new THREE.Group();
  nock.userData.nock = true;
  for (const side of [1, -1]) {
    const half = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, R, 4), strung ? (strung.material as THREE.Material) : new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.6 }));
    if (strung) half.userData.glow = strung.userData.glow;
    half.position.y = (side * R) / 2;
    half.userData.half = side;
    half.userData.len = R;
    nock.add(half);
  }
  g.add(nock);
  // The arrow on the string, seen only while drawing.
  const arrow = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 24, 5), shaftMat);
  body.rotation.z = Math.PI / 2;
  body.position.x = 12;
  const head = glowMesh(new THREE.ConeGeometry(0.9, 3, 4), k.edge, k.pattern, 1.2 * k.bright);
  head.rotation.z = -Math.PI / 2;
  head.position.x = 25;
  arrow.add(body, head);
  arrow.userData.arrow = true;
  arrow.visible = false;
  g.add(arrow);
  // The grip, wrapped, and the bow's gem above it.
  g.add(box(1.8, 5, 1.8, k.fitting, 0, R));
  const s = gem(k, 1);
  s.position.set(R + 1.2, 3.2, 0);
  g.add(s);
  if (f.runes) {
    for (const side of [1, -1]) {
      for (let i = 0; i < f.runes; i++) {
        const a = side * (0.35 + i * 0.4);
        const r = glowMesh(new THREE.BoxGeometry(0.5, 1.4, 0.6), f.glow, k.pattern, 1.3 * k.bright, i);
        r.position.set(Math.cos(a) * (R + thick), Math.sin(a) * (R + thick), 0);
        r.rotation.z = a;
        limbs.add(r);
      }
    }
  }
  return { from: 8, to: -8 };
}

/** A mythic's moving parts: they circle, spin or drift on their own. */
function addExtra(g: THREE.Group, k: Kit, extra: Extra, from: number, to: number): void {
  const mid = (from + to) / 2;
  const glow = k.form.glow;
  if (extra === "ashes") {
    for (let i = 0; i < 5; i++) {
      const shard = glowMesh(new THREE.TetrahedronGeometry(0.9), glow, "flicker", 1.6 * k.bright, i);
      shard.userData.orbit = { r: 4 + (i % 2), speed: 1.6 + i * 0.2, y: from + ((to - from) * (i + 0.5)) / 5, phase: i * 1.3 };
      g.add(shard);
    }
  } else if (extra === "fangs") {
    for (let i = 0; i < 3; i++) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 5), new THREE.MeshStandardMaterial({ color: 0xf0e8e0, emissive: glow, emissiveIntensity: 0.6 * k.bright }));
      fang.userData.orbit = { r: 6, speed: 1.2, y: mid + (i - 1) * 8, phase: (i * Math.PI * 2) / 3 };
      g.add(fang);
    }
  } else if (extra === "rings") {
    for (let i = 0; i < 2; i++) {
      const ring = glowMesh(new THREE.TorusGeometry(4 + i * 1.6, 0.25, 4, 24), glow, k.pattern, 1.5 * k.bright, i);
      ring.position.y = to + 6 + i * 3;
      ring.userData.spin = (i ? -1 : 1) * 1.4;
      ring.userData.tilt = 0.5 + i * 0.4;
      g.add(ring);
    }
  } else {
    // Pages that drift round the nib, and drops of ink.
    const paper = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, emissive: glow, emissiveIntensity: 0.35 * k.bright, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const page = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.2), paper);
      page.userData.orbit = { r: 7, speed: 0.9, y: mid + (i % 2 ? 3 : -3), phase: (i * Math.PI) / 2 };
      g.add(page);
    }
    for (let i = 0; i < 3; i++) {
      const ink = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), new THREE.MeshStandardMaterial({ color: 0x08080c, roughness: 0.1, metalness: 0.6 }));
      ink.userData.orbit = { r: 3.5, speed: -2, y: to + 2 + i * 2, phase: i * 2.1 };
      g.add(ink);
    }
  }
}

export function weaponModel(type: WeaponType, look: WeaponLook): THREE.Group {
  const g = new THREE.Group();
  const tier = look.rarity ? TIER[look.rarity] : 0;
  const form = formOf(type, look.base);
  const element = look.element && ELEMENT[look.element] !== undefined ? ELEMENT[look.element]! : null;
  const metal = stuffMat(form.stuff ?? "steel", tier);
  // A blade of the finest make carries a little of its glow in the metal itself.
  if (tier >= 3 && form.stuff !== "glass") {
    metal.emissive.setHex(element ?? form.glow);
    metal.emissiveIntensity = 0.08 * tier * (look.bright ?? 1);
  }
  const kit: Kit = {
    form,
    tier,
    bright: look.bright ?? 1,
    edge: element ?? form.glow,
    pattern: tier >= 4 ? form.pattern : "steady",
    metal,
    grip: new THREE.MeshStandardMaterial({ color: form.grip ?? 0x2a1c14, roughness: 0.85 }),
    fitting: new THREE.MeshStandardMaterial({ color: tier >= 4 || form.stuff === "gold" ? 0xe9b84a : 0x5a606c, roughness: 0.4, metalness: 0.9 }),
    edgeLit: tier >= 2 || element !== null,
  };

  const { from, to } = type === "spear" ? buildSpear(g, kit) : type === "staff" ? buildStaff(g, kit) : type === "bow" ? buildBow(g, kit) : buildBlade(g, kit, type);
  if (tier >= 5 && form.extra) addExtra(g, kit, form.extra, from, to);

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
      const drop = glowMesh(new THREE.SphereGeometry(0.75 + (i % 2) * 0.35, 6, 5), ELEMENT.poison!, "pulse", 1.2 * kit.bright, i);
      drop.position.set(i % 2 ? 0.9 : -0.9, from + ((to - from) * (i + 0.5)) / 5, (i % 3) - 1);
      g.add(drop);
    }
  } else if (el === "chain") {
    // A crooked line of light, like a spark held still.
    for (let i = 0; i < 6; i++) {
      const arc = glowMesh(new THREE.BoxGeometry(0.5, Math.abs(to - from) / 5, 0.5), ELEMENT.chain!, "flicker", 1.6 * kit.bright, i);
      arc.position.set(0, from + ((to - from) * (i + 0.5)) / 6, (i % 2 ? 1 : -1) * 1.5);
      arc.rotation.x = (i % 2 ? 1 : -1) * 0.7;
      g.add(arc);
    }
  } else if (el === "bleed" || el === "lifesteal") {
    for (let i = 0; i < 3; i++) {
      const drip = glowMesh(new THREE.ConeGeometry(0.7, 3.2, 5), ELEMENT[el]!, "pulse", 1.2 * kit.bright, i);
      drip.position.set(0, to + 2 + i * 3, (i - 1) * 1.2);
      drip.rotation.x = Math.PI;
      g.add(drip);
    }
  }
  return g;
}

/**
 * Move a weapon's light and its loose parts. `t` is any steadily rising time
 * in seconds. Cheap enough to call every frame on the weapon in hand.
 */
export function animateWeapon(g: THREE.Object3D, t: number): void {
  g.traverse((o) => {
    const u = o.userData;
    if (u.glow) {
      const { pattern, base, phase } = u.glow as { pattern: Pattern; base: number; phase: number };
      let k = 1;
      if (pattern === "pulse") k = 0.65 + 0.35 * Math.sin(t * 2.2 + phase * 0.8);
      else if (pattern === "flicker") k = 0.7 + 0.3 * Math.sin(t * 23 + phase * 5) * Math.sin(t * 7.3 + phase);
      else if (pattern === "runes") k = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 3 - phase * 0.9)), 3);
      else if (pattern === "ripple") k = 0.55 + 0.45 * Math.sin(t * 8 - phase * 1.4);
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && "emissiveIntensity" in mat) mat.emissiveIntensity = base * k;
    }
    if (u.orbit) {
      const r = u.orbit as { r: number; speed: number; y: number; phase: number };
      const a = t * r.speed + r.phase;
      o.position.set(Math.cos(a) * r.r, r.y + Math.sin(t * 2 + r.phase) * 0.8, Math.sin(a) * r.r);
      o.rotation.set(t * 1.3 + r.phase, -a, 0);
    }
    if (u.spin !== undefined) o.rotation.set(Math.PI / 2 + Math.sin(t) * (u.tilt ?? 0.4), 0, t * u.spin);
    if (u.swing) o.rotation.x = Math.sin(t * 1.7) * 0.22;
  });
}
