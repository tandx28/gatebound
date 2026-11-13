import type { Dungeon } from "../game/dungeon";
import type { World } from "../game/state";
import type { SongKind } from "./compose";

/**
 * Decides what the music should be doing from the state of the game:
 * which scene, how intense, and which song. Pure, so it can be tested.
 */

export type Scene = "title" | "board" | "gate" | "boss" | "penalty" | "rest";
export type Layer = "pad" | "bass" | "drums" | "arp" | "snare" | "lead" | "boss";
export const LAYERS: Layer[] = ["pad", "bass", "drums", "arp", "snare", "lead", "boss"];

export interface MusicState {
  scene: Scene;
  /** 0 = nothing happening, 1 = everything at once. */
  intensity: number;
  /** Which song to play. The same gate always gives the same number. */
  seed: number;
  kind: SongKind;
}

/** A number that identifies a dungeon's layout, so each gate has its own song. */
export function dungeonSeed(d: Dungeon): number {
  let h = d.rank.charCodeAt(0) * 131 + d.rooms.length;
  for (const r of d.rooms) h = (Math.imul(h, 31) + (r.gx + 50) * 101 + (r.gy + 50) * 7 + r.spawns.length) >>> 0;
  return (h % 100000) + 10;
}

export function musicState(w: World): MusicState {
  if (w.mode === "title") return { scene: "title", intensity: 0, seed: 1, kind: "calm" };
  if (w.mode === "select") return { scene: "board", intensity: 0, seed: 2, kind: "calm" };

  const seed = w.dungeon ? dungeonSeed(w.dungeon) : 3;
  // After a death or a clear the gate's own song thins out to its pad.
  if (w.mode !== "gate") return { scene: "rest", intensity: 0, seed, kind: "gate" };
  if (w.gateKind === "penalty") return { scene: "penalty", intensity: 1, seed: 4242, kind: "boss" };
  // The rite is one long boss fight.
  if (w.gateKind === "rite") return { scene: "boss", intensity: 1, seed: 5151, kind: "boss" };

  const p = w.player;
  const boss = w.enemies.some((e) => e.boss);
  // Each enemy adds less than the one before; a boss counts as three.
  const threat = w.enemies.reduce((sum, e) => sum + (e.boss ? 3 : 1), 0);
  let intensity = 1 - Math.exp(-threat / 4);
  if (threat > 0 && p.hp / p.d.maxHp < 0.34) intensity += 0.2;
  if (w.emergency) intensity += 0.15;
  if (w.sealed) intensity += 0.1;
  intensity = Math.max(0, Math.min(1, intensity));

  if (boss) return { scene: "boss", intensity: Math.max(0.6, intensity), seed: seed + 7919, kind: "boss" };
  return { scene: "gate", intensity, seed, kind: "gate" };
}

/** 0 below `lo`, 1 above `hi`, a straight line between. */
function ramp(x: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
}

/**
 * How loud each layer should be. Layers enter one by one as a fight builds:
 * pad, then bass, drums, arpeggio, snare, and the lead last.
 */
export function layerGains(scene: Scene, intensity: number): Record<Layer, number> {
  const off = { pad: 0, bass: 0, drums: 0, arp: 0, snare: 0, lead: 0, boss: 0 };
  switch (scene) {
    case "title":
      return { ...off, pad: 0.8, arp: 0.25 };
    case "board":
      return { ...off, pad: 0.7, arp: 0.4, bass: 0.3 };
    case "rest":
      return { ...off, pad: 0.5 };
    case "boss":
      return { pad: 0.6, bass: 1, drums: 1, arp: 0.8, snare: 1, lead: ramp(intensity, 0.55, 0.85), boss: 1 };
    case "penalty":
      return { pad: 0.5, bass: 1, drums: 1, arp: 1, snare: 1, lead: 0, boss: 0.7 };
    case "gate":
      return {
        pad: 0.7,
        bass: ramp(intensity, 0.1, 0.3),
        drums: ramp(intensity, 0.25, 0.45),
        arp: ramp(intensity, 0.4, 0.6),
        snare: ramp(intensity, 0.5, 0.7),
        lead: ramp(intensity, 0.7, 0.9),
        boss: 0,
      };
  }
}
