import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Controls } from "../engine/input";
import { KINDS, ROOM, STEP, type EnemyKind } from "../game/config";
import { makeEnemy } from "../game/enemies";
import { applySetting } from "../game/profile";
import { QUALITIES } from "../game/state";
import { hubButtons, pauseButtons, pointIn } from "../game/ui";
import { createWorld, enterArena, step } from "../game/world";
import { buildRig, ghostify, poseFor, type Anim, type Pose } from "./rigs";

const KIND_IDS = Object.keys(KINDS) as EnemyKind[];
const POSES: Pose[] = ["idle", "windup", "attack", "thrust", "bow", "cast", "slump", "guard", "leap"];

function anim(over: Partial<Anim> = {}): Anim {
  return { time: 1.37, moving: false, pose: "idle", swing: 0.5, flash: false, glow: 0.3, phase: 1, ...over };
}

/** Every number in a figure's transforms, to check none has gone bad. */
function transforms(root: THREE.Object3D): number[] {
  const out: number[] = [];
  root.traverse((o) => out.push(o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z));
  return out;
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function size(root: THREE.Object3D): THREE.Vector3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
}

describe("rigs", () => {
  it("there is a figure for the hunter and for every enemy kind", () => {
    for (const kind of ["player", ...KIND_IDS] as (EnemyKind | "player")[]) {
      const rig = buildRig(kind, kind === "player" ? 14 : KINDS[kind].radius);
      expect(meshes(rig.root).length).toBeGreaterThan(1);
      expect(rig.height).toBeGreaterThan(10);
    }
  });

  it("every figure takes every pose, moving or still, without a bad number", () => {
    for (const kind of ["player", ...KIND_IDS] as (EnemyKind | "player")[]) {
      const rig = buildRig(kind, kind === "player" ? 14 : KINDS[kind].radius);
      for (const pose of POSES) {
        for (const moving of [false, true]) {
          for (const phase of [1, 2, 3]) {
            rig.animate(anim({ pose, moving, phase, time: 0.9 + phase, flash: moving, weapon: kind === "player" ? "spear" : undefined }));
            for (const n of transforms(rig.root)) expect(Number.isFinite(n)).toBe(true);
          }
        }
      }
    }
  });

  it("a figure stands on the ground and is about as wide as its footprint", () => {
    for (const kind of KIND_IDS) {
      const r = KINDS[kind].radius;
      const rig = buildRig(kind, r);
      rig.animate(anim());
      rig.root.updateMatrixWorld(true);
      // Only what is drawn counts: the commander keeps his on-foot form hidden until he is unhorsed.
      const box = new THREE.Box3();
      rig.root.traverseVisible((o) => {
        if ((o as THREE.Mesh).isMesh) box.union(new THREE.Box3().setFromObject(o));
      });
      // Feet near the floor; nothing held trails far beneath it.
      expect(box.min.y).toBeGreaterThan(-6);
      expect(box.min.y).toBeLessThan(12);
      const s = size(rig.root);
      const width = Math.max(s.x, s.z);
      expect(width).toBeGreaterThan(r * 0.8);
      expect(width).toBeLessThan(r * 6.5);
    }
  });

  it("whichever weapon the hunter holds, at rest or mid-thrust, it stays above the floor", () => {
    const rig = buildRig("player");
    for (const weapon of ["dagger", "sword", "spear", "bow"] as const) {
      for (const pose of ["idle", "thrust", "attack"] as Pose[]) {
        rig.animate(anim({ weapon, pose }));
        rig.root.updateMatrixWorld(true);
        // Measure only what is shown: the other three weapons are hidden.
        const box = new THREE.Box3();
        rig.root.traverseVisible((o) => {
          if ((o as THREE.Mesh).isMesh) box.expandByObject(o);
        });
        expect(box.min.y).toBeGreaterThan(-4);
      }
    }
  });

  it("bigger enemies get bigger figures", () => {
    const h = (kind: EnemyKind) => size(buildRig(kind, KINDS[kind].radius).root).y;
    expect(h("warden")).toBeGreaterThan(h("swarmer") * 1.6);
    expect(h("colossus")).toBeGreaterThan(h("knight"));
    expect(h("monarch")).toBeGreaterThan(h("assassin"));
  });

  it("walking moves the legs; standing still does not", () => {
    const rig = buildRig("knight", KINDS.knight.radius);
    rig.animate(anim({ moving: true, time: 0.2 }));
    const a = transforms(rig.root);
    rig.animate(anim({ moving: true, time: 0.33 }));
    const b = transforms(rig.root);
    expect(a.some((n, i) => Math.abs(n - b[i]) > 0.05)).toBe(true);
  });

  it("poses differ from one another", () => {
    const rig = buildRig("player");
    const shot = (pose: Pose) => {
      rig.animate(anim({ pose }));
      return transforms(rig.root).join();
    };
    const seen = new Set(POSES.map(shot));
    expect(seen.size).toBe(POSES.length);
  });

  it("the hunter shows only the weapon in hand", () => {
    const rig = buildRig("player");
    const visible = () => {
      let n = 0;
      rig.root.traverse((o) => {
        // Each weapon is a group hung from the hand; count the hidden ones.
        if (o.type === "Group" && !o.visible) n += 1;
      });
      return n;
    };
    rig.animate(anim({ weapon: "bow" }));
    expect(visible()).toBe(4);
    // Bare hands: every weapon is put away.
    rig.animate(anim({ weapon: null }));
    expect(visible()).toBe(5);
  });

  it("the commander rides in phase one and fights on foot in phase two", () => {
    const rig = buildRig("commander", KINDS.commander.radius);
    rig.animate(anim({ phase: 1 }));
    const [mount, foot] = rig.root.children;
    expect([mount.visible, foot.visible]).toEqual([true, false]);
    rig.animate(anim({ phase: 2 }));
    expect([mount.visible, foot.visible]).toEqual([false, true]);
  });

  it("a hit lights the whole figure for a moment", () => {
    const rig = buildRig("brute", KINDS.brute.radius);
    const lit = () => meshes(rig.root).filter((m) => (m.material as THREE.MeshStandardMaterial).emissiveIntensity > 0.5).length;
    rig.animate(anim({ flash: false, glow: 0 }));
    const calm = lit();
    rig.animate(anim({ flash: true }));
    expect(lit()).toBeGreaterThan(calm);
    expect(lit()).toBe(meshes(rig.root).length);
  });

  // Echoes used to be see-through; their back parts showed through their
  // front ones and read as a jumble, so a shade is now solid and dark.
  it("an echo is a solid dark shade, drawn with depth so its parts hide each other", () => {
    const rig = buildRig("swarmer", 13);
    const before = (meshes(rig.root)[0].material as THREE.MeshStandardMaterial).color.getHSL({ h: 0, s: 0, l: 0 }).l;
    ghostify(rig, 0x8a6cff);
    for (const m of meshes(rig.root)) {
      const mat = m.material as THREE.MeshStandardMaterial;
      expect(mat.transparent).toBe(false);
      expect(mat.depthWrite).toBe(true);
    }
    const after = (meshes(rig.root)[0].material as THREE.MeshStandardMaterial).color.getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(after).toBeLessThan(Math.max(before, 0.2));
  });

  it("each enemy state maps to a sensible pose", () => {
    expect(poseFor("swarmer", "windup")).toBe("windup");
    expect(poseFor("swarmer", "lunge")).toBe("attack");
    expect(poseFor("knight", "lunge")).toBe("thrust");
    expect(poseFor("pyro", "cast")).toBe("cast");
    expect(poseFor("knight", "broken")).toBe("slump");
    expect(poseFor("leaper", "leap")).toBe("leap");
    expect(poseFor("swarmer", "chase")).toBe("idle");
    expect(poseFor("exploder", "fuse")).toBe("windup");
  });
});

describe("drawing between steps", () => {
  const idle: Controls = { mouseX: 0, mouseY: 0, aimX: ROOM.w, aimY: ROOM.h / 2, attackHeld: false, axis: () => ({ x: 1, y: 0 }), consume: () => false };

  it("each step records where the player and every enemy stood before it", () => {
    const w = createWorld(() => 0.5);
    enterArena(w);
    const e = makeEnemy("swarmer", w.player.x + 300, w.player.y, "E");
    e.state = "chase";
    w.enemies.push(e);
    w.player.iframes = 99;
    const before = { px: w.player.x, ex: e.x };
    step(w, idle, STEP);
    expect(w.player.px).toBe(before.px);
    expect(e.px).toBe(before.ex);
    expect(w.player.x).toBeGreaterThan(before.px);
    expect(e.x).toBeLessThan(before.ex);
  });

  it("a paused game reports no movement", () => {
    const w = createWorld(() => 0.5);
    enterArena(w);
    w.menu = "pause";
    step(w, idle, STEP);
    expect(w.player.px).toBe(w.player.x);
  });
});

describe("graphics settings", () => {
  it("start on high, with automatic lowering on", () => {
    const w = createWorld(() => 0.5);
    expect(w.settings.quality).toBe("high");
    expect(w.settings.autoQuality).toBe(true);
  });

  it("choosing a level cycles through all three and turns automatic lowering off", () => {
    const w = createWorld(() => 0.5);
    const seen = [w.settings.quality];
    for (let i = 0; i < QUALITIES.length; i++) {
      applySetting(w, "quality");
      seen.push(w.settings.quality);
    }
    expect(seen).toEqual(["high", "medium", "low", "high"]);
    expect(w.settings.autoQuality).toBe(false);
    applySetting(w, "autoq");
    expect(w.settings.autoQuality).toBe(true);
    expect(w.settingsDirty).toBe(true);
  });

  it("both controls are on the System tab and the pause menu, clear of the others", () => {
    const w = createWorld(() => 0.5);
    w.tab = "system";
    for (const list of [hubButtons(w), pauseButtons(w)]) {
      expect(list.some((b) => b.id === "set:quality")).toBe(true);
      expect(list.some((b) => b.id === "set:autoq")).toBe(true);
      for (const a of list) {
        for (const b of list) {
          if (a !== b) expect(pointIn(b.rect, a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2)).toBe(false);
        }
      }
    }
  });
});
