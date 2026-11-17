import * as THREE from "three";
import { LINES, REDACTOR, ROOM } from "../game/config";
import { itemDef, perksOf, type PerkId } from "../game/items";
import type { Fx, World } from "../game/state";
import { BOW } from "../game/items";
import { SHOT_HUE } from "../game/allies";

/**
 * The 3D effects that go beyond marks on the floor: falling stars, rock
 * spikes, lightning, domes, raining arrows, the Redactor's ink, glyph stones,
 * gear auras, ash from the fallen, dust and footprints.
 *
 * Everything is drawn from pooled meshes that are reused frame to frame and
 * hidden when unused. Nothing here adds or removes a light: that would make
 * the GPU rebuild every lit surface's shader (see CLAUDE.md).
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A pool of meshes sharing one shape. Each frame takes what it needs; the rest hide. */
class Pool {
  private items: THREE.Mesh[] = [];
  private used = 0;

  constructor(
    private parent: THREE.Object3D,
    private geo: THREE.BufferGeometry,
    private additive = true,
  ) {}

  begin(): void {
    this.used = 0;
  }

  next(color: number, opacity: number): THREE.Mesh {
    let m = this.items[this.used];
    if (!m) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: THREE.DoubleSide,
      });
      m = new THREE.Mesh(this.geo, mat);
      m.frustumCulled = false;
      this.parent.add(m);
      this.items.push(m);
    }
    this.used += 1;
    m.visible = true;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = clamp01(opacity);
    return m;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    for (const m of this.items) (m.material as THREE.Material).dispose();
  }
}

/** Small glowing points that rise, fall or drift: auras, ash, dust. Not part of the simulation. */
class Motes {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private items: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number }[] = [];

  constructor(private max: number) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number): void {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, y, z, vx, vy, vz, life, max: life, r: ((color >> 16) & 255) / 255, g: ((color >> 8) & 255) / 255, b: (color & 255) / 255 });
  }

  step(dt: number): void {
    for (const m of this.items) {
      m.life -= dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
    }
    this.items = this.items.filter((m) => m.life > 0);
    this.items.forEach((m, i) => {
      const a = clamp01(m.life / m.max) * clamp01((m.max - m.life) * 8);
      this.pos[i * 3] = m.x;
      this.pos[i * 3 + 1] = m.y;
      this.pos[i * 3 + 2] = m.z;
      this.col[i * 3] = m.r * a;
      this.col[i * 3 + 1] = m.g * a;
      this.col[i * 3 + 2] = m.b * a;
    });
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.items.length);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** The colour and motion of each perk's aura. */
const AURA: Partial<Record<PerkId, { color: number; motion: "rise" | "fall" | "swirl" | "jitter" | "inward" }>> = {
  burn: { color: 0xff6a20, motion: "rise" },
  frost: { color: 0x9fe8ff, motion: "swirl" },
  poison: { color: 0x6dff5a, motion: "fall" },
  bleed: { color: 0xc81e2e, motion: "fall" },
  lifesteal: { color: 0xff3a6a, motion: "inward" },
  chain: { color: 0xfff27a, motion: "jitter" },
  thorns: { color: 0xffd0a0, motion: "jitter" },
  dodge: { color: 0x9fc8ff, motion: "swirl" },
  siphon: { color: 0x6f9bff, motion: "inward" },
  gilded: { color: 0xffd84a, motion: "rise" },
};

const hex = (css: string): number => new THREE.Color(css).getHex();

export class Effects {
  private group = new THREE.Group();
  private glowSphere: Pool;
  private glowCone: Pool;
  private glowBox: Pool;
  private glowColumn: Pool;
  private glowRing: Pool;
  private glowDisc: Pool;
  private glowDome: Pool;
  private glowTri: Pool;
  private glowSquare: Pool;
  private darkBox: Pool;
  private darkDisc: Pool;
  private darkRing: Pool;
  private stone: Pool;
  private motes = new Motes(900);
  private seenCorpses = new WeakSet<object>();
  private stepClock = 0;
  private lastPrint = { x: 0, y: 0 };
  private prints: { x: number; y: number; a: number; t: number }[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.group.add(this.motes.points);
    this.glowSphere = new Pool(this.group, new THREE.SphereGeometry(1, 14, 10));
    this.glowCone = new Pool(this.group, new THREE.ConeGeometry(1, 1, 6));
    this.glowBox = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1));
    this.glowColumn = new Pool(this.group, new THREE.CylinderGeometry(1, 1, 1, 20, 1, true));
    this.glowRing = new Pool(this.group, new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2));
    this.glowDisc = new Pool(this.group, new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2));
    this.glowDome = new Pool(this.group, new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    this.glowTri = new Pool(this.group, new THREE.RingGeometry(0.7, 1, 3).rotateX(-Math.PI / 2));
    this.glowSquare = new Pool(this.group, new THREE.RingGeometry(0.7, 1, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2));
    this.darkBox = new Pool(this.group, new THREE.BoxGeometry(1, 1, 1), false);
    this.darkDisc = new Pool(this.group, new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), false);
    this.darkRing = new Pool(this.group, new THREE.RingGeometry(1, 5, 96).rotateX(-Math.PI / 2), false);
    this.stone = new Pool(this.group, new THREE.CylinderGeometry(1, 1.15, 1, 8), false);
  }

  private pools(): Pool[] {
    return [this.glowSphere, this.glowCone, this.glowBox, this.glowColumn, this.glowRing, this.glowDisc, this.glowDome, this.glowTri, this.glowSquare, this.darkBox, this.darkDisc, this.darkRing, this.stone];
  }

  dispose(): void {
    for (const p of this.pools()) p.dispose();
    this.motes.dispose();
    this.group.parent?.remove(this.group);
  }

  /** Draw every effect for this frame. `clock` is the view's own ever-rising time. */
  sync(w: World, dt: number, clock: number): void {
    for (const p of this.pools()) p.begin();
    for (const f of w.fx) this.drawFx(w, f, clock);
    this.drawBlasts(w, clock);
    this.drawRedactor(w, clock);
    this.drawGlyphs(w, clock);
    this.drawMarks(w, clock);
    this.drawPlayer(w, dt, clock);
    this.drawCorpses(w);
    this.drawSparks(w);
    // A trail of sparks behind staff bolts and charged arrows.
    for (const s of w.allyShots) {
      if (!s.look || s.look === "arrow" || s.look === "quill") continue;
      this.motes.add(s.x, 26, s.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, hex(SHOT_HUE[s.look]));
    }
    for (const p of this.pools()) p.end();
    this.motes.step(dt);
  }

  private drawFx(w: World, f: Fx, clock: number): void {
    const k = clamp01(f.t / f.total);
    const u = 1 - k;
    const c = hex(f.color);
    const p = w.player;
    switch (f.kind) {
      case "column":
      case "loot": {
        // A pillar of light: a loot beam stays tall and thin, a level-up flares and fades.
        const loot = f.kind === "loot";
        const m = this.glowColumn.next(c, (loot ? 0.55 : 0.45) * k);
        const h = loot ? 260 : 320 * (0.4 + u);
        m.scale.set(f.radius * (loot ? 0.5 : 1 + u * 0.4), h, f.radius * (loot ? 0.5 : 1 + u * 0.4));
        m.position.set(f.x, h / 2, f.y);
        const core = this.glowColumn.next(0xffffff, 0.35 * k);
        core.scale.set(f.radius * 0.25, h, f.radius * 0.25);
        core.position.set(f.x, h / 2, f.y);
        if (Math.random() < 0.5) this.motes.add(f.x + (Math.random() - 0.5) * f.radius, 10, f.y + (Math.random() - 0.5) * f.radius, 0, 120 + Math.random() * 80, 0, 1, c);
        break;
      }
      case "spikes": {
        // Rock spikes thrust up from the ground and sink back.
        const rise = Math.sin(u * Math.PI);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + f.x;
          const r = i === 0 ? 0 : f.radius * 0.55;
          const m = this.glowCone.next(i === 0 ? 0xffc080 : c, 0.85 * k);
          const h = (i === 0 ? 70 : 42) * rise;
          m.scale.set(i === 0 ? 14 : 9, Math.max(0.1, h), i === 0 ? 14 : 9);
          m.position.set(f.x + Math.cos(a) * r, h / 2, f.y + Math.sin(a) * r);
          m.rotation.z = Math.cos(a) * 0.25;
          m.rotation.x = Math.sin(a) * 0.25;
        }
        break;
      }
      case "bolt": {
        // Jagged lightning, redrawn each frame so it crackles.
        const x2 = f.x2 ?? f.x;
        const y2 = f.y2 ?? f.y;
        const n = 7;
        let ax = f.x;
        let ay = f.y;
        let az = 30;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const jitter = i === n ? 0 : 22;
          const bx = f.x + (x2 - f.x) * t + (Math.random() - 0.5) * jitter;
          const by = f.y + (y2 - f.y) * t + (Math.random() - 0.5) * jitter;
          const bz = 30 + (Math.random() - 0.5) * (i === n ? 0 : 16);
          this.segment(this.glowBox, c, k, ax, az, ay, bx, bz, by, 3);
          this.segment(this.glowBox, 0xffffff, k, ax, az, ay, bx, bz, by, 1.2);
          ax = bx;
          ay = by;
          az = bz;
        }
        break;
      }
      case "dome": {
        // A shell of light round the hunter for as long as it lasts.
        const m = this.glowDome.next(c, 0.16 + 0.06 * Math.sin(clock * 6));
        const r = f.radius * (k > 0.95 ? (1 - k) * 20 : 1);
        m.scale.set(r, r * 1.1, r);
        m.position.set(p.x, 0, p.y);
        const rim = this.glowRing.next(c, 0.7);
        rim.scale.set(r, 1, r);
        rim.position.set(p.x, 2, p.y);
        break;
      }
      case "sigil": {
        // A mark that turns above its target: a ring and a square, counter-rotating.
        const m = this.glowRing.next(c, 0.9 * k);
        m.scale.set(f.radius, 1, f.radius);
        m.position.set(f.x, 3, f.y);
        const sq = this.glowSquare.next(c, 0.7 * k);
        sq.scale.set(f.radius * 0.7, 1, f.radius * 0.7);
        sq.position.set(f.x, 4, f.y);
        sq.rotation.y = clock * 2;
        break;
      }
      case "spiral": {
        // Motes of light climbing round the point in a helix.
        for (let i = 0; i < 3; i++) {
          const a = clock * 6 + (i * Math.PI * 2) / 3;
          const r = f.radius * (0.3 + 0.7 * k);
          this.motes.add(f.x + Math.cos(a) * r, 8 + u * 90, f.y + Math.sin(a) * r, 0, 90, 0, 0.6, c);
        }
        const ring = this.glowRing.next(c, 0.6 * k);
        ring.scale.set(f.radius * (0.4 + 0.6 * k), 1, f.radius * (0.4 + 0.6 * k));
        ring.position.set(f.x, 3, f.y);
        break;
      }
      case "swirl": {
        // Blades of light circling outward.
        for (let i = 0; i < 10; i++) {
          const a = clock * 9 + (i / 10) * Math.PI * 2;
          const r = f.radius * (0.4 + 0.6 * u);
          const m = this.glowBox.next(c, 0.8 * k);
          m.scale.set(26, 2, 4);
          m.position.set(f.x + Math.cos(a) * r, 26, f.y + Math.sin(a) * r);
          m.rotation.y = -a + Math.PI / 2;
        }
        break;
      }
      case "frost": {
        // Ice shards lying outward from the hunter, growing then melting.
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const r = f.radius * (0.35 + 0.6 * Math.min(1, u * 3));
          const m = this.glowCone.next(c, 0.8 * k);
          m.scale.set(6, 34 * Math.min(1, u * 4), 6);
          m.position.set(f.x + Math.cos(a) * r, 8, f.y + Math.sin(a) * r);
          m.rotation.z = -Math.PI / 2 + 0.6;
          m.rotation.y = -a;
        }
        break;
      }
      case "slash": {
        // A long cut from one point to another: light, or ink if the colour is dark.
        const x2 = f.x2 ?? f.x;
        const y2 = f.y2 ?? f.y;
        const dark = (c & 0xffffff) < 0x303030;
        this.segment(dark ? this.darkBox : this.glowBox, c, dark ? 0.85 * k : 0.75 * k, f.x, 14, f.y, x2, 14, y2, f.radius * (dark ? 1 : 0.6));
        if (!dark) this.segment(this.glowBox, 0xffffff, k, f.x, 16, f.y, x2, 16, y2, f.radius * 0.18);
        break;
      }
      case "shatter": {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const m = this.glowBox.next(c, k);
          m.scale.set(6, 6, 6);
          m.position.set(f.x + Math.cos(a) * f.radius * u, 30 + 40 * Math.sin(u * Math.PI), f.y + Math.sin(a) * f.radius * u);
          m.rotation.set(clock * 7 + i, clock * 5, 0);
        }
        break;
      }
      case "wave": {
        // A wall of water crossing the room from left to right.
        const x = ROOM.w * u;
        const m = this.glowBox.next(c, 0.45 * Math.sin(u * Math.PI));
        m.scale.set(40, 90, ROOM.h);
        m.position.set(x, 45, ROOM.h / 2);
        const crest = this.glowBox.next(0xffffff, 0.5 * Math.sin(u * Math.PI));
        crest.scale.set(12, 8, ROOM.h);
        crest.position.set(x + 14, 92, ROOM.h / 2);
        break;
      }
      case "ink": {
        // The page going dark (or white): a flat wash over the floor that fades.
        const light = (c & 0xffffff) > 0x808080;
        const m = (light ? this.glowDisc : this.darkDisc).next(c, (light ? 0.5 : 0.75) * Math.sin(k * Math.PI));
        m.scale.set(f.radius, 1, f.radius);
        m.position.set(f.x, 1.5, f.y);
        break;
      }
      default:
        break;
    }
  }

  /** A box stretched from one point to another, `width` thick. */
  private segment(pool: Pool, color: number, opacity: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number): void {
    const m = pool.next(color, opacity);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.scale.set(len, width * 0.5, width);
    m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz)));
  }

  /** What falls from the sky before a blast lands: a star with its trail, or an arrow. */
  private drawBlasts(w: World, clock: number): void {
    for (const b of w.blasts) {
      if (b.show === "star") {
        const k = clamp01(b.t / 0.8);
        const h = 20 + k * 620;
        const ox = -k * 260;
        const oz = -k * 120;
        const star = this.glowSphere.next(0xffd890, 1);
        star.scale.setScalar(16 + 4 * Math.sin(clock * 30));
        star.position.set(b.x + ox, h, b.y + oz);
        const halo = this.glowSphere.next(0xff8a3c, 0.5);
        halo.scale.setScalar(30);
        halo.position.copy(star.position);
        // The trail streams back along the way it came.
        this.segment(this.glowBox, 0xff7a2a, 0.55, b.x + ox, h, b.y + oz, b.x + ox - 160, h + 380, b.y + oz - 75, 16);
        this.motes.add(b.x + ox, h, b.y + oz, (Math.random() - 0.5) * 40, 20, (Math.random() - 0.5) * 40, 0.5, 0xffb04a);
        const shadow = this.glowRing.next(0xffb04a, 0.4 + 0.5 * (1 - k));
        shadow.scale.set(b.radius * (1.2 - 0.4 * (1 - k)), 1, b.radius * (1.2 - 0.4 * (1 - k)));
        shadow.position.set(b.x, 2, b.y);
      } else if (b.show === "arrow") {
        const h = Math.max(0, b.t) * 900;
        this.segment(this.glowBox, 0x7dffb0, 0.9, b.x, h, b.y, b.x - 6, h + 46, b.y - 3, 3);
        const head = this.glowCone.next(0xd0ffe0, 1);
        head.scale.set(4, 10, 4);
        head.position.set(b.x, h, b.y);
        head.rotation.x = Math.PI;
        const mark = this.glowRing.next(0x7dffb0, 0.5);
        mark.scale.set(b.radius * 0.6, 1, b.radius * 0.6);
        mark.position.set(b.x, 2, b.y);
      }
    }
  }

  /** The Redactor's writing: the erased page and its safe circles, the sweeping walls, the bars, the closing floor. */
  private drawRedactor(w: World, clock: number): void {
    if (w.erasure) {
      const k = 1 - w.erasure.t / w.erasure.total;
      const ink = this.darkDisc.next(0x050507, 0.25 + 0.55 * k);
      ink.scale.set(1100, 1, 1100);
      ink.position.set(ROOM.w / 2, 1, ROOM.h / 2);
      for (const s of w.erasure.safe) {
        const disc = this.glowDisc.next(0xe8e8f0, 0.35 + 0.15 * Math.sin(clock * 10));
        disc.scale.set(REDACTOR.erasure.radius, 1, REDACTOR.erasure.radius);
        disc.position.set(s.x, 2, s.y);
        const ring = this.glowRing.next(0xffffff, 1);
        ring.scale.set(REDACTOR.erasure.radius, 1, REDACTOR.erasure.radius);
        ring.position.set(s.x, 3, s.y);
        // A closing ring counts down to the moment the page is erased.
        const count = this.glowRing.next(0xff5a60, 0.9);
        const r = REDACTOR.erasure.radius + 120 * (1 - k);
        count.scale.set(r, 1, r);
        count.position.set(s.x, 3, s.y);
      }
    }
    for (const s of w.sweeps) {
      const along = s.axis === "x";
      const len = along ? ROOM.h : ROOM.w;
      if (s.wait > 0) {
        // The warning: a pale line where the wall will rise, flickering faster as it comes.
        const flick = 0.4 + 0.5 * Math.abs(Math.sin(clock * (8 + (1 - s.wait) * 20)));
        const m = this.glowBox.next(0xff5a60, flick);
        m.scale.set(along ? 10 : len, 3, along ? len : 10);
        m.position.set(along ? s.at : ROOM.w / 2, 2, along ? ROOM.h / 2 : s.at);
        continue;
      }
      const wall = this.darkBox.next(0x050507, 0.92);
      wall.scale.set(along ? REDACTOR.strike.thick * 2 : len, 110, along ? len : REDACTOR.strike.thick * 2);
      wall.position.set(along ? s.at : ROOM.w / 2, 55, along ? ROOM.h / 2 : s.at);
      const edge = this.glowBox.next(0xe8e8f0, 0.9);
      edge.scale.set(along ? 4 : len, 112, along ? len : 4);
      edge.position.set(along ? s.at + s.dir * REDACTOR.strike.thick : ROOM.w / 2, 56, along ? ROOM.h / 2 : s.at + s.dir * REDACTOR.strike.thick);
    }
    for (const b of w.bars) {
      const k = 1 - b.t / b.total;
      const dx = (Math.cos(b.angle) * b.len) / 2;
      const dy = (Math.sin(b.angle) * b.len) / 2;
      // Warned as a red band that fills in; it lands black.
      this.segment(this.glowBox, 0xff3040, 0.15 + 0.35 * k, b.x - dx, 2, b.y - dy, b.x + dx, 2, b.y + dy, b.width);
      this.segment(this.glowBox, 0xffffff, 0.6, b.x - dx, 3, b.y - dy, b.x + dx, 3, b.y + dy, b.width * k * 0.15 + 1);
    }
    if (w.arenaR > 0) {
      // Outside the closing page is ink.
      const out = this.darkRing.next(0x050507, 0.82);
      out.scale.set(w.arenaR, 1, w.arenaR);
      out.position.set(ROOM.w / 2, 1.5, ROOM.h / 2);
      const edge = this.glowRing.next(0xe8e8f0, 0.8);
      edge.scale.set(w.arenaR, 1, w.arenaR);
      edge.position.set(ROOM.w / 2, 2.5, ROOM.h / 2);
    }
  }

  /** The four glyph stones of the thirteenth floor: dark until struck, then white. */
  private drawGlyphs(w: World, clock: number): void {
    for (const g of w.glyphs) {
      const s = this.stone.next(g.lit ? 0xe8e8f0 : 0x2a2a34, 1);
      s.scale.set(LINES.stoneRadius * 0.8, 26, LINES.stoneRadius * 0.8);
      s.position.set(g.x, 13, g.y);
      const pulse = g.lit ? 1 : 0.35 + 0.25 * Math.sin(clock * 2 + g.glyph);
      const r = LINES.stoneRadius * 0.55;
      if (g.glyph === 0) {
        const m = this.glowRing.next(0xe8e8f0, pulse);
        m.scale.set(r, 1, r);
        m.position.set(g.x, 27, g.y);
      } else if (g.glyph === 1) {
        const m = this.glowTri.next(0xe8e8f0, pulse);
        m.scale.set(r, 1, r);
        m.position.set(g.x, 27, g.y);
      } else if (g.glyph === 2) {
        const m = this.glowSquare.next(0xe8e8f0, pulse);
        m.scale.set(r, 1, r);
        m.position.set(g.x, 27, g.y);
      } else {
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          const m = this.glowBox.next(0xe8e8f0, pulse);
          m.scale.set(r * 2, 1, 4);
          m.position.set(g.x, 27, g.y);
          m.rotation.y = a;
        }
      }
      if (g.lit) {
        const col = this.glowColumn.next(0xe8e8f0, 0.25);
        col.scale.set(LINES.stoneRadius * 0.5, 200, LINES.stoneRadius * 0.5);
        col.position.set(g.x, 100, g.y);
      }
    }
  }

  /** A turning red sigil over every enemy under a Death Mark. */
  private drawMarks(w: World, clock: number): void {
    for (const e of w.enemies) {
      if (e.markT <= 0) continue;
      const m = this.glowSquare.next(0xff3a50, 0.85);
      m.scale.set(12, 1, 12);
      m.position.set(e.x, 70 + e.radius, e.y);
      m.rotation.set(Math.PI / 2, 0, clock * 3);
    }
  }

  /**
   * Around the hunter: the aura of legendary and mythic gear by its perks, a
   * mythic's ring underfoot, the bow's charge, dust when dashing and
   * footprints when walking.
   */
  private drawPlayer(w: World, dt: number, clock: number): void {
    const p = w.player;
    if (w.mode !== "gate" && w.mode !== "select") return;
    const pr = w.profile;
    const slots = [pr.activeWeapon === 1 ? "weapon2" : "weapon", "armour", "accessory"] as const;
    let mythic = false;
    const perks: PerkId[] = [];
    for (const slot of slots) {
      const owned = pr.equipped[slot];
      const def = owned ? itemDef(owned) : undefined;
      if (!owned || !def || (def.rarity !== "legendary" && def.rarity !== "mythic")) continue;
      if (def.rarity === "mythic") mythic = true;
      for (const perk of perksOf(owned)) if (!perks.includes(perk)) perks.push(perk);
    }
    this.stepClock += dt;
    // A few motes each frame, shared between the perks.
    const rate = Math.min(4, perks.length * 1.2);
    for (let i = 0; i < rate; i++) {
      const perk = perks[Math.floor(Math.random() * perks.length)];
      const look = AURA[perk];
      if (!look) continue;
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 14;
      const x = p.x + Math.cos(a) * r;
      const z = p.y + Math.sin(a) * r;
      const y = 8 + Math.random() * 46;
      if (look.motion === "rise") this.motes.add(x, y, z, 0, 50 + Math.random() * 30, 0, 0.7, look.color);
      else if (look.motion === "fall") this.motes.add(x, y + 20, z, 0, -40, 0, 0.8, look.color);
      else if (look.motion === "swirl") this.motes.add(x, y, z, -Math.sin(a) * 60, 6, Math.cos(a) * 60, 0.6, look.color);
      else if (look.motion === "inward") this.motes.add(p.x + Math.cos(a) * 60, y, p.y + Math.sin(a) * 60, -Math.cos(a) * 90, 0, -Math.sin(a) * 90, 0.55, look.color);
      else this.motes.add(x, y, z, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 0.15, look.color);
    }
    // The Unstruck's title wears the margin's ink, in pale motes.
    if (pr.title === "unstruck" && Math.random() < 0.6) this.motes.add(p.x + (Math.random() - 0.5) * 30, 10 + Math.random() * 40, p.y + (Math.random() - 0.5) * 30, 0, 30, 0, 0.9, 0xb8b8c8);
    if (mythic && w.mode === "gate") {
      const ring = this.glowRing.next(0xff5a7a, 0.35 + 0.15 * Math.sin(clock * 3));
      ring.scale.set(34, 1, 34);
      ring.position.set(p.x, 1.5, p.y);
      ring.rotation.y = clock * 0.6;
    }
    if (w.mode !== "gate") return;
    // The bow's draw: a ring that closes in, gold when the shot is charged.
    if (p.drawT > 0) {
      const k = Math.min(1, p.drawT / BOW.charge);
      const ring = this.glowRing.next(k >= 1 ? 0xffd84a : 0x5ee6ff, k >= 1 ? 0.9 + 0.1 * Math.sin(clock * 30) : 0.6);
      const r = 60 - 30 * k;
      ring.scale.set(r, 1, r);
      ring.position.set(p.x, 3, p.y);
    }
    // Dust kicked up by a dash.
    if (p.dashT > 0) for (let i = 0; i < 3; i++) this.motes.add(p.x + (Math.random() - 0.5) * 16, 4, p.y + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 60, 30 + Math.random() * 30, (Math.random() - 0.5) * 60, 0.45, 0x8a8478);
    // Footprints: one every stride, fading behind.
    if (p.moving && Math.hypot(p.x - this.lastPrint.x, p.y - this.lastPrint.y) > 34) {
      this.lastPrint = { x: p.x, y: p.y };
      this.prints.push({ x: p.x, y: p.y, a: p.facing, t: 1.6 });
      if (this.prints.length > 24) this.prints.shift();
    }
    for (const f of this.prints) f.t -= dt;
    this.prints = this.prints.filter((f) => f.t > 0);
    for (const f of this.prints) {
      const m = this.darkDisc.next(0x0a0a0c, 0.35 * (f.t / 1.6));
      m.scale.set(5, 1, 3);
      m.position.set(f.x, 1.2, f.y);
      m.rotation.y = -f.a;
    }
  }

  /** Sparks where a blow lands: seen when an enemy's hit flash starts. Drawn here so the game's own dice are never touched. */
  private flashes = new WeakMap<object, number>();
  private drawSparks(w: World): void {
    for (const e of w.enemies) {
      const before = this.flashes.get(e) ?? 0;
      this.flashes.set(e, e.flash);
      if (e.flash <= before || e.flash < 0.05) continue;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 200;
        this.motes.add(e.x, 26 + Math.random() * 14, e.y, Math.cos(a) * v, 40 + Math.random() * 120, Math.sin(a) * v, 0.25 + Math.random() * 0.15, i % 3 === 0 ? 0xffffff : 0xffd8a0);
      }
    }
  }

  /** Each fallen enemy gives off a puff of ash and embers as it goes. */
  private drawCorpses(w: World): void {
    for (const c of w.corpses) {
      if (this.seenCorpses.has(c)) continue;
      this.seenCorpses.add(c);
      const ink = c.kind === "redactor";
      const n = 14 + Math.round(c.radius);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * c.radius;
        this.motes.add(c.x + Math.cos(a) * r, 6 + Math.random() * 30, c.y + Math.sin(a) * r, Math.cos(a) * 30, 40 + Math.random() * 60, Math.sin(a) * 30, 1 + Math.random() * 0.8, ink ? 0xd8d8e0 : Math.random() < 0.3 ? 0xff7a2a : 0x6a5a50);
      }
    }
  }
}
