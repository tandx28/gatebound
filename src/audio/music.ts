import { chordNotes, compose, midiToHz, SONG_STEPS, STEPS_PER_BAR, type Song } from "./compose";
import { layerGains, LAYERS, type Layer, type MusicState } from "./director";

/**
 * Plays generated songs through Web Audio. Notes are scheduled a little
 * ahead of the clock each frame; each layer has its own gain, eased toward
 * the level the director asks for.
 */

/** How far ahead of the audio clock notes are queued, in seconds. */
const LOOKAHEAD = 0.25;
/** Overall level of the music relative to effects. */
const MIX = 0.5;

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private layers!: Record<Layer, GainNode>;
  private noise!: AudioBuffer;
  private song: Song | null = null;
  private queued: Song | null = null;
  private key = "";
  private step = 0;
  private nextTime = 0;
  /** Steps scheduled since load, and the current song, for checks. */
  stats = { steps: 0, key: "", bpm: 0, scale: "" };

  private attach(ctx: AudioContext): void {
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(limiter).connect(ctx.destination);
    this.layers = {} as Record<Layer, GainNode>;
    for (const name of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.layers[name] = g;
    }
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** One enveloped oscillator through a lowpass filter. */
  private voice(
    layer: Layer,
    wave: OscillatorType,
    note: number,
    t: number,
    dur: number,
    gain: number,
    cutoff: number,
    attack = 0.005,
    detune = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midiToHz(note);
    osc.detune.value = detune;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(amp).connect(this.layers[layer]);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private hit(layer: Layer, type: BiquadFilterType, freq: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = freq;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(amp).connect(this.layers[layer]);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    amp.gain.setValueAtTime(0.9, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(amp).connect(this.layers.drums);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private scheduleStep(song: Song, step: number, t: number, stepDur: number): void {
    const s = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR);

    if (s === 0) {
      // Pad: the bar's chord, two slightly detuned saws per note.
      const len = stepDur * STEPS_PER_BAR * 1.08;
      for (const n of chordNotes(song, bar)) {
        this.voice("pad", "sawtooth", n, t, len, 0.07, 900, len * 0.3, -7);
        this.voice("pad", "sawtooth", n, t, len, 0.07, 900, len * 0.3, 7);
      }
    }

    const bass = song.bass[step];
    if (bass !== null) this.voice("bass", "sawtooth", bass, t, stepDur * 1.8, 0.3, 420);

    if (song.kick[s]) this.kick(t);
    if (song.hat[s]) this.hit("drums", "highpass", 7000, t, 0.04, s % 4 === 2 ? 0.16 : 0.09);
    if (song.snare[s]) {
      this.hit("snare", "bandpass", 1800, t, 0.14, 0.4);
      this.voice("snare", "triangle", 55, t, 0.08, 0.2, 2000);
    }

    const arp = song.arp[step];
    if (arp !== null) this.voice("arp", "triangle", arp, t, stepDur * 0.9, 0.13, 3200);

    const lead = song.lead[step];
    if (lead !== null) {
      this.voice("lead", "square", lead, t, stepDur * 2.2, 0.07, 2600, 0.01);
      this.voice("lead", "square", lead, t, stepDur * 2.2, 0.05, 2600, 0.01, 9);
    }

    // Boss layer: a driving low fifth on every eighth note.
    if (song.kind === "boss" && s % 2 === 0) {
      const root = song.bass[bar * STEPS_PER_BAR] ?? song.root;
      this.voice("boss", "sawtooth", root + 12, t, stepDur * 1.1, 0.1, 1100);
      this.voice("boss", "sawtooth", root + 19, t, stepDur * 1.1, 0.08, 1100);
    }
  }

  /**
   * Call once a frame. `ctx` is the shared audio context once the player has
   * unlocked it; `volume` is the music setting, 0 to 1.
   */
  update(ctx: AudioContext | null, state: MusicState, volume: number): void {
    if (!ctx || ctx.state !== "running") return;
    if (!this.ctx) this.attach(ctx);
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(volume * MIX, now, 0.1);
    if (volume <= 0) return;

    const key = `${state.kind}:${state.seed}`;
    if (key !== this.key) {
      this.key = key;
      const next = compose(state.seed, state.kind);
      // The first song starts at once; later ones wait for the next beat.
      if (this.song) this.queued = next;
      else this.song = next;
    }

    // Layers swell quickly and fall away slowly, so a lull does not sound abrupt.
    const want = layerGains(state.scene, state.intensity);
    for (const name of LAYERS) {
      const g = this.layers[name].gain;
      g.setTargetAtTime(want[name], now, want[name] > g.value ? 0.25 : 1.1);
    }

    // After a long gap (a hidden tab), skip ahead rather than play a burst.
    if (this.nextTime < now - 0.3) this.nextTime = now + 0.06;
    while (this.nextTime < now + LOOKAHEAD && this.song) {
      // Change on a beat: prompt enough to follow the action, never mid-note.
      if (this.queued && this.step % 4 === 0) {
        this.song = this.queued;
        this.queued = null;
        this.step = 0;
      }
      const stepDur = 60 / this.song.bpm / 4;
      this.scheduleStep(this.song, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % SONG_STEPS;
      this.stats.steps += 1;
    }
    this.stats.key = key;
    this.stats.bpm = this.song?.bpm ?? 0;
    this.stats.scale = this.song?.scaleName ?? "";
  }
}
