import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { EnemyKind } from "../game/config";
import type { ActorKind } from "../game/cutscenes";
import type { WeaponType } from "../game/items";
import { weaponProp, type Anim, type Held, type Pose, type Rig } from "./rigs";

/**
 * Modelled, skinned figures for the hunter and the human and undead enemies
 * (KayKit character packs, CC0, by Kay Lousberg). Everything else, and
 * everything until these have loaded, uses the figures built in rigs.ts.
 *
 * Every character in a pack shares one skeleton, so one file per pack carries
 * the animation clips for all of them.
 */

type Pack = "adventurer" | "skeleton";

/** The file in each pack that holds its clips. */
export const CARRIER: Record<Pack, string> = { adventurer: "rogue_hooded", skeleton: "skeleton_minion" };

export interface ModelSpec {
  file: string;
  pack: Pack;
  /** Height relative to a plain humanoid of the same footprint. */
  size: number;
  /** Multiplied into every colour, to tell kinds that share a model apart. */
  tint?: number;
  /** One flat colour in place of the model's own: a figure seen as a dark shape. */
  flat?: number;
  /** Eyes that burn this colour under the hood. */
  eyes?: number;
  /** Bare-headed: the head keeps the model's own face while the rest goes flat. */
  face?: boolean;
  /** Short tousled hair in the hair colour: a fringe over the brow, layers behind. */
  spikes?: boolean;
  /** Parts of the model left out altogether, by name. */
  hide?: string[];
  /** Hair dyed this colour, in place of the model's own. */
  hair?: number;
  /** Grown proportions: long legs and arms, a longer body and a head a fifth of the height, where the models are half head. */
  lean?: boolean;
  /** A long coat of this colour, hanging from the hips to the shins and open at the front. */
  coat?: number;
  /** Which of the model's own hand-held parts to show; the rest are hidden. */
  show?: string[];
  /** Weapons built by the game and put in the hands. */
  right?: Held;
  left?: Held;
  /** Floats this far above the ground. */
  hover?: number;
  idle?: string;
  /** Clip for a swing, and for the wind-up before it. */
  strike: string;
  thrust?: string;
  cast?: string;
}

export const HUNTER_MODEL: ModelSpec = { file: "knight", pack: "adventurer", size: 1.2, flat: 0x191c2c, face: true, hair: 0x0b0d14, spikes: true, hide: ["Knight_Helmet"], eyes: 0x5ee6ff, lean: true, coat: 0x12141f, show: [], strike: "1H_Melee_Attack_Slice_Horizontal", thrust: "1H_Melee_Attack_Stab" };

/** The hunter's swing for each weapon. */
const HUNTER_STRIKE: Record<WeaponType, string> = {
  dagger: "1H_Melee_Attack_Slice_Horizontal",
  sword: "1H_Melee_Attack_Chop",
  spear: "2H_Melee_Attack_Stab",
  bow: "2H_Ranged_Shoot",
};

export const MODELS: Partial<Record<EnemyKind, ModelSpec>> = {
  swarmer: { file: "skeleton_minion", pack: "skeleton", size: 0.82, tint: 0x8d8679, right: "dagger", strike: "1H_Melee_Attack_Chop" },
  shooter: { file: "skeleton_rogue", pack: "skeleton", size: 0.88, tint: 0x8d8679, right: "bow", strike: "2H_Ranged_Shoot", thrust: "2H_Ranged_Shoot" },
  healer: { file: "skeleton_mage", pack: "skeleton", size: 0.9, tint: 0x5f9a70, right: "staff", strike: "Spellcast_Raise", cast: "Spellcast_Raise" },
  summoner: { file: "skeleton_mage", pack: "skeleton", size: 0.8, tint: 0x7a5aa8, right: "staff", strike: "Spellcast_Raise", cast: "Spellcast_Raise" },
  monarch: { file: "skeleton_warrior", pack: "skeleton", size: 0.78, tint: 0xbfae70, right: "staff", hover: 8, strike: "Spellcast_Shoot", cast: "Spellcast_Raise" },
  brute: { file: "barbarian", pack: "adventurer", size: 0.74, tint: 0x8f6f5f, show: ["1H_Axe", "Barbarian_Round_Shield"], strike: "1H_Melee_Attack_Chop" },
  knight: { file: "knight", pack: "adventurer", size: 0.78, tint: 0x6a6e7c, show: ["1H_Sword", "Rectangle_Shield"], strike: "1H_Melee_Attack_Chop", thrust: "1H_Melee_Attack_Stab" },
  warder: { file: "knight", pack: "adventurer", size: 0.74, tint: 0x4a6a8f, show: ["Spike_Shield"], idle: "Blocking", strike: "Blocking" },
  duellist: { file: "rogue", pack: "adventurer", size: 0.98, tint: 0xa04848, show: ["Knife", "Knife_Offhand"], strike: "Dualwield_Melee_Attack_Slice", thrust: "1H_Melee_Attack_Stab" },
  assassin: { file: "rogue_hooded", pack: "adventurer", size: 0.96, flat: 0x33244a, eyes: 0xb060ff, show: ["Knife", "Knife_Offhand"], strike: "Dualwield_Melee_Attack_Slice", thrust: "1H_Melee_Attack_Stab" },
  pyro: { file: "mage", pack: "adventurer", size: 0.92, tint: 0x9a4a30, show: ["1H_Wand"], strike: "Spellcast_Shoot", cast: "Spellcast_Shoot" },
  warper: { file: "mage", pack: "adventurer", size: 0.9, tint: 0x3a7a8a, show: ["Spellbook_open"], hover: 7, strike: "Spellcast_Shoot", cast: "Spellcast_Shoot" },
};

/** People who appear only in cutscenes. */
export const NPC_MODELS: Record<"mara" | "dov" | "rival", ModelSpec> = {
  mara: { file: "mage", pack: "adventurer", size: 0.98, show: ["Spellbook"], strike: "Spellcast_Shoot" },
  dov: { file: "barbarian", pack: "adventurer", size: 1.05, show: ["Mug"], strike: "1H_Melee_Attack_Chop" },
  rival: { file: "knight", pack: "adventurer", size: 1.08, tint: 0x8a86b0, show: ["2H_Sword"], strike: "2H_Melee_Attack_Slice" },
};

/** Every file the game loads. */
export const MODEL_FILES = [
  ...new Set([HUNTER_MODEL, ...Object.values(MODELS), ...Object.values(NPC_MODELS)].map((s) => s.file).concat(Object.values(CARRIER))),
];

/**
 * Grown proportions for a model that is built half head: each bone's scale
 * (across, along, across), how far that lifts the feet's reach, and how tall
 * the figure then stands. A name ending in a dot means both sides.
 */
const LEAN = {
  bones: [
    ["upperleg.", 1.05, 2.25, 1.05],
    ["spine", 1, 1.18, 1],
    ["upperarm.", 1, 1.45, 1],
    ["head", 0.52, 0.52, 0.52],
  ] as [string, number, number, number][],
  lift: 0.66,
  height: 2.75,
};

/** How tall the models stand in their own units. */
const NATIVE_HEIGHT = 2.2;
/** A plain humanoid is this many times as tall as its footprint is wide. */
const TALL = 3.5;
/** The game's own weapons are built for a figure 46 units tall. */
const PROP_SCALE = NATIVE_HEIGHT / 46;
/** Where in a strike clip the weapon is drawn back, and where the blow has landed. */
const DRAWN = 0.18;
const LANDED = 0.62;

interface Loaded {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
}
const loaded = new Map<string, Loaded>();
let ready = false;

export function modelsReady(): boolean {
  return ready;
}

/** Fetch every model. Until this resolves, `modelRig` returns null. */
export async function loadModels(base: string): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    MODEL_FILES.map(async (file) => {
      const gltf = await loader.loadAsync(`${base}${file}.glb`);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        // A skinned figure's bounds do not follow its pose.
        m.frustumCulled = false;
      });
      loaded.set(file, { scene: gltf.scene, clips: new Map(gltf.animations.map((c) => [c.name, c])) });
    }),
  );
  ready = true;
}

/** three.js strips dots from node names when it loads a file. */
const bone = (root: THREE.Object3D, name: string): THREE.Object3D | undefined => root.getObjectByName(name.replace(/\./g, ""));

/** Hair-coloured textures already made, by the texture they came from and the colour. */
const dyed = new Map<string, THREE.Texture>();

/**
 * A copy of a face texture with its hair dyed. The models paint hair in a
 * strong orange-brown and skin in a pale one, so strongly coloured warm
 * pixels are hair and are replaced, keeping their shading.
 */
function recolourHair(map: THREE.Texture, colour: number): THREE.Texture {
  const key = `${map.uuid}:${colour}`;
  const done = dyed.get(key);
  if (done) return done;
  const img = map.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return map;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  const dye = new THREE.Color(colour).convertLinearToSRGB();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    // Warm (red over green over blue) and strongly coloured: hair, not skin.
    if (!(r > g && g > b && sat > 0.5)) continue;
    const shade = max / 255;
    d[i] = dye.r * 255 * (0.6 + shade);
    d[i + 1] = dye.g * 255 * (0.6 + shade);
    d[i + 2] = dye.b * 255 * (0.6 + shade);
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.flipY = map.flipY;
  out.colorSpace = map.colorSpace;
  out.wrapS = map.wrapS;
  out.wrapT = map.wrapT;
  out.magFilter = map.magFilter;
  out.minFilter = map.minFilter;
  dyed.set(key, out);
  return out;
}

function build(spec: ModelSpec, radius: number, hunter: boolean): Rig | null {
  const src = loaded.get(spec.file);
  const clips = loaded.get(CARRIER[spec.pack])?.clips;
  if (!ready || !src || !clips) return null;

  const height = radius * TALL * spec.size;
  const k = height / NATIVE_HEIGHT;
  const body = cloneSkinned(src.scene);
  const inner = new THREE.Group();
  inner.add(body);
  inner.scale.setScalar(k);
  // Grown proportions make the figure taller in its own units: size it by that height.
  const kLean = height / LEAN.height;
  if (spec.lean) {
    inner.scale.set(kLean * 0.9, kLean, kLean * 0.9);
    // Longer legs reach further down, so the whole body is lifted to keep the feet on the floor.
    body.position.y = LEAN.lift;
  }
  if (spec.hide) for (const name of spec.hide) body.getObjectByName(name)?.removeFromParent();
  // Bones stretched or shrunk for those proportions. Animation resets a bone's
  // scale every frame, so these are put back after each update.
  const reshaped: [THREE.Object3D, number, number, number][] = [];
  if (spec.lean) {
    for (const [name, x, y, z] of LEAN.bones) {
      for (const side of name.endsWith(".") ? ["l", "r"] : [""]) {
        const b = bone(body, name + side);
        if (b) reshaped.push([b, x, y, z]);
      }
    }
  }
  const reshape = () => {
    for (const [b, x, y, z] of reshaped) b.scale.set(x, y, z);
  };
  reshape();
  // The models face +Z; the game's figures face +X.
  inner.rotation.y = Math.PI / 2;
  const root = new THREE.Group();
  root.add(inner);
  // Shared with every other copy of this model: not to be freed with this one.
  body.traverse((o) => (o.userData.shared = true));

  // Each copy has its own materials, so it can flash and be tinted alone.
  const mats: THREE.MeshStandardMaterial[] = [];
  const eyes: THREE.MeshStandardMaterial[] = [];
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const old = m.material as THREE.MeshStandardMaterial;
    // A bare head keeps its face: its own copy of the material, texture and all.
    if (spec.face && m.name.endsWith("_Head")) {
      const skin = old.clone();
      skin.roughness = 0.8;
      // Toned down: bare skin under the hunter's own light burns white otherwise.
      skin.color.multiplyScalar(0.72);
      if (spec.hair !== undefined && skin.map) skin.map = recolourHair(skin.map, spec.hair);
      mats.push(skin);
      m.material = skin;
      return;
    }
    let mat = copies.get(old);
    if (!mat) {
      mat = old.clone();
      copies.set(old, mat);
      if (old.name === "Glow") eyes.push(mat);
      else {
        mats.push(mat);
        mat.roughness = 0.75;
        if (spec.flat !== undefined) {
          mat.map = null;
          mat.color.setHex(spec.flat);
          mat.roughness = 0.6;
        } else if (spec.tint !== undefined) mat.color.multiply(new THREE.Color(spec.tint));
      }
    }
    m.material = mat;
  });

  // Two points of light where the eyes are. Under a hood they are all that shows of the
  // face; on a bare face they burn only while the hunter's power is up.
  const burning: THREE.Mesh[] = [];
  const head = bone(body, "head");
  if (spec.spikes && spec.hair !== undefined && head) {
    // The skull is a ball about half a unit across, centred a little above the neck.
    const strands = new THREE.MeshStandardMaterial({ color: spec.hair, roughness: 0.5 });
    const centre = new THREE.Vector3(0, 0.52, 0);
    const up = new THREE.Vector3(0, 1, 0);
    // A close cap of hair, then layered locks over it; the face stays clear.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.61, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), strands);
    cap.position.copy(centre).add(new THREE.Vector3(0, 0.03, -0.05));
    // Tipped back a little, so the hairline sits above the brow but the crown stays covered.
    cap.rotation.x = -0.2;
    head.add(cap);
    const down = new THREE.Vector3(0, -1, 0);
    // A lock of hair lying on the skull: it starts at a point on the head and
    // falls along the surface, a little outward, swept to one side.
    const lock = (turn: number, rise: number, len: number, width: number, sweep: number, lift = 0.22) => {
      const dir = new THREE.Vector3(Math.cos(rise) * Math.sin(turn), Math.sin(rise), Math.cos(rise) * Math.cos(turn));
      const fall = down.clone().addScaledVector(dir, -down.dot(dir)).normalize();
      const side = new THREE.Vector3().crossVectors(dir, fall);
      const tip = fall.addScaledVector(side, sweep).addScaledVector(dir, lift).normalize();
      const strand = new THREE.Mesh(new THREE.ConeGeometry(width, len, 5), strands);
      strand.position.copy(centre).addScaledVector(dir, 0.6).addScaledVector(tip, len * 0.42);
      strand.quaternion.setFromUnitVectors(up, tip);
      head.add(strand);
    };
    // The fringe: uneven locks over the brow, swept across, stopping short of the eyes.
    [-0.62, -0.38, -0.14, 0.08, 0.3, 0.52].forEach((turn, i) => lock(turn, 0.62, 0.34 + 0.07 * ((i * 5) % 3), 0.15, 0.45));
    // Layers round the sides and the back, longer behind.
    for (let i = 0; i < 11; i++) {
      const turn = 0.85 + (i / 10) * (Math.PI * 2 - 1.7);
      lock(turn, 0.42, 0.42 + 0.08 * (i % 3), 0.17, i % 2 ? 0.25 : -0.2);
      lock(turn + 0.25, 0.85, 0.36, 0.16, 0.3);
    }
    // A few wisps standing off the crown: tousled, not spiked.
    for (const [turn, rise] of [[2.6, 1.25], [3.6, 1.15], [0.6, 1.3], [4.6, 1.2]]) lock(turn, rise, 0.2, 0.07, 0.9, 1.4);
  }
  if (spec.eyes !== undefined && head) {
    const lit = new THREE.MeshStandardMaterial({ color: spec.eyes, emissive: spec.eyes, emissiveIntensity: 2.4 });
    eyes.push(lit);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(spec.face ? 0.05 : 0.07, 8, 6), lit);
      burning.push(eye);
      eye.position.set(side * 0.17, 0.42, 0.49);
      head.add(eye);
    }
  }

  // The coat: a long skirt of cloth from the hips, open at the front, that sways with the stride.
  const hips = bone(body, "hips");
  let coat: THREE.Mesh | null = null;
  if (spec.coat !== undefined && hips) {
    const cloth = new THREE.MeshStandardMaterial({ color: spec.coat, roughness: 0.85, side: THREE.DoubleSide });
    // Open over a fifth of the way round, and that gap faces forward (+Z).
    coat = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 1.25, 14, 1, true, Math.PI * 0.2, Math.PI * 1.6), cloth);
    coat.position.y = -0.52;
    coat.castShadow = true;
    hips.add(coat);
  }

  // The aura: a column of cold fire that only shows when the hunter's power is up.
  let aura: THREE.Mesh | null = null;
  if (hunter) {
    aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.75, 3.1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3050ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    aura.position.y = 1.45;
    inner.add(aura);
  }

  // Hand-held parts that came with the model.
  const slots = [bone(body, "handslot.r"), bone(body, "handslot.l")];
  const arsenal = new Map<WeaponType, THREE.Object3D>();
  for (const slot of slots) for (const part of slot?.children ?? []) part.visible = spec.show?.includes(part.name) ?? false;

  const give = (slot: THREE.Object3D | undefined, kind: Held, metal?: number): THREE.Object3D | null => {
    if (!slot) return null;
    const holder = new THREE.Group();
    // Built hanging down from the hand; the model's grip points up.
    holder.rotation.x = Math.PI;
    holder.scale.setScalar(PROP_SCALE);
    const prop = weaponProp(kind, metal);
    // A spear is gripped well forward, so its point clears the floor at rest.
    if (kind === "spear") prop.position.y = 16;
    holder.add(prop);
    slot.add(holder);
    return holder;
  };
  if (spec.right) give(slots[0], spec.right);
  if (spec.left) give(slots[1], spec.left);
  if (hunter) {
    // All four are the game's own, so each blade carries the same cold light.
    for (const type of ["dagger", "sword", "spear", "bow"] as const) {
      const g = give(slots[0], type, 0x9fdcff);
      if (g) arsenal.set(type, g);
    }
  }

  const mixer = new THREE.AnimationMixer(body);
  const actions = new Map<string, THREE.AnimationAction>();
  const action = (name: string): THREE.AnimationAction | null => {
    let a = actions.get(name);
    if (!a) {
      const clip = clips.get(name);
      if (!clip) return null;
      a = mixer.clipAction(clip);
      actions.set(name, a);
    }
    return a;
  };

  let current: THREE.AnimationAction | null = null;
  let currentKey = "";
  let last = Number.NaN;
  let flashed = false;

  return {
    root,
    height,
    animate(a: Anim) {
      const dt = Number.isNaN(last) ? 0 : Math.min(0.1, Math.max(0, a.time - last));
      last = a.time;

      const strike = hunter && a.weapon ? HUNTER_STRIKE[a.weapon] : hunter ? "Unarmed_Melee_Attack_Punch_A" : spec.strike;
      const thrust = hunter && a.weapon === "spear" ? "2H_Melee_Attack_Stab" : (spec.thrust ?? strike);
      const clipFor: Record<Pose, string> = {
        idle: a.moving ? "Running_A" : (spec.idle ?? "Idle"),
        windup: strike,
        attack: strike,
        thrust,
        bow: "2H_Ranged_Shoot",
        cast: spec.cast ?? "Spellcast_Shoot",
        guard: "Blocking",
        slump: "Hit_A",
        leap: "Jump_Idle",
        down: "Lie_Idle",
        die: "Death_A",
      };
      const name = clipFor[a.pose];
      const looping = a.pose === "idle" || a.pose === "guard" || a.pose === "leap" || a.pose === "down" || name === "Blocking";
      const next = action(name);

      if (next && name !== currentKey) {
        next.reset();
        next.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        next.clampWhenFinished = true;
        next.fadeIn(0.1).play();
        if (!looping) next.time = next.getClip().duration * DRAWN;
        current?.fadeOut(0.1);
        current = next;
        currentKey = name;
      }
      if (current && !looping) {
        const length = current.getClip().duration;
        if (hunter) {
          // The hunter's swing follows the simulation exactly.
          current.paused = true;
          current.time = length * (DRAWN + (LANDED - DRAWN) * a.swing);
        } else if (a.pose === "windup" || a.pose === "slump") {
          // Held drawn back until the blow is let go.
          current.paused = true;
          current.time = length * (a.pose === "slump" ? 0.4 : DRAWN);
        } else {
          current.paused = false;
          current.timeScale = 1.6;
        }
      } else if (current) {
        current.paused = false;
        current.timeScale = name === "Running_A" ? 1.25 : 1;
      }
      mixer.update(dt);
      reshape();

      if (spec.hover) inner.position.y = spec.hover + Math.sin(a.time * 2.4) * 2;

      if (a.flash !== flashed) {
        flashed = a.flash;
        for (const m of mats) {
          m.emissive.setHex(a.flash ? 0xffffff : 0x000000);
          m.emissiveIntensity = a.flash ? 0.9 : 0;
        }
      }
      for (const m of eyes) m.emissiveIntensity = (hunter ? 2.2 : 0.6) + a.glow * 2.4;
      if (spec.face) for (const eye of burning) eye.visible = a.glow > 0.31;
      if (coat) coat.rotation.x = a.moving ? -0.22 + Math.sin(a.time * 9) * 0.06 : Math.sin(a.time * 1.4) * 0.02;
      if (aura) {
        // Nothing at rest; full when Surge, Fury or Blood Price is running.
        const power = Math.max(0, (a.glow - 0.3) / 0.7);
        (aura.material as THREE.MeshBasicMaterial).opacity = power * (0.13 + 0.05 * Math.sin(a.time * 11));
        aura.rotation.y = a.time * 2.5;
        aura.scale.y = 1 + 0.12 * Math.sin(a.time * 7);
        aura.visible = power > 0;
      }

      // Bare hands show nothing at all.
      for (const [type, g] of arsenal) g.visible = type === a.weapon;
    },
  };
}

/** A modelled figure for an enemy kind, or null if it has none or they have not loaded. */
export function modelRig(kind: ActorKind, radius = 14): Rig | null {
  if (kind === "player") return build(HUNTER_MODEL, radius, true);
  if (kind === "mara" || kind === "dov" || kind === "rival") return build(NPC_MODELS[kind], radius, false);
  const spec = MODELS[kind];
  return spec ? build(spec, radius, false) : null;
}
