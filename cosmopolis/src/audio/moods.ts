/**
 * OWNER: audio.
 * The eight generative music moods. Each is a MoodPlayer with its own key, scale, tempo, progression and layers
 * that come and go with the energy `section` (0..3), so the music keeps evolving without ever repeating exactly.
 *
 *   menu        D major, 54 bpm — majestic slow FM pads, low drone bass, soft timpani, horn swells, harp melody
 *   day         F lydian, 92 bpm — warm hopeful harp arpeggios over a light pad, round bass, shaker & soft kick,
 *               kalimba melody
 *   night       A aeolian, 64 bpm — soft piano plucks and rolled chords over a dark pad, glock twinkles
 *   space       C lydian, 60 bpm — vast drone, high shimmer pads, scattered bells and falling comet runs
 *   galaxy      E lydian, 50 bpm — deeper drone, airy "oo" choir, twinkling glock arpeggios, deep bells
 *   tension     D phrygian, 112 bpm — low pulsing bass, heartbeat kick, ticking hats, harp ostinato, stabs, risers
 *   apocalypse  C phrygian, 66 bpm — choir pads, sub booms, tolling bell, taiko pattern, gritty drone
 *   studio      Eb major, 80 bpm swung — lo-fi groove: FM e-piano comping, walking bass, dusty drums, vinyl crackle
 */
import type { MusicMood } from '../core/types';
import {
  bass,
  boom,
  choir,
  drone,
  hat,
  kick,
  note,
  pad,
  rim,
  riser,
  shaker,
  snare,
  stab,
  swell,
  taiko,
  voicing,
  type DroneHandle,
} from './instruments';
import { AEOLIAN, LYDIAN, MAJOR, MoodPlayer, PHRYGIAN, span, type MusicEnv } from './player';
import type { InstName } from './samples';

// ─────────────────────────────────────────────────────────────── menu
class MenuMood extends MoodPlayer {
  readonly mood = 'menu';
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 0.62;
    this.bpm = 54;
    this.root = 50;
    this.scale = MAJOR;
    this.prog = [0, 5, 3, 4];
    this.bpc = 2;
    this.delayBeats = 1.5;
    this.delayFeedback = 0.42;
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    if (this.chordStart(s)) {
      const ci = Math.floor(bar / this.bpc);
      if (ci > 0 && ci % this.prog.length === 0) this.prog = this.r.pick([[0, 5, 3, 4], [0, 4, 5, 3], [0, 3, 5, 4], [0, 5, 1, 4]]);
      const dur = this.barDur * this.bpc;
      pad(this, voicing([...this.chord(cd, 4), this.deg(cd + 8)], 57, 81), t, dur + 0.3, 0.16, this.wet, { attack: 2.6, release: 3.4, cutoff: 1500, fm: 0.32, spread: 8 });
      bass(this, this.deg(cd, -1), t, dur, 0.11, this.dry, 'soft');
      if (ci % 2 === 0) taiko(this, t, 0.16, this.wet, 52);
      if (ci % 4 === 2 && this.section >= 1) swell(this, [this.deg(cd, 0), this.deg(cd + 4, 0)], t + this.barDur * 0.25, dur * 0.85, 0.08, this.wet);
    }
    const prob = [0.2, 0.3, 0.42, 0.5][this.section];
    if (i % 4 === 0 && this.r.chance(prob)) note(this, 'harp', this.melody(cd, 2, i % 8 === 0), t + this.jitter(), this.r.range(0.28, 0.38), this.far);
    else if (i % 4 === 2 && this.section >= 2 && this.r.chance(0.12)) note(this, 'harp', this.melody(cd, 2, false), t + this.jitter(), this.r.range(0.18, 0.26), this.far);
    if (i === 8 && bar % 2 === 1 && this.r.chance(0.35)) note(this, 'glock', this.deg(this.r.pick([0, 2, 4]), 3), t, 0.07, this.far);
  }
}

// ─────────────────────────────────────────────────────────────── day
const ARPS = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 5],
  [0, 1, 2, 4, 3, 2, 1, 2],
  [4, 3, 2, 1, 0, 1, 2, 3],
];

class DayMood extends MoodPlayer {
  readonly mood = 'day';
  private arp = ARPS[0];
  private tones: number[] = [];
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 0.85;
    this.bpm = 92;
    this.root = 53;
    this.scale = LYDIAN;
    this.prog = [0, 1, 2, 4];
    this.bpc = 2;
    this.delayBeats = 0.75;
    this.delayFeedback = 0.3;
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    if (this.chordStart(s)) {
      const ci = Math.floor(bar / this.bpc);
      if (ci > 0 && ci % this.prog.length === 0) this.prog = this.r.pick([[0, 1, 2, 4], [0, 1, 5, 4], [0, 4, 1, 5], [0, 2, 1, 4]]);
      const dur = this.barDur * this.bpc;
      pad(this, voicing(this.chord(cd, 4), 60, 77), t, dur, 0.09, this.wet, { attack: 0.9, release: 1.6, cutoff: 2000, fm: 0.18 });
      this.arp = this.r.pick(ARPS);
      this.tones = voicing([...this.chord(cd, 4), ...this.chord(cd, 4, 1)], 65, 92);
    }
    if (!this.tones.length) this.tones = voicing([...this.chord(cd, 4), ...this.chord(cd, 4, 1)], 65, 92);
    // bass (round, syncopated)
    if (i === 0) bass(this, this.deg(cd, -1), t, this.sd * 5, 0.15, this.dry, 'soft');
    else if (i === 6 && this.r.chance(0.6)) bass(this, this.deg(cd + 4, -1), t, this.sd * 2, 0.1, this.dry, 'soft');
    else if (i === 8) bass(this, this.deg(cd, -1), t, this.sd * 4, 0.12, this.dry, 'soft');
    else if (i === 14 && this.r.chance(0.4)) bass(this, this.deg(cd + this.r.pick([1, -1, 2]), -1), t, this.sd * 2, 0.08, this.dry, 'soft');
    // harp arpeggio
    const sec = this.section;
    let play = false;
    if (i % 2 === 0) play = this.r.chance(sec === 0 ? 0.85 : 0.95);
    else if (sec === 1) play = (i === 7 || i === 15) && this.r.chance(0.6);
    else if (sec >= 2) play = this.r.chance(0.55 + 0.15 * (sec - 2));
    if (play) {
      const idx = this.arp[(i >> (sec >= 2 ? 0 : 1)) % this.arp.length] + (bar % 2 === 1 && sec >= 2 ? 1 : 0);
      const m = this.tones[Math.min(this.tones.length - 1, idx)];
      const accent = i % 4 === 0;
      note(this, 'harp', m, t + this.jitter(), (accent ? 0.27 : 0.17) * this.r.range(0.85, 1.05), accent && this.r.chance(0.4) ? this.far : this.wet);
    }
    // light percussion
    if (sec >= 1 && i % 2 === 0) shaker(this, t, i % 4 === 2 ? 0.09 : 0.05, this.dry);
    if (sec >= 2 && (i === 0 || i === 8)) kick(this, t, 0.38, this.dry, 0.3);
    if (sec >= 3 && i === 12) rim(this, t, 0.09, this.dry);
    // kalimba melody
    if (sec >= 1 && i % 4 === 0 && this.r.chance(0.22)) note(this, 'kalimba', this.melody(cd, 2, i % 8 === 0), t + this.jitter(), this.r.range(0.16, 0.22), this.far);
  }
}

// ─────────────────────────────────────────────────────────────── night
class NightMood extends MoodPlayer {
  readonly mood = 'night';
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 0.8;
    this.bpm = 64;
    this.root = 57;
    this.scale = AEOLIAN;
    this.prog = [5, 0, 3, 6];
    this.bpc = 2;
    this.delayBeats = 1;
    this.delayFeedback = 0.36;
    this.mel = 7;
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    if (this.chordStart(s)) {
      const ci = Math.floor(bar / this.bpc);
      if (ci > 0 && ci % this.prog.length === 0) this.prog = this.r.pick([[5, 0, 3, 6], [0, 5, 3, 4], [3, 0, 5, 6], [5, 3, 0, 4]]);
      const dur = this.barDur * this.bpc;
      pad(this, voicing([...this.chord(cd, 4), this.deg(cd + 8)], 52, 72), t, dur + 0.2, 0.13, this.wet, { attack: 2.6, release: 3.2, cutoff: 900, fm: 0.12, spread: 6 });
      bass(this, this.deg(cd, -1), t, dur * 0.95, 0.09, this.dry, 'soft');
      if (this.r.chance(0.55)) {
        const roll = voicing(this.chord(cd, 4, 1), 64, 82).slice(0, 3);
        roll.forEach((m, k) => note(this, 'piano', m, t + 0.02 + k * 0.075, 0.22 - k * 0.03, this.wet));
      }
    }
    if (i % 2 === 0) {
      const prob = [0.12, 0.2, 0.28, 0.34][this.section];
      if (this.r.chance(prob)) {
        const m = this.melody(cd, 1, i % 4 === 0, 0, 11);
        const vel = this.r.range(0.2, 0.32);
        note(this, 'piano', m, t + this.jitter(), vel, this.r.chance(0.2) ? this.far : this.wet);
        if (this.r.chance(0.25)) note(this, 'piano', m - this.r.pick([3, 4, 5, 8, 9]), t + this.jitter(), vel * 0.65, this.wet);
      }
      if (this.r.chance(0.025)) note(this, 'glock', this.deg(this.r.pick([0, 2, 4, 6]), 3), t, 0.05, this.far);
    }
  }
}

// ─────────────────────────────────────────────────────────────── space (system view)
class SpaceMood extends MoodPlayer {
  readonly mood: MusicMood = 'space';
  protected dr: DroneHandle | null = null;
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 1.25;
    this.bpm = 60;
    this.root = 48;
    this.scale = LYDIAN;
    this.prog = [0, 1];
    this.bpc = 4;
    this.delayBeats = 1.5;
    this.delayFeedback = 0.46;
  }
  override onStart(t: number): void {
    this.dr = drone(this, [36, 43, 48], t, this.wet, { cutoff: 420, lfoRate: 0.045, vel: 0.075 });
  }
  override onStop(now: number, fade: number): void {
    this.dr?.stop(now, fade);
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    if (this.chordStart(s)) {
      const dur = this.barDur * this.bpc;
      pad(this, voicing([...this.chord(cd, 4), this.deg(cd + 8)], 64, 88), t, dur, 0.08, this.far, { attack: 3.5, release: 4.5, cutoff: 2600, fm: 0.9, spread: 9 });
    }
    if (i % 2 === 0) {
      const prob = [0.08, 0.12, 0.16, 0.2][this.section];
      if (this.r.chance(prob)) note(this, 'bell', this.deg(this.r.pick([0, 1, 2, 4, 5, 7, 8, 9]), 2), t + this.jitter(), this.r.range(0.16, 0.28), this.far);
    }
    if (i === 0 && this.r.chance(0.07)) {
      const top = this.r.int(9, 12);
      for (let k = 0; k < 4; k++) note(this, 'glock', this.deg(top - k, 2), t + k * 0.09, 0.09 - k * 0.012, this.far);
    }
    if (bar % 8 === 4 && i === 0 && this.section >= 2) riser(this, t, this.barDur * 1.5, 0.025, this.far);
  }
}

// ─────────────────────────────────────────────────────────────── galaxy
class GalaxyMood extends MoodPlayer {
  readonly mood = 'galaxy';
  private dr: DroneHandle | null = null;
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 1.25;
    this.bpm = 50;
    this.root = 40;
    this.scale = LYDIAN;
    this.prog = [0, 4, 5, 1];
    this.bpc = 4;
    this.delayBeats = 1.5;
    this.delayFeedback = 0.5;
  }
  override onStart(t: number): void {
    this.dr = drone(this, [40, 47, 52], t, this.wet, { cutoff: 380, lfoRate: 0.03, vel: 0.075 });
  }
  override onStop(now: number, fade: number): void {
    this.dr?.stop(now, fade);
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    if (this.chordStart(s)) {
      const dur = this.barDur * this.bpc;
      choir(this, voicing(this.chord(cd, 3), 59, 77), t, dur, 0.08, this.far, 'o', 3, 4);
      pad(this, voicing(this.chord(cd, 4, 2), 76, 92), t, dur, 0.035, this.far, { attack: 4, release: 4, cutoff: 3000, fm: 1.1, spread: 10 });
    }
    const prob = [0.1, 0.16, 0.22, 0.28][this.section];
    if (this.r.chance(prob)) {
      const tones = this.chord(cd, 4, 3);
      note(this, 'glock', this.r.pick(tones) + (this.r.chance(0.3) ? 12 : 0), t + this.jitter(), this.r.range(0.07, 0.13), this.far);
    }
    if (i === 0 && bar % 2 === 0 && this.r.chance(0.6)) note(this, 'bell', this.deg(cd, 2), t, 0.2, this.far);
  }
}

// ─────────────────────────────────────────────────────────────── tension
const PULSE_ACC = [1, 0.55, 0.8, 0.55, 1, 0.6, 0.85, 0.7];
const OSTINATO = [0, 2, 4, 5, 4, 2, 1, 2];

class TensionMood extends MoodPlayer {
  readonly mood = 'tension';
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 1.2;
    this.bpm = 112;
    this.root = 38;
    this.scale = PHRYGIAN;
    this.prog = [0, 1, 0, 6];
    this.bpc = 2;
    this.delayBeats = 0.75;
    this.delayFeedback = 0.25;
  }
  override start(t: number, fade: number): void {
    super.start(t, fade);
    this.section = 1;
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    const sec = this.section;
    if (this.chordStart(s)) {
      const dur = this.barDur * this.bpc;
      pad(this, voicing(this.chord(cd, 3), 50, 66), t, dur, 0.16, this.wet, { attack: 0.6, release: 1.2, cutoff: 650, wave: 'sawtooth', spread: 9 });
      if (bar % 4 === 0) stab(this, voicing(this.chord(cd, 3), 62, 76), t, 0.11, this.wet);
    }
    if (i % 2 === 0) {
      const up = (i >> 1) % 4 === 3;
      bass(this, this.deg(cd, up ? 1 : 0) + 12, t, this.sd * 1.6, 0.36 * PULSE_ACC[(i >> 1) % 8], this.dry, 'pulse');
    }
    if (i === 0 || i === 6 || (sec >= 2 && i === 10)) kick(this, t, i === 0 ? 0.45 : 0.32, this.dry, 0.32);
    if (sec >= 1) hat(this, t, i % 2 ? 0.025 : 0.05, this.dry);
    if (sec >= 3 && (i === 4 || i === 12)) snare(this, t, 0.22, this.dry);
    if (sec >= 1 && i % 2 === 0) note(this, 'harp', this.deg(OSTINATO[(i >> 1) % 8] + cd, 2), t, i % 4 === 0 ? 0.2 : 0.14, this.wet, 0.6);
    if (bar % 8 === 7 && i === 8) riser(this, t, this.sd * 8, 0.05, this.wet);
  }
}

// ─────────────────────────────────────────────────────────────── apocalypse
const TAIKO: [number, number][] = [
  [0, 0.65],
  [3, 0.3],
  [6, 0.45],
  [8, 0.6],
  [11, 0.3],
  [14, 0.42],
];

class ApocalypseMood extends MoodPlayer {
  readonly mood = 'apocalypse';
  private dr: DroneHandle | null = null;
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 0.9;
    this.bpm = 66;
    this.root = 36;
    this.scale = PHRYGIAN;
    this.prog = [0, 5, 1, 4];
    this.bpc = 2;
    this.delayBeats = 1;
    this.delayFeedback = 0.3;
  }
  override start(t: number, fade: number): void {
    super.start(t, fade);
    this.section = 2;
  }
  override onStart(t: number): void {
    this.dr = drone(this, [36, 43], t, this.wet, { cutoff: 300, lfoRate: 0.07, vel: 0.14, drive: 2.5, wave: 'sawtooth' });
  }
  override onStop(now: number, fade: number): void {
    this.dr?.stop(now, fade);
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    const sec = this.section;
    if (this.chordStart(s)) {
      const dur = this.barDur * this.bpc;
      choir(this, voicing(this.chord(cd, 3), 55, 72), t, dur + 0.3, 0.22, this.wet, 'a', 1.2, 2);
      boom(this, t, 0.45, this.wet);
      if (sec >= 2) choir(this, voicing(this.chord(cd, 3), 72, 86), t, dur, 0.06, this.far, 'o', 2, 2.5);
    }
    if (i === 0) note(this, 'toll', this.deg(cd, 1), t, 0.26, this.far);
    for (const [step, v] of TAIKO) {
      if (step !== i) continue;
      const ok = sec === 0 ? step === 0 || step === 8 : sec === 1 ? step % 2 === 0 || step === 3 : true;
      if (ok) taiko(this, t, v * 0.8, this.wet, step === 0 || step === 8 ? 62 : 78);
    }
  }
}

// ─────────────────────────────────────────────────────────────── studio
class StudioMood extends MoodPlayer {
  readonly mood = 'studio';
  private drums: GainNode;
  private vinyl: AudioBufferSourceNode | null = null;
  private vinylGain: GainNode | null = null;
  constructor(env: MusicEnv, seed: number) {
    super(env, seed);
    this.level = 0.85;
    this.bpm = 80;
    this.swing = 0.28;
    this.root = 51;
    this.scale = MAJOR;
    this.prog = [1, 4, 0, 5];
    this.bpc = 1;
    this.delayBeats = 0.75;
    this.delayFeedback = 0.25;
    // dusty drum bus: lowpass + gentle saturation
    const v = this.v;
    this.drums = v.gain(1);
    const lp = v.filt('lowpass', 4200, 0.7, 0);
    const sh = v.shaper(1.6);
    v.chain(this.drums, lp, sh);
    sh.connect(this.dry);
  }
  override onStart(t: number): void {
    const v = this.v;
    const s = v.ctx.createBufferSource();
    s.buffer = v.noise.get('vinyl');
    s.loop = true;
    const hp = v.filt('highpass', 700, 0.7, t);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 2);
    v.chain(s, hp, g);
    g.connect(this.dry);
    s.start(t);
    this.vinyl = s;
    this.vinylGain = g;
  }
  override onStop(now: number, fade: number): void {
    try {
      this.vinylGain?.gain.linearRampToValueAtTime(0, now + fade);
      this.vinyl?.stop(now + fade + 0.1);
    } catch {
      /* ignore */
    }
  }
  private comp(cd: number, t: number, vel: number): void {
    const vs = voicing([this.deg(cd + 2), this.deg(cd + 4), this.deg(cd + 6), this.deg(cd + 8)], 58, 78);
    vs.forEach((m, k) => note(this, 'ep', m, t + k * 0.014 + this.jitter(), vel * (k === vs.length - 1 ? 1.1 : 1), this.wet, 1.6));
  }
  onStep(s: number, t: number): void {
    const bar = s >> 4;
    const i = s & 15;
    const cd = this.chordDeg(bar);
    const next = this.chordDeg(bar + 1);
    const sec = this.section;
    // e-piano comping
    if (i === 0) this.comp(cd, t, 0.15);
    else if (i === 6 && this.r.chance(0.5)) this.comp(cd, t, 0.09);
    else if (i === 10 && this.r.chance(0.35)) this.comp(cd, t, 0.08);
    else if (i === 14 && this.r.chance(0.3)) this.comp(next, t, 0.1);
    // walking bass
    if (i === 0) bass(this, this.deg(cd, -1), t, this.sd * 3, 0.2, this.dry, 'soft');
    else if (i === 8) bass(this, this.r.chance(0.5) ? this.deg(cd + 4, -1) : this.deg(cd, 0), t, this.sd * 3, 0.16, this.dry, 'soft');
    else if (i === 14 && this.r.chance(0.35)) bass(this, this.deg(next, -1) + this.r.pick([-1, 1]), t, this.sd * 2, 0.12, this.dry, 'soft');
    // dusty drums
    if (i === 0 || i === 10 || (i === 7 && this.r.chance(0.45))) kick(this, t, i === 0 ? 0.45 : 0.34, this.drums, 0.28);
    if (i === 4 || i === 12) snare(this, t, 0.24, this.drums);
    if (i === 15 && this.r.chance(0.15)) snare(this, t, 0.08, this.drums);
    if (i % 2 === 0) hat(this, t, i % 4 === 0 ? 0.08 : 0.06, this.drums);
    else if (this.r.chance(0.22)) hat(this, t, 0.03, this.drums);
    // kalimba / marimba licks
    if (sec >= 1 && i % 2 === 0 && this.r.chance(0.12)) note(this, this.r.chance(0.5) ? 'kalimba' : 'marimba', this.melody(cd, 2, i % 4 === 0), t + this.jitter(), 0.16, this.wet);
  }
}

// ─────────────────────────────────────────────────────────────── sample warm lists
/** SampleBank notes each mood needs (pre-rendered in idle frames before they are played) */
export const WARM: Record<MusicMood, [InstName, number[]][]> = {
  menu: [
    ['harp', span(64, 96)],
    ['glock', span(84, 100)],
  ],
  day: [
    ['harp', span(60, 92)],
    ['kalimba', span(72, 96)],
  ],
  night: [
    ['piano', span(56, 92)],
    ['glock', span(80, 96)],
  ],
  space: [
    ['bell', span(68, 92)],
    ['glock', span(80, 100)],
  ],
  galaxy: [
    ['glock', span(76, 104)],
    ['bell', span(60, 80)],
  ],
  tension: [['harp', span(48, 76)]],
  apocalypse: [['toll', [44, 48, 52, 56]]],
  studio: [
    ['ep', span(56, 80)],
    ['kalimba', span(72, 92)],
    ['marimba', span(68, 88)],
  ],
};

// ─────────────────────────────────────────────────────────────── factory
export function createMood(mood: MusicMood, env: MusicEnv, seed: number): MoodPlayer {
  switch (mood) {
    case 'menu':
      return new MenuMood(env, seed);
    case 'day':
      return new DayMood(env, seed);
    case 'night':
      return new NightMood(env, seed);
    case 'space':
      return new SpaceMood(env, seed);
    case 'galaxy':
      return new GalaxyMood(env, seed);
    case 'tension':
      return new TensionMood(env, seed);
    case 'apocalypse':
      return new ApocalypseMood(env, seed);
    case 'studio':
      return new StudioMood(env, seed);
  }
}

export const MOODS: MusicMood[] = ['menu', 'day', 'night', 'space', 'galaxy', 'tension', 'apocalypse', 'studio'];
