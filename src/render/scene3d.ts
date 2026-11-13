import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  CHARGER,
  EXPLODER,
  HEALER,
  PLAYER,
  ROOM,
  SWARMER,
  VIEW_H,
  VIEW_W,
  type EnemyKind,
  type Rank,
} from "../game/config";
import type { Dungeon, Side } from "../game/dungeon";
import type { Ally, Enemy, World } from "../game/state";

/**
 * 3D view of the simulation. The game itself is flat: a sim point (x, y)
 * sits on the ground at three.js (x, 0, y), and a sim angle a faces
 * (cos a, 0, sin a), which is a rotation of -a about the vertical axis.
 */

const RANK_TINT: Record<Rank, number> = { E: 0x3aa0ff, D: 0x35e0a0, C: 0xb070ff };
const SEALED_TINT = 0xff3355;
const ECHO_TINT = 0x8a6cff;
const KIND_COLOR: Record<EnemyKind, number> = {
  swarmer: 0xe5484d,
  charger: 0xff8a3c,
  shooter: 0xff4fd8,
  brute: 0x8fb4ff,
  exploder: 0xffd84a,
  healer: 0x6dff9c,
  warden: 0xff5a40,
  summoner: 0xb070ff,
  duellist: 0xffffff,
};

const WALL_H = 80;
const WALL_T = 30;
const CAM_OFFSET = new THREE.Vector3(0, 800, 590);
const MAX_PARTICLES = 800;

interface EnemyView {
  group: THREE.Group;
  core: THREE.MeshStandardMaterial;
  color: THREE.Color;
  spin?: THREE.Object3D;
}

function glow(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x14161f,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.45,
    metalness: 0.35,
  });
}

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function buildEnemy(kind: EnemyKind, r: number): EnemyView {
  const group = new THREE.Group();
  const color = new THREE.Color(KIND_COLOR[kind]);
  const core = glow(KIND_COLOR[kind]);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f2e, roughness: 0.6, metalness: 0.5 });
  let spin: THREE.Object3D | undefined;

  switch (kind) {
    case "swarmer":
      group.add(part(new THREE.IcosahedronGeometry(r, 0), core, 0, r));
      break;
    case "charger": {
      const horn = part(new THREE.ConeGeometry(r * 0.9, r * 2.8, 5), core, 0, r);
      horn.rotation.z = -Math.PI / 2;
      group.add(horn);
      break;
    }
    case "shooter": {
      group.add(part(new THREE.OctahedronGeometry(r, 0), core, 0, r + 12));
      const halo = part(new THREE.TorusGeometry(r + 6, 1.5, 6, 24), core, 0, r + 12);
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
      spin = halo;
      break;
    }
    case "brute": {
      group.add(part(new THREE.CylinderGeometry(r * 0.9, r * 1.1, 50, 8), dark, 0, 25));
      group.add(part(new THREE.BoxGeometry(14, 10, 14), core, 0, 56));
      // The shield marks the side that blocks attacks.
      group.add(part(new THREE.BoxGeometry(5, 44, r * 2.3), core, r + 5, 26));
      break;
    }
    case "exploder":
      group.add(part(new THREE.SphereGeometry(r, 14, 10), core, 0, r));
      break;
    case "healer": {
      group.add(part(new THREE.TetrahedronGeometry(r * 1.3, 0), core, 0, r + 10));
      const ring = part(new THREE.TorusGeometry(r + 8, 1.5, 6, 24), core, 0, 3);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      break;
    }
    case "warden": {
      group.add(part(new THREE.BoxGeometry(r * 1.4, 72, r * 1.4), dark, 0, 36));
      group.add(part(new THREE.BoxGeometry(r * 1.2, 20, r * 2.5), dark, 0, 64));
      group.add(part(new THREE.BoxGeometry(20, 16, 20), core, 0, 84));
      group.add(part(new THREE.BoxGeometry(24, 24, 24), core, r * 0.5, 26, r * 1.15));
      group.add(part(new THREE.BoxGeometry(24, 24, 24), core, r * 0.5, 26, -r * 1.15));
      group.add(part(new THREE.BoxGeometry(r * 1.45, 3, r * 1.45), core, 0, 50));
      break;
    }
    case "summoner": {
      group.add(part(new THREE.ConeGeometry(r, 74, 6), dark, 0, 37));
      group.add(part(new THREE.SphereGeometry(10, 12, 10), core, 0, 82));
      const orbit = new THREE.Group();
      orbit.position.y = 50;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        orbit.add(part(new THREE.OctahedronGeometry(7, 0), core, Math.cos(a) * 40, 0, Math.sin(a) * 40));
      }
      group.add(orbit);
      spin = orbit;
      break;
    }
    case "duellist": {
      group.add(part(new THREE.CapsuleGeometry(r * 0.7, 30, 4, 10), dark, 0, 28));
      group.add(part(new THREE.SphereGeometry(8, 12, 10), core, 0, 56));
      group.add(part(new THREE.BoxGeometry(40, 2, 4), core, 22, 30, 13));
      group.add(part(new THREE.BoxGeometry(40, 2, 4), core, 22, 30, -13));
      break;
    }
  }
  return { group, core, color, spin };
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
  private playerBody: THREE.MeshStandardMaterial;
  private playerTrim: THREE.MeshStandardMaterial;
  private playerLight = new THREE.PointLight(0x5ee6ff, 1.2, 420, 1.4);
  private enemies = new Map<Enemy, EnemyView>();
  private allies = new Map<Ally, EnemyView>();
  private shots: THREE.Mesh[] = [];
  private shotMat = glow(0xff4fd8, 3);
  private allyShotMat = glow(0x8a6cff, 3);
  private shotGeo = new THREE.SphereGeometry(1, 10, 8);

  private circles: DecalPool;
  private rings: DecalPool;
  private lines: DecalPool;
  private sectors: DecalPool;

  private points: THREE.Points;
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private colorCache = new Map<string, THREE.Color>();
  private clock = 0;
  private tmp = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x04060b);
    this.scene.fog = new THREE.Fog(0x04060b, 1100, 2400);

    this.scene.add(new THREE.AmbientLight(0x8fa8ff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x10131f, 0.7));
    const sun = new THREE.DirectionalLight(0xcfe0ff, 1.5);
    sun.position.set(ROOM.w / 2 + 260, 900, ROOM.h / 2 + 320);
    sun.target.position.set(ROOM.w / 2, 0, ROOM.h / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -900;
    sc.right = 900;
    sc.top = 700;
    sc.bottom = -700;
    sc.near = 100;
    sc.far = 2200;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshBasicMaterial({ color: 0x030409 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ROOM.w / 2, -2, ROOM.h / 2);
    this.scene.add(ground, this.roomGroup);

    // Player: a small hooded figure with a bright dagger.
    this.playerBody = new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5, metalness: 0.4, emissive: 0x5ee6ff, emissiveIntensity: 0.25 });
    this.playerTrim = glow(0x5ee6ff, 1.3);
    this.player.add(part(new THREE.CapsuleGeometry(10, 20, 4, 12), this.playerBody, 0, 22));
    this.player.add(part(new THREE.SphereGeometry(8, 14, 10), this.playerBody, 0, 46));
    this.player.add(part(new THREE.BoxGeometry(6, 3, 12), this.playerTrim, 6, 47));
    this.player.add(part(new THREE.BoxGeometry(24, 2, 5), this.playerTrim, 18, 26, 9));
    this.playerLight.position.y = 60;
    this.player.add(this.playerLight);
    this.scene.add(this.player);

    const fx = new THREE.Group();
    this.scene.add(fx);
    this.circles = new DecalPool(fx, new THREE.CircleGeometry(1, 48), 0.6);
    this.rings = new DecalPool(fx, new THREE.RingGeometry(0.93, 1, 64), 0.9);
    const lineGeo = new THREE.PlaneGeometry(1, 1);
    lineGeo.translate(0.5, 0, 0);
    this.lines = new DecalPool(fx, lineGeo, 0.7);
    this.sectors = new DecalPool(
      fx,
      new THREE.RingGeometry(0.3, 1, 24, 1, -PLAYER.attackHalfAngle, PLAYER.attackHalfAngle * 2),
      1.4,
    );

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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(VIEW_W, VIEW_H), 0.45, 0.5, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(2, dpr));
    this.renderer.setSize(cssW, cssH, false);
    this.composer.setPixelRatio(Math.min(2, dpr));
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
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.barriers = [];
    // A sealed gate is lit red throughout.
    const tint = w.sealed ? SEALED_TINT : RANK_TINT[w.rank];
    const room = w.dungeon ? w.dungeon.rooms[w.roomId] : null;
    const isBoss = room?.kind === "boss";

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.h),
      new THREE.MeshStandardMaterial({ color: isBoss ? 0x24121c : 0x141d36, roughness: 0.8, metalness: 0.2 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM.w / 2, 0, ROOM.h / 2);
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    const gridPts: number[] = [];
    for (let x = 100; x < ROOM.w; x += 100) gridPts.push(x, 0.3, 0, x, 0.3, ROOM.h);
    for (let z = 100; z < ROOM.h; z += 100) gridPts.push(0, 0.3, z, ROOM.w, 0.3, z);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
    this.roomGroup.add(
      new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: isBoss ? 0xff3355 : tint, transparent: true, opacity: 0.13 })),
    );

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x121a30, roughness: 0.7, metalness: 0.3 });
    const trimMat = glow(isBoss ? 0xff3355 : tint, 0.9);
    const nearTrimMat = glow(isBoss ? 0xff3355 : tint, 0.15);
    const cx = ROOM.w / 2;
    const cz = ROOM.h / 2;
    const dh = ROOM.doorHalf;

    // One wall piece running from a to b along its side.
    const wall = (side: Side, a: number, b: number) => {
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

  private syncEnemies(w: World): void {
    for (const [e, v] of this.enemies) {
      if (!w.enemies.includes(e)) {
        this.scene.remove(v.group);
        this.enemies.delete(e);
      }
    }
    for (const e of w.enemies) {
      let v = this.enemies.get(e);
      if (!v) {
        v = buildEnemy(e.kind, e.radius);
        this.enemies.set(e, v);
        this.scene.add(v.group);
      }
      const hover = e.kind === "shooter" || e.kind === "healer" ? Math.sin(this.clock * 3 + e.x) * 4 : 0;
      v.group.position.set(e.x, hover, e.y);
      v.group.rotation.y = -e.facing;
      if (v.spin) v.spin.rotation[e.kind === "summoner" ? "y" : "z"] = this.clock * 2;

      // Colour tells the state: white flash on hit, bright on wind-up, dim when spent.
      const winding = e.state === "windup" || e.state === "fuse" || e.state === "cast" || e.state === "attack";
      if (e.flash > 0) {
        v.core.emissive.setHex(0xffffff);
        v.core.emissiveIntensity = 5;
      } else if (winding) {
        v.core.emissive.copy(v.color).lerp(this.color("#ffffff"), 0.5 + 0.5 * Math.sin(this.clock * 30));
        v.core.emissiveIntensity = 3.2;
      } else {
        v.core.emissive.copy(v.color);
        v.core.emissiveIntensity = e.state === "recover" ? 0.45 : e.phase === 2 ? 2.6 : 1.6;
      }
      v.group.visible = e.inv <= 0 || Math.floor(this.clock * 30) % 2 === 0;
      // Penalty-zone enemies cannot be hurt: they burn a steady, colourless white.
      if (e.immortal && !winding) {
        v.core.emissive.setHex(0xd8e4ff);
        v.core.emissiveIntensity = 1.2;
      }
      const pulse = e.kind === "exploder" && e.state === "fuse" ? 1 + 0.35 * Math.sin(this.clock * 40) : 1;
      v.group.scale.setScalar(pulse);
    }
  }

  /** Echoes wear the shape they had in life, in a ghostly violet. */
  private syncAllies(w: World): void {
    for (const [a, v] of this.allies) {
      if (!w.allies.includes(a)) {
        this.scene.remove(v.group);
        this.allies.delete(a);
      }
    }
    for (const a of w.allies) {
      let v = this.allies.get(a);
      if (!v) {
        v = buildEnemy(a.kind, a.radius);
        v.group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (!m || !("emissive" in m)) return;
          m.transparent = true;
          m.opacity = 0.72;
          // The dark body parts take a faint glow too, so the whole figure reads as a shade.
          if (m !== v!.core) {
            m.emissive.setHex(ECHO_TINT);
            m.emissiveIntensity = 0.35;
          }
        });
        this.allies.set(a, v);
        this.scene.add(v.group);
      }
      v.group.position.set(a.x, Math.sin(this.clock * 2.5 + a.x) * 2 + 2, a.y);
      v.group.rotation.y = -a.facing;
      if (v.spin) v.spin.rotation[a.kind === "summoner" ? "y" : "z"] = this.clock * 2;
      v.core.emissive.setHex(a.flash > 0 ? 0xffffff : ECHO_TINT);
      v.core.emissiveIntensity = a.flash > 0 ? 4 : 1.8;
    }
  }

  private syncShots(w: World): void {
    const all = [...w.projectiles, ...w.allyShots];
    while (this.shots.length < all.length) {
      const m = new THREE.Mesh(this.shotGeo, this.shotMat);
      this.scene.add(m);
      this.shots.push(m);
    }
    this.shots.forEach((m, i) => {
      const s = all[i];
      // Echo shots are violet; enemy shots stay magenta.
      if (s) m.material = i >= w.projectiles.length ? this.allyShotMat : this.shotMat;
      m.visible = !!s;
      if (s) {
        m.position.set(s.x, 22, s.y);
        m.scale.setScalar(s.radius);
      }
    });
  }

  private syncDecals(w: World): void {
    const p = w.player;
    this.circles.begin();
    this.rings.begin();
    this.lines.begin();
    this.sectors.begin();

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
    for (const a of w.allies) this.rings.place(a.x, a.y, 0, a.radius + 6, a.radius + 6, ECHO_TINT, 0.35);

    for (const z of w.zones) {
      const k = 1 - z.t / z.total;
      this.rings.place(z.x, z.y, 0, z.radius, z.radius, 0xff3040, 0.9);
      this.circles.place(z.x, z.y, 0, z.radius * k, z.radius * k, 0xff3040, 0.18 + 0.3 * k);
    }
    for (const s of w.shockwaves) this.rings.place(s.x, s.y, 0, s.r, s.r, 0xff5a60, 0.9);
    for (const f of w.fx) {
      const k = f.t / f.total;
      const c = this.color(f.color).getHex();
      if (f.kind === "ring") this.rings.place(f.x, f.y, 0, f.radius * (1.1 - 0.5 * k), f.radius * (1.1 - 0.5 * k), c, k);
      else this.circles.place(f.x, f.y, 0, f.radius, f.radius, c, 0.5 * k);
    }

    if (p.attackT > 0) {
      const k = p.attackT / PLAYER.attackActive;
      this.sectors.place(p.x, p.y, p.attackFacing, PLAYER.attackRange, PLAYER.attackRange, 0x5ee6ff, 0.35 + 0.5 * k);
    }
    if (p.surgeT > 0) this.rings.place(p.x, p.y, 0, 26, 26, 0xffd84a, 0.7);
    // Aim marker under the player.
    if (w.mode === "gate") this.lines.place(p.x, p.y, p.facing, 34, 2, 0x5ee6ff, 0.5);

    this.circles.end();
    this.rings.end();
    this.lines.end();
    this.sectors.end();
  }

  private syncParticles(w: World): void {
    const n = Math.min(MAX_PARTICLES, w.particles.length);
    for (let i = 0; i < n; i++) {
      const pt = w.particles[i];
      const c = this.color(pt.color);
      const a = Math.min(1, pt.life * 4);
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

  render(w: World, dt: number): void {
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
    this.player.position.set(p.x, p.moving && p.dashT <= 0 ? Math.abs(Math.sin(this.clock * 12)) * 3 : 0, p.y);
    this.player.rotation.y = -p.facing;
    const fast = p.dashT > 0 || p.lungeT > 0;
    this.playerBody.emissive.setHex(p.hurtFlash > 0 ? 0xff2030 : fast ? 0xffffff : p.surgeT > 0 ? 0xffd84a : 0x5ee6ff);
    this.playerBody.emissiveIntensity = p.hurtFlash > 0 ? 3 : fast ? 3 : p.surgeT > 0 ? 1 : 0.25;
    this.playerLight.color.setHex(p.surgeT > 0 ? 0xffd84a : 0x5ee6ff);
    // Blink while invulnerable after a hit (not during a dash).
    this.player.visible = !(p.iframes > 0 && !fast && Math.floor(p.iframes * 20) % 2 === 0) && w.mode !== "dead" && w.mode !== "title";

    this.syncEnemies(w);
    this.syncAllies(w);
    this.syncShots(w);
    this.syncDecals(w);
    this.syncParticles(w);

    // Follow the player, but stop before showing much beyond the walls.
    const tx = THREE.MathUtils.clamp(p.x, 520, ROOM.w - 520);
    const tz = THREE.MathUtils.clamp(p.y, 330, ROOM.h - 260);
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
    this.camera.position.copy(steady);
    this.camera.updateMatrixWorld();
  }
}
