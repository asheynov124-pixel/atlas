/**
 * OWNER: audio.
 * SFX library — one synthesised voice per SfxName (core/types). Every recipe draws into a `Voice` (dsp.ts) starting
 * at `v.t`, scaled by `v.p` (pitch) and coloured by `v.far` (0 close … 1 distant: duller, softer attack, wetter).
 * Struck/plucked tones come from the SampleBank so a coin chime or a fanfare costs a handful of nodes.
 *
 * SfxDef fields: gain (base level), wet (reverb send), duck (0..1 music/ambience ducking), ui (UI bus — never
 * distance-filtered), gap (min seconds between two plays), max (simultaneous voices), vary (random ± pitch),
 * prio (voice stealing: higher steals lower when the global voice cap is hit).
 */
import type { SfxName } from '../core/types';
import { clamp, lerp, type Voice } from './dsp';
import type { InstName, SampleBank } from './samples';

export interface SfxKit {
  bank: SampleBank;
}

export interface SfxDef {
  play(v: Voice, k: SfxKit): void;
  gain: number;
  wet: number;
  duck?: number;
  ui?: boolean;
  gap?: number;
  max?: number;
  vary?: number;
  prio?: number;
}

// ─────────────────────────────────────────────────────────────── helpers

/** play a SampleBank note (optionally cut short with a fade) */
function smp(v: Voice, k: SfxKit, inst: InstName, midi: number, t: number, amp: number, dur?: number, dest: AudioNode = v.out): void {
  const { buf, rate } = k.bank.get(inst, midi);
  const r = rate * v.p;
  const full = buf.duration / r;
  const len = dur !== undefined ? Math.min(full, dur) : full;
  const s = v.buffer(buf, t, r, t + len + 0.01);
  const g = v.gain(amp);
  if (dur !== undefined && dur < full) {
    g.gain.setValueAtTime(amp, t + Math.max(0, len - 0.12));
    g.gain.linearRampToValueAtTime(0, t + len);
  }
  s.connect(g);
  g.connect(dest);
}

/** filtered noise with a swept filter and a percussive envelope */
function noiseSweep(
  v: Voice,
  kind: 'white' | 'pink' | 'brown' | 'crackle' | 'rain' | 'grit',
  t: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q: number,
  sweep: number,
  peak: number,
  a: number,
  d: number,
  dest: AudioNode = v.out,
  rate = 1,
): BiquadFilterNode {
  const s = v.noiseSrc(kind, t, t + a + d + 0.05, rate);
  const f = v.filt(type, f0, q, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(v.f(f1), t + Math.max(0.01, sweep));
  const g = v.gain(0);
  v.perc(g.gain, t, peak, a, d);
  v.chain(s, f, g);
  g.connect(dest);
  return f;
}

/** two detuned saws through an opening lowpass — brass for fanfares */
function brass(v: Voice, midi: number, t: number, dur: number, amp: number, dest: AudioNode = v.out): void {
  const f = 440 * Math.pow(2, (midi - 69) / 12) * v.p;
  const lp = v.filt('lowpass', 380, 1.2, t);
  lp.frequency.linearRampToValueAtTime(v.f(2600 + f), t + 0.06);
  lp.frequency.setTargetAtTime(v.f(1100 + f * 0.5), t + 0.08, dur * 0.5);
  const g = v.gain(0);
  v.ahr(g.gain, t, amp, 0.025, dur, 0.28);
  for (const det of [-9, 8]) v.osc('sawtooth', f, t, t + dur + 0.35, det).connect(lp);
  v.chain(lp, g);
  g.connect(dest);
}

/** random scatter of debris grains */
function debris(v: Voice, t: number, n: number, spread: number, fLo: number, fHi: number, amp: number, dest: AudioNode = v.out): void {
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(v.r.next(), 1.4) * spread;
    const f = fLo * Math.pow(fHi / fLo, v.r.next());
    v.grain(tt, v.r.chance(0.5) ? 'white' : 'pink', 'bandpass', f, 1.6 + v.r.next() * 2, amp * (0.4 + 0.6 * v.r.next()), 0.03 + v.r.next() * 0.1, dest, v.r.range(-0.6, 0.6));
  }
}

/** tremolo: returns a gain node whose gain is modulated by an LFO */
function tremolo(v: Voice, t: number, end: number, rate: number, depth: number, type: OscillatorType = 'sine'): GainNode {
  const g = v.gain(1 - depth);
  const lfo = v.osc(type, rate, t, end);
  const lg = v.gain(depth);
  lfo.connect(lg);
  lg.connect(g.gain);
  return g;
}

/** parallel bandpass formant bank (vocal-ish roars / choirs) */
function formants(v: Voice, input: AudioNode, t: number, from: number[], to: number[], glide: number, qs: number[], gains: number[], dest: AudioNode): void {
  for (let i = 0; i < from.length; i++) {
    const bp = v.filt('bandpass', from[i], qs[i], t);
    bp.frequency.exponentialRampToValueAtTime(v.f(to[i]), t + glide);
    const g = v.gain(gains[i]);
    input.connect(bp);
    bp.connect(g);
    g.connect(dest);
  }
}

// ─────────────────────────────────────────────────────────────── recipes

export const SFX: Record<SfxName, SfxDef> = {
  // ── UI (crisp & quiet)
  click: {
    gain: 0.55,
    wet: 0.02,
    ui: true,
    gap: 0.03,
    max: 3,
    vary: 0.03,
    play(v) {
      v.blip(v.t, 'sine', 2300 * v.p, 1350 * v.p, 0.35, 0.028);
      v.blip(v.t, 'triangle', 4600 * v.p, 3800 * v.p, 0.05, 0.012);
      v.grain(v.t, 'white', 'highpass', 5200, 0.7, 0.1, 0.01);
    },
  },
  tap: {
    gain: 0.5,
    wet: 0.03,
    ui: true,
    gap: 0.03,
    max: 3,
    vary: 0.04,
    play(v) {
      v.blip(v.t, 'triangle', 1250 * v.p, 930 * v.p, 0.24, 0.045);
      v.blip(v.t, 'sine', 640 * v.p, 520 * v.p, 0.2, 0.05);
      v.grain(v.t, 'white', 'bandpass', 3600, 1.2, 0.05, 0.01);
    },
  },
  open: {
    gain: 0.5,
    wet: 0.1,
    ui: true,
    gap: 0.06,
    max: 2,
    play(v) {
      const t = v.t;
      const o = v.osc('sine', 420 * v.p, t, t + 0.26);
      o.frequency.exponentialRampToValueAtTime(v.f(800 * v.p), t + 0.09);
      const o2 = v.osc('triangle', 840 * v.p, t, t + 0.26);
      o2.frequency.exponentialRampToValueAtTime(v.f(1600 * v.p), t + 0.09);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.26, 0.012, 0.2);
      const g2 = v.gain(0.18);
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(v.out);
      noiseSweep(v, 'pink', t, 'bandpass', 1200, 4200, 1.3, 0.12, 0.06, 0.03, 0.12);
    },
  },
  close: {
    gain: 0.55,
    wet: 0.08,
    ui: true,
    gap: 0.06,
    max: 2,
    play(v) {
      const t = v.t;
      const o = v.osc('sine', 760 * v.p, t, t + 0.22);
      o.frequency.exponentialRampToValueAtTime(v.f(400 * v.p), t + 0.1);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.24, 0.008, 0.16);
      o.connect(g);
      g.connect(v.out);
      noiseSweep(v, 'pink', t, 'bandpass', 3600, 1100, 1.3, 0.1, 0.05, 0.01, 0.1);
    },
  },
  toggle: {
    gain: 0.6,
    wet: 0.03,
    ui: true,
    gap: 0.04,
    max: 2,
    vary: 0.03,
    play(v) {
      v.blip(v.t, 'triangle', 1700 * v.p, 1450 * v.p, 0.2, 0.022);
      v.grain(v.t, 'white', 'highpass', 4000, 0.7, 0.07, 0.008);
      v.blip(v.t + 0.048, 'triangle', 2400 * v.p, 2150 * v.p, 0.17, 0.028);
      v.grain(v.t + 0.048, 'white', 'highpass', 5000, 0.7, 0.05, 0.008);
    },
  },
  notify: {
    gain: 0.55,
    wet: 0.25,
    ui: true,
    gap: 0.25,
    max: 2,
    play(v, k) {
      smp(v, k, 'glock', 88, v.t, 0.32, 1.1);
      smp(v, k, 'glock', 95, v.t + 0.09, 0.28, 1.3);
    },
  },
  error: {
    gain: 0.55,
    wet: 0.05,
    ui: true,
    gap: 0.15,
    max: 2,
    play(v) {
      const t = v.t;
      for (const [dt, f] of [
        [0, 233],
        [0.12, 185],
      ] as const) {
        const o = v.osc('hollow', f * v.p, t + dt, t + dt + 0.16);
        const lp = v.filt('lowpass', 900, 1, t + dt);
        const g = v.gain(0);
        v.ahr(g.gain, t + dt, 0.28, 0.006, 0.07, 0.05);
        v.chain(o, lp, g);
        g.connect(v.out);
      }
      v.blip(t, 'sine', 120, 90, 0.2, 0.1);
    },
  },

  // ── building & tools
  place: {
    gain: 0.75,
    wet: 0.08,
    gap: 0.035,
    max: 5,
    vary: 0.07,
    prio: 1,
    play(v) {
      const t = v.t;
      v.blip(t, 'sine', 155 * v.p, 52 * v.p, 0.95, 0.17, v.out, 0.002);
      v.blip(t, 'triangle', 340 * v.p, 290 * v.p, 0.28, 0.07);
      v.grain(t, 'brown', 'lowpass', 1500, 0.8, 0.5, 0.05);
      v.grain(t, 'white', 'highpass', 3200, 0.7, 0.07, 0.008);
      v.blip(t + 0.06, 'sine', 95 * v.p, 70 * v.p, 0.18, 0.06);
    },
  },
  placeBig: {
    gain: 0.72,
    wet: 0.16,
    gap: 0.06,
    max: 3,
    vary: 0.05,
    prio: 2,
    duck: 0.15,
    play(v) {
      const t = v.t;
      v.blip(t, 'sine', 112 * v.p, 34 * v.p, 1.0, 0.48, v.out, 0.002);
      v.grain(t, 'brown', 'lowpass', 700, 0.8, 0.7, 0.26);
      v.grain(t, 'white', 'bandpass', 2300, 9, 0.22, 0.12);
      v.blip(t, 'triangle', 680 * v.p, 640 * v.p, 0.12, 0.12);
      v.blip(t + 0.14, 'sine', 92 * v.p, 44 * v.p, 0.5, 0.26);
      v.grain(t + 0.14, 'brown', 'lowpass', 500, 0.7, 0.35, 0.16);
      v.grain(t + 0.05, 'pink', 'bandpass', 900, 0.6, 0.12, 0.5);
    },
  },
  road: {
    gain: 0.85,
    wet: 0.06,
    gap: 0.05,
    max: 3,
    vary: 0.05,
    play(v) {
      const t = v.t;
      noiseSweep(v, 'white', t, 'bandpass', 500, 3900, 2.5, 0.14, 0.32, 0.005, 0.17);
      const o = v.osc('sawtooth', 220 * v.p, t, t + 0.18);
      o.frequency.exponentialRampToValueAtTime(v.f(780 * v.p), t + 0.12);
      const lp = v.filt('lowpass', 2200, 1, t);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.09, 0.005, 0.13);
      v.chain(o, lp, g);
      g.connect(v.out);
      v.blip(t, 'sine', 120 * v.p, 68 * v.p, 0.4, 0.08);
    },
  },
  zone: {
    gain: 0.95,
    wet: 0.06,
    gap: 0.05,
    max: 3,
    vary: 0.06,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('pink', t, t + 0.3);
      const bp = v.filt('bandpass', 1500 * v.p, 0.9, t);
      bp.frequency.exponentialRampToValueAtTime(v.f(3400 * v.p), t + 0.2);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.3, 0.04, 0.03, 0.17);
      v.chain(s, bp, g);
      g.connect(v.out);
      v.blip(t + 0.02, 'sine', 1760 * v.p, 1760 * v.p, 0.035, 0.18, v.out, 0.04);
    },
  },
  bulldoze: {
    gain: 0.7,
    wet: 0.08,
    gap: 0.06,
    max: 4,
    vary: 0.08,
    prio: 1,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('white', t, t + 0.45);
      const lp = v.filt('lowpass', 2300, 0.8, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.35);
      const sh = v.shaper(4);
      const trem = tremolo(v, t, t + 0.45, 27 * v.p, 0.55, 'square');
      const g = v.gain(0);
      v.perc(g.gain, t, 0.42, 0.006, 0.34);
      v.chain(s, lp, sh, trem, g);
      g.connect(v.out);
      v.blip(t, 'sine', 84 * v.p, 38 * v.p, 0.7, 0.3);
      debris(v, t + 0.02, 5, 0.32, 400, 1600, 0.3);
    },
  },
  demolish: {
    gain: 0.66,
    wet: 0.18,
    gap: 0.12,
    max: 3,
    vary: 0.05,
    prio: 2,
    duck: 0.25,
    play(v) {
      const t = v.t;
      v.blip(t, 'sine', 72 * v.p, 29 * v.p, 1.0, 0.65);
      noiseSweep(v, 'brown', t, 'lowpass', 1700, 280, 0.8, 0.8, 0.85, 0.01, 0.9);
      noiseSweep(v, 'white', t, 'lowpass', 4000, 700, 0.7, 0.4, 0.3, 0.005, 0.35);
      debris(v, t + 0.06, 13, 1.05, 300, 2600, 0.36);
      for (let i = 0; i < 3; i++) v.blip(t + 0.2 + v.r.next() * 0.7, 'triangle', v.r.range(3000, 5200), v.r.range(2600, 4800), 0.04, 0.05);
    },
  },
  terraform: {
    gain: 0.7,
    wet: 0.12,
    gap: 0.08,
    max: 3,
    vary: 0.04,
    play(v) {
      const t = v.t;
      const up = v.p >= 1;
      const s = v.noiseSrc('brown', t, t + 0.75);
      const lp = v.filt('lowpass', up ? 220 : 700, 1.4, t);
      lp.frequency.exponentialRampToValueAtTime(up ? 760 : 200, t + 0.5);
      const sh = v.shaper(2.5);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.75, 0.05, 0.2, 0.4);
      v.chain(s, lp, sh, g);
      g.connect(v.out);
      const o = v.osc('sine', (up ? 46 : 78) * v.p, t, t + 0.7);
      o.frequency.exponentialRampToValueAtTime((up ? 78 : 44) * v.p, t + 0.5);
      const og = v.gain(0);
      v.ahr(og.gain, t, 0.5, 0.05, 0.25, 0.32);
      o.connect(og);
      og.connect(v.out);
      debris(v, t + 0.05, 6, 0.5, 300, 1100, 0.18);
    },
  },
  paint: {
    gain: 0.8,
    wet: 0.08,
    gap: 0.04,
    max: 3,
    vary: 0.08,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('white', t, t + 0.2);
      const hp = v.filt('highpass', 2500, 0.7, t);
      const bp = v.filt('bandpass', 6000, 0.8, t);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.2, 0.012, 0.12);
      v.chain(s, hp, bp, g);
      g.connect(v.out);
      v.blip(t + 0.02, 'sine', 1400 * v.p, 2150 * v.p, 0.13, 0.07);
      v.blip(t + 0.07, 'sine', 900 * v.p, 1500 * v.p, 0.07, 0.05);
    },
  },

  // ── rewards
  money: {
    gain: 0.6,
    wet: 0.15,
    gap: 0.06,
    max: 3,
    vary: 0.02,
    play(v, k) {
      smp(v, k, 'glock', 95, v.t, 0.5, 0.5);
      smp(v, k, 'glock', 100, v.t + 0.075, 0.48, 0.9);
      v.blip(v.t + 0.075, 'sine', 5300, 5100, 0.035, 0.06);
    },
  },
  chime: {
    gain: 0.8,
    wet: 0.35,
    gap: 0.12,
    max: 3,
    play(v, k) {
      smp(v, k, 'bell', 84, v.t, 0.3, 1.8);
      smp(v, k, 'bell', 88, v.t + 0.06, 0.28, 1.8);
      smp(v, k, 'bell', 91, v.t + 0.12, 0.28, 2.0);
    },
  },
  milestone: {
    gain: 0.75,
    wet: 0.3,
    gap: 0.8,
    max: 1,
    prio: 3,
    duck: 0.6,
    play(v, k) {
      const t = v.t;
      // arpeggio pickup then a sustained, swelling C-major chord
      const arp = [60, 64, 67];
      arp.forEach((m, i) => brass(v, m, t + i * 0.11, 0.09, 0.12));
      for (const m of [60, 64, 67, 72, 76]) brass(v, m, t + 0.33, 1.15, 0.085);
      brass(v, 48, t + 0.33, 1.15, 0.09);
      // timpani + cymbal swell
      v.blip(t + 0.33, 'sine', 98 * v.p, 66 * v.p, 0.7, 0.7);
      v.grain(t + 0.33, 'brown', 'lowpass', 320, 0.8, 0.3, 0.25);
      const s = v.noiseSrc('white', t + 0.05, t + 1.6);
      const hp = v.filt('highpass', 6500, 0.7, t);
      const cg = v.gain(0);
      v.ahr(cg.gain, t + 0.05, 0.06, 0.3, 0.05, 1.1);
      v.chain(s, hp, cg);
      cg.connect(v.out);
      // sparkle
      [84, 88, 91, 96, 100].forEach((m, i) => smp(v, k, 'glock', m, t + 0.36 + i * 0.06, 0.18, 1.2));
    },
  },
  unlock: {
    gain: 0.65,
    wet: 0.35,
    gap: 0.5,
    max: 1,
    prio: 3,
    duck: 0.45,
    play(v, k) {
      const t = v.t;
      [72, 74, 76, 79, 81, 84, 86, 88].forEach((m, i) => smp(v, k, 'glock', m, t + i * 0.05, 0.16 + i * 0.02, 0.8));
      noiseSweep(v, 'white', t, 'bandpass', 2000, 9000, 1.5, 0.45, 0.09, 0.4, 0.3);
      for (const m of [84, 88, 91]) smp(v, k, 'bell', m, t + 0.45, 0.3, 2.2);
      v.blip(t + 0.45, 'sine', 92 * v.p, 55 * v.p, 0.4, 0.45);
    },
  },
  levelUp: {
    gain: 0.65,
    wet: 0.25,
    gap: 0.4,
    max: 1,
    prio: 2,
    duck: 0.3,
    play(v, k) {
      const t = v.t;
      const o = v.osc('triangle', 400 * v.p, t, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(v.f(1400 * v.p), t + 0.25);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.12, 0.02, 0.15, 0.08);
      o.connect(g);
      g.connect(v.out);
      smp(v, k, 'glock', 88, t + 0.22, 0.42, 0.9);
      smp(v, k, 'glock', 92, t + 0.34, 0.45, 1.2);
      for (let i = 0; i < 4; i++) v.blip(t + 0.3 + i * 0.07, 'sine', v.r.range(4000, 7000), v.r.range(5000, 8000), 0.04, 0.05);
    },
  },

  // ── motion
  warp: {
    gain: 0.75,
    wet: 0.3,
    gap: 0.4,
    max: 2,
    prio: 3,
    duck: 0.5,
    play(v, k) {
      const t = v.t;
      const o = v.osc('sawtooth', 90 * v.p, t, t + 1.2);
      o.frequency.exponentialRampToValueAtTime(v.f(1800 * v.p), t + 1.1);
      const lfo = v.osc('sine', 7, t, t + 1.2);
      const lg = v.gain(35);
      lfo.connect(lg);
      lg.connect(o.detune);
      const lp = v.filt('lowpass', 300, 6, t);
      lp.frequency.exponentialRampToValueAtTime(6000, t + 1.1);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.2, 1.0, 0.03, 0.06);
      v.chain(o, lp, g);
      g.connect(v.out);
      const s = v.noiseSrc('white', t, t + 1.2);
      const bp = v.filt('bandpass', 300, 3, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + 1.1);
      const ng = v.gain(0);
      v.ahr(ng.gain, t, 0.25, 1.05, 0, 0.06);
      v.chain(s, bp, ng);
      ng.connect(v.out);
      // release whoosh + thump + shimmer
      noiseSweep(v, 'pink', t + 1.1, 'bandpass', 5000, 280, 1.2, 0.7, 0.55, 0.01, 0.75);
      v.blip(t + 1.1, 'sine', 120 * v.p, 38 * v.p, 0.85, 0.5);
      smp(v, k, 'glock', 96, t + 1.12, 0.2, 1.4);
    },
  },
  whoosh: {
    gain: 1.4,
    wet: 0.12,
    gap: 0.08,
    max: 3,
    vary: 0.08,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('pink', t, t + 0.75);
      const bp = v.filt('bandpass', 350 * v.p, 1.4, t);
      bp.frequency.exponentialRampToValueAtTime(v.f(2600 * v.p), t + 0.28);
      bp.frequency.exponentialRampToValueAtTime(v.f(500 * v.p), t + 0.68);
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.28);
      g.gain.linearRampToValueAtTime(0, t + 0.7);
      const pan = v.pan(-0.7);
      if ('pan' in pan) {
        (pan as StereoPannerNode).pan.setValueAtTime(-0.7, t);
        (pan as StereoPannerNode).pan.linearRampToValueAtTime(0.7, t + 0.7);
      }
      v.chain(s, bp, g, pan);
      pan.connect(v.out);
    },
  },

  // ── destruction
  explosion: {
    gain: 0.55,
    wet: 0.25,
    gap: 0.05,
    max: 6,
    vary: 0.1,
    prio: 2,
    duck: 0.45,
    play(v) {
      const t = v.t;
      const far = v.far;
      const cut = lerp(7000, 1600, far);
      v.grain(t, 'white', 'highpass', 1200, 0.7, 0.5 * (1 - far * 0.7), 0.03);
      const s = v.noiseSrc('white', t, t + 1.5);
      const lp = v.filt('lowpass', cut, 0.8, t);
      lp.frequency.exponentialRampToValueAtTime(240, t + 1.1);
      const sh = v.shaper(3);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.85, 0.005 + far * 0.05, 1.3);
      v.chain(s, lp, sh, g);
      g.connect(v.out);
      v.blip(t, 'sine', 112 * v.p, 30 * v.p, 1.0, 0.95);
      debris(v, t + 0.06, 6, 0.6, 800, 3000, 0.22 * (1 - far * 0.6));
    },
  },
  bigExplosion: {
    gain: 0.55,
    wet: 0.32,
    gap: 0.15,
    max: 3,
    vary: 0.06,
    prio: 3,
    duck: 0.8,
    play(v) {
      const t = v.t;
      const far = v.far;
      v.grain(t, 'white', 'highpass', 1000, 0.7, 0.6 * (1 - far * 0.6), 0.045);
      const s = v.noiseSrc('white', t, t + 3);
      const lp = v.filt('lowpass', lerp(6500, 2000, far), 0.7, t);
      lp.frequency.exponentialRampToValueAtTime(150, t + 2.4);
      const sh = v.shaper(5);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.85, 0.01 + far * 0.06, 2.6);
      v.chain(s, lp, sh, g);
      g.connect(v.out);
      noiseSweep(v, 'brown', t, 'lowpass', 420, 160, 0.7, 3, 0.9, 0.08, 3.4);
      const o = v.osc('sine', 80 * v.p, t, t + 3);
      o.frequency.exponentialRampToValueAtTime(24 * v.p, t + 2.2);
      const osh = v.shaper(2);
      const og = v.gain(0);
      v.perc(og.gain, t, 1.0, 0.01, 2.6);
      v.chain(o, osh, og);
      og.connect(v.out);
      for (let i = 0; i < 4; i++) {
        const tt = t + 0.4 + v.r.next() * 1.1;
        noiseSweep(v, 'white', tt, 'bandpass', v.r.range(900, 2500), v.r.range(300, 700), 1.2, 0.3, 0.25 * (1 - far * 0.5), 0.005, 0.32);
      }
      debris(v, t + 1, 10, 2.5, 600, 1500, 0.12);
    },
  },
  rumble: {
    gain: 0.8,
    wet: 0.2,
    gap: 0.2,
    max: 3,
    prio: 2,
    duck: 0.25,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('brown', t, t + 3.1);
      const lp = v.filt('lowpass', 140 * v.p, 0.9, t);
      const trem = tremolo(v, t, t + 3.1, 6, 0.35);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.95, 0.5, 1.0, 1.6);
      v.chain(s, lp, trem, g);
      g.connect(v.out);
      const o = v.osc('sine', 36 * v.p, t, t + 3.1);
      const og = v.gain(0);
      v.ahr(og.gain, t, 0.5, 0.5, 1.0, 1.5);
      o.connect(og);
      og.connect(v.out);
    },
  },
  quake: {
    gain: 0.62,
    wet: 0.18,
    gap: 0.3,
    max: 2,
    prio: 3,
    duck: 0.65,
    play(v) {
      const t = v.t;
      const D = 3.8;
      const s = v.noiseSrc('brown', t, t + D);
      const lp = v.filt('lowpass', 110 * v.p, 1.1, t);
      const sh = v.shaper(2.2);
      const irr = v.gain(0.7);
      for (let i = 1; i <= 12; i++) irr.gain.linearRampToValueAtTime(0.4 + v.r.next() * 0.6, t + (i * D) / 12);
      const g = v.gain(0);
      v.ahr(g.gain, t, 1, 0.35, 1.8, 1.6);
      v.chain(s, lp, sh, irr, g);
      g.connect(v.out);
      const o = v.osc('sine', 32 * v.p, t, t + D);
      for (let i = 1; i <= 8; i++) o.frequency.linearRampToValueAtTime((26 + v.r.next() * 12) * v.p, t + (i * D) / 8);
      const og = v.gain(0);
      v.ahr(og.gain, t, 0.7, 0.3, 2, 1.4);
      o.connect(og);
      og.connect(v.out);
      for (let i = 0; i < 6; i++) {
        const tt = t + 0.3 + v.r.next() * 2.6;
        v.grain(tt, 'white', 'bandpass', v.r.range(400, 1800), 3, v.r.range(0.18, 0.35), 0.05, v.out, v.r.range(-0.7, 0.7));
      }
      v.blip(t + 0.2, 'sine', 72, 38, 0.5, 0.35);
      v.blip(t + 1.4, 'sine', 66, 36, 0.45, 0.35);
      const c = v.osc('sawtooth', 140, t + 1, t + 2.3);
      c.frequency.linearRampToValueAtTime(108, t + 2.2);
      const cb = v.filt('bandpass', 620, 8, t + 1);
      const cg = v.gain(0);
      v.ahr(cg.gain, t + 1, 0.05, 0.3, 0.4, 0.5);
      v.chain(c, cb, cg);
      cg.connect(v.out);
    },
  },
  thunder: {
    gain: 0.9,
    wet: 0.35,
    gap: 0.25,
    max: 3,
    vary: 0.08,
    prio: 2,
    duck: 0.4,
    play(v) {
      const t = v.t;
      const far = v.far;
      v.grain(t, 'white', 'highpass', 1500, 0.7, 0.75 * (1 - far * 0.6), 0.02);
      for (let i = 0; i < 7; i++) {
        const tt = t + Math.pow(v.r.next(), 1.5) * 0.35;
        v.grain(tt, 'white', 'bandpass', v.r.range(1500, 5000), 1, v.r.range(0.25, 0.5) * (1 - far * 0.6), v.r.range(0.02, 0.06), v.out, v.r.range(-0.5, 0.5));
      }
      const s = v.noiseSrc('brown', t, t + 3.6);
      const lp = v.filt('lowpass', 900 * v.p, 0.8, t);
      lp.frequency.exponentialRampToValueAtTime(110, t + 2.8);
      const irr = v.gain(1);
      for (let i = 1; i <= 9; i++) irr.gain.linearRampToValueAtTime(0.45 + v.r.next() * 0.55, t + i * 0.35);
      const g = v.gain(0);
      v.perc(g.gain, t + 0.02, 0.95, 0.04 + far * 0.1, 3.2);
      v.chain(s, lp, irr, g);
      g.connect(v.out);
      v.blip(t + 0.02, 'sine', 70, 34, 0.6, 1.2);
    },
  },
  crumble: {
    gain: 0.75,
    wet: 0.16,
    gap: 0.08,
    max: 4,
    vary: 0.08,
    prio: 1,
    play(v) {
      const t = v.t;
      for (let i = 0; i < 14; i++) {
        const tt = t + Math.pow(v.r.next(), 1.3) * 1.0;
        v.grain(tt, v.r.chance(0.5) ? 'brown' : 'pink', 'bandpass', v.r.range(250, 1400), 1.5, v.r.range(0.2, 0.5), v.r.range(0.05, 0.15), v.out, v.r.range(-0.5, 0.5));
      }
      v.blip(t, 'sine', 90 * v.p, 40 * v.p, 0.6, 0.3);
      v.blip(t + 0.5, 'sine', 80 * v.p, 38 * v.p, 0.35, 0.2);
      noiseSweep(v, 'pink', t, 'lowpass', 900, 500, 0.7, 1, 0.22, 0.1, 0.9);
    },
  },

  // ── elements
  wind: {
    gain: 1.0,
    wet: 0.15,
    gap: 0.4,
    max: 3,
    vary: 0.1,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('pink', t, t + 2.6);
      const bp = v.filt('bandpass', 300 * v.p, 4, t);
      bp.frequency.exponentialRampToValueAtTime(v.f(850 * v.p), t + 1.0);
      bp.frequency.exponentialRampToValueAtTime(v.f(420 * v.p), t + 2.4);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.75, 0.9, 0.2, 1.4);
      v.chain(s, bp, g);
      g.connect(v.out);
      const s2 = v.noiseSrc('pink', t, t + 2.6);
      const lp = v.filt('lowpass', 1200, 0.7, t);
      const g2 = v.gain(0);
      v.ahr(g2.gain, t, 0.28, 0.8, 0.3, 1.3);
      v.chain(s2, lp, g2);
      g2.connect(v.out);
      const o = v.osc('sine', 900 * v.p, t, t + 2.4);
      o.frequency.linearRampToValueAtTime(1300 * v.p, t + 1);
      o.frequency.linearRampToValueAtTime(1000 * v.p, t + 2.2);
      const og = v.gain(0);
      v.ahr(og.gain, t, 0.018, 0.9, 0.2, 1.1);
      o.connect(og);
      og.connect(v.out);
    },
  },
  fire: {
    gain: 0.75,
    wet: 0.12,
    gap: 0.2,
    max: 3,
    vary: 0.08,
    prio: 1,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('pink', t, t + 1.6);
      const lp = v.filt('lowpass', 200, 0.9, t);
      lp.frequency.exponentialRampToValueAtTime(3200, t + 0.25);
      lp.frequency.exponentialRampToValueAtTime(900, t + 1.2);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.7, 0.05, 1.2);
      v.chain(s, lp, g);
      g.connect(v.out);
      const c = v.noiseSrc('crackle', t, t + 1.6);
      const hp = v.filt('highpass', 900, 0.7, t);
      const cg = v.gain(0);
      v.ahr(cg.gain, t, 0.55, 0.05, 0.6, 0.7);
      v.chain(c, hp, cg);
      cg.connect(v.out);
      noiseSweep(v, 'brown', t, 'lowpass', 300, 300, 0.7, 1, 0.5, 0.1, 1.3);
    },
  },
  water: {
    gain: 0.9,
    wet: 0.15,
    gap: 0.15,
    max: 3,
    vary: 0.1,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('pink', t, t + 1.3);
      const bp = v.filt('bandpass', 900, 1.2, t);
      for (let i = 1; i <= 6; i++) bp.frequency.linearRampToValueAtTime(v.r.range(600, 1400) * v.p, t + i * 0.18);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.32, 0.12, 0.6, 0.45);
      v.chain(s, bp, g);
      g.connect(v.out);
      for (let i = 0; i < 9; i++) {
        const f = v.r.range(300, 900) * v.p;
        v.blip(t + v.r.next() * 1.0, 'sine', f, f * 2.2, v.r.range(0.12, 0.25), v.r.range(0.03, 0.06));
      }
    },
  },
  splash: {
    gain: 0.7,
    wet: 0.2,
    gap: 0.1,
    max: 4,
    vary: 0.1,
    prio: 1,
    play(v) {
      const t = v.t;
      const s = v.noiseSrc('white', t, t + 0.5);
      const hp = v.filt('highpass', 700 * v.p, 0.7, t);
      const lp = v.filt('lowpass', 6000, 0.7, t);
      lp.frequency.exponentialRampToValueAtTime(2000, t + 0.4);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.7, 0.004, 0.36);
      v.chain(s, hp, lp, g);
      g.connect(v.out);
      noiseSweep(v, 'pink', t, 'bandpass', 1200, 700, 0.7, 0.5, 0.5, 0.01, 0.5);
      v.blip(t, 'sine', 160 * v.p, 70 * v.p, 0.4, 0.12);
      for (let i = 0; i < 10; i++) {
        const f = v.r.range(900, 2600) * v.p;
        v.blip(t + 0.12 + v.r.next() * 0.9, 'sine', f, f * 1.6, v.r.range(0.05, 0.14), v.r.range(0.02, 0.04));
      }
    },
  },
  freeze: {
    gain: 0.65,
    wet: 0.4,
    gap: 0.3,
    max: 2,
    prio: 2,
    play(v, k) {
      const t = v.t;
      const notes = [96, 98, 100, 103, 105, 108];
      for (let i = 0; i < 9; i++) smp(v, k, i % 3 ? 'glock' : 'bell', v.r.pick(notes), t + Math.pow(v.r.next(), 0.8) * 0.7, v.r.range(0.1, 0.22), 1.1);
      const o = v.osc('sine', 4200 * v.p, t, t + 1.1);
      o.frequency.exponentialRampToValueAtTime(v.f(1200 * v.p), t + 1.0);
      const m = v.osc('sine', 4200 * 1.41 * v.p, t, t + 1.1);
      m.frequency.exponentialRampToValueAtTime(v.f(1200 * 1.41 * v.p), t + 1.0);
      const mg = v.gain(600);
      m.connect(mg);
      mg.connect(o.frequency);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.07, 0.05, 0.5, 0.5);
      o.connect(g);
      g.connect(v.out);
      for (let i = 0; i < 8; i++) v.grain(t + v.r.next() * 1.0, 'white', 'highpass', 4000, 0.7, v.r.range(0.1, 0.25), v.r.range(0.006, 0.02), v.out, v.r.range(-0.6, 0.6));
      const s = v.noiseSrc('white', t, t + 1.3);
      const hp = v.filt('highpass', 6000, 0.7, t);
      const hg = v.gain(0);
      v.ahr(hg.gain, t, 0.08, 0.2, 0.4, 0.6);
      v.chain(s, hp, hg);
      hg.connect(v.out);
    },
  },
  magic: {
    gain: 0.6,
    wet: 0.4,
    gap: 0.15,
    max: 3,
    vary: 0.03,
    play(v, k) {
      const t = v.t;
      [84, 86, 88, 91, 93, 96, 98, 100].forEach((m, i) => smp(v, k, 'glock', m, t + i * 0.045, 0.18 + i * 0.012, 0.9));
      const s = v.noiseSrc('white', t, t + 1.2);
      const bp = v.filt('bandpass', 7000, 1, t);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.08, 0.25, 0.3, 0.6);
      v.chain(s, bp, g);
      g.connect(v.out);
      const o = v.osc('sine', 220 * v.p, t, t + 0.8);
      o.frequency.exponentialRampToValueAtTime(440 * v.p, t + 0.4);
      const og = v.gain(0);
      v.ahr(og.gain, t, 0.08, 0.1, 0.2, 0.4);
      o.connect(og);
      og.connect(v.out);
      smp(v, k, 'bell', 96, t + 0.4, 0.2, 1.6);
    },
  },

  // ── weapons, creatures & cosmic
  laser: {
    gain: 0.8,
    wet: 0.12,
    gap: 0.04,
    max: 5,
    vary: 0.1,
    prio: 1,
    play(v) {
      const t = v.t;
      const o = v.osc('sawtooth', 2600 * v.p, t, t + 0.26);
      o.frequency.exponentialRampToValueAtTime(v.f(160 * v.p), t + 0.2);
      const lp = v.filt('lowpass', 5000, 2, t);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.3, 0.002, 0.22);
      v.chain(o, lp, g);
      g.connect(v.out);
      const q = v.osc('square', 1300 * v.p, t, t + 0.24);
      q.frequency.exponentialRampToValueAtTime(v.f(90 * v.p), t + 0.2);
      const qg = v.gain(0);
      v.perc(qg.gain, t, 0.08, 0.002, 0.2);
      q.connect(qg);
      qg.connect(lp);
      v.blip(t, 'sine', 3200 * v.p, 1800 * v.p, 0.08, 0.1);
      v.grain(t, 'white', 'highpass', 3000, 0.7, 0.15, 0.01);
    },
  },
  alien: {
    gain: 0.65,
    wet: 0.3,
    gap: 0.2,
    max: 3,
    vary: 0.1,
    play(v) {
      const t = v.t;
      const o = v.osc('sine', 300 * v.p, t, t + 1.25);
      o.frequency.exponentialRampToValueAtTime(v.f(900 * v.p), t + 0.35);
      o.frequency.exponentialRampToValueAtTime(v.f(520 * v.p), t + 1.0);
      const vib = v.osc('sine', 9, t, t + 1.25);
      const vg = v.gain(60 * v.p);
      vib.connect(vg);
      vg.connect(o.frequency);
      // ring modulator
      const m = v.osc('sine', 140 * v.p, t, t + 1.25);
      const rm = v.gain(0);
      o.connect(rm);
      m.connect(rm.gain);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.55, 0.08, 0.7, 0.3);
      rm.connect(g);
      g.connect(v.out);
      const o2 = v.osc('triangle', 600 * v.p, t, t + 1.25);
      o2.frequency.exponentialRampToValueAtTime(v.f(1500 * v.p), t + 0.4);
      o2.frequency.exponentialRampToValueAtTime(v.f(800 * v.p), t + 1.0);
      const vib2 = v.osc('sine', 12.5, t, t + 1.25);
      const vg2 = v.gain(90);
      vib2.connect(vg2);
      vg2.connect(o2.frequency);
      const g2 = v.gain(0);
      v.ahr(g2.gain, t, 0.12, 0.1, 0.65, 0.3);
      o2.connect(g2);
      g2.connect(v.out);
    },
  },
  monster: {
    gain: 0.85,
    wet: 0.25,
    gap: 0.5,
    max: 2,
    prio: 3,
    duck: 0.5,
    play(v) {
      const t = v.t;
      const D = 2.2;
      const src = v.gain(1);
      const o = v.osc('sawtooth', 75 * v.p, t, t + D);
      o.frequency.linearRampToValueAtTime(96 * v.p, t + 0.5);
      o.frequency.linearRampToValueAtTime(64 * v.p, t + D);
      const jit = v.osc('sine', 23, t, t + D);
      const jg = v.gain(7);
      jit.connect(jg);
      jg.connect(o.frequency);
      o.connect(src);
      const n = v.noiseSrc('white', t, t + D);
      const ng = v.gain(0.25);
      n.connect(ng);
      ng.connect(src);
      const sh = v.shaper(6);
      src.connect(sh);
      const growl = tremolo(v, t, t + D, 31, 0.3, 'square');
      const amp = v.gain(0);
      v.ahr(amp.gain, t, 0.7, 0.25, 0.95, 0.9);
      growl.connect(amp);
      amp.connect(v.out);
      formants(v, sh, t, [700, 1150, 2500], [400, 800, 2300], 1.6, [6, 8, 10], [1, 0.6, 0.35], growl);
      const sub = v.osc('sine', 42 * v.p, t, t + D);
      const sg = v.gain(0);
      v.ahr(sg.gain, t, 0.5, 0.2, 0.9, 0.8);
      sub.connect(sg);
      sg.connect(v.out);
    },
  },
  roar: {
    gain: 0.85,
    wet: 0.22,
    gap: 0.4,
    max: 2,
    vary: 0.06,
    prio: 3,
    duck: 0.4,
    play(v) {
      const t = v.t;
      const D = 1.4;
      const src = v.gain(1);
      const o = v.osc('sawtooth', 122 * v.p, t, t + D);
      o.frequency.exponentialRampToValueAtTime(v.f(70 * v.p), t + 1.1);
      o.connect(src);
      const n = v.noiseSrc('white', t, t + D);
      const ng = v.gain(0.32);
      n.connect(ng);
      ng.connect(src);
      const sh = v.shaper(8);
      src.connect(sh);
      const growl = tremolo(v, t, t + D, 38, 0.32, 'square');
      const amp = v.gain(0);
      v.ahr(amp.gain, t, 0.75, 0.06, 0.55, 0.7);
      growl.connect(amp);
      amp.connect(v.out);
      formants(v, sh, t, [820, 1250, 2600], [560, 900, 2200], 1.1, [5, 7, 9], [1, 0.55, 0.3], growl);
      v.blip(t, 'sine', 70 * v.p, 40 * v.p, 0.45, 0.9);
    },
  },
  blackhole: {
    gain: 0.7,
    wet: 0.35,
    gap: 1,
    max: 2,
    prio: 3,
    duck: 0.9,
    play(v) {
      const t = v.t;
      const o = v.osc('sine', 140 * v.p, t, t + 4.4);
      o.frequency.exponentialRampToValueAtTime(18 * v.p, t + 3.8);
      const sh = v.shaper(3);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.9, 0.3, 2.6, 1.3);
      v.chain(o, sh, g);
      g.connect(v.out);
      const gr = v.noiseSrc('grit', t, t + 4.4, 1.8);
      gr.playbackRate.exponentialRampToValueAtTime(0.4, t + 3.8);
      const bp = v.filt('bandpass', 3000, 1.5, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 3.8);
      const gg = v.gain(0);
      v.ahr(gg.gain, t, 0.7, 1.2, 1.8, 1.2);
      v.chain(gr, bp, gg);
      gg.connect(v.out);
      const w = v.osc('sine', 2400 * v.p, t, t + 4.4);
      w.frequency.exponentialRampToValueAtTime(160 * v.p, t + 3.4);
      const wv = v.osc('sine', 5, t, t + 4.4);
      const wvg = v.gain(15);
      wv.connect(wvg);
      wvg.connect(w.detune);
      const wg = v.gain(0);
      v.ahr(wg.gain, t, 0.06, 0.4, 2.4, 0.9);
      w.connect(wg);
      wg.connect(v.out);
      noiseSweep(v, 'pink', t, 'lowpass', 2000, 100, 0.7, 3.4, 0.45, 0.8, 3.2);
    },
  },
  supernova: {
    gain: 0.58,
    wet: 0.45,
    gap: 1.5,
    max: 2,
    prio: 3,
    duck: 1,
    play(v, k) {
      const t = v.t;
      // reversed swell into the blast
      const s = v.noiseSrc('white', t, t + 0.75);
      const bp = v.filt('bandpass', 400, 1.2, t);
      bp.frequency.exponentialRampToValueAtTime(5000, t + 0.7);
      const sg = v.gain(0);
      sg.gain.setValueAtTime(0.001, t);
      sg.gain.exponentialRampToValueAtTime(0.5, t + 0.7);
      sg.gain.linearRampToValueAtTime(0, t + 0.73);
      v.chain(s, bp, sg);
      sg.connect(v.out);
      const b = t + 0.7;
      const o = v.osc('sine', 70 * v.p, b, b + 3.2);
      o.frequency.exponentialRampToValueAtTime(22 * v.p, b + 3);
      const osh = v.shaper(3);
      const og = v.gain(0);
      v.perc(og.gain, b, 1, 0.005, 3);
      v.chain(o, osh, og);
      og.connect(v.out);
      noiseSweep(v, 'white', b, 'lowpass', 8000, 200, 0.7, 3.5, 0.9, 0.005, 3.8);
      const w = v.noiseSrc('pink', b, b + 5);
      const wbp = v.filt('bandpass', 3500, 1, b);
      wbp.frequency.exponentialRampToValueAtTime(180, b + 4.5);
      const wg = v.gain(0);
      v.ahr(wg.gain, b, 0.6, 0.3, 1.5, 3);
      v.chain(w, wbp, wg);
      wg.connect(v.out);
      // the star rings like a struck bell
      const f0 = 196 * v.p;
      for (const [r, a] of [
        [1, 0.12],
        [1.5, 0.06],
        [2.76, 0.07],
        [5.4, 0.04],
      ] as const)
        v.blip(b, 'sine', f0 * r, f0 * r * 0.98, a, 5);
      smp(v, k, 'glock', 103, b + 0.1, 0.18, 1.6);
      smp(v, k, 'glock', 108, b + 0.25, 0.14, 1.6);
    },
  },
  alarm: {
    gain: 0.7,
    wet: 0.15,
    gap: 0.8,
    max: 2,
    prio: 2,
    play(v) {
      const t = v.t;
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.42;
        const lp = v.filt('lowpass', 2300, 1, tk);
        const g = v.gain(0);
        v.ahr(g.gain, tk, 0.17, 0.02, 0.26, 0.06);
        for (const f of [392, 466]) {
          const o = v.osc('sawtooth', f * v.p, tk, tk + 0.36);
          o.frequency.setValueAtTime(f * v.p, tk + 0.22);
          o.frequency.linearRampToValueAtTime(f * 0.94 * v.p, tk + 0.34);
          o.connect(lp);
        }
        v.chain(lp, g);
        g.connect(v.out);
      }
    },
  },
  launch: {
    gain: 0.7,
    wet: 0.25,
    gap: 0.6,
    max: 2,
    prio: 3,
    duck: 0.5,
    play(v) {
      const t = v.t;
      const D = 3.6;
      const s = v.noiseSrc('white', t, t + D);
      const b = v.noiseSrc('brown', t, t + D);
      const mix = v.gain(1);
      s.connect(mix);
      const bg = v.gain(1.4);
      b.connect(bg);
      bg.connect(mix);
      const lp = v.filt('lowpass', 300, 0.8, t);
      lp.frequency.exponentialRampToValueAtTime(1500, t + 1.0);
      lp.frequency.exponentialRampToValueAtTime(500, t + D);
      const sh = v.shaper(3);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.6, 0.5, 1.2, 1.8);
      v.chain(mix, lp, sh, g);
      g.connect(v.out);
      const c = v.noiseSrc('crackle', t, t + D, 1.3);
      const hp = v.filt('highpass', 400, 0.7, t);
      const cg = v.gain(0);
      v.ahr(cg.gain, t, 0.35, 0.4, 1.3, 1.6);
      v.chain(c, hp, cg);
      cg.connect(v.out);
      const o = v.osc('sine', 44 * v.p, t, t + D);
      o.frequency.linearRampToValueAtTime(32 * v.p, t + D);
      const og = v.gain(0);
      v.ahr(og.gain, t, 0.6, 0.3, 1.4, 1.6);
      o.connect(og);
      og.connect(v.out);
      v.blip(t, 'sine', 100, 45, 0.5, 0.4);
      v.grain(t, 'white', 'highpass', 800, 0.7, 0.3, 0.1);
    },
  },
  engine: {
    gain: 0.95,
    wet: 0.12,
    gap: 0.2,
    max: 3,
    vary: 0.08,
    play(v) {
      const t = v.t;
      const D = 1.6;
      const lp = v.filt('lowpass', 600, 2, t);
      for (const [kind, f, a] of [
        ['sawtooth', 70, 0.5],
        ['square', 140, 0.2],
      ] as const) {
        const o = v.osc(kind, f * v.p * 1.08, t, t + D);
        o.frequency.linearRampToValueAtTime(f * v.p * 1.08, t + 0.6);
        o.frequency.linearRampToValueAtTime(f * v.p * 0.9, t + 0.85);
        const og = v.gain(a);
        o.connect(og);
        og.connect(lp);
      }
      const trem = tremolo(v, t, t + D, 35 * v.p, 0.3, 'square');
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.45, 0.6, 0.1, 0.8);
      const pan = v.pan(-0.8);
      if ('pan' in pan) {
        (pan as StereoPannerNode).pan.setValueAtTime(-0.8, t);
        (pan as StereoPannerNode).pan.linearRampToValueAtTime(0.8, t + D);
      }
      v.chain(lp, trem, g, pan);
      pan.connect(v.out);
    },
  },
  camera: {
    gain: 0.6,
    wet: 0.05,
    ui: true,
    gap: 0.15,
    max: 2,
    play(v) {
      const t = v.t;
      v.grain(t, 'white', 'highpass', 2500, 0.7, 0.42, 0.012);
      v.blip(t, 'square', 1100, 800, 0.06, 0.01);
      const o = v.osc('sawtooth', 320, t + 0.012, t + 0.07);
      o.frequency.linearRampToValueAtTime(280, t + 0.06);
      const bp = v.filt('bandpass', 1200, 3, t);
      const g = v.gain(0);
      v.ahr(g.gain, t + 0.012, 0.05, 0.005, 0.04, 0.01);
      v.chain(o, bp, g);
      g.connect(v.out);
      v.grain(t + 0.07, 'white', 'highpass', 2200, 0.7, 0.32, 0.014);
      v.blip(t + 0.07, 'square', 900, 700, 0.05, 0.012);
    },
  },
  rewind: {
    gain: 1.0,
    wet: 0.18,
    gap: 0.3,
    max: 2,
    prio: 2,
    play(v) {
      const t = v.t;
      const o = v.osc('sawtooth', 120 * v.p, t, t + 0.84);
      o.frequency.exponentialRampToValueAtTime(v.f(1600 * v.p), t + 0.8);
      const wob = v.osc('sine', 11, t, t + 0.84);
      const wg = v.gain(40);
      wob.connect(wg);
      wg.connect(o.detune);
      const lp = v.filt('lowpass', 3000, 1, t);
      const g = v.gain(0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.26, t + 0.78);
      g.gain.linearRampToValueAtTime(0, t + 0.81);
      v.chain(o, lp, g);
      g.connect(v.out);
      const s = v.noiseSrc('pink', t, t + 0.84);
      const bp = v.filt('bandpass', 400, 1.4, t);
      bp.frequency.exponentialRampToValueAtTime(4000, t + 0.8);
      const ng = v.gain(0);
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.22, t + 0.78);
      ng.gain.linearRampToValueAtTime(0, t + 0.81);
      v.chain(s, bp, ng);
      ng.connect(v.out);
      v.grain(t + 0.8, 'white', 'highpass', 3000, 0.7, 0.12, 0.01);
    },
  },
};

/** convenience: list of every sfx name (for diagnostics) */
export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/** clamp helper exported for the engine */
export const sfxVolume = (def: SfxDef, v: number): number => clamp(def.gain * v, 0, 2);
