/**
 * OWNER: audio.
 * Real-time music instruments (scheduled ahead by the mood players). Each call builds a few nodes that start and
 * stop at fixed times, so nothing needs cleanup beyond letting the graph finish.
 *
 *   note      SampleBank note (harp / piano / ep / bell / toll / glock / kalimba / marimba)
 *   pad       warm detuned-oscillator pad through one shared swelling lowpass, optional FM shimmer
 *   choir     sawtooth ensemble through a parallel vowel-formant bank with shared vibrato
 *   drone     continuous low drone with a slowly breathing filter (returns a stop handle)
 *   bass      'soft' (triangle + sine sub) · 'pluck' (filtered saw) · 'pulse' (tight tension pulse)
 *   kick · snare · hat · shaker · rim · taiko · boom (sub drop) · riser · swell (brass-like) · stab
 */
import { clamp, mtof, periodicWave, type OscKind, type Voice } from './dsp';
import type { InstName, SampleBank } from './samples';

export interface Ins {
  v: Voice;
  bank: SampleBank;
  /** humanise timing (seconds) */
  jitter(): number;
}

/** keep `midis` inside [lo, hi) by octave shifts, sorted, unique */
export function voicing(midis: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m of midis) {
    while (m < lo) m += 12;
    while (m >= hi) m -= 12;
    if (!out.includes(m)) out.push(m);
  }
  return out.sort((a, b) => a - b);
}

export function note(p: Ins, inst: InstName, midi: number, t: number, vel: number, dest: AudioNode, maxDur?: number): void {
  const { buf, rate } = p.bank.get(inst, midi);
  const v = p.v;
  const full = buf.duration / rate;
  const len = maxDur !== undefined ? Math.min(full, maxDur) : full;
  const s = v.buffer(buf, t, rate, t + len + 0.02);
  const g = v.gain(vel);
  if (len < full) {
    g.gain.setValueAtTime(vel, t + Math.max(0, len - 0.25));
    g.gain.linearRampToValueAtTime(0, t + len);
  }
  s.connect(g);
  g.connect(dest);
}

export interface PadOpts {
  wave?: OscKind;
  attack?: number;
  release?: number;
  cutoff?: number;
  /** filter swell multiplier at the end of the attack */
  open?: number;
  q?: number;
  /** ± detune in cents of the two oscillators per note */
  spread?: number;
  /** FM shimmer index (0 = off) */
  fm?: number;
}

export function pad(p: Ins, midis: number[], t: number, dur: number, vel: number, dest: AudioNode, o: PadOpts = {}): void {
  if (!midis.length) return;
  const v = p.v;
  const atk = o.attack ?? 1.5;
  const rel = o.release ?? 2.5;
  const cut = o.cutoff ?? 1200;
  const end = t + dur + rel + 0.1;
  const lp = v.filt('lowpass', cut * 0.5, o.q ?? 0.6, t);
  lp.frequency.linearRampToValueAtTime(v.f(cut * (o.open ?? 1.4)), t + atk);
  lp.frequency.linearRampToValueAtTime(v.f(cut), t + atk + Math.max(0.1, dur - atk) * 0.7);
  const amp = v.gain(0);
  v.ahr(amp.gain, t, vel / Math.sqrt(midis.length), atk, Math.max(0, dur - atk), rel);
  const spread = o.spread ?? 7;
  for (const m of midis) {
    const f = mtof(m);
    for (const det of [-spread, spread]) {
      const osc = v.osc(o.wave ?? 'warm', f, t, end, det);
      if (o.fm && det < 0) {
        const mod = v.osc('sine', f * 2, t, end);
        const mg = v.gain(0);
        mg.gain.setValueAtTime(0, t);
        mg.gain.linearRampToValueAtTime(f * o.fm, t + atk);
        mg.gain.linearRampToValueAtTime(f * o.fm * 0.35, t + dur + rel);
        mod.connect(mg);
        mg.connect(osc.frequency);
      }
      osc.connect(lp);
    }
  }
  lp.connect(amp);
  amp.connect(dest);
}

const VOWELS: Record<'a' | 'o' | 'u' | 'e', { f: number[]; g: number[] }> = {
  a: { f: [800, 1150, 2900], g: [1, 0.5, 0.25] },
  o: { f: [450, 800, 2830], g: [1, 0.35, 0.12] },
  u: { f: [325, 700, 2530], g: [1, 0.22, 0.08] },
  e: { f: [400, 1700, 2600], g: [1, 0.35, 0.2] },
};

export function choir(p: Ins, midis: number[], t: number, dur: number, vel: number, dest: AudioNode, vowel: 'a' | 'o' | 'u' | 'e' = 'a', atk = 1.4, rel = 2.2): void {
  if (!midis.length) return;
  const v = p.v;
  const end = t + dur + rel + 0.1;
  const src = v.gain(1);
  const vib = v.osc('sine', 5.1, t, end);
  const vg = v.gain(10);
  vib.connect(vg);
  for (const m of midis) {
    const f = mtof(m);
    for (const det of [-11, 12]) {
      const o = v.osc('sawtooth', f, t, end, det);
      vg.connect(o.detune);
      o.connect(src);
    }
  }
  const amp = v.gain(0);
  v.ahr(amp.gain, t, vel / Math.sqrt(midis.length), atk, Math.max(0, dur - atk), rel);
  const vw = VOWELS[vowel];
  for (let i = 0; i < 3; i++) {
    const bp = v.filt('bandpass', vw.f[i], 7 + i * 2, t);
    const g = v.gain(vw.g[i] * 2.4);
    src.connect(bp);
    bp.connect(g);
    g.connect(amp);
  }
  amp.connect(dest);
}

export interface DroneHandle {
  stop(t: number, fade?: number): void;
}

export function drone(p: Ins, midis: number[], t: number, dest: AudioNode, o: { cutoff?: number; lfoRate?: number; vel?: number; drive?: number; wave?: OscKind } = {}): DroneHandle {
  const v = p.v;
  const ctx = v.ctx;
  const srcs: AudioScheduledSourceNode[] = [];
  const cut = o.cutoff ?? 500;
  const lp = v.filt('lowpass', cut, 1.1, t);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = o.lfoRate ?? 0.05;
  const lg = v.gain(cut * 0.55);
  lfo.connect(lg);
  lg.connect(lp.frequency);
  lfo.start(t);
  srcs.push(lfo);
  const amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime((o.vel ?? 0.08) / Math.sqrt(midis.length), t + 5);
  for (const m of midis) {
    const f = mtof(m);
    for (const det of [-5, 6]) {
      const osc = ctx.createOscillator();
      if (o.wave && o.wave !== 'warm' && o.wave !== 'hollow' && o.wave !== 'organ' && o.wave !== 'reed') osc.type = o.wave;
      else osc.setPeriodicWave(periodicFor(v, o.wave ?? 'warm'));
      osc.frequency.value = f;
      osc.detune.value = det;
      osc.start(t);
      srcs.push(osc);
      osc.connect(lp);
    }
  }
  if (o.drive) {
    const sh = v.shaper(o.drive);
    lp.connect(sh);
    sh.connect(amp);
  } else lp.connect(amp);
  amp.connect(dest);
  let stopped = false;
  return {
    stop(t1: number, fade = 3) {
      if (stopped) return;
      stopped = true;
      amp.gain.cancelScheduledValues(t1);
      amp.gain.setValueAtTime(amp.gain.value, t1);
      amp.gain.linearRampToValueAtTime(0, t1 + fade);
      for (const s of srcs) {
        try {
          s.stop(t1 + fade + 0.05);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

function periodicFor(v: Voice, kind: 'warm' | 'hollow' | 'organ' | 'reed'): PeriodicWave {
  return periodicWave(v.ctx, kind);
}

export function bass(p: Ins, midi: number, t: number, dur: number, vel: number, dest: AudioNode, kind: 'soft' | 'pluck' | 'pulse' = 'soft'): void {
  const v = p.v;
  const f = mtof(midi);
  if (kind === 'soft') {
    const lp = v.filt('lowpass', 650, 0.7, t);
    const amp = v.gain(0);
    v.ahr(amp.gain, t, vel, 0.02, dur * 0.7, dur * 0.3 + 0.15);
    const end = t + dur + 0.3;
    const a = v.osc('triangle', f, t, end);
    const b = v.osc('sine', f, t, end);
    const bg = v.gain(0.8);
    a.connect(lp);
    b.connect(bg);
    bg.connect(lp);
    lp.connect(amp);
    amp.connect(dest);
  } else if (kind === 'pluck') {
    const lp = v.filt('lowpass', 1300, 2.5, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.28);
    const amp = v.gain(0);
    v.perc(amp.gain, t, vel, 0.005, dur);
    const o = v.osc('sawtooth', f, t, t + dur + 0.05);
    const s = v.osc('sine', f, t, t + dur + 0.05);
    o.connect(lp);
    s.connect(amp);
    lp.connect(amp);
    amp.connect(dest);
  } else {
    const lp = v.filt('lowpass', 950, 4, t);
    lp.frequency.exponentialRampToValueAtTime(170, t + 0.13);
    const amp = v.gain(0);
    const d = Math.min(dur, 0.26);
    v.perc(amp.gain, t, vel, 0.004, d);
    const o = v.osc('sawtooth', f, t, t + d + 0.05);
    const s = v.osc('square', f * 0.5, t, t + d + 0.05);
    const sg = v.gain(0.4);
    o.connect(lp);
    s.connect(sg);
    sg.connect(lp);
    lp.connect(amp);
    amp.connect(dest);
  }
}

export function kick(p: Ins, t: number, vel: number, dest: AudioNode, decay = 0.38): void {
  const v = p.v;
  const o = v.osc('sine', 150, t, t + decay + 0.1);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  const g = v.gain(0);
  v.perc(g.gain, t, vel, 0.002, decay);
  o.connect(g);
  g.connect(dest);
  v.grain(t, 'white', 'lowpass', 3000, 0.7, vel * 0.22, 0.006, dest);
}

export function snare(p: Ins, t: number, vel: number, dest: AudioNode): void {
  const v = p.v;
  v.grain(t, 'white', 'bandpass', 1900, 0.8, vel * 0.85, 0.17, dest);
  v.blip(t, 'triangle', 190, 160, vel * 0.5, 0.08, dest);
}

export function hat(p: Ins, t: number, vel: number, dest: AudioNode, open = false): void {
  p.v.grain(t, 'white', 'highpass', 7500, 0.7, vel, open ? 0.22 : 0.035, dest);
}

export function shaker(p: Ins, t: number, vel: number, dest: AudioNode): void {
  const v = p.v;
  const s = v.noiseSrc('white', t, t + 0.1);
  const bp = v.filt('bandpass', 6500, 1.6, t);
  const g = v.gain(0);
  v.ahr(g.gain, t, vel, 0.014, 0.01, 0.055);
  v.chain(s, bp, g);
  g.connect(dest);
}

export function rim(p: Ins, t: number, vel: number, dest: AudioNode): void {
  p.v.blip(t, 'triangle', 1700, 1600, vel, 0.02, dest);
  p.v.grain(t, 'white', 'bandpass', 2500, 4, vel * 0.6, 0.012, dest);
}

export function taiko(p: Ins, t: number, vel: number, dest: AudioNode, f = 80): void {
  const v = p.v;
  const o = v.osc('sine', f * 1.6, t, t + 0.9);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  const g = v.gain(0);
  v.perc(g.gain, t, vel, 0.003, 0.75);
  o.connect(g);
  g.connect(dest);
  v.grain(t, 'brown', 'lowpass', 500, 0.7, vel * 0.55, 0.2, dest);
  v.grain(t, 'white', 'bandpass', 900, 1, vel * 0.18, 0.03, dest);
}

export function boom(p: Ins, t: number, vel: number, dest: AudioNode): void {
  const v = p.v;
  const o = v.osc('sine', 58, t, t + 2.4);
  o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
  const sh = v.shaper(2.5);
  const g = v.gain(0);
  v.perc(g.gain, t, vel, 0.012, 2.2);
  v.chain(o, sh, g);
  g.connect(dest);
  v.grain(t, 'brown', 'lowpass', 160, 0.7, vel * 0.6, 1.4, dest);
}

export function riser(p: Ins, t: number, dur: number, vel: number, dest: AudioNode): void {
  const v = p.v;
  const s = v.noiseSrc('white', t, t + dur + 0.08);
  const bp = v.filt('bandpass', 300, 2, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
  v.chain(s, bp, g);
  g.connect(dest);
}

/** slow brass-like swell (majestic menu horns) */
export function swell(p: Ins, midis: number[], t: number, dur: number, vel: number, dest: AudioNode): void {
  const v = p.v;
  const end = t + dur + 0.2;
  const lp = v.filt('lowpass', 300, 1, t);
  lp.frequency.linearRampToValueAtTime(1900, t + dur * 0.6);
  lp.frequency.linearRampToValueAtTime(500, t + dur);
  const amp = v.gain(0);
  v.ahr(amp.gain, t, vel / Math.sqrt(midis.length), dur * 0.5, dur * 0.15, dur * 0.35);
  for (const m of midis) for (const det of [-8, 7]) v.osc('sawtooth', mtof(m), t, end, det).connect(lp);
  lp.connect(amp);
  amp.connect(dest);
}

/** short dark brass stab (tension) */
export function stab(p: Ins, midis: number[], t: number, vel: number, dest: AudioNode): void {
  const v = p.v;
  const lp = v.filt('lowpass', 2200, 1.5, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.28);
  const amp = v.gain(0);
  v.perc(amp.gain, t, vel / Math.sqrt(midis.length), 0.006, 0.38);
  for (const m of midis) for (const det of [-10, 9]) v.osc('sawtooth', mtof(m), t, t + 0.5, det).connect(lp);
  lp.connect(amp);
  amp.connect(dest);
}

export const vel = (base: number, spread = 0.15, r = Math.random()): number => clamp(base * (1 - spread + 2 * spread * r), 0, 1);
