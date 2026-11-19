import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  ARMY,
  CORPSE,
  ASSASSIN,
  CHARGER,
  EXPLODER,
  HEALER,
  KNIGHT,
  PLAYER,
  ROOM,
  SWARMER,
  TOTEM,
  WARDER,
  WARPER,
  VIEW_H,
  VIEW_W,
  type Rank,
} from "../game/config";
import type { Dungeon, Side } from "../game/dungeon";
import { BOW, WEAPONS, type WeaponType } from "../game/items";
import { PREVIEW_VIEW, previewWeapon } from "../game/ui";
import { WeaponPreview } from "./preview";
import { ELEMENT, formOf, HAND_GLOW, lookOf, type WeaponLook } from "./weapons";
import type { Ally, Corpse, Enemy, Quality, ShotLook, World } from "../game/state";
import { SHOT_HUE } from "../game/allies";
import { Effects } from "./effects";
import { KINDS, type EnemyKind } from "../game/config";
import { CUT, CUTSCENES, type ActorKind, type CutActor } from "../game/cutscenes";
import { roomTheme, TRAPS, trapPhase } from "../game/rooms";
import { dress, pillarFor, type Torch } from "./decor";
import { GRADE, tickFire } from "./fire";
import { modelRig } from "./models";
import { buildRig, ghostify, poseFor, type Pose, type Rig } from "./rigs";

/** Which built figure stands in for a person until the models arrive. */
const STAND_IN = { mara: "pyro", dov: "brute", rival: "knight" } as const;

/** A modelled figure where there is one, a built one otherwise. */
const figure = (kind: ActorKind, radius?: number): Rig =>
  modelRig(kind, radius) ?? buildRig(kind === "mara" || kind === "dov" || kind === "rival" ? STAND_IN[kind] : kind, radius);

/**
 * 3D view of the simulation. The game itself is flat: a sim point (x, y)
 * sits on the ground at three.js (x, 0, y), and a sim angle a faces
 * (cos a, 0, sin a), which is a rotation of -a about the vertical axis.
 */

const RANK_TINT: Record<Rank, number> = { E: 0x3aa0ff, D: 0x35e0a0, C: 0xb070ff, B: 0xff9a3c, A: 0xff4f6a, S: 0xffe9a0 };
const SEALED_TINT = 0xff3355;
const ECHO_TINT = 0x8a6cff;
/** The stone each rank's gates are cut from, so a deeper gate looks like a different place. */
const RANK_STONE: Record<Rank, number> = { E: 0x6c7080, D: 0x5f7468, C: 0x6f6684, B: 0x80705a, A: 0x7c5f66, S: 0x85806c };
const WALL_H = 80;
const WALL_T = 30;
const CAM_OFFSET = new THREE.Vector3(0, 800, 590);
const MAX_PARTICLES = 800;
/** Torch lights the scene always holds, lit or not. */
const TORCH_LIGHTS = 6;

function glow(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x14161f,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.45,
    metalness: 0.35,
  });
}

/** Free the GPU memory held by everything under an object. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // A model's geometry belongs to every copy of it.
    if (m.geometry && !o.userData.shared) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    // Fire shares one material among every flame of its colour.
    else if (mat && !mat.userData.shared) mat.dispose();
  });
}

const finite = (c: { x: number; y: number }) => Number.isFinite(c.x) && Number.isFinite(c.y);

/** A position part-way between where a thing was a step ago and where it is. */
function between(c: { x: number; y: number; px?: number; py?: number }, alpha: number): { x: number; y: number } {
  const px = c.px ?? c.x;
  const py = c.py ?? c.y;
  // A jump across the room (a blink, a new room) is shown as a jump.
  if (Math.hypot(c.x - px, c.y - py) > 120) return { x: c.x, y: c.y };
  return { x: px + (c.x - px) * alpha, y: py + (c.y - py) * alpha };
}

/** Did it move since the last step, faster than a drift? */
const walking = (c: { x: number; y: number; px?: number; py?: number }) => Math.hypot(c.x - (c.px ?? c.x), c.y - (c.py ?? c.y)) > 0.12;

/** A square texture painted in code: no image files. */
function paint(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Worn stone flags: each a slightly different grey, with dark joints and grit. */
function flagstones(): THREE.CanvasTexture {
  return paint(512, (ctx, size) => {
    const n = 8;
    const cell = size / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 96 + Math.floor(Math.random() * 46);
        ctx.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
        ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }
    for (let k = 0; k < 5000; k++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    ctx.strokeStyle = "rgba(10,12,18,0.85)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
      ctx.stroke();
    }
  });
}

/** Courses of rough-cut blocks, each course offset from the one below. */
function masonry(): THREE.CanvasTexture {
  return paint(256, (ctx, size) => {
    const rows = 4;
    const h = size / rows;
    ctx.fillStyle = "#1a1c22";
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      const w = size / 2;
      for (let c = -1; c < 3; c++) {
        const v = 110 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v + 6})`;
        ctx.fillRect(c * w + (r % 2) * (w / 2) + 2, r * h + 2, w - 4, h - 4);
      }
    }
    for (let k = 0; k < 1800; k++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });
}

/** A pool of flat, additive ground markers reused every frame. */
class DecalPool {
  private items: { holder: THREE.Group; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private used = 0;

  constructor(
    private parent: THREE.Object3D,
    private geo: THREE.BufferGeometry,
    private height: number,
  ) {}

  begin(): void {
    this.used = 0;
  }

  /** Place the next marker. Scale is applied in the ground plane. */
  place(x: number, y: number, angle: number, sx: number, sy: number, color: number, opacity: number): void {
    let it = this.items[this.used];
    if (!it) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(mesh);
      this.parent.add(holder);
      it = { holder, mesh, mat };
      this.items.push(it);
    }
    this.used += 1;
    it.holder.visible = true;
    it.holder.position.set(x, this.height, y);
    it.holder.rotation.y = -angle;
    it.mesh.scale.set(sx, sy, 1);
    it.mat.color.setHex(color);
    it.mat.opacity = Math.max(0, Math.min(1, opacity));
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].holder.visible = false;
  }
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, VIEW_W / VIEW_H, 10, 5000);
  private target = new THREE.Vector3(ROOM.w / 2, 0, ROOM.h / 2);
  private roomGroup = new THREE.Group();
  private barriers: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; boss: boolean; trial: boolean }[] = [];
  private builtFor: Dungeon | null | undefined = undefined;
  private builtRoom = -1;
  private builtRev = -1;
  private builtSealed = false;

  private player = new THREE.Group();
  private hunter: Rig;
  /** A lantern's worth of warm light, carried high enough that nothing passes through it. */
  private playerLight = new THREE.PointLight(0xc4d8ff, 15000, 620, 2);
  private sun = new THREE.DirectionalLight(0xffe9d0, 1.9);
  private enemies = new Map<Enemy, Rig>();
  private allies = new Map<Ally, Rig>();
  /** Figures on stage in the cutscene being played. */
  private actors = new Map<CutActor, Rig>();
  private slashes!: Record<"dagger" | "sword" | "spear", THREE.Mesh>;
  private wardShell!: THREE.Mesh;
  /** The fires of the current room, to be made to flicker. */
  private torches: Torch[] = [];
  /**
   * A fixed set of lights for torches, always in the scene; a room lends them
   * out and dark ones sit at zero. The number never changes, because each change
   * makes the GPU rebuild the shader of every lit surface: a stall of a second or more.
   */
  private torchLights: THREE.PointLight[] = [];
  private grade!: ShaderPass;
  /** Enemies that have just fallen, playing out their deaths. */
  private corpses = new Map<Corpse, Rig>();
  private floorTex: THREE.CanvasTexture;
  private wallTex: THREE.CanvasTexture;
  private quality: Quality | null = null;
  private shots: THREE.Mesh[] = [];
  private shotMat = glow(0xff4fd8, 3);
  private allyShotMat = glow(0x8a6cff, 3);
  private arrowMat = glow(0x5ee6ff, 3);
  private shotGeo = new THREE.SphereGeometry(1, 10, 8);

  private circles: DecalPool;
  private rings: DecalPool;
  private lines: DecalPool;
  /** One swing shape per melee weapon type. */
  private sectors: Record<Exclude<WeaponType, "bow" | "staff">, DecalPool>;
  private effects!: Effects;
  /** A material for each look of the player's own shots: arrows, charged arrows, staff bolts. */
  private shotLooks = new Map<ShotLook, THREE.MeshBasicMaterial>();
  private arrowGeo = new THREE.CylinderGeometry(0.35, 0.35, 1, 6).rotateZ(Math.PI / 2);

  private points: THREE.Points;
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private colorCache = new Map<string, THREE.Color>();
  private clock = 0;
  /** The turning weapon on the shop and gear tabs. */
  private preview = new WeaponPreview();
  private tmp = new THREE.Vector3();
  private lost = false;
  private size = { w: VIEW_W, h: VIEW_H, dpr: 1 };
  /** Called when the browser takes the graphics context away, and when it returns. */
  onContext: (state: "lost" | "restored") => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // A browser may drop the graphics context (memory pressure, a driver
    // reset, a sleeping laptop). Without this the view stays blank for good.
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      this.onContext("lost");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      // Everything on the GPU is gone: rebuild the room and the bloom targets.
      this.builtFor = undefined;
      this.resize(this.size.w, this.size.h, this.size.dpr);
      this.onContext("restored");
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Filmic tone mapping: bright things roll off instead of clipping to white.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.scene.background = new THREE.Color(0x07080c);
    this.scene.fog = new THREE.Fog(0x07080c, 1300, 2800);
    this.floorTex = flagstones();
    this.wallTex = masonry();

    // A dim cool sky, a warm key light from the camera's side so faces are
    // lit, and a cold rim from behind to pick figures out of the dark.
    // Dim enough that torches and the hunter's own light do the work, bright enough to read a fight.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    this.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x2a2018, 0.95));
    // The far side of a room sinks into murk.
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.0002);
    const sun = this.sun;
    sun.position.set(ROOM.w / 2 + 420, 900, ROOM.h / 2 + 560);
    sun.target.position.set(ROOM.w / 2, 0, ROOM.h / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    const sc = sun.shadow.camera;
    sc.left = -900;
    sc.right = 900;
    sc.top = 700;
    sc.bottom = -700;
    sc.near = 100;
    sc.far = 2400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    const rim = new THREE.DirectionalLight(0x6f9cff, 0.9);
    rim.position.set(ROOM.w / 2 - 500, 500, ROOM.h / 2 - 700);
    rim.target.position.set(ROOM.w / 2, 0, ROOM.h / 2);
    this.scene.add(sun, sun.target, rim, rim.target);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshBasicMaterial({ color: 0x040507 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ROOM.w / 2, -2, ROOM.h / 2);
    this.scene.add(ground, this.roomGroup);

    this.hunter = figure("player");
    this.player.add(this.hunter.root);
    this.playerLight.position.y = 115;
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const light = new THREE.PointLight(0xff9a3c, 0, 700, 1.7);
      light.userData.torch = null;
      this.torchLights.push(light);
      this.scene.add(light);
    }
    this.player.add(this.playerLight);
    this.scene.add(this.player);

    const fx = new THREE.Group();
    this.scene.add(fx);
    this.circles = new DecalPool(fx, new THREE.CircleGeometry(1, 48), 0.6);
    this.rings = new DecalPool(fx, new THREE.RingGeometry(0.93, 1, 64), 0.9);
    const lineGeo = new THREE.PlaneGeometry(1, 1);
    lineGeo.translate(0.5, 0, 0);
    this.lines = new DecalPool(fx, lineGeo, 0.7);
    const sector = (type: WeaponType) => {
      const half = WEAPONS[type].halfAngle;
      return new DecalPool(fx, new THREE.RingGeometry(0.3, 1, 24, 1, -half, half * 2), 1.4);
    };
    this.sectors = { dagger: sector("dagger"), sword: sector("sword"), spear: sector("spear") };
    // The swing in the air: a thin crescent, lying flat, one for each reach.
    const slash = (type: WeaponType) => {
      const half = WEAPONS[type].halfAngle;
      const geo = new THREE.RingGeometry(0.62, 1, 28, 1, -half, half * 2);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.slashes = { dagger: slash("dagger"), sword: slash("sword"), spear: slash("spear") };
    this.effects = new Effects(this.scene);
    // A soft gold bubble: a wireframe cage here read as a rendering fault.
    this.wardShell = new THREE.Mesh(new THREE.SphereGeometry(36, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.wardShell.visible = false;
    this.scene.add(this.wardShell);

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        size: 9,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // A light touch: only what is truly bright (telegraphs, eyes, blades) glows.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(VIEW_W, VIEW_H), 0.2, 0.4, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Last of all, the grade: contrast, split tone and grain over the finished picture.
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
  }

  /** True while the browser has taken the graphics context away. */
  get isLost(): boolean {
    return this.lost;
  }

  /** GPU objects currently held, to check nothing leaks as enemies come and go. */
  get memory(): { geometries: number; textures: number } {
    return { ...this.renderer.info.memory };
  }

  /** Let go of everything, before this view is replaced by a new one. */
  /** Rebuild every figure: called once the models have loaded. */
  refreshFigures(): void {
    this.player.remove(this.hunter.root);
    disposeTree(this.hunter.root);
    this.hunter = figure("player");
    this.player.add(this.hunter.root);
    for (const map of [this.enemies, this.allies, this.actors, this.corpses]) {
      for (const rig of map.values()) {
        this.scene.remove(rig.root);
        disposeTree(rig.root);
      }
      map.clear();
    }
  }

  dispose(): void {
    disposeTree(this.scene);
    this.preview.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  /**
   * High: shadows and bloom at full sharpness. Medium: bloom, no shadows,
   * a little softer. Low: neither, at the screen's base resolution.
   */
  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.shadowMap.enabled = q === "high";
    this.sun.castShadow = q === "high";
    this.bloom.enabled = q !== "low";
    this.grade.enabled = q !== "low";
    // How many torches cast light depends on the level: have the room built again.
    this.builtRoom = -2;
    // Materials are compiled with or without shadows: have them rebuilt.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize(this.size.w, this.size.h, this.size.dpr);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.size = { w: cssW, h: cssH, dpr };
    const cap = this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(cap, dpr));
    this.renderer.setSize(cssW, cssH, false);
    this.composer.setPixelRatio(Math.min(cap, dpr));
    this.composer.setSize(cssW, cssH);
  }

  /** Where a view-space point falls on the ground, in sim coordinates. */
  groundPoint(viewX: number, viewY: number): { x: number; y: number } {
    const v = this.tmp.set((viewX / VIEW_W) * 2 - 1, -((viewY / VIEW_H) * 2 - 1), 0.5).unproject(this.camera);
    const o = this.camera.position;
    const dy = v.y - o.y;
    if (Math.abs(dy) < 1e-6) return { x: this.target.x, y: this.target.z };
    const t = -o.y / dy;
    return { x: o.x + (v.x - o.x) * t, y: o.z + (v.z - o.z) * t };
  }

  /** View-space position of a sim point at a given height above the ground. */
  project(x: number, y: number, height = 0): { x: number; y: number } {
    const v = this.tmp.set(x, height, y).project(this.camera);
    return { x: ((v.x + 1) / 2) * VIEW_W, y: ((1 - v.y) / 2) * VIEW_H };
  }

  private color(css: string): THREE.Color {
    let c = this.colorCache.get(css);
    if (!c) {
      c = new THREE.Color(css);
      this.colorCache.set(css, c);
    }
    return c;
  }

  private buildRoom(w: World): void {
    for (const child of [...this.roomGroup.children]) {
      this.roomGroup.remove(child);
      disposeTree(child);
    }
    this.barriers = [];
    // A sealed gate is lit red throughout.
    const tint = w.sealed ? SEALED_TINT : RANK_TINT[w.rank];
    const room = w.dungeon ? w.dungeon.rooms[w.roomId] : null;
    const isBoss = room?.kind === "boss";

    // Stone flags, faintly coloured by the gate's rank; a boss room runs dark and red.
    const floorMap = this.floorTex.clone();
    floorMap.needsUpdate = true;
    floorMap.repeat.set(ROOM.w / 400, ROOM.h / 400);
    const shade = new THREE.Color(isBoss ? 0x6a4a50 : RANK_STONE[w.rank]).lerp(new THREE.Color(tint), isBoss ? 0.05 : 0.1);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.h),
      new THREE.MeshStandardMaterial({ map: floorMap, color: shade, roughness: 0.92, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM.w / 2, 0, ROOM.h / 2);
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    // Pillars in the manner of the room, then everything that dresses it.
    const theme = roomTheme(w.rank, w.gateKind === "normal" || w.gateKind === "key" ? room : null);
    for (const pillar of w.pillars) this.roomGroup.add(pillarFor(theme, pillar, this.wallTex, tint));
    this.torches = dress(this.roomGroup, theme, (room?.id ?? 0) + (room?.gx ?? 0) * 31 + (room?.gy ?? 0) * 57, room?.doors ?? {}, tint, WALL_H);
    // Lend the room's first fires the fixed lights; the rest burn without throwing light.
    const lit = this.quality === "high" ? TORCH_LIGHTS : this.quality === "medium" ? 2 : 0;
    this.torchLights.forEach((light, i) => {
      const t = i < lit ? this.torches[i] : undefined;
      light.userData.torch = t ?? null;
      light.intensity = 0;
      if (t) {
        light.position.set(t.x, t.y, t.z);
        light.color.setHex(t.color);
      }
    });

    const wallMat = new THREE.MeshStandardMaterial({ map: this.wallTex, color: isBoss ? 0x7a6066 : RANK_STONE[w.rank], roughness: 0.95, metalness: 0 });
    const trimMat = glow(isBoss ? 0xff3355 : tint, 0.55);
    const nearTrimMat = glow(isBoss ? 0xff3355 : tint, 0.12);
    const cx = ROOM.w / 2;
    const cz = ROOM.h / 2;
    const dh = ROOM.doorHalf;

    // A wall from a to b along its side, laid in blocks so the masonry keeps its scale.
    const wall = (side: Side, a: number, b: number) => {
      const pieces = Math.max(1, Math.round((b - a) / 110));
      for (let i = 0; i < pieces; i++) block(side, a + ((b - a) * i) / pieces, a + ((b - a) * (i + 1)) / pieces);
    };
    const block = (side: Side, a: number, b: number) => {
      // The near wall is kept low so it never hides the floor.
      const h = side === "s" ? 22 : WALL_H;
      const len = b - a;
      const mid = (a + b) / 2;
      const along = side === "n" || side === "s";
      const geo = along ? new THREE.BoxGeometry(len, h, WALL_T) : new THREE.BoxGeometry(WALL_T, h, len);
      const off = side === "n" || side === "w" ? -WALL_T / 2 : (along ? ROOM.h : ROOM.w) + WALL_T / 2;
      const body = new THREE.Mesh(geo, wallMat);
      body.position.set(along ? mid : off, h / 2, along ? off : mid);
      body.castShadow = true;
      body.receiveShadow = true;
      const trimGeo = along ? new THREE.BoxGeometry(len, 3, WALL_T + 2) : new THREE.BoxGeometry(WALL_T + 2, 3, len);
      // The near wall sits right under the camera: keep its edge faint.
      const trim = new THREE.Mesh(trimGeo, side === "s" ? nearTrimMat : trimMat);
      trim.position.set(body.position.x, h + 1.5, body.position.z);
      this.roomGroup.add(body, trim);
    };

    for (const side of ["n", "s", "w", "e"] as Side[]) {
      const along = side === "n" || side === "s";
      const lo = -WALL_T;
      const hi = (along ? ROOM.w : ROOM.h) + WALL_T;
      const c = along ? cx : cz;
      const to = room?.doors[side];
      if (to === undefined) {
        wall(side, lo, hi);
        continue;
      }
      wall(side, lo, c - dh);
      wall(side, c + dh, hi);
      // A coloured field fills the doorway: red when locked, faint when open.
      const boss = w.dungeon!.rooms[to].kind === "boss";
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const h = side === "s" ? 22 : WALL_H - 10;
      const geo = along ? new THREE.BoxGeometry(dh * 2, h, 6) : new THREE.BoxGeometry(6, h, dh * 2);
      const mesh = new THREE.Mesh(geo, mat);
      const off = side === "n" || side === "w" ? -WALL_T / 2 : (along ? ROOM.h : ROOM.w) + WALL_T / 2;
      mesh.position.set(along ? c : off, h / 2, along ? off : c);
      this.roomGroup.add(mesh);
      this.barriers.push({ mesh, mat, boss, trial: w.dungeon!.rooms[to].kind === "trial" });
    }
  }

  private syncEnemies(w: World, alpha: number): void {
    for (const [e, rig] of this.enemies) {
      if (!w.enemies.includes(e)) {
        this.scene.remove(rig.root);
        disposeTree(rig.root);
        this.enemies.delete(e);
      }
    }
    for (const e of w.enemies) {
      if (!finite(e)) continue;
      let rig = this.enemies.get(e);
      if (!rig) {
        rig = figure(e.kind, e.radius);
        this.enemies.set(e, rig);
        this.scene.add(rig.root);
      }
      const at = between(e, alpha);
      rig.root.position.set(at.x, 0, at.y);
      rig.root.rotation.y = -e.facing;

      // The eyes and runes tell the state: flaring on a wind-up, dark when spent.
      const pose = poseFor(e.kind, e.state);
      const winding = pose === "windup" || pose === "cast";
      const glow = e.immortal ? 1 : winding ? 0.5 + 0.5 * Math.sin(this.clock * 30) : e.state === "recover" ? 0 : e.phase >= 2 ? 0.55 : 0.25;
      rig.animate({ time: this.clock + e.maxHp, moving: walking(e), pose, swing: 0.7, flash: e.flash > 0, glow, phase: e.phase });

      // A vanished shade is not there at all; anything else untouchable flickers.
      rig.root.visible = e.state !== "vanish" && (e.inv <= 0 || e.immortal || Math.floor(this.clock * 30) % 2 === 0);
      // A leaper rises and falls through its jump.
      if (e.state === "leap") rig.root.position.y = 70 * Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - e.t / 0.35)));
    }
  }

  /** How the weapon in hand is made: its rarity, and the first element among its perks. */
  private gearOf(w: World): WeaponLook {
    const pr = w.profile;
    const owned = pr.equipped[pr.activeWeapon === 1 ? "weapon2" : "weapon"];
    // In the hand the glow is held back; the board's preview shows it in full.
    return owned ? lookOf(owned, HAND_GLOW) : { rarity: null, element: null };
  }

  /** The fallen lie where they fell, then sink out of sight. */
  private syncCorpses(w: World): void {
    for (const [c, rig] of this.corpses) {
      if (!w.corpses.includes(c)) {
        this.scene.remove(rig.root);
        disposeTree(rig.root);
        this.corpses.delete(c);
      }
    }
    for (const c of w.corpses) {
      let rig = this.corpses.get(c);
      if (!rig) {
        rig = figure(c.kind, c.radius);
        this.corpses.set(c, rig);
        this.scene.add(rig.root);
      }
      const sunk = Math.max(0, 1 - c.t / CORPSE.sink);
      rig.root.position.set(c.x, -(rig.height + 12) * sunk * sunk, c.y);
      rig.root.rotation.y = -c.facing;
      rig.animate({ time: this.clock, moving: false, pose: "die", swing: 1, flash: false, glow: 0, phase: 1 });
    }
  }

  /** The cast of a cutscene. Returns where the camera should look, and how closely. */
  private syncActors(w: World, alpha: number): { x: number; y: number; zoom: number } | null {
    const cs = w.cutscene;
    for (const [a, rig] of this.actors) {
      if (!cs || !cs.actors.includes(a)) {
        this.scene.remove(rig.root);
        disposeTree(rig.root);
        this.actors.delete(a);
      }
    }
    if (!cs) return null;
    for (const a of cs.actors) {
      let rig = this.actors.get(a);
      if (!rig) {
        rig = figure(a.kind, a.kind === "player" ? 14 : a.kind in KINDS ? KINDS[a.kind as EnemyKind].radius : 14);
        if (a.ghost) ghostify(rig, ECHO_TINT);
        this.actors.set(a, rig);
        this.scene.add(rig.root);
      }
      const at = between(a, alpha);
      const up = a.anim <= 0 ? 1 : a.out ? a.anim / CUT.sink : 1 - a.anim / CUT.rise;
      rig.root.position.set(at.x, -(rig.height + 12) * (1 - up) * (1 - up), at.y);
      rig.root.rotation.y = -a.facing;
      // Actors that attack or cast play the move through, over and over, rather than holding one frame.
      const acting = a.pose === "attack" || a.pose === "cast";
      rig.animate({ time: this.clock + at.x, moving: a.moving, pose: a.pose, swing: acting ? (this.clock * 1.4) % 1 : 0.7, flash: false, glow: a.ghost || a.pose === "cast" ? 1 : 0.3, phase: 1, weapon: a.kind === "player" ? "sword" : undefined });
    }
    const beat = CUTSCENES[cs.id].beats[cs.beat];
    // The camera drifts over the beat: to its pan point if it has one, and always a little closer.
    const k = Math.min(1, cs.t / beat.dur);
    const ease = k * k * (3 - 2 * k);
    const to = beat.pan ?? beat.focus;
    const zoomTo = beat.zoomTo ?? beat.zoom * 1.06;
    return { x: beat.focus[0] + (to[0] - beat.focus[0]) * ease, y: beat.focus[1] + (to[1] - beat.focus[1]) * ease, zoom: beat.zoom + (zoomTo - beat.zoom) * ease };
  }

  /** Echoes wear the shape they had in life, as violet shades. */
  private syncAllies(w: World, alpha: number): void {
    for (const [a, rig] of this.allies) {
      if (!w.allies.includes(a)) {
        this.scene.remove(rig.root);
        disposeTree(rig.root);
        this.allies.delete(a);
      }
    }
    for (const a of w.allies) {
      if (!finite(a)) continue;
      let rig = this.allies.get(a);
      if (!rig) {
        rig = figure(a.kind, a.radius);
        ghostify(rig, ECHO_TINT);
        this.allies.set(a, rig);
        this.scene.add(rig.root);
      }
      const at = between(a, alpha);
      // Called up, it climbs out of the floor; sent away, it sinks back in.
      const up = a.anim <= 0 ? 1 : a.out ? a.anim / ARMY.leave : 1 - a.anim / ARMY.rise;
      rig.root.position.set(at.x, -(rig.height + 12) * (1 - up) * (1 - up), at.y);
      rig.root.rotation.y = -a.facing + (1 - up) * 2.5;
      const striking = a.flash > 0;
      rig.animate({ time: this.clock + a.radius, moving: walking(a), pose: striking ? "attack" : "idle", swing: 0.7, flash: false, glow: striking ? 1 : 0.4, phase: 1 });
      // Under Dominion they burn red: a warning to keep clear.
      const lit = w.turnedT > 0 ? 0xff2030 : ECHO_TINT;
      rig.root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && "emissive" in m) {
          m.emissive.setHex(lit);
          m.emissiveIntensity = w.turnedT > 0 ? 0.9 : 0.2;
        }
      });
    }
  }

  /** The material for a look of shot, made once and kept. */
  private lookMat(look: ShotLook): THREE.MeshBasicMaterial {
    let m = this.shotLooks.get(look);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: this.color(SHOT_HUE[look]), transparent: true, opacity: 0.95, blending: look === "quill" ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false });
      if (look === "quill") m.color.setHex(0x0a0a10);
      this.shotLooks.set(look, m);
    }
    return m;
  }

  private syncShots(w: World, alpha: number): void {
    const all = [...w.projectiles, ...w.allyShots];
    while (this.shots.length < all.length) {
      const m = new THREE.Mesh(this.shotGeo, this.shotMat);
      this.scene.add(m);
      this.shots.push(m);
    }
    this.shots.forEach((m, i) => {
      const s = all[i];
      // Echo shots are violet; enemy shots stay magenta.
      // The player's arrows are cyan, an echo's shots violet, an enemy's magenta.
      if (s) m.material = i < w.projectiles.length ? this.shotMat : s.mine ? this.arrowMat : this.allyShotMat;
      m.visible = !!s;
      if (s) {
        const at = between(s, alpha);
        m.position.set(at.x, 26, at.y);
        m.rotation.set(0, 0, 0);
        m.geometry = this.shotGeo;
        m.scale.setScalar(s.radius);
        if (s.look) {
          m.material = this.lookMat(s.look);
          const angle = Math.atan2(s.vy, s.vx);
          if (s.look === "arrow" || s.look === "charged" || s.look === "quill") {
            // Arrows and quills are long and thin, pointing the way they fly.
            m.geometry = this.arrowGeo;
            m.rotation.y = -angle;
            m.scale.set(s.look === "charged" ? 46 : 26, s.look === "charged" ? 5 : 3, s.look === "charged" ? 5 : 3);
          } else {
            // A staff's bolt pulses as it flies.
            m.scale.setScalar(s.radius * (1 + 0.2 * Math.sin(this.clock * 30 + s.x * 0.01)));
          }
        }
      }
    });
  }

  private syncDecals(w: World): void {
    const p = w.player;
    this.circles.begin();
    this.rings.begin();
    this.lines.begin();
    for (const pool of Object.values(this.sectors)) pool.begin();

    // Floor traps: always marked, ringed while they warn, filled while they bite.
    for (const t of w.traps) {
      const { phase, k } = trapPhase(t, w.trapClock);
      if (t.kind === "sludge") {
        this.circles.place(t.x, t.y, 0, t.radius, t.radius, 0x5a8a3a, 0.4);
        this.rings.place(t.x, t.y, 0, t.radius, t.radius, 0x8ac060, 0.5);
      } else if (t.kind === "spike") {
        this.rings.place(t.x, t.y, 0, t.radius, t.radius, phase === "idle" ? 0x8a8f99 : 0xff3040, phase === "idle" ? 0.35 : 0.9);
        if (phase === "warn") this.circles.place(t.x, t.y, 0, t.radius * k, t.radius * k, 0xff3040, 0.3);
        if (phase === "on") this.circles.place(t.x, t.y, 0, t.radius, t.radius, 0xffe0e0, 0.75);
      } else {
        const width = TRAPS.flame.width * 2;
        const color = phase === "on" ? 0xffb040 : 0xff7a20;
        this.lines.place(t.x - t.radius, t.y, 0, t.radius * 2, phase === "idle" ? 6 : phase === "warn" ? width * k : width, color, phase === "idle" ? 0.3 : phase === "warn" ? 0.3 : 0.8);
      }
    }

    for (const e of w.enemies) {
      const a = Math.atan2(e.dirY, e.dirX);
      if (e.kind === "swarmer" && e.state === "windup") {
        const k = 1 - e.t / SWARMER.windup;
        this.lines.place(e.x, e.y, a, SWARMER.lungeSpeed * SWARMER.lungeTime, e.radius * 2, 0xff3040, 0.15 + 0.45 * k);
      } else if (e.kind === "charger" && e.state === "windup") {
        const k = 1 - e.t / CHARGER.windup;
        this.lines.place(e.x, e.y, a, CHARGER.chargeSpeed * CHARGER.chargeTime, e.radius * 2, 0xff7a20, 0.12 + 0.4 * k);
      } else if ((e.kind === "shooter" || e.kind === "healer") && e.state === "windup") {
        this.lines.place(e.x, e.y, a, 520, 3, 0xff4fd8, 0.6);
      } else if (e.kind === "duellist" && e.state === "windup") {
        this.lines.place(e.x, e.y, a, 180, e.radius * 2, 0xffffff, 0.45);
      } else if (e.kind === "exploder" && e.state === "fuse") {
        const k = 1 - e.t / EXPLODER.fuse;
        this.rings.place(e.x, e.y, 0, EXPLODER.blastRadius, EXPLODER.blastRadius, 0xffd84a, 0.8);
        this.circles.place(e.x, e.y, 0, EXPLODER.blastRadius * k, EXPLODER.blastRadius * k, 0xffb020, 0.35);
      } else if (e.kind === "healer" && e.state === "cast") {
        this.rings.place(e.x, e.y, 0, HEALER.radius, HEALER.radius, 0x6dff9c, 0.5);
      } else if (e.kind === "summoner" && e.state === "cast") {
        this.rings.place(e.x, e.y, 0, 60, 60, 0xb070ff, 0.9);
      }
      if (e.kind === "assassin" && e.state === "windup") {
        this.lines.place(e.x, e.y, a, ASSASSIN.lungeSpeed * ASSASSIN.lungeTime + 20, e.radius * 2, 0x9b5cff, 0.5);
      } else if (e.kind === "knight" && e.state === "windup") {
        this.lines.place(e.x, e.y, a, KNIGHT.lungeSpeed * KNIGHT.lungeTime + 20, e.radius * 2, 0xd0d8e8, 0.4);
      } else if (e.kind === "commander" && e.state === "windup") {
        this.lines.place(e.x, e.y, a, 820 * 0.7, e.radius * 2.4, 0xffd070, 0.4);
      } else if ((e.kind === "commander" && e.state === "dwind") || (e.kind === "monarch" && e.state === "blinkwind")) {
        this.lines.place(e.x, e.y, a, 180, e.radius * 2, 0xffffff, 0.5);
      } else if (e.kind === "warper" && e.state === "cast") {
        // The swap is aimed at the player: the mark is on them, closing as it comes.
        const k = Math.max(0, e.t / WARPER.cast);
        this.rings.place(p.x, p.y, 0, 30 + 60 * k, 30 + 60 * k, 0x40e0ff, 0.9);
      } else if (e.kind === "monarch" && e.state === "dominion") {
        this.rings.place(e.x, e.y, 0, 120, 120, 0xff5a60, 0.8);
      }
      if (e.kind === "warder") this.rings.place(e.x, e.y, 0, WARDER.aura, WARDER.aura, 0x7fd0ff, 0.18);
      if (e.kind === "totem") {
        const pulse = 60 + 30 * Math.sin(this.clock * 3 * TOTEM.damage);
        this.rings.place(e.x, e.y, 0, pulse, pulse, 0xff4f6a, 0.45);
      }
      if (e.guard > 0) this.rings.place(e.x, e.y, 0, e.radius + 12, e.radius + 12, 0xffd84a, 0.7);
      if (e.kind === "brute" && e.state !== "recover") {
        // Faint arc showing where the shield blocks.
        this.rings.place(e.x, e.y, 0, e.radius + 10, e.radius + 10, 0x8fb4ff, 0.25);
      }
    }

    for (const r of w.remnants) {
      // A remnant: a violet ring that tightens as it fades.
      const k = Math.min(1, r.life / 2);
      const pulse = 22 + 6 * Math.sin(this.clock * 6);
      this.rings.place(r.x, r.y, 0, pulse, pulse, ECHO_TINT, 0.9 * k);
      this.circles.place(r.x, r.y, 0, 12, 12, ECHO_TINT, 0.5 * k);
    }
    for (const a of w.allies) this.rings.place(a.x, a.y, 0, a.radius + 6, a.radius + 6, ECHO_TINT, a.anim > 0 ? 0.9 : 0.35);

    for (const patch of w.patches) {
      const k = Math.min(1, patch.life);
      const flick = 0.22 + 0.08 * Math.sin(this.clock * 9 + patch.x);
      this.circles.place(patch.x, patch.y, 0, patch.radius, patch.radius, 0xff6a20, flick * k);
      this.rings.place(patch.x, patch.y, 0, patch.radius, patch.radius, 0xff8a3c, 0.6 * k);
    }
    if (w.domainT > 0) this.rings.place(p.x, p.y, 0, 34, 34, 0x4f7bff, 0.7);
    if (w.rallyTarget) this.rings.place(w.rallyTarget.x, w.rallyTarget.y, 0, w.rallyTarget.radius + 18, w.rallyTarget.radius + 18, 0xb9a4ff, 0.9);

    for (const z of w.zones) {
      const k = 1 - z.t / z.total;
      this.rings.place(z.x, z.y, 0, z.radius, z.radius, 0xff3040, 0.9);
      this.circles.place(z.x, z.y, 0, z.radius * k, z.radius * k, 0xff3040, 0.18 + 0.3 * k);
    }
    for (const s of w.shockwaves) {
      if (s.wait > 0) {
        // Warning: the ring flickers where it will start, and a faint disc fills it.
        const flick = 0.45 + 0.45 * Math.sin(this.clock * 26);
        this.rings.place(s.x, s.y, 0, s.r, s.r, 0xffd84a, flick);
        this.circles.place(s.x, s.y, 0, s.r, s.r, 0xff5a60, 0.22);
      } else this.rings.place(s.x, s.y, 0, s.r, s.r, 0xff5a60, 0.9);
    }
    for (const f of w.fx) {
      const k = f.t / f.total;
      const c = this.color(f.color).getHex();
      if (f.kind === "beam") {
        // A wide wash of colour with a white-hot core, both thinning as it fades.
        this.lines.place(f.x, f.y, f.angle ?? 0, f.radius, 70 * k, c, 0.55 * k);
        this.lines.place(f.x, f.y, f.angle ?? 0, f.radius, 18 * k, 0xffffff, 0.95 * k);
      } else if (f.kind === "ring") this.rings.place(f.x, f.y, 0, f.radius * (1.1 - 0.5 * k), f.radius * (1.1 - 0.5 * k), c, k);
      else if (f.kind === "blast") this.circles.place(f.x, f.y, 0, f.radius, f.radius, c, 0.5 * k);
      // Every other kind is a 3D effect, drawn by the effects module.
    }

    if (p.attackT > 0) {
      const k = p.attackT / PLAYER.attackActive;
      const type = p.weapon && p.weapon !== "bow" && p.weapon !== "staff" ? p.weapon : "dagger";
      const reach = WEAPONS[type].range;
      // The cut on the floor takes the colour of whatever the blade carries.
      const gear = this.gearOf(w);
      const hue = (gear.element && ELEMENT[gear.element]) || (gear.base ? formOf(type, gear.base).glow : 0x5ee6ff);
      this.sectors[type].place(p.x, p.y, p.attackFacing, reach, reach, hue, 0.35 + 0.5 * k);
      // And the same cut in the air at blade height, sweeping across as the swing goes.
      const arc = this.slashes[type];
      arc.visible = true;
      arc.position.set(p.x, 30, p.y);
      arc.rotation.y = -p.attackFacing + (0.5 - k) * 0.9;
      arc.scale.setScalar(reach);
      const am = arc.material as THREE.MeshBasicMaterial;
      am.color.setHex(hue);
      am.opacity = 0.75 * k;
    }
    for (const [type, arc] of Object.entries(this.slashes)) if (p.attackT <= 0 || type !== (p.weapon && p.weapon !== "bow" && p.weapon !== "staff" ? p.weapon : "dagger")) arc.visible = false;
    // A ward waiting to take a hit shows as a shell of light round the hunter.
    this.wardShell.visible = w.wardReady && w.mode === "gate" && !w.cutscene;
    if (this.wardShell.visible) {
      this.wardShell.position.set(p.x, 34, p.y);
      this.wardShell.rotation.y = this.clock * 0.8;
      (this.wardShell.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.03 * Math.sin(this.clock * 5);
    }
    // A cutscene shows the hunter plain: no aim line, no rings underfoot.
    const field = w.mode === "gate" && !w.cutscene;
    if (p.surgeT > 0 && field) this.rings.place(p.x, p.y, 0, 26, 26, 0xffd84a, 0.7);
    // Aim marker under the player.
    if (field) this.lines.place(p.x, p.y, p.facing, 34, 2, 0x5ee6ff, 0.5);
    // The hunter stands in a pool of cold light that breathes.
    if (field) this.rings.place(p.x, p.y, 0, 24 + 2 * Math.sin(this.clock * 3), 24 + 2 * Math.sin(this.clock * 3), 0x5ee6ff, 0.45);

    this.circles.end();
    this.rings.end();
    this.lines.end();
    for (const pool of Object.values(this.sectors)) pool.end();
  }

  private syncParticles(w: World): void {
    const n = Math.min(MAX_PARTICLES, w.particles.length);
    for (let i = 0; i < n; i++) {
      const pt = w.particles[i];
      const c = this.color(pt.color);
      // Never negative: a negative colour would poison the bloom.
      const a = finite(pt) ? Math.max(0, Math.min(1, pt.life * 4)) : 0;
      this.pPos[i * 3] = pt.x;
      this.pPos[i * 3 + 1] = 16 + (pt.vx !== 0 || pt.vy !== 0 ? pt.life * 40 : 6);
      this.pPos[i * 3 + 2] = pt.y;
      this.pCol[i * 3] = c.r * a;
      this.pCol[i * 3 + 1] = c.g * a;
      this.pCol[i * 3 + 2] = c.b * a;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  /** Draw the world. `alpha` is how far the clock stands between the last two steps. */
  render(w: World, dt: number, alpha = 1): void {
    if (this.lost) return;
    this.clock += dt;
    let snap = false;
    const moved = this.builtFor !== w.dungeon || this.builtRoom !== w.roomId;
    if (moved || this.builtRev !== w.layoutRev || this.builtSealed !== w.sealed) {
      this.buildRoom(w);
      this.builtFor = w.dungeon;
      this.builtRoom = w.roomId;
      this.builtRev = w.layoutRev;
      this.builtSealed = w.sealed;
      // A new door in the same room must not jolt the camera.
      snap = moved;
    }

    for (const b of this.barriers) {
      b.mat.color.setHex(w.doorsOpen ? (b.boss ? 0xff3355 : b.trial ? 0xffd84a : RANK_TINT[w.rank]) : 0xff2030);
      b.mat.opacity = w.doorsOpen ? 0.1 + 0.05 * Math.sin(this.clock * 3) : 0.3;
    }

    const p = w.player;
    // A bad position would reach the player's light and blank the whole view.
    if (!finite(p)) return;
    const at = between(p, alpha);
    this.player.position.set(at.x, 0, at.y);
    this.player.rotation.y = -p.facing;
    const fast = p.dashT > 0 || p.lungeT > 0;
    // The swing plays over the first fifth of a second after an attack begins.
    const since = p.d.attackCooldown - p.attackCd;
    const swinging = p.attackCd > 0 && since < 0.2;
    const type = p.weapon ?? "dagger";
    const drawing = type === "bow" && p.drawT > 0;
    const pose: Pose =
      p.lungeT > 0 ? "thrust" : p.dashT > 0 ? "leap" : drawing ? "bow" : !swinging ? "idle" : type === "bow" || type === "staff" ? "bow" : type === "spear" ? "thrust" : "attack";
    this.hunter.animate({
      time: this.clock,
      moving: p.moving && w.mode === "gate",
      pose,
      // While the string is drawn, the shot is held at its drawn-back moment.
      swing: drawing ? 0 : Math.min(1, Math.max(0, since / 0.2)),
      draw: drawing ? Math.min(1, p.drawT / BOW.charge) : 0,
      flash: p.hurtFlash > 0,
      glow: p.surgeT > 0 || p.furyT > 0 || p.drainT > 0 ? 1 : 0.3,
      // Blood Price burns red, Fury orange, Surge gold.
      aura: p.drainT > 0 ? 0xff2040 : p.furyT > 0 ? 0xff5a20 : 0xffc040,
      gear: this.gearOf(w),
      phase: 1,
      weapon: p.weapon,
    });
    this.playerLight.color.setHex(p.surgeT > 0 ? 0xffd070 : 0xc4d8ff);
    // Blink while invulnerable after a hit (not during a dash).
    const blinking = p.iframes > 0 && !fast && Math.floor(p.iframes * 20) % 2 === 0;
    this.playerLight.intensity = w.mode === "dead" || w.mode === "title" ? 0 : 15000;

    // During a cutscene the hunter is one of the cast, not the player's figure.
    // Fire wavers, and the light it throws with it.
    tickFire(this.clock);
    this.grade.uniforms.time.value = this.clock % 100;
    for (const light of this.torchLights) {
      const t = light.userData.torch as Torch | null;
      light.intensity = t ? t.base * (0.82 + 0.12 * Math.sin(this.clock * 11 + t.phase) + 0.06 * Math.sin(this.clock * 27 + t.phase * 3)) : 0;
    }
    const stage = this.syncActors(w, alpha);
    // Only the figure blinks or hides; its lamp stays, so the count of lights never changes.
    this.hunter.root.visible = !stage && !blinking && w.mode !== "dead" && w.mode !== "title";
    if (stage) this.player.position.set(stage.x, 0, stage.y);

    this.syncEnemies(w, alpha);
    this.syncCorpses(w);
    this.syncAllies(w, alpha);
    this.syncShots(w, alpha);
    this.syncDecals(w);
    this.effects.sync(w, dt, this.clock);
    this.syncParticles(w);

    // Follow the player, but stop before showing much beyond the walls.
    const tx = stage ? stage.x : THREE.MathUtils.clamp(at.x, 520, ROOM.w - 520);
    const tz = stage ? stage.y : THREE.MathUtils.clamp(at.y, 330, ROOM.h - 260);
    // A cutscene moves the camera in and out; play always stands at 1.
    // The ultimate showcase pushes in slowly on the ring of targets.
    const show = w.practice ? 1.15 + 0.25 * Math.min(1, w.practice.age / 3) : 0;
    const zoom = stage ? stage.zoom : show || 1;
    if (Math.abs(this.camera.zoom - zoom) > 0.001) {
      this.camera.zoom += (zoom - this.camera.zoom) * (stage || show ? 1 - Math.exp(-2.5 * dt) : 1);
      this.camera.updateProjectionMatrix();
    }
    // A new room cuts straight to its framing instead of sliding across.
    const ease = snap ? 1 : 1 - Math.exp(-6 * dt);
    this.target.x += (tx - this.target.x) * ease;
    this.target.z += (tz - this.target.z) * ease;
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.lookAt(this.target);
    // Aiming and labels use the steady camera; shake is applied on top.
    this.camera.updateMatrixWorld();
    const steady = this.camera.position.clone();
    const shake = w.settings.shake ? w.shake * 1.5 : 0;
    this.camera.position.x += (Math.random() - 0.5) * shake;
    this.camera.position.y += (Math.random() - 0.5) * shake;

    this.composer.render();
    this.preview.draw(this.renderer, previewWeapon(w), PREVIEW_VIEW, this.size.w, this.size.h, this.clock);
    this.camera.position.copy(steady);
    this.camera.updateMatrixWorld();
  }
}
