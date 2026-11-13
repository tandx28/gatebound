import { pick, seeded } from "../engine/rng";

/**
 * Pure song generation. A seed always gives the same song, so each gate has
 * its own key, tempo and patterns. Nothing here touches audio.
 */

export type SongKind = "calm" | "gate" | "boss";

/** Steps are sixteenth notes: 16 to a bar, and a song loops over 4 bars. */
export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const SONG_STEPS = STEPS_PER_BAR * BARS;

export interface Song {
  seed: number;
  kind: SongKind;
  bpm: number;
  /** MIDI note of the tonic, in the bass register. */
  root: number;
  scaleName: string;
  /** Semitone offsets of the seven scale degrees. */
  scale: number[];
  /** One chord per bar, as a scale degree (0 = tonic). */
  chords: number[];
  /** MIDI note per step, or null for silence. */
  bass: (number | null)[];
  arp: (number | null)[];
  lead: (number | null)[];
  /** One bar of drums, repeated. */
  kick: boolean[];
  snare: boolean[];
  hat: boolean[];
}

const SCALES: [string, number[]][] = [
  ["minor", [0, 2, 3, 5, 7, 8, 10]],
  ["dorian", [0, 2, 3, 5, 7, 9, 10]],
  ["phrygian", [0, 1, 3, 5, 7, 8, 10]],
  ["harmonic minor", [0, 2, 3, 5, 7, 8, 11]],
];

/** Chord loops that resolve well in minor modes, as scale degrees. */
const PROGRESSIONS = [
  [0, 5, 3, 6],
  [0, 3, 4, 0],
  [0, 6, 5, 4],
  [0, 2, 5, 4],
  [0, 5, 6, 4],
  [0, 0, 3, 4],
];

const BASS_RHYTHMS = ["x...x...x...x...", "x..x..x.x..x..x.", "x.x...x.x.x...x.", "x...x.x.x...x.xx", "x.......x...x..."];
const KICKS = ["x...x...x...x...", "x.....x.x...x...", "x..x..x.x..x....", "x...x..xx...x..."];
const SNARES = ["....x.......x...", "....x.......x..x", "....x..x....x..."];
const HATS = ["x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx", "..x...x...x...x.", "x.xxx.xxx.xxx.xx"];
const ARP_SHAPES = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
  [2, 1, 0, 1],
];

const mask = (pattern: string): boolean[] => [...pattern].map((c) => c === "x");

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** MIDI note for a scale degree; degrees past the seventh climb an octave. */
export function degreeNote(root: number, scale: number[], degree: number): number {
  const octave = Math.floor(degree / scale.length);
  const index = ((degree % scale.length) + scale.length) % scale.length;
  return root + scale[index] + 12 * octave;
}

export function compose(seed: number, kind: SongKind): Song {
  const rng = seeded(seed * 2654435761 + (kind === "boss" ? 97 : kind === "calm" ? 31 : 0));
  // Boss music leans on the darkest modes.
  const scales = kind === "boss" ? SCALES.slice(2) : SCALES;
  const [scaleName, scale] = scales[pick(rng, scales.length)];
  const root = 40 + pick(rng, 10);
  const bpm = kind === "boss" ? 132 + pick(rng, 19) : kind === "gate" ? 96 + pick(rng, 29) : 68 + pick(rng, 9);
  const chords = PROGRESSIONS[pick(rng, PROGRESSIONS.length)];

  const bassRhythm = mask(kind === "calm" ? BASS_RHYTHMS[4] : BASS_RHYTHMS[pick(rng, 4)]);
  const shape = ARP_SHAPES[pick(rng, ARP_SHAPES.length)];
  // The arpeggio rests on some steps so it breathes.
  const arpRest = Array.from({ length: STEPS_PER_BAR }, () => rng() < (kind === "calm" ? 0.5 : 0.2));

  const bass: (number | null)[] = [];
  const arp: (number | null)[] = [];
  const lead: (number | null)[] = [];
  // The melody walks the scale, landing on a chord tone at the start of each bar.
  let degree = 0;

  for (let bar = 0; bar < BARS; bar++) {
    const chord = chords[bar];
    const tones = [chord, chord + 2, chord + 4, chord + 7];
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      // Bass: the chord root, with the fifth on some off-beats.
      const fifth = s % 4 !== 0 && rng() < 0.25;
      bass.push(bassRhythm[s] ? degreeNote(root, scale, chord + (fifth ? 4 : 0)) : null);

      arp.push(arpRest[s] ? null : degreeNote(root + 24, scale, tones[shape[s % shape.length]]));

      // Lead: eighth notes only, so it sings rather than chatters.
      if (s % 2 !== 0) {
        lead.push(null);
        continue;
      }
      if (s === 0) degree = tones[pick(rng, 3)];
      else degree += pick(rng, 5) - 2;
      degree = Math.max(-2, Math.min(9, degree));
      const rest = s !== 0 && rng() < 0.3;
      lead.push(rest ? null : degreeNote(root + 36, scale, degree));
    }
  }

  return {
    seed,
    kind,
    bpm,
    root,
    scaleName,
    scale,
    chords,
    bass,
    arp,
    lead,
    kick: mask(kind === "calm" ? "................" : KICKS[pick(rng, KICKS.length)]),
    snare: mask(kind === "calm" ? "................" : SNARES[pick(rng, SNARES.length)]),
    hat: mask(kind === "calm" ? "................" : HATS[kind === "boss" ? 1 + pick(rng, 1) : pick(rng, HATS.length)]),
  };
}

/** The three notes of the chord for a bar, in the middle register. */
export function chordNotes(song: Song, bar: number): number[] {
  const d = song.chords[bar % BARS];
  return [d, d + 2, d + 4].map((x) => degreeNote(song.root + 12, song.scale, x));
}
