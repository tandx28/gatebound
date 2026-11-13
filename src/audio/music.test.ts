import { describe, expect, it } from "vitest";
import { seeded } from "../engine/rng";
import { makeEnemy } from "../game/enemies";
import { createWorld, enterArena, enterGate, enterPenalty, enterRoom, type World } from "../game/world";
import { BARS, chordNotes, compose, degreeNote, midiToHz, SONG_STEPS, STEPS_PER_BAR, type SongKind } from "./compose";
import { dungeonSeed, layerGains, LAYERS, musicState, type Scene } from "./director";

const KINDS: SongKind[] = ["calm", "gate", "boss"];

describe("compose", () => {
  it("is deterministic for a seed and kind", () => {
    expect(compose(42, "gate")).toEqual(compose(42, "gate"));
  });

  it("differs between seeds, and between kinds for one seed", () => {
    const songs = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(compose(i + 1, "gate"))));
    expect(songs.size).toBe(30);
    expect(compose(5, "gate")).not.toEqual(compose(5, "boss"));
  });

  it("has full-length patterns and one bar of drums", () => {
    for (const kind of KINDS) {
      const s = compose(7, kind);
      expect(s.bass.length).toBe(SONG_STEPS);
      expect(s.arp.length).toBe(SONG_STEPS);
      expect(s.lead.length).toBe(SONG_STEPS);
      expect(s.kick.length).toBe(STEPS_PER_BAR);
      expect(s.snare.length).toBe(STEPS_PER_BAR);
      expect(s.hat.length).toBe(STEPS_PER_BAR);
      expect(s.chords.length).toBe(BARS);
    }
  });

  it("every note belongs to the song's scale", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const kind of KINDS) {
        const s = compose(seed, kind);
        const allowed = new Set(s.scale.map((x) => (s.root + x) % 12));
        const all = [...s.bass, ...s.arp, ...s.lead, ...[0, 1, 2, 3].flatMap((b) => chordNotes(s, b))];
        for (const n of all) if (n !== null) expect(allowed.has(((n % 12) + 12) % 12)).toBe(true);
      }
    }
  });

  it("keeps the bass under the arpeggio and the lead on top", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = compose(seed, "gate");
      const notes = (xs: (number | null)[]) => xs.filter((n): n is number => n !== null);
      expect(Math.max(...notes(s.bass))).toBeLessThan(Math.min(...notes(s.arp)));
      expect(Math.min(...notes(s.lead))).toBeGreaterThan(Math.max(...notes(s.bass)));
    }
  });

  it("stays in an audible range", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const kind of KINDS) {
        const s = compose(seed, kind);
        for (const n of [...s.bass, ...s.arp, ...s.lead]) {
          if (n === null) continue;
          expect(midiToHz(n)).toBeGreaterThan(40);
          expect(midiToHz(n)).toBeLessThan(5000);
        }
      }
    }
  });

  it("tempo rises from calm to gate to boss", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const calm = compose(seed, "calm").bpm;
      const gate = compose(seed, "gate").bpm;
      const boss = compose(seed, "boss").bpm;
      expect(calm).toBeLessThan(96);
      expect(gate).toBeGreaterThanOrEqual(96);
      expect(gate).toBeLessThanOrEqual(124);
      expect(boss).toBeGreaterThanOrEqual(132);
    }
  });

  it("the lead plays on eighth notes only and starts each bar", () => {
    const s = compose(9, "gate");
    s.lead.forEach((n, i) => {
      if (i % 2 === 1) expect(n).toBe(null);
    });
    for (let bar = 0; bar < BARS; bar++) expect(s.lead[bar * STEPS_PER_BAR]).not.toBe(null);
  });

  it("the bass sounds on the first beat of every bar", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = compose(seed, "gate");
      for (let bar = 0; bar < BARS; bar++) expect(s.bass[bar * STEPS_PER_BAR]).not.toBe(null);
    }
  });

  it("calm songs have no drums; gate and boss songs have a kick and a snare", () => {
    expect(compose(3, "calm").kick.some(Boolean)).toBe(false);
    for (const kind of ["gate", "boss"] as SongKind[]) {
      expect(compose(3, kind).kick[0]).toBe(true);
      expect(compose(3, kind).snare[4]).toBe(true);
    }
  });

  it("boss songs use the darker modes", () => {
    for (let seed = 1; seed <= 40; seed++) {
      expect(["phrygian", "harmonic minor"]).toContain(compose(seed, "boss").scaleName);
    }
  });
});

describe("pitch helpers", () => {
  it("A4 is 440 Hz and an octave doubles it", () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });

  it("degrees past the scale climb an octave, and negative ones drop", () => {
    const minor = [0, 2, 3, 5, 7, 8, 10];
    expect(degreeNote(48, minor, 0)).toBe(48);
    expect(degreeNote(48, minor, 2)).toBe(51);
    expect(degreeNote(48, minor, 7)).toBe(60);
    expect(degreeNote(48, minor, -1)).toBe(46);
  });
});

describe("musicState", () => {
  function inGate(): World {
    const w = createWorld(seeded(11));
    w.hiddenChance = 0;
    enterGate(w, "E", { sealed: false });
    return w;
  }

  it("the title and the board are calm, with fixed themes", () => {
    const w = createWorld(seeded(1));
    expect(musicState(w)).toEqual({ scene: "board", intensity: 0, seed: 2, kind: "calm" });
    w.mode = "title";
    expect(musicState(w).scene).toBe("title");
  });

  it("an empty room in a gate is the gate scene at zero intensity", () => {
    const m = musicState(inGate());
    expect(m.scene).toBe("gate");
    expect(m.intensity).toBe(0);
    expect(m.kind).toBe("gate");
  });

  it("intensity rises with each enemy, by less each time, and never passes 1", () => {
    const w = createWorld(() => 0.5);
    enterArena(w);
    let last = 0;
    let lastGain = 1;
    for (let i = 0; i < 30; i++) {
      w.enemies.push(makeEnemy("swarmer", 100, 100, "E"));
      const now = musicState(w).intensity;
      expect(now).toBeGreaterThan(last);
      expect(now).toBeLessThanOrEqual(1);
      if (now < 1) expect(now - last).toBeLessThanOrEqual(lastGain + 1e-9);
      lastGain = now - last;
      last = now;
    }
  });

  it("low health in a fight, an emergency, and a sealed gate each add tension", () => {
    const w = createWorld(() => 0.5);
    enterArena(w);
    w.enemies.push(makeEnemy("swarmer", 100, 100, "E"));
    const base = musicState(w).intensity;
    w.player.hp = 10;
    const hurt = musicState(w).intensity;
    expect(hurt).toBeGreaterThan(base);
    w.emergency = { t: 5, total: 5, bonus: 0 };
    const rushed = musicState(w).intensity;
    expect(rushed).toBeGreaterThan(hurt);
    w.sealed = true;
    expect(musicState(w).intensity).toBeGreaterThan(rushed);
  });

  it("low health alone, with nothing to fight, adds nothing", () => {
    const w = createWorld(() => 0.5);
    enterArena(w);
    w.player.hp = 5;
    expect(musicState(w).intensity).toBe(0);
  });

  it("a boss in the room switches to the boss scene and a different song", () => {
    const w = inGate();
    const calm = musicState(w);
    enterRoom(w, w.dungeon!.bossId, null);
    const boss = musicState(w);
    expect(boss.scene).toBe("boss");
    expect(boss.kind).toBe("boss");
    expect(boss.seed).not.toBe(calm.seed);
    expect(boss.intensity).toBeGreaterThanOrEqual(0.6);
  });

  it("the song is the same in every room of a gate, and differs between gates", () => {
    const w = inGate();
    const a = musicState(w).seed;
    enterRoom(w, w.dungeon!.rooms.find((r) => r.kind === "normal")!.id, null);
    expect(musicState(w).seed).toBe(a);
    const seeds = new Set<number>();
    for (let i = 1; i <= 30; i++) {
      const g = createWorld(seeded(i));
      enterGate(g, "E", { sealed: false });
      seeds.add(musicState(g).seed);
    }
    expect(seeds.size).toBeGreaterThan(20);
  });

  it("death and victory thin the gate's own song out", () => {
    const w = inGate();
    const seed = musicState(w).seed;
    w.mode = "dead";
    expect(musicState(w)).toEqual({ scene: "rest", intensity: 0, seed, kind: "gate" });
  });

  it("the penalty zone is always at full intensity", () => {
    const w = createWorld(seeded(3));
    enterPenalty(w);
    const m = musicState(w);
    expect(m.scene).toBe("penalty");
    expect(m.intensity).toBe(1);
  });

  it("dungeonSeed depends on the layout", () => {
    const a = createWorld(seeded(1));
    const b = createWorld(seeded(2));
    enterGate(a, "D", { sealed: false });
    enterGate(b, "D", { sealed: false });
    expect(dungeonSeed(a.dungeon!)).toBe(dungeonSeed(a.dungeon!));
    expect(dungeonSeed(a.dungeon!)).not.toBe(dungeonSeed(b.dungeon!));
  });
});

describe("layerGains", () => {
  const scenes: Scene[] = ["title", "board", "gate", "boss", "penalty", "rest"];

  it("every gain is between 0 and 1 in every scene", () => {
    for (const scene of scenes) {
      for (let i = 0; i <= 10; i++) {
        const g = layerGains(scene, i / 10);
        for (const name of LAYERS) {
          expect(g[name]).toBeGreaterThanOrEqual(0);
          expect(g[name]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("in a gate, no layer gets quieter as intensity rises", () => {
    let prev = layerGains("gate", 0);
    for (let i = 1; i <= 20; i++) {
      const now = layerGains("gate", i / 20);
      for (const name of LAYERS) expect(now[name]).toBeGreaterThanOrEqual(prev[name]);
      prev = now;
    }
  });

  it("layers enter in order: bass, drums, arpeggio, snare, lead", () => {
    const order = ["bass", "drums", "arp", "snare", "lead"] as const;
    const enters = order.map((name) => {
      for (let i = 0; i <= 100; i++) if (layerGains("gate", i / 100)[name] > 0) return i;
      return 999;
    });
    for (let i = 1; i < enters.length; i++) expect(enters[i]).toBeGreaterThan(enters[i - 1]);
  });

  it("a quiet gate is pad only; a full fight has everything but the boss layer", () => {
    const quiet = layerGains("gate", 0);
    expect(quiet.pad).toBeGreaterThan(0);
    expect(quiet.bass + quiet.drums + quiet.arp + quiet.snare + quiet.lead + quiet.boss).toBe(0);
    const full = layerGains("gate", 1);
    for (const name of ["bass", "drums", "arp", "snare", "lead"] as const) expect(full[name]).toBe(1);
    expect(full.boss).toBe(0);
  });

  it("only boss fights and the penalty zone use the boss layer", () => {
    for (const scene of scenes) {
      const on = layerGains(scene, 1).boss > 0;
      expect(on).toBe(scene === "boss" || scene === "penalty");
    }
  });

  it("the calm scenes and the rest scene have no drums", () => {
    for (const scene of ["title", "board", "rest"] as Scene[]) {
      const g = layerGains(scene, 1);
      expect(g.drums + g.snare + g.lead).toBe(0);
    }
  });
});
