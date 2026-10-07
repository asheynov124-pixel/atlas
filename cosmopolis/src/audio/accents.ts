/**
 * OWNER: audio.
 * Placement accents — a tiny sonic signature layered on top of the generic place / placeBig thunk when the PLAYER
 * places something (AudioEngine watches 'building:added' right after a place sound). Each category answers in its
 * own voice: power sparks and hums, water bloops, services ring a friendly two-note bell, schools a soft bell,
 * parks chirp with birds, transit plays a station "ding-dong", industry clanks, landmarks swell like a small
 * fanfare, orbital assets whoosh skyward, decor rustles, custom Studio designs sparkle.
 * Tonal accents are written in C and transposed into the current music key like the tonal SFX.
 */
import type { Category } from '../core/types';
import type { Voice } from './dsp';
import type { SfxDef, SfxKit } from './sfx';
import type { InstName } from './samples';

function smp(v: Voice, k: SfxKit, inst: InstName, midi: number, t: number, amp: number, dur = 1.2): void {
  const { buf, rate } = k.bank.get(inst, midi);
  const r = rate * v.p;
  const len = Math.min(buf.duration / r, dur);
  const s = v.buffer(buf, t, r, t + len + 0.01);
  const g = v.gain(amp);
  g.gain.setValueAtTime(amp, t + Math.max(0, len - 0.15));
  g.gain.linearRampToValueAtTime(0, t + len);
  s.connect(g);
  g.connect(v.out);
}

function chirp(v: Voice, t: number, f: number): void {
  v.blip(t, 'sine', f, f * 1.35, 0.05, 0.05);
  v.blip(t + 0.08, 'sine', f * 1.1, f * 1.5, 0.045, 0.05);
}

export const ACCENTS: Partial<Record<Category, SfxDef>> = {
  power: {
    gain: 0.55,
    wet: 0.1,
    play(v) {
      const t = v.t + 0.05;
      const o = v.osc('sawtooth', 120, t, t + 0.3);
      const bp = v.filt('bandpass', 1800, 6, t);
      const g = v.gain(0);
      v.perc(g.gain, t, 0.22, 0.01, 0.25);
      v.chain(o, bp, g);
      g.connect(v.out);
      for (let i = 0; i < 3; i++) v.grain(t + i * 0.05 + v.r.next() * 0.04, 'white', 'highpass', 4500, 0.7, 0.18, 0.012);
      const h = v.osc('sine', 60, t, t + 0.5);
      const hg = v.gain(0);
      v.ahr(hg.gain, t, 0.12, 0.04, 0.15, 0.25);
      h.connect(hg);
      hg.connect(v.out);
    },
  },
  water: {
    gain: 0.6,
    wet: 0.2,
    play(v) {
      const t = v.t + 0.05;
      v.blip(t, 'sine', 700, 260, 0.3, 0.18);
      v.blip(t + 0.12, 'sine', 420, 900, 0.1, 0.05);
      v.blip(t + 0.2, 'sine', 520, 1100, 0.08, 0.04);
    },
  },
  services: {
    gain: 0.5,
    wet: 0.25,
    tonal: true,
    play(v, k) {
      smp(v, k, 'glock', 76, v.t + 0.06, 0.28, 0.9);
      smp(v, k, 'glock', 81, v.t + 0.18, 0.26, 1.1);
    },
  },
  education: {
    gain: 0.5,
    wet: 0.3,
    tonal: true,
    play(v, k) {
      smp(v, k, 'bell', 72, v.t + 0.06, 0.3, 1.4);
      smp(v, k, 'bell', 76, v.t + 0.06, 0.18, 1.4);
    },
  },
  leisure: {
    gain: 1.3,
    wet: 0.3,
    play(v) {
      const t = v.t + 0.06;
      chirp(v, t, v.r.range(2600, 3400));
      chirp(v, t + 0.22, v.r.range(2800, 3800));
      const s = v.noiseSrc('pink', t, t + 0.3);
      const bp = v.filt('bandpass', 3500, 0.8, t);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.08, 0.03, 0.05, 0.15);
      v.chain(s, bp, g);
      g.connect(v.out);
    },
  },
  transit: {
    gain: 0.55,
    wet: 0.3,
    tonal: true,
    play(v, k) {
      smp(v, k, 'marimba', 79, v.t + 0.06, 0.35, 0.8);
      smp(v, k, 'marimba', 76, v.t + 0.3, 0.35, 1);
    },
  },
  industry: {
    gain: 0.6,
    wet: 0.15,
    play(v) {
      const t = v.t + 0.05;
      v.grain(t, 'white', 'bandpass', 2500, 12, 0.35, 0.12);
      v.blip(t, 'triangle', 420, 400, 0.12, 0.2);
      v.blip(t + 0.02, 'sine', 90, 50, 0.3, 0.18);
      v.grain(t + 0.14, 'white', 'bandpass', 3100, 14, 0.2, 0.08);
    },
  },
  landmarks: {
    gain: 0.6,
    wet: 0.35,
    tonal: true,
    play(v, k) {
      const t = v.t + 0.08;
      const lp = v.filt('lowpass', 400, 1, t);
      lp.frequency.linearRampToValueAtTime(2200, t + 0.5);
      lp.frequency.linearRampToValueAtTime(900, t + 1.4);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.07, 0.45, 0.4, 0.7);
      for (const m of [48, 55, 60, 64]) for (const d of [-8, 7]) v.osc('sawtooth', 440 * Math.pow(2, (m - 69) / 12) * v.p, t, t + 1.7, d).connect(lp);
      v.chain(lp, g);
      g.connect(v.out);
      smp(v, k, 'bell', 84, t + 0.45, 0.25, 1.6);
    },
  },
  orbital: {
    gain: 0.8,
    wet: 0.3,
    tonal: true,
    play(v, k) {
      const t = v.t + 0.04;
      const s = v.noiseSrc('pink', t, t + 0.7);
      const bp = v.filt('bandpass', 400, 1.5, t);
      bp.frequency.exponentialRampToValueAtTime(3500, t + 0.6);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.3, 0.3, 0.1, 0.25);
      v.chain(s, bp, g);
      g.connect(v.out);
      smp(v, k, 'glock', 91, t + 0.55, 0.18, 1);
    },
  },
  decor: {
    gain: 1.1,
    wet: 0.1,
    play(v) {
      const t = v.t + 0.03;
      const s = v.noiseSrc('pink', t, t + 0.25);
      const bp = v.filt('bandpass', 3200, 0.8, t);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.12, 0.02, 0.04, 0.14);
      v.chain(s, bp, g);
      g.connect(v.out);
      v.grain(t + 0.05, 'white', 'highpass', 3000, 0.7, 0.06, 0.008);
    },
  },
  custom: {
    gain: 0.5,
    wet: 0.35,
    tonal: true,
    play(v, k) {
      [84, 88, 91].forEach((m, i) => smp(v, k, 'glock', m, v.t + 0.05 + i * 0.05, 0.2, 0.8));
    },
  },
};
