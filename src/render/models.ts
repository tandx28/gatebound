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

export const HUNTER_MODEL: ModelSpec = { file: "rogue_hooded", pack: "adventurer", size: 1.02, show: [], strike: "1H_Melee_Attack_Slice_Horizontal", thrust: "1H_Melee_Attack_Stab" };

/** The hunter's swing for each weapon. */
const HUNTER_STRIKE: Record<WeaponType, string> = {
  dagger: "1H_Melee_Attack_Slice_Horizontal",
  sword: "1H_Melee_Attack_Chop",
  spear: "2H_Melee_Attack_Stab",
  bow: "2H_Ranged_Shoot",
};

export const MODELS: Partial<Record<EnemyKind, ModelSpec>> = {
  swarmer: { file: "skeleton_minion", pack: "skeleton", size: 0.82, tint: 0xb9b0a0, right: "dagger", strike: "1H_Melee_Attack_Chop" },
  shooter: { file: "skeleton_rogue", pack: "skeleton", size: 0.88, tint: 0xb9b0a0, right: "bow", strike: "2H_Ranged_Shoot", thrust: "2H_Ranged_Shoot" },
  healer: { file: "skeleton_mage", pack: "skeleton", size: 0.9, tint: 0x9dffb8, right: "staff", strike: "Spellcast_Raise", cast: "Spellcast_Raise" },
  summoner: { file: "skeleton_mage", pack: "skeleton", size: 0.8, tint: 0xc79bff, right: "staff", strike: "Spellcast_Raise", cast: "Spellcast_Raise" },
  monarch: { file: "skeleton_warrior", pack: "skeleton", size: 0.78, tint: 0xffe9a0, right: "staff", hover: 8, strike: "Spellcast_Shoot", cast: "Spellcast_Raise" },
  brute: { file: "barbarian", pack: "adventurer", size: 0.74, show: ["1H_Axe", "Barbarian_Round_Shield"], strike: "1H_Melee_Attack_Chop" },
  knight: { file: "knight", pack: "adventurer", size: 0.78, show: ["1H_Sword", "Rectangle_Shield"], strike: "1H_Melee_Attack_Chop", thrust: "1H_Melee_Attack_Stab" },
  warder: { file: "knight", pack: "adventurer", size: 0.74, tint: 0x8fc4ff, show: ["Spike_Shield"], idle: "Blocking", strike: "Blocking" },
  duellist: { file: "rogue", pack: "adventurer", size: 0.98, tint: 0xff9a9a, show: ["Knife", "Knife_Offhand"], strike: "Dualwield_Melee_Attack_Slice", thrust: "1H_Melee_Attack_Stab" },
  assassin: { file: "rogue_hooded", pack: "adventurer", size: 0.96, tint: 0x8a6cd8, show: ["Knife", "Knife_Offhand"], strike: "Dualwield_Melee_Attack_Slice", thrust: "1H_Melee_Attack_Stab" },
  pyro: { file: "mage", pack: "adventurer", size: 0.92, tint: 0xffa070, show: ["1H_Wand"], strike: "Spellcast_Shoot", cast: "Spellcast_Shoot" },
  warper: { file: "mage", pack: "adventurer", size: 0.9, tint: 0x7fe8ff, show: ["Spellbook_open"], hover: 7, strike: "Spellcast_Shoot", cast: "Spellcast_Shoot" },
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
    let mat = copies.get(old);
    if (!mat) {
      mat = old.clone();
      copies.set(old, mat);
      if (old.name === "Glow") eyes.push(mat);
      else {
        mats.push(mat);
        mat.roughness = 0.75;
        if (spec.tint !== undefined) mat.color.multiply(new THREE.Color(spec.tint));
      }
    }
    m.material = mat;
  });

  // Hand-held parts that came with the model.
  const slots = [bone(body, "handslot.r"), bone(body, "handslot.l")];
  const arsenal = new Map<WeaponType, THREE.Object3D>();
  for (const slot of slots) for (const part of slot?.children ?? []) part.visible = spec.show?.includes(part.name) ?? false;

  const give = (slot: THREE.Object3D | undefined, kind: Held): THREE.Object3D | null => {
    if (!slot) return null;
    const holder = new THREE.Group();
    // Built hanging down from the hand; the model's grip points up.
    holder.rotation.x = Math.PI;
    holder.scale.setScalar(PROP_SCALE);
    const prop = weaponProp(kind);
    // A spear is gripped well forward, so its point clears the floor at rest.
    if (kind === "spear") prop.position.y = 16;
    holder.add(prop);
    slot.add(holder);
    return holder;
  };
  if (spec.right) give(slots[0], spec.right);
  if (spec.left) give(slots[1], spec.left);
  if (hunter) {
    const knife = slots[0]?.children.find((c) => c.name === "Knife");
    if (knife) arsenal.set("dagger", knife);
    for (const type of ["sword", "spear", "bow"] as const) {
      const g = give(slots[0], type);
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

      if (spec.hover) inner.position.y = spec.hover + Math.sin(a.time * 2.4) * 2;

      if (a.flash !== flashed) {
        flashed = a.flash;
        for (const m of mats) {
          m.emissive.setHex(a.flash ? 0xffffff : 0x000000);
          m.emissiveIntensity = a.flash ? 0.9 : 0;
        }
      }
      for (const m of eyes) m.emissiveIntensity = 0.6 + a.glow * 2.4;

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
