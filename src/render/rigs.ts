import * as THREE from "three";
import type { EnemyKind } from "../game/config";
import type { WeaponType } from "../game/items";

/**
 * Jointed figures built from simple solids, with their animation.
 *
 * Every figure faces +X, stands on y = 0, and is sized so that its footprint
 * matches the radius the simulation gives it. A limb is a pivot at the joint
 * with its mesh hanging below, so turning the pivot about Z swings the limb
 * forward (positive) or back (negative).
 */

/** What a figure is doing this frame. */
export type Pose = "idle" | "windup" | "attack" | "thrust" | "bow" | "cast" | "slump" | "guard" | "leap" | "down" | "die";

export interface Anim {
  /** Seconds, ever increasing; drives every cycle. */
  time: number;
  moving: boolean;
  pose: Pose;
  /** Progress through an attack swing, 0 to 1. */
  swing: number;
  /** Lit white for a moment after being hit. */
  flash: boolean;
  /** 0 to 1: how brightly the accent parts (eyes, runes) burn. */
  glow: number;
  /** Boss phase, for figures that change shape. */
  phase: number;
  /** Which weapon the hunter holds. */
  weapon?: WeaponType | null;
}

export interface Rig {
  root: THREE.Group;
  /** Height of the figure's head above the ground, for labels. */
  height: number;
  animate(a: Anim): void;
}

interface Palette {
  skin: number;
  cloth: number;
  trim: number;
  metal: number;
  /** Eyes, runes, anything that glows. */
  accent: number;
}

/** Materials a rig owns, so a hit can flash all of them and the accents can pulse. */
class Skin {
  private all: { mat: THREE.MeshStandardMaterial; emissive: number; intensity: number }[] = [];
  private accents: THREE.MeshStandardMaterial[] = [];

  matte(color: number, roughness = 0.82, metalness = 0.04): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.all.push({ mat, emissive: 0x000000, intensity: 0 });
    return mat;
  }

  steel(color: number): THREE.MeshStandardMaterial {
    return this.matte(color, 0.38, 0.85);
  }

  accent(color: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, emissive: color, emissiveIntensity: 0.9 });
    this.all.push({ mat, emissive: color, intensity: 0.9 });
    this.accents.push(mat);
    return mat;
  }

  apply(flash: boolean, glow: number): void {
    for (const m of this.all) {
      const isAccent = this.accents.includes(m.mat);
      if (flash) {
        m.mat.emissive.setHex(0xffffff);
        m.mat.emissiveIntensity = isAccent ? 2 : 0.55;
      } else {
        m.mat.emissive.setHex(m.emissive);
        m.mat.emissiveIntensity = isAccent ? 0.7 + 2.2 * glow : m.intensity;
      }
    }
  }
}

function solid(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ball = (r: number) => new THREE.SphereGeometry(r, 14, 10);
const rod = (r: number, len: number) => new THREE.CylinderGeometry(r, r, len, 8);
const taper = (top: number, bottom: number, len: number, sides = 8) => new THREE.CylinderGeometry(top, bottom, len, sides);

interface Limb {
  /** Joint nearest the body. */
  root: THREE.Group;
  /** Elbow or knee. */
  mid: THREE.Group;
  /** Hand or foot: things held are attached here. */
  end: THREE.Group;
}

/** A two-part limb hanging down from its root joint. */
function limb(radius: number, upper: number, lower: number, upperMat: THREE.Material, lowerMat: THREE.Material): Limb {
  const root = new THREE.Group();
  root.add(solid(new THREE.CapsuleGeometry(radius, Math.max(0.1, upper - radius * 2), 3, 8), upperMat, 0, -upper / 2));
  const mid = new THREE.Group();
  mid.position.y = -upper;
  mid.add(solid(new THREE.CapsuleGeometry(radius * 0.85, Math.max(0.1, lower - radius * 1.7), 3, 8), lowerMat, 0, -lower / 2));
  const end = new THREE.Group();
  end.position.y = -lower;
  mid.add(end);
  root.add(mid);
  return { root, mid, end };
}

/** How far a long weapon is turned in the hand so that it lies level when the arm hangs. */
const LEVEL = 1.35;

export type Held = "none" | "dagger" | "sword" | "spear" | "bow" | "staff" | "shield" | "claws" | "lance" | "flame";

/** Something to hold, hanging from the hand: blades point down the arm. */
function held(kind: Held, skin: Skin, pal: Palette): THREE.Group {
  const g = new THREE.Group();
  const steel = skin.steel(pal.metal);
  const wood = skin.matte(0x4a3524, 0.9);
  switch (kind) {
    case "dagger":
      g.add(solid(box(1.2, 11, 2.6), steel, 0, -6.5), solid(box(1.6, 3.5, 1.6), wood, 0, 0.5));
      break;
    case "sword":
      g.add(solid(box(1.3, 27, 3.4), steel, 0, -15), solid(box(1.8, 1.6, 8), steel, 0, -1), solid(box(1.6, 5, 1.6), wood, 0, 2));
      // Carried point-forward, so it never trails through the floor.
      g.rotation.z = 0.45;
      break;
    case "spear":
      g.add(solid(rod(0.8, 54), wood, 0, -12), solid(new THREE.ConeGeometry(2, 9, 6), steel, 0, -43).rotateX(Math.PI));
      // Long weapons are held level: the hand grips them, it does not dangle them.
      g.rotation.z = LEVEL;
      break;
    case "lance":
      g.add(solid(taper(0.9, 2.4, 70), steel, 0, -30), solid(taper(4, 4, 3), steel, 0, 2));
      g.rotation.z = LEVEL;
      break;
    case "bow": {
      const arc = solid(new THREE.TorusGeometry(11, 0.7, 6, 14, Math.PI), wood);
      arc.rotation.z = -Math.PI / 2;
      g.add(arc, solid(rod(0.15, 22), skin.matte(0xdddddd)));
      break;
    }
    case "staff":
      g.add(solid(rod(0.9, 46), wood, 0, 6), solid(ball(3.2), skin.accent(pal.accent), 0, 31));
      break;
    case "shield":
      g.add(solid(box(2.2, 22, 16), steel, 2, -4), solid(box(2.6, 4, 4), skin.accent(pal.accent), 2.2, -4));
      break;
    case "claws":
      for (const z of [-1.6, 0, 1.6]) g.add(solid(new THREE.ConeGeometry(0.8, 6, 5), steel, 0, -3.5, z).rotateX(Math.PI));
      break;
    case "flame":
      g.add(solid(new THREE.IcosahedronGeometry(4, 0), skin.accent(pal.accent), 0, -4));
      break;
    case "none":
      break;
  }
  return g;
}

/** One of the game's own weapons on its own, for a modelled figure to hold. */
export function weaponProp(kind: Held, metal = 0xc9d4e6, accent = 0x7fdcff): THREE.Group {
  const g = held(kind, new Skin(), { skin: 0, cloth: 0, trim: 0, metal, accent });
  // How it is carried is up to the figure holding it.
  g.rotation.set(0, 0, 0);
  return g;
}

interface Body {
  /** Overall size multiplier. */
  scale: number;
  torsoW: number;
  torsoD: number;
  torsoH: number;
  headR: number;
  armR: number;
  armLen: number;
  legR: number;
  legLen: number;
  /** How far the figure stoops, in radians. */
  stoop: number;
  /** A long skirt instead of legs. */
  robe: boolean;
  hood: boolean;
  helmet: boolean;
  horns: boolean;
  crown: boolean;
  /** Floats above the ground. */
  hover: number;
  right: Held;
  left: Held;
  /** Steps per second while walking. */
  gait: number;
}

const BODY: Body = {
  scale: 1,
  torsoW: 12,
  torsoD: 7,
  torsoH: 16,
  headR: 5,
  armR: 1.9,
  armLen: 8.5,
  legR: 2.4,
  legLen: 11,
  stoop: 0,
  robe: false,
  hood: false,
  helmet: false,
  horns: false,
  crown: false,
  hover: 0,
  right: "none",
  left: "none",
  gait: 11,
};

/** A person-shaped figure: the hunter, and every enemy that walks upright. */
function humanoid(pal: Palette, shape: Partial<Body>): Rig {
  const b = { ...BODY, ...shape };
  const skin = new Skin();
  const cloth = skin.matte(pal.cloth);
  const trim = skin.matte(pal.trim, 0.7);
  const flesh = skin.matte(pal.skin, 0.75);
  const eyes = skin.accent(pal.accent);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  const hipY = b.robe ? b.legLen * 2 * 0.95 : b.legLen * 2 + 1;
  hips.position.y = hipY;
  root.add(hips);
  hips.add(solid(box(b.torsoD * 0.95, 4, b.torsoW * 0.9), trim, 0, 0));

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(solid(box(b.torsoD, b.torsoH, b.torsoW), cloth, 0, b.torsoH / 2 + 1));
  // A strip down the chest, so the figure has a front.
  torso.add(solid(box(0.6, b.torsoH * 0.8, b.torsoW * 0.28), trim, b.torsoD / 2, b.torsoH / 2 + 1));

  const head = new THREE.Group();
  head.position.y = b.torsoH + 1 + b.headR * 0.9;
  torso.add(head);
  head.add(solid(ball(b.headR), flesh));
  for (const z of [-1, 1]) head.add(solid(box(0.8, 0.9, 1.5), eyes, b.headR * 0.92, b.headR * 0.12, z * b.headR * 0.4));
  if (b.hood) {
    const hood = solid(new THREE.SphereGeometry(b.headR * 1.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, -b.headR * 0.12, b.headR * 0.1);
    head.add(hood, solid(new THREE.ConeGeometry(b.headR * 0.9, b.headR * 1.3, 8), cloth, -b.headR * 0.9, -b.headR * 0.5).rotateZ(-0.9));
  }
  if (b.helmet) head.add(solid(new THREE.SphereGeometry(b.headR * 1.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), skin.steel(pal.metal), 0, b.headR * 0.08));
  if (b.horns) for (const z of [-1, 1]) head.add(solid(new THREE.ConeGeometry(b.headR * 0.28, b.headR * 1.3, 6), skin.matte(0xd8cfb8, 0.6), 0, b.headR * 0.9, z * b.headR * 0.7).rotateX(z * 0.5));
  if (b.crown) {
    const crown = solid(new THREE.TorusGeometry(b.headR * 0.85, 0.8, 6, 16), eyes, 0, b.headR * 0.95);
    crown.rotation.x = Math.PI / 2;
    head.add(crown);
  }

  const shoulderY = b.torsoH - 1;
  const arm = (side: number, holds: Held): Limb => {
    const a = limb(b.armR, b.armLen, b.armLen, cloth, flesh);
    a.root.position.set(0, shoulderY, side * (b.torsoW / 2 + b.armR));
    a.end.add(solid(ball(b.armR * 1.15), flesh));
    a.end.add(held(holds, skin, pal));
    torso.add(a.root);
    return a;
  };
  const armR = arm(1, b.right);
  const armL = arm(-1, b.left);

  let legL: Limb | null = null;
  let legR: Limb | null = null;
  let skirt: THREE.Mesh | null = null;
  if (b.robe) {
    skirt = solid(taper(b.torsoW * 0.5, b.torsoW * 0.95, hipY, 10), cloth, 0, -hipY / 2);
    hips.add(skirt);
  } else {
    const leg = (side: number): Limb => {
      const l = limb(b.legR, b.legLen, b.legLen, trim, cloth);
      l.root.position.set(0, -1, side * b.torsoW * 0.27);
      l.end.add(solid(box(b.legR * 3, 1.6, b.legR * 1.9), trim, b.legR * 0.7, 0.4));
      hips.add(l.root);
      return l;
    };
    legR = leg(1);
    legL = leg(-1);
  }

  // The hunter carries all four weapon types and shows the one in hand.
  const arsenal = new Map<WeaponType, THREE.Group>();
  root.scale.setScalar(b.scale);

  const rig: Rig & { arsenal: Map<WeaponType, THREE.Group>; hand: THREE.Group } = {
    root,
    height: (hipY + b.torsoH + b.headR * 2.4 + b.hover) * b.scale,
    arsenal,
    hand: armR.end,
    animate(a) {
      skin.apply(a.flash, a.glow);
      const stride = a.moving ? Math.sin(a.time * b.gait) : 0;
      const lift = a.moving ? Math.cos(a.time * b.gait) : 0;
      hips.position.y = hipY + b.hover + (a.moving ? Math.abs(lift) * 1.1 : Math.sin(a.time * 2) * 0.35) + (b.hover ? Math.sin(a.time * 2.4) * 2 : 0);

      if (legL && legR) {
        legL.root.rotation.z = stride * 0.75;
        legR.root.rotation.z = -stride * 0.75;
        // A knee only bends back, as the foot comes off the ground.
        legL.mid.rotation.z = -Math.max(0, lift) * 0.95;
        legR.mid.rotation.z = -Math.max(0, -lift) * 0.95;
      }
      if (skirt) skirt.rotation.z = a.moving ? -0.08 + stride * 0.04 : Math.sin(a.time * 1.6) * 0.02;

      // Arms at rest swing against the legs; a held blade is carried a little forward.
      const carryR = b.right === "none" || b.right === "claws" ? 0 : 0.35;
      const carryL = b.left === "shield" ? 0.9 : b.left === "none" ? 0 : 0.35;
      let sr = -stride * 0.5 + carryR;
      let sl = stride * 0.5 + carryL;
      let er = 0.25 + carryR;
      let el = 0.25 + (b.left === "shield" ? 1.1 : carryL);
      let lean = b.stoop + (a.moving ? 0.1 : 0.02);
      let twist = 0;
      let nod = 0;
      const ease = a.swing * a.swing * (3 - 2 * a.swing);

      switch (a.pose) {
        case "windup":
          sr = -2.1;
          er = 0.9;
          lean = b.stoop - 0.12;
          twist = -0.45;
          break;
        case "attack":
          sr = -1.7 + ease * 3.4;
          er = 0.3;
          twist = -0.55 + ease * 1.1;
          lean = b.stoop + 0.22;
          break;
        case "thrust": {
          // A levelled spear needs the arm low; a sword or dagger is driven out from the shoulder.
          const long = a.weapon === "spear" || b.right === "spear" || b.right === "lance";
          const blade = a.weapon === "sword" || b.right === "sword";
          sr = long ? 0.25 : blade ? 1.0 : 1.45;
          sl = long ? 0.6 : 1.1;
          er = 0.1;
          el = 0.5;
          lean = b.stoop + 0.42;
          break;
        }
        case "bow":
          sl = 1.5;
          el = 0.05;
          sr = 1.25;
          er = 1.7;
          twist = 0.35;
          break;
        case "cast":
          sr = 2.7;
          sl = 2.7;
          er = 0.2;
          el = 0.2;
          lean = b.stoop - 0.12;
          break;
        case "guard":
          sl = 1.2;
          el = 1.3;
          lean = b.stoop + 0.1;
          break;
        case "die":
        case "down":
          // Fallen: folded right over. (The modelled figures lie flat.)
          lean = b.stoop + 1.35;
          sr = 0.6;
          sl = 0.6;
          nod = 0.6;
          break;
        case "slump":
          lean = b.stoop + 0.55;
          sr = 0.25;
          sl = 0.25;
          nod = 0.5;
          break;
        case "leap":
          sr = -1.2;
          sl = -1.2;
          lean = b.stoop + 0.5;
          break;
        case "idle":
          break;
      }
      armR.root.rotation.z = sr;
      armL.root.rotation.z = sl;
      armR.mid.rotation.z = er;
      armL.mid.rotation.z = el;
      // Tilting about Z by a negative angle carries the head forward.
      torso.rotation.z = -lean;
      torso.rotation.y = twist;
      head.rotation.z = -nod + lean * 0.5;

      // Bare hands show nothing at all.
      for (const [type, g] of arsenal) g.visible = type === a.weapon;
    },
  };
  return rig;
}

/** The hunter: a hooded figure in a dark coat, with all four weapons to hand. */
function hunter(): Rig {
  const pal: Palette = { skin: 0xd9b89a, cloth: 0x3a4a6e, trim: 0x8a9cc4, metal: 0xc9d4e6, accent: 0x7fdcff };
  const rig = humanoid(pal, { hood: true, scale: 1.02 }) as Rig & { arsenal: Map<WeaponType, THREE.Group>; hand: THREE.Group };
  const skin = new Skin();
  for (const type of ["dagger", "sword", "spear", "bow"] as WeaponType[]) {
    const g = held(type, skin, pal);
    rig.hand.add(g);
    rig.arsenal.set(type, g);
  }
  // A short cape, so the back reads at a glance from above.
  const cape = solid(box(1, 20, 13), new THREE.MeshStandardMaterial({ color: 0x2a3654, roughness: 0.9 }), -5.2, 8);
  cape.rotation.z = -0.1;
  // Hung from the torso, so it leans with the body.
  rig.root.children[0].children[1].add(cape);
  return rig;
}

interface Beast {
  scale: number;
  length: number;
  girth: number;
  legLen: number;
  horns: boolean;
  tail: boolean;
  /** A rider sits on its back. */
  saddle: boolean;
}

/** A four-legged beast: the leaper, the charger, and the commander's mount. */
function beast(pal: Palette, shape: Partial<Beast>): Rig & { back: THREE.Group } {
  const b: Beast = { scale: 1, length: 30, girth: 11, legLen: 8, horns: false, tail: true, saddle: false, ...shape };
  const skin = new Skin();
  const hide = skin.matte(pal.cloth, 0.9);
  const dark = skin.matte(pal.trim, 0.85);
  const eyes = skin.accent(pal.accent);

  const root = new THREE.Group();
  const body = new THREE.Group();
  const bodyY = b.legLen * 2 + b.girth / 2;
  body.position.y = bodyY;
  root.add(body);
  body.add(solid(box(b.length, b.girth, b.girth * 0.95), hide));
  body.add(solid(box(b.length * 0.5, b.girth * 0.35, b.girth * 0.6), dark, -b.length * 0.1, b.girth * 0.6));

  const neck = new THREE.Group();
  neck.position.set(b.length / 2, b.girth * 0.2, 0);
  body.add(neck);
  neck.add(solid(box(b.girth * 0.95, b.girth * 0.8, b.girth * 0.8), hide, b.girth * 0.4, b.girth * 0.15));
  neck.add(solid(box(b.girth * 0.7, b.girth * 0.4, b.girth * 0.5), dark, b.girth * 1.05, -b.girth * 0.05));
  for (const z of [-1, 1]) {
    neck.add(solid(box(0.8, 1, 1.6), eyes, b.girth * 0.9, b.girth * 0.35, z * b.girth * 0.3));
    neck.add(solid(new THREE.ConeGeometry(1.6, 4.5, 4), dark, b.girth * 0.2, b.girth * 0.7, z * b.girth * 0.3));
    if (b.horns) neck.add(solid(new THREE.ConeGeometry(1.4, b.girth * 0.9, 6), skin.matte(0xd8cfb8, 0.55), b.girth * 0.95, b.girth * 0.5, z * b.girth * 0.42).rotateZ(-1.2));
  }

  const legs: Limb[] = [];
  for (const [fx, fz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const l = limb(b.girth * 0.16, b.legLen, b.legLen, hide, dark);
    l.root.position.set(fx * b.length * 0.36, -b.girth * 0.3, fz * b.girth * 0.36);
    body.add(l.root);
    legs.push(l);
  }
  let tail: THREE.Group | null = null;
  if (b.tail) {
    tail = new THREE.Group();
    tail.position.set(-b.length / 2, b.girth * 0.2, 0);
    tail.add(solid(taper(0.7, 1.6, b.length * 0.5, 6), dark, -b.length * 0.22, 0).rotateZ(Math.PI / 2));
    body.add(tail);
  }
  const back = new THREE.Group();
  back.position.set(-b.length * 0.05, b.girth / 2, 0);
  body.add(back);
  root.scale.setScalar(b.scale);

  return {
    root,
    back,
    height: (bodyY + b.girth) * b.scale,
    animate(a) {
      skin.apply(a.flash, a.glow);
      // Diagonal pairs move together, as a trotting animal's do.
      const stride = a.moving ? Math.sin(a.time * 13) : 0;
      legs.forEach((l, i) => {
        const s = i === 0 || i === 3 ? stride : -stride;
        l.root.rotation.z = s * 0.7;
        l.mid.rotation.z = -Math.max(0, s) * 0.8;
      });
      body.position.y = bodyY + (a.moving ? Math.abs(Math.cos(a.time * 13)) * 1.2 : Math.sin(a.time * 2) * 0.3);
      let pitch = 0;
      let headDrop = Math.sin(a.time * 1.7) * 0.05;
      if (a.pose === "windup") {
        pitch = 0.18;
        headDrop = -0.5;
      } else if (a.pose === "thrust" || a.pose === "attack") {
        headDrop = -0.65;
        pitch = -0.08;
      } else if (a.pose === "leap") {
        pitch = -0.45;
        for (const l of legs) {
          l.root.rotation.z = -0.9;
          l.mid.rotation.z = -1.2;
        }
      } else if (a.pose === "slump") headDrop = -0.9;
      body.rotation.z = pitch;
      neck.rotation.z = headDrop;
      if (tail) tail.rotation.y = Math.sin(a.time * 5) * 0.4;
    },
  };
}

/** The Brood Queen: a six-legged insect with a swollen abdomen. */
function insect(pal: Palette, scale: number): Rig {
  const skin = new Skin();
  const shell = skin.matte(pal.cloth, 0.45, 0.25);
  const dark = skin.matte(pal.trim, 0.6);
  const eyes = skin.accent(pal.accent);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 20;
  root.add(body);

  const abdomen = solid(ball(13), shell, -15, 3);
  abdomen.scale.set(1.5, 1, 1.05);
  body.add(abdomen, solid(ball(8), dark, 1, 1), solid(ball(6.5), shell, 12, 3));
  for (let i = 0; i < 4; i++) body.add(solid(box(1.5, 0.8, 22 - i * 3), dark, -8 - i * 6, 13.2 - i * 0.6));
  for (const z of [-1, 1]) {
    body.add(solid(ball(1.8), eyes, 16.5, 5, z * 3.4));
    body.add(solid(new THREE.ConeGeometry(1.3, 9, 5), dark, 19, 0.5, z * 3).rotateZ(-1.9).rotateX(z * 0.4));
    body.add(solid(rod(0.3, 12), dark, 15, 11, z * 3).rotateZ(-0.7));
  }
  const legs: { side: number; phase: number; l: Limb }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const l = limb(1.2, 12, 14, dark, shell);
      l.root.position.set(6 - i * 6, 0, side * 6);
      // Splayed outward, the lower part reaching down to the ground.
      l.root.rotation.x = side * 1.15;
      l.mid.rotation.x = -side * 1.3;
      body.add(l.root);
      legs.push({ side, phase: i * 2.1 + (side > 0 ? 0 : Math.PI), l });
    }
  }
  root.scale.setScalar(scale);
  return {
    root,
    height: 38 * scale,
    animate(a) {
      skin.apply(a.flash, a.glow);
      for (const { phase, l } of legs) l.root.rotation.z = a.moving ? Math.sin(a.time * 9 + phase) * 0.45 : Math.sin(a.time * 1.5 + phase) * 0.05;
      body.position.y = 20 + Math.sin(a.time * 2) * 0.5;
      body.rotation.z = a.pose === "cast" || a.pose === "windup" ? 0.22 : a.pose === "attack" ? -0.15 : 0;
      abdomen.scale.x = 1.5 + Math.sin(a.time * 3) * 0.04;
    },
  };
}

/** A rig for things that do not walk: eggs, totems, and the bloated exploder. */
function prop(build: (skin: Skin, root: THREE.Group) => { height: number; tick?: (a: Anim) => void }): Rig {
  const skin = new Skin();
  const root = new THREE.Group();
  const made = build(skin, root);
  return {
    root,
    height: made.height,
    animate(a) {
      skin.apply(a.flash, a.glow);
      made.tick?.(a);
    },
  };
}

const P = (skin: number, cloth: number, trim: number, metal: number, accent: number): Palette => ({ skin, cloth, trim, metal, accent });

/** Build the figure for an enemy kind, sized to the radius the simulation uses. */
export function buildRig(kind: EnemyKind | "player", radius = 14): Rig {
  // A humanoid of scale 1 has a footprint of about 13.
  const s = radius / 13;
  switch (kind) {
    case "player":
      return hunter();
    case "swarmer":
      return humanoid(P(0x6f8a4e, 0x3d3327, 0x2a221a, 0x8a8f99, 0xff5040), { scale: s * 0.82, stoop: 0.35, right: "claws", left: "claws", headR: 5.6, legLen: 8, gait: 15 });
    case "shooter":
      return humanoid(P(0x7c9458, 0x4a3b2b, 0x2e251b, 0x8a8f99, 0xff4fd8), { scale: s * 0.85, stoop: 0.15, left: "bow", hood: true, legLen: 9 });
    case "healer":
      return humanoid(P(0x9fb08a, 0x2f5a44, 0x1d3a2c, 0x8a8f99, 0x6dff9c), { scale: s * 0.9, robe: true, hood: true, right: "staff" });
    case "brute":
      return humanoid(P(0x8a7a66, 0x3a3f4d, 0x23262f, 0x9aa7bd, 0x8fb4ff), {
        scale: s * 0.72,
        torsoW: 20,
        torsoD: 12,
        torsoH: 19,
        armR: 3.4,
        legR: 3.8,
        headR: 5.5,
        stoop: 0.15,
        left: "shield",
        right: "claws",
        gait: 7,
      });
    case "warden":
    case "colossus":
      return humanoid(P(0x6b6258, kind === "warden" ? 0x5a5148 : 0x6a5238, 0x3b352f, 0x7a7067, kind === "warden" ? 0xff5a40 : 0xffa040), {
        scale: s * (kind === "warden" ? 0.62 : 0.72),
        torsoW: 22,
        torsoD: 14,
        torsoH: 20,
        armR: 4.4,
        armLen: 11,
        legR: 4.4,
        legLen: 9,
        headR: 5.4,
        stoop: 0.18,
        gait: 6,
      });
    case "summoner":
      return humanoid(P(0xcfc7b8, 0x3a2550, 0x231633, 0x9a8fb3, 0xb070ff), { scale: s * 0.74, robe: true, hood: true, right: "staff", legLen: 13 });
    case "duellist":
      return humanoid(P(0xe6e0d6, 0x5a1f28, 0x2b1014, 0xe8edf5, 0xffffff), { scale: s * 0.98, right: "sword", left: "dagger", helmet: true, gait: 14 });
    case "pyro":
      return humanoid(P(0xd0a080, 0x6b2a16, 0x3b160c, 0x8a8f99, 0xff7a20), { scale: s * 0.92, robe: true, hood: true, right: "flame" });
    case "warder":
      return humanoid(P(0xb8a890, 0x30506a, 0x1c3040, 0xa9c4dc, 0x7fd0ff), { scale: s * 0.72, torsoW: 17, torsoD: 10, armR: 3, legR: 3.2, helmet: true, left: "shield", right: "shield", gait: 8 });
    case "assassin":
      return humanoid(P(0x9c94a8, 0x1a1626, 0x0e0c16, 0xb9a8e0, 0x9b5cff), { scale: s * 0.98, hood: true, right: "dagger", left: "dagger", stoop: 0.12, gait: 15 });
    case "knight":
      return humanoid(P(0xd6c7b0, 0x5d6676, 0x353c49, 0xd0d8e8, 0xffd84a), { scale: s * 0.76, torsoW: 14, armR: 2.4, legR: 2.8, helmet: true, right: "sword", left: "shield" });
    case "warper":
      return humanoid(P(0x8fd8e6, 0x123a4a, 0x0a2530, 0x8a8f99, 0x40e0ff), { scale: s * 0.9, robe: true, hood: true, hover: 7, right: "flame", left: "flame" });
    case "monarch":
      return humanoid(P(0xe9e2d0, 0x15131c, 0x2a2536, 0xffe9a0, 0xffe9a0), { scale: s * 0.74, robe: true, crown: true, hover: 8, right: "staff", legLen: 14, torsoH: 19 });
    case "leaper":
      return beast(P(0, 0x2b2c33, 0x141519, 0, 0xff3030), { scale: s * 0.8, length: 34, girth: 11, legLen: 9 });
    case "charger":
      return beast(P(0, 0x33241b, 0x18110c, 0, 0xff5a20), { scale: s * 0.74, length: 34, girth: 16, legLen: 7, horns: true, tail: false });
    case "commander": {
      // Mounted in the first phase, on foot in the second.
      const mount = beast(P(0, 0x3a3d48, 0x1d1f26, 0, 0xffd070), { scale: s * 0.62, length: 44, girth: 15, legLen: 13, saddle: true });
      const rider = humanoid(P(0xd6c7b0, 0x6b5a30, 0x3b3018, 0xffd070, 0xffd070), { scale: 0.95, helmet: true, right: "lance", left: "shield" });
      rider.root.position.y = -22;
      mount.back.add(rider.root);
      const foot = humanoid(P(0xd6c7b0, 0x6b5a30, 0x3b3018, 0xffd070, 0xffd070), { scale: s * 0.9, helmet: true, right: "sword", left: "shield", gait: 13 });
      const root = new THREE.Group();
      root.add(mount.root, foot.root);
      return {
        root,
        height: mount.height + 30 * s * 0.62,
        animate(a) {
          const mounted = a.phase < 2;
          mount.root.visible = mounted;
          foot.root.visible = !mounted;
          if (mounted) {
            mount.animate(a);
            rider.animate({ ...a, moving: false, pose: a.pose === "thrust" ? "thrust" : "guard" });
          } else foot.animate(a);
        },
      };
    }
    case "queen":
      return insect(P(0, 0x2c3318, 0x14180b, 0, 0xc8ff40), s * 0.5);
    case "exploder":
      return prop((skin, root) => {
        const sac = solid(ball(radius), skin.matte(0x3a1414, 0.5), 0, radius * 1.05);
        const core = solid(ball(radius * 0.62), skin.accent(0xff5a20), 0, radius * 1.05);
        root.add(sac, core);
        const legs: THREE.Mesh[] = [];
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const leg = solid(rod(1.4, radius * 0.6), skin.matte(0x4a3814), x * radius * 0.55, radius * 0.25, z * radius * 0.55);
          root.add(leg);
          legs.push(leg);
        }
        return {
          height: radius * 2.2,
          tick: (a) => {
            // It swells as the fuse burns.
            const swell = a.pose === "windup" ? 1 + 0.3 * Math.abs(Math.sin(a.time * 22)) : 1 + 0.04 * Math.sin(a.time * 4);
            sac.scale.setScalar(swell);
            legs.forEach((l, i) => (l.position.y = radius * 0.25 + (a.moving ? Math.abs(Math.sin(a.time * 16 + i * 1.6)) * 2 : 0)));
          },
        };
      });
    case "egg":
      return prop((skin, root) => {
        const shell = solid(ball(radius), skin.matte(0x3d4426, 0.4), 0, radius * 1.25);
        shell.scale.set(1, 1.35, 1);
        root.add(shell, solid(ball(radius * 0.5), skin.accent(0xc8e060), 0, radius * 1.1));
        return { height: radius * 2.8, tick: (a) => (shell.rotation.z = Math.sin(a.time * 9) * 0.06) };
      });
    case "totem":
      return prop((skin, root) => {
        const wood = skin.matte(0x4a3524, 0.9);
        const rune = skin.accent(0xff4f6a);
        root.add(solid(taper(radius * 0.8, radius, 30, 6), wood, 0, 15));
        root.add(solid(taper(radius * 0.6, radius * 0.8, 26, 6), wood, 0, 43));
        root.add(solid(taper(radius * 0.95, radius * 0.5, 14, 6), wood, 0, 63));
        for (const y of [18, 44]) for (const z of [-1, 1]) root.add(solid(box(1.2, 4, 4), rune, radius * 0.72, y, z * radius * 0.35));
        root.add(solid(box(1.2, 2, 9), rune, radius * 0.7, 36, 0));
        return { height: 72 };
      });
  }
}

/** Which pose an enemy's state calls for. */
export function poseFor(kind: EnemyKind, state: string): Pose {
  switch (state) {
    case "windup":
    case "dwind":
    case "blinkwind":
    case "fuse":
      return "windup";
    case "lunge":
    case "strike":
    case "charge":
      return kind === "swarmer" || kind === "brute" ? "attack" : "thrust";
    case "attack":
    case "sweep":
      return "attack";
    case "cast":
    case "spit":
    case "dominion":
      return "cast";
    case "leap":
      return "leap";
    case "broken":
      return "slump";
    default:
      return "idle";
  }
}

/** Turn a figure into a shade: see-through, violet, faintly lit from within. */
export function ghostify(rig: Rig, tint: number): void {
  rig.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || !("emissive" in m)) return;
    m.transparent = true;
    m.opacity = 0.62;
    m.color.lerp(new THREE.Color(tint), 0.7);
    m.depthWrite = false;
  });
}
