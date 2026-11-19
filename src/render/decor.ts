import * as THREE from "three";
import { seeded } from "../engine/rng";
import { ROOM } from "../game/config";
import type { Side } from "../game/dungeon";
import { WALL_STYLE, type Pillar, type Theme } from "../game/rooms";
import { flame } from "./fire";

/**
 * How a room is dressed: its torches, what stands along its walls, the shape
 * of its pillars. Nothing here blocks or hurts anyone; the game's rules know
 * only the pillars and traps it already had.
 */

/**
 * A fire that may light the room: where its light sits, its colour, its
 * strength at rest and where in its flicker it starts. The room does not make
 * the light itself: the view keeps a fixed set of lights and lends them out,
 * because a change in how many lights a scene has makes the GPU rebuild every
 * lit surface's shader, which stalls the game for a second or more.
 */
export interface Torch {
  x: number;
  y: number;
  z: number;
  color: number;
  base: number;
  phase: number;
}

interface Look {
  /** Colour of fire and of the light it throws. */
  fire: number;
  /** Tint of the props. */
  wood: number;
  stone: number;
}

const LOOK: Record<Theme, Look> = {
  gate: { fire: 0xff9a3c, wood: 0x4a3524, stone: 0x9a9fac },
  hall: { fire: 0xff9a3c, wood: 0x4a3524, stone: 0xa0a5b2 },
  crypt: { fire: 0x4fe0c0, wood: 0x2f2a26, stone: 0x8a9098 },
  armoury: { fire: 0xffb050, wood: 0x5a3d24, stone: 0x989ca8 },
  cavern: { fire: 0x5ad0ff, wood: 0x3a332c, stone: 0x857c76 },
  shrine: { fire: 0xb070ff, wood: 0x3a2a44, stone: 0x968fb0 },
  throne: { fire: 0xff4a2a, wood: 0x2a1a1a, stone: 0x8a737a },
};

const solid = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/**
 * A pillar in the manner of the room. Each theme has four shapes, chosen by
 * the pillar's style: a hall's drum, broken drum, obelisk or statue; a
 * crypt's or armoury's pier, chained pier, broken pier or pedestal; a
 * cavern's stalagmite, crystal spire, stacked boulders or cluster. A block of
 * a low wall is rough-cut stone in any room. Slender pillars are built thinner
 * and a little lower.
 */
export function pillarFor(theme: Theme, p: Pillar, wallTex: THREE.Texture, tint: number): THREE.Object3D {
  const look = LOOK[theme];
  const stone = new THREE.MeshStandardMaterial({ map: wallTex, color: look.stone, roughness: 0.95 });
  const g = new THREE.Group();
  const r = p.radius;
  const style = p.style ?? 0;
  // Each pillar's own small differences come from where it stands, so a room always looks the same.
  const rng = seeded(Math.round(p.x) * 7919 + Math.round(p.y) * 104729 + 11);
  const tall = r < 28 ? 120 : 150;
  const glow = (color: number, k: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.8 });

  if (style === WALL_STYLE) {
    // A rough block, a little out of true; side by side they make a wall.
    const rough = new THREE.MeshStandardMaterial({ map: wallTex, color: look.stone, roughness: 1, flatShading: true });
    const h = 54 + rng() * 22;
    const block = solid(new THREE.BoxGeometry(r * 1.9, h, r * 1.9), rough, p.x, h / 2, p.y);
    block.rotation.y = (rng() - 0.5) * 0.25;
    g.add(block);
    if (rng() < 0.5) g.add(solid(new THREE.BoxGeometry(r * 1.2, 14, r * 1.1), rough, p.x + (rng() - 0.5) * 8, h + 7, p.y));
    return g;
  }

  if (theme === "cavern") {
    const rock = new THREE.MeshStandardMaterial({ color: look.stone, roughness: 1, flatShading: true });
    if (style === 1) {
      // A spire of crystal grown from a stone foot.
      g.add(solid(new THREE.DodecahedronGeometry(r * 0.9), rock, p.x, r * 0.4, p.y));
      const crystal = glow(look.fire, 0.9);
      for (let i = 0; i < 4; i++) {
        const c = solid(new THREE.ConeGeometry(r * (0.5 - i * 0.08), tall * (0.9 - i * 0.15), 5), crystal, p.x + (rng() - 0.5) * r * 0.6, (tall * (0.9 - i * 0.15)) / 2 + 10, p.y + (rng() - 0.5) * r * 0.6);
        c.rotation.set((rng() - 0.5) * 0.4, rng() * 3, (rng() - 0.5) * 0.4);
        c.castShadow = false;
        g.add(c);
      }
    } else if (style === 2) {
      // Boulders stacked by no hand.
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const s = r * (1.05 - i * 0.18);
        g.add(solid(new THREE.DodecahedronGeometry(s), rock, p.x + (rng() - 0.5) * 10, y + s * 0.8, p.y + (rng() - 0.5) * 10));
        y += s * 1.4;
      }
    } else if (style === 3) {
      // A cluster of stalagmites, none the master.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rng();
        const h = 60 + rng() * 90;
        g.add(solid(new THREE.ConeGeometry(r * (0.35 + rng() * 0.25), h, 6), rock, p.x + Math.cos(a) * r * 0.5, h / 2, p.y + Math.sin(a) * r * 0.5));
      }
    } else {
      // A stalagmite, with two lesser ones leaning on it.
      g.add(solid(new THREE.ConeGeometry(r, tall + 20, 7), rock, p.x, (tall + 20) / 2, p.y));
      g.add(solid(new THREE.ConeGeometry(r * 0.5, 80, 6), rock, p.x + r * 0.7, 40, p.y + r * 0.3));
      g.add(solid(new THREE.ConeGeometry(r * 0.4, 60, 6), rock, p.x - r * 0.6, 30, p.y - r * 0.5));
      g.add(solid(new THREE.OctahedronGeometry(r * 0.28), glow(look.fire, 1), p.x + r * 0.5, 70, p.y - r * 0.4));
    }
    return g;
  }

  if (theme === "crypt" || theme === "armoury") {
    const side = r * 1.55;
    if (style === 1) {
      // A pier bound in iron bands, with a chain hanging from it.
      g.add(solid(new THREE.BoxGeometry(side, tall, side), stone, p.x, tall / 2, p.y));
      for (const y of [30, tall - 30]) g.add(solid(new THREE.BoxGeometry(side + 3, 6, side + 3), iron, p.x, y, p.y));
      for (let i = 0; i < 6; i++) {
        const link = solid(new THREE.TorusGeometry(2.6, 0.7, 4, 8), iron, p.x + side / 2 + 2, tall - 40 - i * 6, p.y);
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        g.add(link);
      }
    } else if (style === 2) {
      // A pier broken off, its top lying beside it.
      const h = tall * (0.4 + rng() * 0.2);
      g.add(solid(new THREE.BoxGeometry(side, h, side), stone, p.x, h / 2, p.y));
      const fallen = solid(new THREE.BoxGeometry(side * 0.9, side * 0.9, tall * 0.45), stone, p.x + side * 0.4, side * 0.45, p.y + side * 0.9);
      fallen.rotation.set(0, rng() - 0.5, 0.15);
      g.add(fallen);
    } else if (style === 3) {
      // A pedestal holding up a bowl of cold light.
      g.add(solid(new THREE.BoxGeometry(side * 1.2, 14, side * 1.2), stone, p.x, 7, p.y));
      g.add(solid(new THREE.CylinderGeometry(r * 0.45, r * 0.6, 70, 8), stone, p.x, 49, p.y));
      g.add(solid(new THREE.CylinderGeometry(r * 0.9, r * 0.5, 12, 10), iron, p.x, 90, p.y));
      g.add(solid(new THREE.SphereGeometry(r * 0.35, 10, 8), glow(look.fire, 0.8), p.x, 100, p.y));
    } else {
      // A square pier on a plinth.
      g.add(solid(new THREE.BoxGeometry(side * 1.2, 14, side * 1.2), stone, p.x, 7, p.y));
      g.add(solid(new THREE.BoxGeometry(side, tall, side), stone, p.x, tall / 2, p.y));
      g.add(solid(new THREE.BoxGeometry(side * 1.2, 10, side * 1.2), stone, p.x, tall, p.y));
    }
    return g;
  }

  if (style === 1) {
    // A drum broken at its height, and a piece of it on the floor.
    const h = tall * (0.45 + rng() * 0.2);
    g.add(solid(new THREE.CylinderGeometry(r * 1.12, r * 1.2, 12, 14), stone, p.x, 6, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 0.88, r, h, 14), stone, p.x, h / 2 + 6, p.y));
    const shard = solid(new THREE.ConeGeometry(r * 0.88, 22, 14), stone, p.x, h + 14, p.y);
    shard.rotation.z = 0.25;
    g.add(shard);
    const piece = solid(new THREE.CylinderGeometry(r * 0.85, r * 0.85, r * 1.6, 12), stone, p.x + r * 1.4, r * 0.85, p.y + r * 0.5);
    piece.rotation.set(0, rng() * 3, Math.PI / 2);
    g.add(piece);
  } else if (style === 2) {
    // An obelisk, its rune band lit in the gate's colour.
    const side = r * 1.4;
    g.add(solid(new THREE.BoxGeometry(side * 1.3, 16, side * 1.3), stone, p.x, 8, p.y));
    const shaft = solid(new THREE.CylinderGeometry(side * 0.42, side * 0.7, tall + 10, 4), stone, p.x, (tall + 10) / 2 + 16, p.y);
    shaft.rotation.y = Math.PI / 4;
    g.add(shaft);
    const tip = solid(new THREE.ConeGeometry(side * 0.42, 22, 4), stone, p.x, tall + 37, p.y);
    tip.rotation.y = Math.PI / 4;
    g.add(tip);
    for (let i = 0; i < 3; i++) g.add(solid(new THREE.BoxGeometry(side * 0.9, 3, side * 0.9), glow(tint, theme === "shrine" ? 1 : 0.5), p.x, 50 + i * 22, p.y).rotateY(Math.PI / 4));
  } else if (style === 3) {
    // A hooded figure of stone on a plinth, head bowed.
    g.add(solid(new THREE.BoxGeometry(r * 2, 24, r * 2), stone, p.x, 12, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 0.45, r * 0.85, tall * 0.6, 8), stone, p.x, 24 + tall * 0.3, p.y));
    const head = solid(new THREE.ConeGeometry(r * 0.45, r * 1.1, 8), stone, p.x, 24 + tall * 0.6 + r * 0.45, p.y);
    head.rotation.x = 0.25;
    g.add(head);
    g.add(solid(new THREE.BoxGeometry(r * 1.6, 8, 10), stone, p.x, 24 + tall * 0.42, p.y + r * 0.3));
  } else {
    // A drum on a base, with a capital, and a band in the gate's colour.
    g.add(solid(new THREE.CylinderGeometry(r * 1.12, r * 1.2, 12, 14), stone, p.x, 6, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 0.88, r, tall - 10, 14), stone, p.x, tall / 2 + 5, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 1.15, r * 0.9, 12, 14), stone, p.x, tall + 2, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 5, 14), glow(tint, theme === "shrine" ? 1 : 0.4), p.x, tall * 0.75, p.y));
  }
  return g;
}

/** Dress the room. Returns where its fires are, in the order they should be given light. */
export function dress(group: THREE.Group, theme: Theme, seed: number, doors: Partial<Record<Side, number>>, tint: number, wallH: number): Torch[] {
  const look = LOOK[theme];
  const rng = seeded(seed * 7919 + 3);
  const torches: Torch[] = [];
  const wood = new THREE.MeshStandardMaterial({ color: look.wood, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: look.stone, roughness: 0.95 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.8 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xcfc8b4, roughness: 0.8 });
  const W = ROOM.w;
  const H = ROOM.h;

  // A spot along a wall is free unless a door opens there.
  const clear = (side: Side, at: number): boolean => doors[side] === undefined || Math.abs(at - (side === "n" || side === "s" ? W : H) / 2) > ROOM.doorHalf + 70;

  const fire = (x: number, y: number, z: number, size: number, strength: number) => {
    const f = flame(look.fire, size, size * 3.2);
    f.position.set(x, y, z);
    group.add(f);
    torches.push({ x, y: y + size * 2, z, color: look.fire, base: strength, phase: rng() * 10 });
  };

  // Torches in iron brackets along the far wall and the two side walls.
  const torch = (side: Side, at: number) => {
    if (!clear(side, at)) return;
    const x = side === "n" ? at : side === "w" ? 9 : W - 9;
    const z = side === "n" ? 9 : at;
    group.add(solid(new THREE.BoxGeometry(side === "n" ? 5 : 16, 4, side === "n" ? 16 : 5), iron, x, 58, z));
    group.add(solid(new THREE.CylinderGeometry(3.4, 2.2, 9, 8), iron, x + (side === "w" ? 6 : side === "e" ? -6 : 0), 62, z + (side === "n" ? 6 : 0)));
    fire(x + (side === "w" ? 6 : side === "e" ? -6 : 0), 66, z + (side === "n" ? 6 : 0), 5, 26000);
  };
  if (theme !== "cavern") {
    for (const at of [230, 520, 880, 1170]) torch("n", at);
    for (const at of [240, 660]) {
      torch("w", at);
      torch("e", at);
    }
  }

  // Buttresses, so the walls are not one flat face.
  for (const at of [70, 380, 1020, 1330]) if (clear("n", at)) group.add(solid(new THREE.BoxGeometry(34, wallH + 6, 16), stone, at, (wallH + 6) / 2, 8));
  for (const at of [90, 450, 810]) {
    if (clear("w", at)) group.add(solid(new THREE.BoxGeometry(16, wallH + 6, 34), stone, 8, (wallH + 6) / 2, at));
    if (clear("e", at)) group.add(solid(new THREE.BoxGeometry(16, wallH + 6, 34), stone, W - 8, (wallH + 6) / 2, at));
  }

  // Things standing against the walls. Each takes a spot; none stands in a doorway.
  const spots: [Side, number][] = [];
  for (const at of [130, 300, 450, 950, 1100, 1270]) spots.push(["n", at]);
  for (const at of [150, 330, 570, 750]) spots.push(["w", at], ["e", at]);
  const place = (side: Side, at: number, depth: number): [number, number, number] => {
    // x, z, and the turn that faces the thing into the room.
    if (side === "n") return [at, depth, 0];
    if (side === "w") return [depth, at, Math.PI / 2];
    return [W - depth, at, -Math.PI / 2];
  };
  const put = (side: Side, at: number, depth: number, build: (g: THREE.Group) => void) => {
    const [x, z, turn] = place(side, at, depth);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    build(g);
    group.add(g);
  };

  for (const [side, at] of spots) {
    if (!clear(side, at) || rng() < 0.3) continue;
    const pick = rng();
    if (theme === "crypt") {
      if (pick < 0.6) {
        // A sarcophagus, lid a little askew.
        put(side, at, 30, (g) => {
          g.add(solid(new THREE.BoxGeometry(76, 22, 32), stone, 0, 11, 0));
          const lid = solid(new THREE.BoxGeometry(80, 6, 36), stone, 3, 25, 2);
          lid.rotation.y = 0.08;
          g.add(lid);
        });
      } else {
        // A scatter of bones.
        put(side, at, 34, (g) => {
          for (let i = 0; i < 5; i++) {
            const b = solid(new THREE.CylinderGeometry(1.4, 1.4, 14 + rng() * 8, 5), bone, (rng() - 0.5) * 40, 1.6, (rng() - 0.5) * 24);
            b.rotation.set(Math.PI / 2, 0, rng() * 3);
            g.add(b);
          }
          g.add(solid(new THREE.SphereGeometry(5, 8, 6), bone, (rng() - 0.5) * 20, 4.5, (rng() - 0.5) * 12));
        });
      }
    } else if (theme === "armoury") {
      if (pick < 0.45) {
        // A rack of spears.
        put(side, at, 14, (g) => {
          g.add(solid(new THREE.BoxGeometry(60, 4, 6), wood, 0, 18, 0), solid(new THREE.BoxGeometry(60, 4, 6), wood, 0, 46, 0));
          for (let i = -2; i <= 2; i++) {
            g.add(solid(new THREE.CylinderGeometry(1, 1, 62, 5), wood, i * 12, 31, 4));
            g.add(solid(new THREE.ConeGeometry(2.2, 9, 4), iron, i * 12, 66, 4));
          }
        });
      } else {
        // Crates and a barrel.
        put(side, at, 26, (g) => {
          g.add(solid(new THREE.BoxGeometry(30, 30, 30), wood, -16, 15, 0));
          const top = solid(new THREE.BoxGeometry(22, 22, 22), wood, -14, 41, 2);
          top.rotation.y = 0.4;
          g.add(top, solid(new THREE.CylinderGeometry(12, 11, 30, 10), wood, 22, 15, 4));
          g.add(solid(new THREE.TorusGeometry(12, 0.9, 5, 14), iron, 22, 22, 4).rotateX(Math.PI / 2));
        });
      }
    } else if (theme === "cavern") {
      if (pick < 0.5) {
        // A cluster of crystal that lights the rock around it.
        put(side, at, 30, (g) => {
          const crystal = new THREE.MeshStandardMaterial({ color: look.fire, emissive: look.fire, emissiveIntensity: 1.8, roughness: 0.15 });
          for (let i = 0; i < 4; i++) {
            const c = solid(new THREE.ConeGeometry(5 + rng() * 4, 26 + rng() * 26, 5), crystal, (rng() - 0.5) * 30, 14, (rng() - 0.5) * 18);
            c.rotation.set((rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.7);
            c.castShadow = false;
            g.add(c);
          }
        });
        const [x, z] = place(side, at, 40);
        torches.push({ x, y: 40, z, color: look.fire, base: 22000, phase: rng() * 10 });
      } else {
        // Fallen rock.
        put(side, at, 34, (g) => {
          const rock = new THREE.MeshStandardMaterial({ color: look.stone, roughness: 1, flatShading: true });
          for (let i = 0; i < 4; i++) g.add(solid(new THREE.DodecahedronGeometry(8 + rng() * 12), rock, (rng() - 0.5) * 50, 8, (rng() - 0.5) * 26));
        });
      }
    } else if (theme === "shrine" || theme === "throne") {
      if (pick < 0.5) {
        // A brazier on a stand.
        put(side, at, 42, (g) => {
          g.add(solid(new THREE.CylinderGeometry(3, 6, 30, 8), iron, 0, 15, 0), solid(new THREE.CylinderGeometry(13, 7, 9, 10), iron, 0, 34, 0));
        });
        const [x, z] = place(side, at, 42);
        fire(x, 37, z, theme === "throne" ? 9 : 7, 30000);
      } else {
        // A standing figure of stone, worn faceless.
        put(side, at, 30, (g) => {
          g.add(solid(new THREE.BoxGeometry(30, 12, 30), stone, 0, 6, 0), solid(new THREE.CylinderGeometry(9, 13, 58, 8), stone, 0, 41, 0), solid(new THREE.SphereGeometry(9, 10, 8), stone, 0, 78, 0));
        });
      }
    } else {
      if (pick < 0.4) {
        // A banner in the gate's colour, hung from the wall.
        put(side, at, 17, (g) => {
          const cloth = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, side: THREE.DoubleSide, emissive: tint, emissiveIntensity: 0.12 });
          g.add(solid(new THREE.BoxGeometry(34, 2.5, 2.5), iron, 0, 74, 0), solid(new THREE.PlaneGeometry(28, 50), cloth, 0, 48, 0.5));
        });
      } else if (pick < 0.75) {
        put(side, at, 26, (g) => {
          g.add(solid(new THREE.CylinderGeometry(12, 11, 30, 10), wood, -14, 15, 0), solid(new THREE.BoxGeometry(26, 26, 26), wood, 16, 13, 2));
        });
      } else {
        // Rubble from the wall.
        put(side, at, 30, (g) => {
          for (let i = 0; i < 5; i++) g.add(solid(new THREE.BoxGeometry(8 + rng() * 14, 6 + rng() * 8, 8 + rng() * 10), stone, (rng() - 0.5) * 50, 4, (rng() - 0.5) * 24));
        });
      }
    }
  }

  // The floor itself: cracks everywhere, and something of each kind of room.
  const flat = (w: number, d: number, mat: THREE.Material, x: number, z: number, turn: number, y = 0.5): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, turn);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
  };
  const crack = new THREE.MeshBasicMaterial({ color: 0x0a0b0e, transparent: true, opacity: 0.35, depthWrite: false });
  for (let i = 0; i < 5 + Math.floor(rng() * 4); i++) {
    // A crack wanders in short crooked steps, thinning as it goes, and may fork once.
    const start = { x: 120 + rng() * (W - 240), z: 100 + rng() * (H - 200), a: rng() * Math.PI * 2 };
    const run = (x: number, z: number, a: number, steps: number, width: number, level: number): void => {
      for (let j = 0; j < steps; j++) {
        const len = 8 + rng() * 12;
        const w = width * (1 - j / (steps + 1));
        flat(len, w, crack, x + (Math.cos(a) * len) / 2, z + (Math.sin(a) * len) / 2, -a, 0.45 + i * 0.01);
        x += Math.cos(a) * len;
        z += Math.sin(a) * len;
        a += (rng() - 0.5) * 1.4;
        if (level === 0 && j === 2 && rng() < 0.6) run(x, z, a + (rng() < 0.5 ? 0.9 : -0.9), 3, w * 0.7, 1);
      }
    };
    run(start.x, start.z, start.a, 6, 2.2, 0);
  }
  if (theme === "hall" || theme === "throne" || theme === "gate") {
    // A worn runner down the room, in the gate's colour (red before a throne).
    // The gate's colour, deep and dull: at full strength it outshone the fight.
    // (Colours multiply in linear space, so it takes a small factor to darken much.)
    const cloth = new THREE.MeshStandardMaterial({ color: theme === "throne" ? 0x5a1418 : new THREE.Color(tint).multiplyScalar(0.06), roughness: 1, transparent: true, opacity: theme === "throne" ? 0.8 : 0.6 });
    flat(150, H - 60, cloth, W / 2, H / 2, 0, 0.6);
    const hem = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.8 });
    for (const side of [-1, 1]) flat(6, H - 60, hem, W / 2 + side * 72, H / 2, 0, 0.7);
  } else if (theme === "crypt") {
    // Grave slabs set into the floor, a little proud of it, darker than the walls.
    const graveStone = new THREE.MeshStandardMaterial({ color: 0x3e424a, roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const slab = solid(new THREE.BoxGeometry(46, 3, 90), graveStone, 200 + rng() * (W - 400), 1.5, 140 + rng() * (H - 280));
      slab.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
      group.add(slab);
    }
  } else if (theme === "armoury") {
    // Iron drain grates.
    for (let i = 0; i < 3; i++) {
      const x = 220 + rng() * (W - 440);
      const z = 160 + rng() * (H - 320);
      flat(40, 40, new THREE.MeshBasicMaterial({ color: 0x030304 }), x, z, 0, 0.5);
      for (let k = -2; k <= 2; k++) group.add(solid(new THREE.BoxGeometry(40, 1.2, 2.5), iron, x, 0.9, z + k * 8));
    }
  } else if (theme === "cavern") {
    // Still black water, and loose stones.
    const water = new THREE.MeshStandardMaterial({ color: 0x0a1218, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 3; i++) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(30 + rng() * 40, 18), water);
      pool.rotation.x = -Math.PI / 2;
      pool.scale.set(1, 0.6 + rng() * 0.4, 1);
      pool.position.set(200 + rng() * (W - 400), 0.55, 150 + rng() * (H - 300));
      group.add(pool);
    }
    const rock = new THREE.MeshStandardMaterial({ color: look.stone, roughness: 1, flatShading: true });
    for (let i = 0; i < 10; i++) group.add(solid(new THREE.DodecahedronGeometry(3 + rng() * 5), rock, 100 + rng() * (W - 200), 2, 80 + rng() * (H - 160)));
  } else if (theme === "shrine") {
    // Candles in little clusters near the walls.
    const wax = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const cx = rng() < 0.5 ? 90 + rng() * 120 : W - 90 - rng() * 120;
      const cz = 90 + rng() * (H - 180);
      for (let k = 0; k < 4; k++) {
        const h = 6 + rng() * 10;
        const x = cx + (rng() - 0.5) * 30;
        const z = cz + (rng() - 0.5) * 30;
        group.add(solid(new THREE.CylinderGeometry(1.6, 1.8, h, 6), wax, x, h / 2, z));
        const f = flame(look.fire, 1.2, 4);
        f.position.set(x, h, z);
        group.add(f);
      }
    }
  }

  // A circle cut into the floor where rites are held.
  if (theme === "shrine" || theme === "throne") {
    const rune = new THREE.MeshBasicMaterial({ color: look.fire, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [inner, outer] of [[150, 158], [205, 209], [96, 99]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), rune);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(W / 2, 0.6, H / 2);
      group.add(ring);
    }
  }
  return torches;
}
