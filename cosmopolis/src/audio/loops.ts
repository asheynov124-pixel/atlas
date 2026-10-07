/**
 * OWNER: audio.
 * Continuous loops for every LoopName (core/types). A loop is a small always-running node graph whose sources are
 * started once and only stopped when the handle is stopped; LFOs give it life (gusts, flicker, tremolo, siren
 * sweeps). `storm` also schedules distant thunder rolls from `tick()`.
 *
 * LoopKit extends the Voice builder with persistent sources (`sosc`, `snoise`) that are tracked and stopped together.
 */
import type { LoopName } from '../core/types';
import { Voice, periodicWave, type NoiseKind, type OscKind } from './dsp';

export interface LoopVoice {
  /** loop output (connect to the bus through the handle's gain) */
  out: AudioNode;
  /** stop every source at time t */
  stop(t: number): void;
  /** optional stochastic events (called ~every frame with the loop's current level 0..1) */
  tick?(now: number, level: number): void;
}

export interface LoopDef {
  gain: number;
  build(k: LoopKit): LoopVoice;
}

export class LoopKit extends Voice {
  readonly sources: AudioScheduledSourceNode[] = [];

  sosc(kind: OscKind, freq: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (kind === 'warm' || kind === 'hollow' || kind === 'organ' || kind === 'reed') o.setPeriodicWave(periodicWave(this.ctx, kind));
    else o.type = kind;
    o.frequency.value = this.f(freq);
    o.detune.value = detune;
    o.start(this.t);
    this.sources.push(o);
    return o;
  }

  snoise(kind: NoiseKind, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    const b = this.noise.get(kind);
    s.buffer = b;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.t, this.r.next() * Math.max(0, b.duration - 0.1));
    this.sources.push(s);
    return s;
  }

  /** LFO → depth gain → param */
  lfo(param: AudioParam, rate: number, depth: number, kind: OscillatorType = 'sine'): OscillatorNode {
    const o = this.sosc(kind, rate);
    const g = this.gain(depth);
    o.connect(g);
    g.connect(param);
    return o;
  }

  stopAll(t: number): void {
    for (const s of this.sources) {
      try {
        s.stop(t);
      } catch {
        /* already stopped */
      }
    }
  }

}

function simple(k: LoopKit, out: AudioNode): LoopVoice {
  return { out, stop: (t) => k.stopAll(t) };
}

export const LOOPS: Record<LoopName, LoopDef> = {
  wind: {
    gain: 0.75,
    build(k) {
      const out = k.gain(1);
      const gust = k.gain(0.65);
      k.lfo(gust.gain, 0.083, 0.35);
      const n = k.snoise('pink');
      const bp = k.filt('bandpass', 460, 2.4);
      k.lfo(bp.frequency, 0.11, 220);
      k.lfo(bp.frequency, 0.047, 140);
      const hg = k.gain(0.95);
      k.chain(n, bp, hg, gust);
      const n2 = k.snoise('pink', 0.9);
      const lp = k.filt('lowpass', 900, 0.7);
      const bg = k.gain(0.38);
      k.chain(n2, lp, bg, gust);
      gust.connect(out);
      return simple(k, out);
    },
  },
  fire: {
    gain: 0.8,
    build(k) {
      const out = k.gain(1);
      const c = k.snoise('crackle');
      const hp = k.filt('highpass', 500, 0.7);
      const cg = k.gain(0.55);
      k.chain(c, hp, cg, out);
      const b = k.snoise('brown');
      const lp = k.filt('lowpass', 260, 0.8);
      const roar = k.gain(0.55);
      k.lfo(roar.gain, 0.7, 0.18);
      k.lfo(lp.frequency, 0.31, 80);
      k.chain(b, lp, roar, out);
      return simple(k, out);
    },
  },
  rain: {
    gain: 0.7,
    build(k) {
      const out = k.gain(1);
      const r = k.snoise('rain');
      const rg = k.gain(0.6);
      k.chain(r, rg, out);
      const n = k.snoise('pink');
      const lp = k.filt('lowpass', 3000, 0.7);
      const hp = k.filt('highpass', 400, 0.7);
      const ng = k.gain(0.38);
      k.lfo(ng.gain, 0.06, 0.08);
      k.chain(n, lp, hp, ng, out);
      return simple(k, out);
    },
  },
  rumble: {
    gain: 0.9,
    build(k) {
      const out = k.gain(0.7);
      k.lfo(out.gain, 4.3, 0.22);
      k.lfo(out.gain, 0.37, 0.12);
      const b = k.snoise('brown');
      const lp = k.filt('lowpass', 120, 0.9);
      const bg = k.gain(0.95);
      k.chain(b, lp, bg, out);
      const o = k.sosc('sine', 34);
      k.lfo(o.frequency, 0.21, 3);
      const og = k.gain(0.35);
      k.chain(o, og, out);
      return simple(k, out);
    },
  },
  alarm: {
    gain: 0.4,
    build(k) {
      const out = k.gain(1);
      const lp = k.filt('lowpass', 2400, 0.9);
      const o = k.sosc('sawtooth', 640);
      k.lfo(o.frequency, 0.24, 230);
      const o2 = k.sosc('triangle', 960);
      k.lfo(o2.frequency, 0.24, 345);
      const g1 = k.gain(0.22);
      const g2 = k.gain(0.1);
      o.connect(g1);
      o2.connect(g2);
      g1.connect(lp);
      g2.connect(lp);
      lp.connect(out);
      return simple(k, out);
    },
  },
  hum: {
    gain: 0.75,
    build(k) {
      const out = k.gain(0.75);
      k.lfo(out.gain, 0.23, 0.22);
      for (const [f, a, det] of [
        [55, 0.42, 0],
        [110.4, 0.24, 4],
        [165, 0.12, -3],
        [220.7, 0.05, 2],
      ] as const) {
        const o = k.sosc('sine', f, det);
        const g = k.gain(a);
        k.chain(o, g, out);
      }
      const n = k.snoise('pink');
      const bp = k.filt('bandpass', 120, 4);
      const ng = k.gain(0.3);
      k.chain(n, bp, ng, out);
      return simple(k, out);
    },
  },
  blackhole: {
    gain: 0.9,
    build(k) {
      const out = k.gain(0.75);
      k.lfo(out.gain, 0.31, 0.25);
      const o = k.sosc('sine', 30);
      k.lfo(o.frequency, 0.13, 4);
      const sh = k.shaper(2);
      const og = k.gain(0.75);
      k.chain(o, sh, og, out);
      const b = k.snoise('brown');
      const lp = k.filt('lowpass', 70, 0.9);
      const bg = k.gain(0.65);
      k.chain(b, lp, bg, out);
      const w = k.snoise('pink');
      const bp = k.filt('bandpass', 900, 14);
      k.lfo(bp.frequency, 0.07, 350);
      const wg = k.gain(0.5);
      k.chain(w, bp, wg, out);
      const g = k.snoise('grit', 0.6);
      const glp = k.filt('lowpass', 1400, 0.7);
      const gg = k.gain(0.18);
      k.chain(g, glp, gg, out);
      return simple(k, out);
    },
  },
  storm: {
    gain: 0.85,
    build(k) {
      const out = k.gain(1);
      const b = k.snoise('brown');
      const lp = k.filt('lowpass', 260, 0.8);
      const bg = k.gain(0.65);
      k.chain(b, lp, bg, out);
      const w = k.snoise('pink');
      const bp = k.filt('bandpass', 600, 1.5);
      k.lfo(bp.frequency, 0.09, 300);
      const wg = k.gain(0.5);
      k.lfo(wg.gain, 0.07, 0.2);
      k.chain(w, bp, wg, out);
      const r = k.snoise('rain', 1.05);
      const rg = k.gain(0.45);
      k.chain(r, rg, out);
      let next = k.t + 2 + k.r.next() * 5;
      return {
        out,
        stop: (t) => k.stopAll(t),
        tick(now, level) {
          if (now < next) return;
          next = now + 5 + k.r.next() * 9;
          if (level < 0.05) return;
          // a distant thunder roll inside the loop's own output
          const v = new Voice(k.ctx, k.noise, out, null, now + 0.05, 1, 0.6, k.r);
          const s = v.noiseSrc('brown', v.t, v.t + 3.2);
          const f = v.filt('lowpass', 520, 0.8, v.t);
          f.frequency.exponentialRampToValueAtTime(110, v.t + 2.6);
          const irr = v.gain(1);
          for (let i = 1; i <= 7; i++) irr.gain.linearRampToValueAtTime(0.4 + k.r.next() * 0.6, v.t + i * 0.4);
          const g = v.gain(0);
          v.perc(g.gain, v.t, 0.75, 0.25, 2.8);
          v.chain(s, f, irr, g);
          g.connect(out);
        },
      };
    },
  },
  engine: {
    gain: 0.6,
    build(k) {
      const out = k.gain(1);
      const lp = k.filt('lowpass', 420, 1.5);
      const am = k.gain(0.75);
      k.lfo(am.gain, 23, 0.25, 'square');
      const o1 = k.sosc('sawtooth', 46);
      const o2 = k.sosc('square', 92);
      k.lfo(o1.frequency, 0.4, 1.2);
      const g1 = k.gain(0.32);
      const g2 = k.gain(0.12);
      o1.connect(g1);
      o2.connect(g2);
      g1.connect(lp);
      g2.connect(lp);
      k.chain(lp, am, out);
      const b = k.snoise('brown');
      const blp = k.filt('lowpass', 180, 0.8);
      const bg = k.gain(0.38);
      k.chain(b, blp, bg, out);
      return simple(k, out);
    },
  },
};

export const LOOP_NAMES = Object.keys(LOOPS) as LoopName[];
