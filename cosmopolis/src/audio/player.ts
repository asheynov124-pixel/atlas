/**
 * OWNER: audio.
 * MoodPlayer — base class of every generative music mood (moods.ts). A player runs on its own 16th-note grid at its
 * own tempo, scheduled ahead of the audio clock by MusicEngine.pump(). It owns three faders (dry / wet / far) so a
 * crossfade also fades its reverb and delay sends; instruments pick the bus that suits them:
 *   dry  → music bus                  (bass, drums)
 *   wet  → music bus + reverb          (pads, plucks, choirs)
 *   far  → music bus + big reverb + delay (bells, shimmer, melodies that should bloom)
 *
 * Musical helpers: scale degrees (`deg`), stacked-third chords (`chord`), the progression (`chordDeg(bar)`), energy
 * sections (`section` 0..3, a random walk every 8 bars that adds / removes layers) and a melody random walk that
 * gravitates to chord tones on strong beats.
 */
import type { MusicMood } from '../core/types';
import { Prng, Voice, type Ctx, type NoiseBank } from './dsp';
import { note, type Ins } from './instruments';
import type { InstName, SampleBank } from './samples';

export interface MusicEnv {
  ctx: Ctx;
  noise: NoiseBank;
  bank: SampleBank;
  /** music bus input */
  input: AudioNode;
  /** reverb send input */
  rev: AudioNode;
  /** delay send input */
  dly: AudioNode;
  /** retune the shared delay to the active mood */
  setDelay(seconds: number, feedback: number, at: number): void;
}

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
export const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
export const DORIAN = [0, 2, 3, 5, 7, 9, 10];
export const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

/** semitones from each mode's root down to its parent major tonic */
const MODE_OFFSET = new Map<number[], number>([
  [MAJOR, 0],
  [LYDIAN, 5],
  [AEOLIAN, 9],
  [DORIAN, 2],
  [PHRYGIAN, 4],
]);

export abstract class MoodPlayer implements Ins {
  abstract readonly mood: MusicMood;
  bpm = 80;
  /** fraction of a 16th by which odd 16ths are delayed */
  swing = 0;
  root = 60;
  scale = MAJOR;
  prog: number[] = [0];
  /** bars per chord */
  bpc = 2;
  delayBeats = 0.75;
  delayFeedback = 0.33;
  /** energy section 0..3 */
  section = 1;
  /** loudness trim so every mood sits at a similar perceived level */
  level = 1;
  /** 0..1 gameplay energy (city size, game speed, danger) — biases the section random walk */
  energy = 0.5;
  readonly v: Voice;
  readonly r: Prng;
  readonly bank: SampleBank;
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly far: GainNode;
  private faders: GainNode[];
  private sends: AudioNode[];
  step = 0;
  nextTime = 0;
  stopAt = Infinity;
  startedAt = 0;
  /** melody position (scale degree) */
  protected mel = 4;

  constructor(readonly env: MusicEnv, seed: number) {
    const ctx = env.ctx;
    this.r = new Prng(seed);
    this.bank = env.bank;
    const mk = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    this.dry = mk(1);
    this.wet = mk(1);
    this.far = mk(1);
    const fd = mk(0);
    const fw = mk(0);
    const ff = mk(0);
    this.faders = [fd, fw, ff];
    this.dry.connect(fd);
    this.wet.connect(fw);
    this.far.connect(ff);
    fd.connect(env.input);
    fw.connect(env.input);
    const wr = mk(0.32);
    fw.connect(wr);
    wr.connect(env.rev);
    const fdry = mk(0.72);
    ff.connect(fdry);
    fdry.connect(env.input);
    const fr = mk(0.85);
    ff.connect(fr);
    fr.connect(env.rev);
    const fl = mk(0.42);
    ff.connect(fl);
    fl.connect(env.dly);
    this.sends = [wr, fdry, fr, fl];
    this.v = new Voice(ctx, env.noise, this.dry, env.rev, 0, 1, 0, this.r);
  }

  /** seconds per 16th */
  get sd(): number {
    return 60 / this.bpm / 4;
  }
  get barDur(): number {
    return this.sd * 16;
  }

  /** humanise: 0..12 ms late (never early, so nothing lands before `now`) */
  jitter(): number {
    return this.r.next() * 0.012;
  }

  /**
   * Transposition (−5..+6 semitones) that moves a C-major motif into this mood's key (its parent major scale), so
   * tonal SFX (chimes, coins, fanfares) always harmonise with the music.
   */
  get keyShift(): number {
    const tonic = (((this.root - (MODE_OFFSET.get(this.scale) ?? 0)) % 12) + 12) % 12;
    return tonic > 6 ? tonic - 12 : tonic;
  }

  /** a short ascending arpeggio in the current chord (milestones, unlocks) */
  flourish(t: number): void {
    if (this.mood === 'tension' || this.mood === 'apocalypse') return;
    const inst: InstName = this.mood === 'night' ? 'piano' : this.mood === 'studio' ? 'ep' : this.mood === 'space' || this.mood === 'galaxy' ? 'glock' : 'harp';
    const oct = this.mood === 'space' || this.mood === 'galaxy' ? 3 : this.mood === 'studio' ? 0 : 1;
    const cd = this.chordDeg(this.step >> 4);
    [0, 2, 4, 7, 9, 11, 14].forEach((k, i) => note(this, inst, this.deg(cd + k, oct), t + i * 0.075, 0.16 + i * 0.02, this.far));
  }

  /** scale degree → MIDI (degrees wrap into octaves) */
  deg(d: number, oct = 0): number {
    const n = this.scale.length;
    const o = Math.floor(d / n);
    const i = d - o * n;
    return this.root + this.scale[i] + 12 * (o + oct);
  }

  /** stacked thirds on degree d (n notes: 3 = triad, 4 = 7th, 5 = 9th) */
  chord(d: number, n = 4, oct = 0): number[] {
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(this.deg(d + k * 2, oct));
    return out;
  }

  chordDeg(bar: number): number {
    return this.prog[Math.floor(bar / this.bpc) % this.prog.length];
  }

  /** true on the first 16th of a chord */
  chordStart(s: number): boolean {
    return (s & 15) === 0 && (s >> 4) % this.bpc === 0;
  }

  /** melody random walk (degrees), snapping to chord tones on strong beats */
  melody(cd: number, oct: number, strong: boolean, lo = -2, hi = 9): number {
    let d = this.mel + this.r.pick([-2, -1, -1, 0, 1, 1, 2, -3, 3]);
    if (strong && this.r.chance(0.65)) {
      let best = d;
      let bd = 99;
      for (const tone of [cd, cd + 2, cd + 4]) {
        for (let k = -2; k <= 2; k++) {
          const c = tone + k * 7;
          const dd = Math.abs(c - d);
          if (dd < bd) {
            bd = dd;
            best = c;
          }
        }
      }
      d = best;
    }
    if (d < lo) d += 7;
    if (d > hi) d -= 7;
    this.mel = d;
    return this.deg(d, oct);
  }

  start(t: number, fade: number): void {
    this.startedAt = t;
    this.nextTime = t;
    this.section = this.r.chance(0.5) ? 0 : 1;
    for (const f of this.faders) {
      f.gain.cancelScheduledValues(t);
      f.gain.setValueAtTime(0, t);
      f.gain.linearRampToValueAtTime(this.level, t + Math.max(0.05, fade));
    }
    this.onStart(t);
  }

  fadeOut(now: number, fade: number): void {
    if (this.stopAt !== Infinity) {
      // already fading: only allow speeding it up
      if (now + fade >= this.stopAt) return;
    }
    for (const f of this.faders) {
      const cur = f.gain.value;
      f.gain.cancelScheduledValues(now);
      f.gain.setValueAtTime(cur, now);
      f.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fade));
    }
    this.stopAt = now + fade;
    this.onStop(now, fade);
  }

  /** schedule every step that starts before `horizon` */
  pump(horizon: number, now: number): void {
    // fell behind (main thread stalled): skip ahead instead of bursting
    if (this.nextTime < now - 0.08) {
      const behind = Math.ceil((now - this.nextTime) / this.sd);
      this.step += behind;
      this.nextTime += behind * this.sd;
    }
    let guard = 64;
    while (this.nextTime < horizon && this.nextTime < this.stopAt && guard-- > 0) {
      const s = this.step;
      if ((s & 127) === 0 && s > 0) this.nextSection();
      const t = this.nextTime + (s & 1 ? this.swing * this.sd : 0);
      try {
        this.onStep(s, Math.max(t, now));
      } catch (e) {
        console.error('[audio] mood step failed', this.mood, e);
      }
      this.step++;
      this.nextTime += this.sd;
    }
  }

  /** every 8 bars: wander the energy section, drifting toward the gameplay energy */
  protected nextSection(): void {
    const target = Math.round(this.energy * 3);
    let d = this.r.pick([-1, 0, 1]);
    if (this.section < target && this.r.chance(0.55)) d = 1;
    else if (this.section > target && this.r.chance(0.55)) d = -1;
    this.section = Math.max(0, Math.min(3, this.section + d));
  }

  dispose(): void {
    for (const n of [this.dry, this.wet, this.far, ...this.faders, ...this.sends]) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  abstract onStep(step: number, t: number): void;
  onStart(_t: number): void {}
  onStop(_now: number, _fade: number): void {}
}

/** inclusive integer range helper for warm lists */
export function span(a: number, b: number, step = 4): number[] {
  const out: number[] = [];
  for (let m = a; m <= b; m += step) out.push(m);
  return out;
}
