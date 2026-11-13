/**
 * Sound effects, synthesised with Web Audio. No audio files: every sound is
 * a few oscillators and bursts of filtered noise with short envelopes.
 */

type Wave = OscillatorType;

interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  /** Start time of the sound, in context time. */
  t: number;
  noise: AudioBuffer;
}

/** A pitched blip: optional glide to `to`, fast attack, exponential decay. */
function tone(v: Voice, wave: Wave, from: number, to: number, dur: number, gain: number, delay = 0): void {
  const t = v.t + delay;
  const osc = v.ctx.createOscillator();
  const amp = v.ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(v.out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A burst of noise through a filter whose cutoff can sweep. */
function noise(v: Voice, type: BiquadFilterType, from: number, to: number, dur: number, gain: number, delay = 0): void {
  const t = v.t + delay;
  const src = v.ctx.createBufferSource();
  const filter = v.ctx.createBiquadFilter();
  const amp = v.ctx.createGain();
  src.buffer = v.noise;
  filter.type = type;
  filter.Q.value = type === "bandpass" ? 1.4 : 0.7;
  filter.frequency.setValueAtTime(from, t);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(amp).connect(v.out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** A run of notes, `gap` seconds apart. */
function notes(v: Voice, wave: Wave, freqs: number[], gap: number, dur: number, gain: number): void {
  freqs.forEach((f, i) => tone(v, wave, f, f, dur, gain, i * gap));
}

const RECIPES: Record<string, (v: Voice) => void> = {
  swing: (v) => noise(v, "bandpass", 2200, 700, 0.09, 0.16),
  hit: (v) => {
    tone(v, "square", 240, 110, 0.07, 0.16);
    noise(v, "highpass", 1500, 1500, 0.04, 0.12);
  },
  crit: (v) => {
    tone(v, "square", 260, 100, 0.09, 0.2);
    tone(v, "triangle", 880, 1480, 0.14, 0.18, 0.02);
    noise(v, "highpass", 2000, 2000, 0.06, 0.16);
  },
  block: (v) => {
    tone(v, "square", 1240, 1180, 0.06, 0.1);
    tone(v, "square", 1870, 1800, 0.05, 0.07);
  },
  kill: (v) => {
    noise(v, "lowpass", 1800, 200, 0.2, 0.22);
    tone(v, "sine", 320, 60, 0.2, 0.2);
  },
  bosskill: (v) => {
    noise(v, "lowpass", 2400, 80, 1.1, 0.35);
    notes(v, "sawtooth", [220, 165, 110, 82], 0.16, 0.5, 0.14);
    tone(v, "sine", 120, 30, 1.1, 0.35);
  },
  hurt: (v) => {
    tone(v, "sawtooth", 170, 70, 0.22, 0.24);
    noise(v, "lowpass", 900, 300, 0.14, 0.2);
  },
  death: (v) => {
    tone(v, "sawtooth", 220, 36, 1.1, 0.28);
    tone(v, "sine", 110, 30, 1.2, 0.3);
    noise(v, "lowpass", 700, 80, 0.9, 0.2);
  },
  dash: (v) => noise(v, "highpass", 500, 4200, 0.13, 0.14),
  pierce: (v) => {
    tone(v, "sawtooth", 320, 1300, 0.14, 0.14);
    noise(v, "bandpass", 900, 4000, 0.16, 0.18);
  },
  whirl: (v) => {
    noise(v, "bandpass", 500, 2600, 0.13, 0.22);
    noise(v, "bandpass", 2600, 500, 0.16, 0.2, 0.12);
  },
  surge: (v) => notes(v, "triangle", [392, 523, 659, 784], 0.05, 0.22, 0.16),
  shot: (v) => tone(v, "square", 920, 480, 0.08, 0.07),
  blast: (v) => {
    noise(v, "lowpass", 900, 90, 0.4, 0.4);
    tone(v, "sine", 95, 38, 0.4, 0.4);
  },
  phase: (v) => {
    tone(v, "sawtooth", 82, 55, 0.7, 0.26);
    tone(v, "sawtooth", 87, 58, 0.7, 0.2);
    noise(v, "lowpass", 500, 2000, 0.6, 0.18);
  },
  heal: (v) => tone(v, "sine", 660, 990, 0.25, 0.12),
  summon: (v) => {
    tone(v, "sine", 196, 392, 0.3, 0.14);
    tone(v, "sine", 294, 588, 0.3, 0.1, 0.05);
  },
  levelup: (v) => {
    notes(v, "triangle", [523, 659, 784, 1047], 0.08, 0.4, 0.2);
    notes(v, "sine", [1047, 1319, 1568, 2093], 0.08, 0.5, 0.07);
  },
  quest: (v) => notes(v, "triangle", [784, 1047, 1319], 0.09, 0.35, 0.17),
  chime: (v) => {
    tone(v, "sine", 1320, 1320, 0.25, 0.1);
    tone(v, "sine", 1760, 1760, 0.3, 0.07, 0.06);
  },
  click: (v) => tone(v, "sine", 700, 620, 0.04, 0.12),
  tick: (v) => tone(v, "sine", 980, 980, 0.03, 0.08),
  buy: (v) => notes(v, "square", [988, 1319], 0.06, 0.09, 0.08),
  deny: (v) => tone(v, "square", 190, 150, 0.1, 0.1),
  door: (v) => {
    tone(v, "sine", 120, 62, 0.22, 0.3);
    noise(v, "lowpass", 500, 150, 0.2, 0.16);
  },
  roomclear: (v) => notes(v, "triangle", [523, 659, 784], 0.07, 0.25, 0.15),
  gateclear: (v) => {
    notes(v, "triangle", [523, 659, 784, 1047, 1319], 0.11, 0.5, 0.2);
    notes(v, "sine", [262, 330, 392, 523, 659], 0.11, 0.6, 0.12);
  },
  potion: (v) => {
    tone(v, "sine", 480, 920, 0.26, 0.14);
    tone(v, "sine", 720, 1380, 0.2, 0.07, 0.07);
  },
  stone: (v) => notes(v, "sine", [1568, 1319, 1047, 784, 523], 0.06, 0.3, 0.12),
  alarm: (v) => notes(v, "square", [720, 540, 720, 540, 720, 540], 0.12, 0.11, 0.09),
  fail: (v) => tone(v, "sawtooth", 300, 90, 0.55, 0.2),
};

export const SOUND_IDS = Object.keys(RECIPES);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private volume = 0.7;
  /** Sounds started since load. Lets a check confirm audio is wired up. */
  played = 0;

  /**
   * Browsers only allow audio after a user gesture, so the context is made
   * (or resumed) from the first key or mouse press.
   */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        // A soft limiter so many sounds at once do not clip.
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -14;
        limiter.ratio.value = 8;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(limiter).connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 1.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      // No audio on this device: the game simply stays silent.
      this.ctx = null;
    }
  }

  /** The shared context, for the music to play through. Null until unlocked. */
  context(): AudioContext | null {
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  play(id: string): void {
    const recipe = RECIPES[id];
    if (!recipe || !this.ctx || !this.master || !this.noiseBuf || this.volume <= 0) return;
    if (this.ctx.state !== "running") return;
    // The same sound many times in one instant only gets louder, not better.
    const now = this.ctx.currentTime;
    if (now - (this.last.get(id) ?? -1) < 0.045) return;
    this.last.set(id, now);
    recipe({ ctx: this.ctx, out: this.master, t: now + 0.005, noise: this.noiseBuf });
    this.played += 1;
  }
}
