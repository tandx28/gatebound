import * as THREE from "three";
import { seeded } from "../engine/rng";
import { ROOM } from "../game/config";
import type { Side } from "../game/dungeon";
import type { Pillar, Theme } from "../game/rooms";
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

/** A pillar in the manner of the room: a drum, a square pier, a post, a stalagmite, a rune stone. */
export function pillarFor(theme: Theme, p: Pillar, wallTex: THREE.Texture, tint: number): THREE.Object3D {
  const look = LOOK[theme];
  const stone = new THREE.MeshStandardMaterial({ map: wallTex, color: look.stone, roughness: 0.95 });
  const g = new THREE.Group();
  const r = p.radius;
  if (theme === "cavern") {
    // A stalagmite, with two lesser ones leaning on it.
    const rock = new THREE.MeshStandardMaterial({ color: look.stone, roughness: 1, flatShading: true });
    g.add(solid(new THREE.ConeGeometry(r, 170, 7), rock, p.x, 85, p.y));
    g.add(solid(new THREE.ConeGeometry(r * 0.5, 80, 6), rock, p.x + r * 0.7, 40, p.y + r * 0.3));
    g.add(solid(new THREE.ConeGeometry(r * 0.4, 60, 6), rock, p.x - r * 0.6, 30, p.y - r * 0.5));
    const crystal = new THREE.MeshStandardMaterial({ color: look.fire, emissive: look.fire, emissiveIntensity: 1.6, roughness: 0.2 });
    g.add(solid(new THREE.OctahedronGeometry(r * 0.28), crystal, p.x + r * 0.5, 70, p.y - r * 0.4));
  } else if (theme === "crypt" || theme === "armoury") {
    // A square pier on a plinth.
    const side = r * 1.55;
    g.add(solid(new THREE.BoxGeometry(side * 1.2, 14, side * 1.2), stone, p.x, 7, p.y));
    g.add(solid(new THREE.BoxGeometry(side, 150, side), stone, p.x, 75, p.y));
    g.add(solid(new THREE.BoxGeometry(side * 1.2, 10, side * 1.2), stone, p.x, 150, p.y));
  } else {
    // A drum on a base, with a capital, and a band in the gate's colour.
    g.add(solid(new THREE.CylinderGeometry(r * 1.12, r * 1.2, 12, 14), stone, p.x, 6, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 0.88, r, 140, 14), stone, p.x, 80, p.y));
    g.add(solid(new THREE.CylinderGeometry(r * 1.15, r * 0.9, 12, 14), stone, p.x, 152, p.y));
    const band = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: theme === "shrine" ? 1.4 : 0.5 });
    g.add(solid(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 5, 14), band, p.x, 112, p.y));
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
