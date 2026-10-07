/**
 * OWNER: audio.
 * SampleBank — struck / plucked instruments rendered in plain JS into small mono AudioBuffers, once per base note
 * (every 4 semitones; playback-rate covers the ±2 semitones in between). Runtime cost of a note is then one
 * AudioBufferSourceNode + one GainNode, which keeps music and SFX cheap on iPhone.
 *
 *   harp     Karplus–Strong plucked string (noise burst into a damped averaging delay line, pluck-position comb)
 *   piano    additive: inharmonic partials (B≈3.5e-4), two-stage decay, detuned string pairs, hammer thump
 *   ep       FM electric piano (1:1 carrier/modulator with decaying index + 14:1 "tine" bark)
 *   bell     bright, nearly harmonic tubular bell with a hum partial and beating pairs (space shimmer)
 *   toll     inharmonic church bell (hum / prime / minor-third tierce / quint / nominal) with a very long tail
 *   glock    glockenspiel bar modes 1 : 2.76 : 5.40 : 8.93
 *   kalimba  thumb-piano tine (fundamental + fast-dying 5.95× overtone)
 *   marimba  soft mallet on a tuned bar (1 : 3.93 : 9.24) with resonator body
 *
 * Generation uses rotating-phasor oscillators (no Math.sin in the inner loop): ~1–3 ms per buffer. Buffers are
 * generated lazily; `warm()` + `tick(budgetMs)` amortise the work across frames before the notes are needed.
 */
import { Prng, mtof, type Ctx } from './dsp';

export type InstName = 'harp' | 'piano' | 'ep' | 'bell' | 'toll' | 'glock' | 'kalimba' | 'marimba';

interface InstSpec {
  seconds: number;
  rate: number;
}

const SPECS: Record<InstName, InstSpec> = {
  harp: { seconds: 2.4, rate: 22050 },
  piano: { seconds: 3.2, rate: 22050 },
  ep: { seconds: 2.4, rate: 22050 },
  bell: { seconds: 3.6, rate: 24000 },
  toll: { seconds: 6.5, rate: 16000 },
  glock: { seconds: 2.2, rate: 24000 },
  kalimba: { seconds: 1.6, rate: 24000 },
  marimba: { seconds: 1.4, rate: 16000 },
};

const STEP = 4;

interface Entry {
  buf: AudioBuffer;
  /** actual fundamental of the rendered buffer (Hz) */
  f0: number;
}

export interface SampleRef {
  buf: AudioBuffer;
  rate: number;
}

export class SampleBank {
  private cache = new Map<string, Entry>();
  private queue: [InstName, number][] = [];
  private queued = new Set<string>();
  private inflight = new Set<string>();
  generated = 0;

  constructor(private ctx: Ctx) {}

  private static base(midi: number): number {
    return Math.round(midi / STEP) * STEP;
  }

  /** buffer + playback rate for a MIDI note (generates synchronously if not warmed yet) */
  get(inst: InstName, midi: number): SampleRef {
    const base = SampleBank.base(midi);
    const e = this.entry(inst, base);
    return { buf: e.buf, rate: mtof(midi) / e.f0 };
  }

  has(inst: InstName, midi: number): boolean {
    return this.cache.has(inst + ':' + SampleBank.base(midi));
  }

  /** enqueue notes to be rendered during idle frames (`urgent` puts them at the front of the queue) */
  warm(inst: InstName, midis: readonly number[], urgent = false): void {
    for (const m of midis) {
      const base = SampleBank.base(m);
      const k = inst + ':' + base;
      if (this.cache.has(k)) continue;
      if (this.queued.has(k)) {
        if (!urgent) continue;
        const i = this.queue.findIndex(([a, b]) => a === inst && b === base);
        if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
        continue;
      }
      this.queued.add(k);
      if (urgent) this.queue.unshift([inst, base]);
      else this.queue.push([inst, base]);
    }
  }

  /** true when every note of the list is rendered */
  ready(list: readonly [InstName, readonly number[]][]): boolean {
    for (const [inst, notes] of list) for (const m of notes) if (!this.cache.has(inst + ':' + SampleBank.base(m))) return false;
    return true;
  }

  /** render queued buffers until `budgetMs` is spent (always at least one) */
  tick(budgetMs = 2): void {
    if (!this.queue.length) return;
    const t0 = performance.now();
    while (this.queue.length) {
      const [inst, base] = this.queue.shift()!;
      this.queued.delete(inst + ':' + base);
      this.entry(inst, base);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  private entry(inst: InstName, base: number): Entry {
    const k = inst + ':' + base;
    let e = this.cache.get(k);
    if (e) return e;
    e = this.toEntry(renderData(inst, base));
    this.cache.set(k, e);
    this.generated++;
    return e;
  }

  private toEntry(s: SampleData): Entry {
    const buf = this.ctx.createBuffer(1, s.data.length, s.sr);
    buf.copyToChannel(s.data, 0);
    return { buf, f0: s.f0 };
  }

  /**
   * Hand queued notes to an asynchronous renderer (the synth worker): up to `max` requests in flight.
   * `send(inst, base)` must eventually call `adopt()` (or `failed()`).
   */
  dispatch(send: (inst: InstName, base: number) => void, max = 3): void {
    while (this.inflight.size < max && this.queue.length) {
      const [inst, base] = this.queue.shift()!;
      const k = inst + ':' + base;
      this.queued.delete(k);
      if (this.cache.has(k)) continue;
      this.inflight.add(k);
      send(inst, base);
    }
  }

  /** a worker-rendered note arrived */
  adopt(inst: InstName, base: number, s: SampleData): void {
    const k = inst + ':' + base;
    this.inflight.delete(k);
    if (this.cache.has(k)) return;
    this.cache.set(k, this.toEntry(s));
    this.generated++;
  }

  /** the worker could not render a note: fall back to the main-thread queue */
  failed(inst: InstName, base: number): void {
    this.inflight.delete(inst + ':' + base);
    this.warm(inst, [base]);
  }

  get busy(): number {
    return this.inflight.size;
  }
}

// ─────────────────────────────────────────────────────────────── renderers

/** add an exponentially decaying sinusoid (rotating phasor) */
function partial(d: Float32Array, sr: number, f: number, amp: number, tau: number, start = 0, phase = 0): void {
  if (f <= 0 || f >= sr * 0.47 || amp <= 0) return;
  const w = (2 * Math.PI * f) / sr;
  const c = Math.cos(w);
  const s = Math.sin(w);
  const k = Math.exp(-1 / Math.max(1e-4, tau * sr));
  let x = Math.cos(phase) * amp;
  let y = Math.sin(phase) * amp;
  const n = d.length;
  for (let i = start; i < n; i++) {
    d[i] += y;
    const nx = (x * c - y * s) * k;
    y = (x * s + y * c) * k;
    x = nx;
    if ((i & 255) === 0 && Math.abs(x) + Math.abs(y) < 1e-5) break;
  }
}

function finish(d: Float32Array, sr: number, attackMs: number, peakTarget = 0.8): void {
  const n = d.length;
  // attack ramp (avoid clicks) and release fade at the very end
  const a = Math.max(1, Math.floor((sr * attackMs) / 1000));
  for (let i = 0; i < a && i < n; i++) d[i] *= i / a;
  const r = Math.min(n, Math.floor(sr * 0.08));
  for (let i = 0; i < r; i++) d[n - 1 - i] *= i / r;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(d[i]);
    if (v > peak) peak = v;
  }
  if (peak > 0) {
    const k = peakTarget / peak;
    for (let i = 0; i < n; i++) d[i] *= k;
  }
}

export interface SampleData {
  data: Float32Array<ArrayBuffer>;
  sr: number;
  f0: number;
}

/** Render one instrument note into raw mono data (pure, worker-safe). */
export function renderData(inst: InstName, midi: number): SampleData {
  const spec = SPECS[inst];
  const sr = spec.rate;
  // low notes ring longer
  const len = Math.floor(sr * spec.seconds * (midi < 48 ? 1.25 : midi > 84 ? 0.75 : 1));
  const d = new Float32Array(new ArrayBuffer(len * 4));
  const f = mtof(midi);
  const r = new Prng(0x9e37 + midi * 131 + inst.length * 7919);
  let f0 = f;
  // register-dependent decay scaling: 1 at C4, longer for lows
  const reg = Math.max(0.45, Math.min(1.8, 1 + (60 - midi) / 36));
  switch (inst) {
    case 'harp': {
      // Karplus–Strong with Jaffe–Smith decay stretching: y = ρ·((1−S)·x[n−N] + S·x[n−N−1]); period N + S.
      // Small S for high notes keeps them ringing instead of dying in a few periods.
      const S = Math.max(0.06, Math.min(0.5, 0.5 * Math.pow(220 / f, 0.7)));
      const N = Math.max(2, Math.floor(sr / f - S));
      f0 = sr / (N + S);
      const w = (2 * Math.PI * f0) / sr;
      const loss = Math.sqrt((1 - S) * (1 - S) + S * S + 2 * S * (1 - S) * Math.cos(w));
      const t60 = 1.9 * reg;
      const rho = Math.min(0.99995, Math.pow(0.001, 1 / (f0 * t60)) / loss);
      // delay line of N samples
      const line = new Float32Array(N);
      // excitation: lowpassed noise with pluck-position comb (pluck at 1/7 of the string)
      let lp = 0;
      const bright = 0.55;
      for (let i = 0; i < N; i++) {
        lp += bright * (r.next() * 2 - 1 - lp);
        line[i] = lp;
      }
      const pp = Math.max(1, Math.floor(N / 7));
      for (let i = N - 1; i >= pp; i--) line[i] -= line[i - pp] * 0.9;
      let idx = 0;
      let prev = line[N - 1];
      for (let i = 0; i < len; i++) {
        const cur = line[idx];
        const out = rho * ((1 - S) * cur + S * prev);
        prev = cur;
        line[idx] = out;
        d[i] = out;
        idx = idx === N - 1 ? 0 : idx + 1;
      }
      // a touch of body: soft second-order lowpass
      let b1 = 0,
        b2 = 0;
      for (let i = 0; i < len; i++) {
        b1 += 0.6 * (d[i] - b1);
        b2 += 0.6 * (b1 - b2);
        d[i] = d[i] * 0.45 + b2 * 0.55;
      }
      finish(d, sr, 1.2);
      break;
    }
    case 'piano': {
      const B = 0.00035;
      const tauSlow = 2.6 * reg;
      const tauFast = 0.38 * reg;
      for (let n = 1; n <= 10; n++) {
        const fn = n * f * Math.sqrt(1 + B * n * n);
        const amp = (1 / Math.pow(n, 1.15)) * Math.exp(-(n - 1) * 0.22) * (midi > 80 ? Math.exp(-(n - 1) * 0.4) : 1);
        const ph = r.next() * 6.28;
        partial(d, sr, fn, amp * 0.55, tauFast / Math.sqrt(n), 0, ph);
        partial(d, sr, fn, amp * 0.45, tauSlow / Math.pow(n, 0.75), 0, ph);
        if (n <= 3) partial(d, sr, fn * 1.0009, amp * 0.3, tauSlow / Math.pow(n, 0.75), 0, ph + 1.1);
      }
      // hammer thump: short lowpassed noise
      let lp = 0;
      const hn = Math.floor(sr * 0.012);
      for (let i = 0; i < hn; i++) {
        lp += 0.25 * (r.next() * 2 - 1 - lp);
        d[i] += lp * 0.5 * (1 - i / hn);
      }
      finish(d, sr, 2.5);
      break;
    }
    case 'ep': {
      const tau = 1.5 * reg;
      const w = (2 * Math.PI * f) / sr;
      const wt = w * 14;
      let ph = 0,
        pt = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const idx = 2.2 * Math.exp(-t / 0.45) + 0.25;
        const bark = 1.4 * Math.exp(-t / 0.035);
        const mod = Math.sin(ph) * idx + Math.sin(pt) * bark;
        d[i] = Math.sin(ph + mod) * Math.exp(-t / tau) * (0.8 + 0.2 * Math.exp(-t / 0.1));
        ph += w;
        pt += wt;
        if (ph > 6.283185307) ph -= 6.283185307;
        if (pt > 6.283185307) pt -= 6.283185307;
      }
      finish(d, sr, 1.5);
      break;
    }
    case 'bell': {
      const D = 3.2 * reg;
      const P: [number, number, number][] = [
        [0.5, 0.25, 1.0],
        [1, 1, 0.85],
        [1.0016, 0.6, 0.8],
        [2.0, 0.55, 0.55],
        [2.99, 0.35, 0.4],
        [4.07, 0.24, 0.28],
        [5.19, 0.16, 0.2],
        [6.4, 0.1, 0.14],
      ];
      for (const [ratio, amp, dec] of P) partial(d, sr, f * ratio, amp, (D * dec) / 4, 0, r.next() * 6.28);
      // strike transient
      for (let i = 0; i < Math.floor(sr * 0.004); i++) d[i] += (r.next() * 2 - 1) * 0.15;
      finish(d, sr, 1);
      break;
    }
    case 'toll': {
      const D = 6.0 * reg;
      const P: [number, number, number][] = [
        [0.5, 0.7, 1.0],
        [0.5013, 0.4, 0.95],
        [1.0, 0.9, 0.7],
        [1.2, 0.55, 0.5],
        [1.5, 0.35, 0.42],
        [2.0, 0.75, 0.35],
        [2.0021, 0.3, 0.33],
        [2.52, 0.3, 0.22],
        [3.01, 0.22, 0.17],
        [4.16, 0.15, 0.12],
        [5.43, 0.1, 0.08],
      ];
      for (const [ratio, amp, dec] of P) partial(d, sr, f * ratio, amp, (D * dec) / 4.5, 0, r.next() * 6.28);
      let lp = 0;
      for (let i = 0; i < Math.floor(sr * 0.02); i++) {
        lp += 0.3 * (r.next() * 2 - 1 - lp);
        d[i] += lp * 0.6;
      }
      finish(d, sr, 2);
      break;
    }
    case 'glock': {
      const P: [number, number, number][] = [
        [1, 1, 1.5],
        [2.76, 0.38, 0.45],
        [5.4, 0.18, 0.2],
        [8.93, 0.07, 0.09],
      ];
      for (const [ratio, amp, tau] of P) partial(d, sr, f * ratio, amp, (tau * reg) / 2.3, 0, r.next() * 6.28);
      for (let i = 0; i < Math.floor(sr * 0.002); i++) d[i] += (r.next() * 2 - 1) * 0.25;
      finish(d, sr, 0.4);
      break;
    }
    case 'kalimba': {
      partial(d, sr, f, 1, 0.55 * reg, 0, 0);
      partial(d, sr, f * 5.95, 0.42, 0.05, 0, 0.5);
      partial(d, sr, f * 2.0, 0.08, 0.25, 0, 1.2);
      partial(d, sr, f * 3.01, 0.05, 0.08, 0, 2.1);
      for (let i = 0; i < Math.floor(sr * 0.0015); i++) d[i] += (r.next() * 2 - 1) * 0.3;
      finish(d, sr, 0.6);
      break;
    }
    case 'marimba': {
      partial(d, sr, f, 1, 0.42 * reg, 0, 0);
      partial(d, sr, f * 3.93, 0.32, 0.09 * reg, 0, 0.7);
      partial(d, sr, f * 9.24, 0.08, 0.025, 0, 1.4);
      partial(d, sr, f * 2, 0.06, 0.2 * reg, 0, 0.3);
      let lp = 0;
      for (let i = 0; i < Math.floor(sr * 0.006); i++) {
        lp += 0.35 * (r.next() * 2 - 1 - lp);
        d[i] += lp * 0.4;
      }
      finish(d, sr, 1.5);
      break;
    }
  }
  return { data: d, sr, f0 };
}
