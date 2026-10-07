/**
 * OWNER: audio.
 * DSP toolkit shared by SFX, loops, music and ambience. Everything here works on any BaseAudioContext (live
 * AudioContext or OfflineAudioContext — the latter is used by `AudioEngine.diagnose()` to measure every sound).
 *
 *   NoiseBank      white / pink / brown noise + crackle / rain / vinyl textures, generated once in JS (shared across
 *                  contexts — AudioBuffers are context-independent)
 *   makeImpulse    algorithmic reverb impulse response (early reflections + decorrelated, darkening exponential tail)
 *   Voice          tiny node-graph builder used by every synthesised sound: osc / noise / filter / gain / shaper /
 *                  pan + envelope helpers. All sources are started AND stopped at scheduled times, so a finished voice
 *                  needs nothing but `out.disconnect()` to be garbage collected.
 *   Prng           fast xorshift for audio-only variation (never used for world content)
 */

export type Ctx = BaseAudioContext;
export type NoiseKind = 'white' | 'pink' | 'brown' | 'crackle' | 'rain' | 'vinyl' | 'grit';
export const NOISE_KINDS: readonly NoiseKind[] = ['white', 'pink', 'brown', 'crackle', 'rain', 'vinyl', 'grit'];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** MIDI note → Hz */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** settings slider 0..1 → perceptual gain */
export const volCurve = (v: number): number => Math.pow(clamp(v, 0, 1), 1.6);

/** xorshift32 — audio variation only. */
export class Prng {
  private s: number;
  constructor(seed = (Date.now() ^ 0x5bd1e995) >>> 0) {
    this.s = seed >>> 0 || 0x2545f491;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  /** ±1 */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

export const rnd = new Prng();

// ─────────────────────────────────────────────────────────────── buffers

function newBuffer(ctx: Ctx, channels: number, length: number, sampleRate: number): AudioBuffer {
  return ctx.createBuffer(channels, Math.max(1, Math.floor(length)), sampleRate);
}

/** Lazily generated noise & texture buffers (shared by every context of the page). */
export class NoiseBank {
  private bufs = new Map<NoiseKind, AudioBuffer>();
  constructor(private ctx: Ctx) {}

  get(kind: NoiseKind): AudioBuffer {
    let b = this.bufs.get(kind);
    if (!b) {
      b = this.make(kind);
      this.bufs.set(kind, b);
    }
    return b;
  }

  /** generate everything up-front */
  warmAll(): void {
    for (const k of NOISE_KINDS) this.get(k);
  }

  /** generate one missing texture (amortised warm-up, one per frame); false when all exist */
  warmOne(): boolean {
    for (const k of NOISE_KINDS) {
      if (!this.bufs.has(k)) {
        this.get(k);
        return true;
      }
    }
    return false;
  }

  private make(kind: NoiseKind): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const r = new Prng(0x1234 + kind.length * 977);
    const secs = kind === 'white' || kind === 'pink' || kind === 'brown' ? 2.5 : kind === 'vinyl' ? 4 : 3;
    const len = Math.floor(sr * secs);
    const buf = newBuffer(this.ctx, 1, len, sr);
    const d = buf.getChannelData(0);
    switch (kind) {
      case 'white':
        for (let i = 0; i < len; i++) d[i] = r.next() * 2 - 1;
        break;
      case 'pink': {
        // Paul Kellet's economy pink filter
        let b0 = 0,
          b1 = 0,
          b2 = 0;
        for (let i = 0; i < len; i++) {
          const w = r.next() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
        break;
      }
      case 'brown': {
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = r.next() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
        break;
      }
      case 'crackle': {
        // fire: low roar bed + random pops with exponential tails
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = r.next() * 2 - 1;
          last = (last + 0.04 * w) / 1.04;
          d[i] = last * 1.6;
        }
        const pops = Math.floor(secs * 38);
        for (let p = 0; p < pops; p++) {
          const at = Math.floor(r.next() * len);
          const amp = Math.pow(r.next(), 2.2) * 0.9 + 0.05;
          const tau = sr * (0.0008 + r.next() * 0.004);
          const n = Math.min(len - at, Math.floor(tau * 6));
          for (let j = 0; j < n; j++) d[at + j] += (r.next() * 2 - 1) * amp * Math.exp(-j / tau);
        }
        break;
      }
      case 'rain': {
        // dense hiss + thousands of tiny droplets (short resonant blips)
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const w = r.next() * 2 - 1;
          lp += 0.35 * (w - lp);
          d[i] = (w - lp) * 0.22;
        }
        const drops = Math.floor(secs * 260);
        for (let p = 0; p < drops; p++) {
          const at = Math.floor(r.next() * len);
          const f = 1800 + r.next() * 5200;
          const amp = Math.pow(r.next(), 3) * 0.6 + 0.02;
          const tau = sr * (0.0006 + r.next() * 0.0025);
          const n = Math.min(len - at, Math.floor(tau * 5));
          const w = (2 * Math.PI * f) / sr;
          for (let j = 0; j < n; j++) d[at + j] += Math.sin(w * j) * amp * Math.exp(-j / tau);
        }
        break;
      }
      case 'vinyl': {
        // lo-fi record crackle: faint hiss + sparse clicks + rare pops
        for (let i = 0; i < len; i++) d[i] = (r.next() * 2 - 1) * 0.012;
        const clicks = Math.floor(secs * 14);
        for (let p = 0; p < clicks; p++) {
          const at = Math.floor(r.next() * (len - 64));
          const amp = (r.next() < 0.12 ? 0.55 : 0.18) * (0.4 + r.next());
          const sgn = r.next() < 0.5 ? -1 : 1;
          for (let j = 0; j < 24; j++) d[at + j] += sgn * amp * Math.exp(-j / 3) * (j % 2 ? -0.6 : 1);
        }
        break;
      }
      case 'grit': {
        // granular grit: bursts of sparse impulses (black holes, debris, ice)
        for (let i = 0; i < len; i++) d[i] = 0;
        const grains = Math.floor(secs * 900);
        for (let p = 0; p < grains; p++) {
          const at = Math.floor(r.next() * (len - 40));
          const amp = Math.pow(r.next(), 4) * 0.9;
          for (let j = 0; j < 30; j++) d[at + j] += (r.next() * 2 - 1) * amp * Math.exp(-j / 6);
        }
        break;
      }
    }
    // normalise peak to 0.9 and remove DC
    let peak = 0,
      mean = 0;
    for (let i = 0; i < len; i++) mean += d[i];
    mean /= len;
    for (let i = 0; i < len; i++) {
      d[i] -= mean;
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0) {
      const k = 0.9 / peak;
      for (let i = 0; i < len; i++) d[i] *= k;
    }
    // short crossfade so loops are seamless
    const xf = Math.min(Math.floor(sr * 0.03), len >> 2);
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      d[i] = d[i] * t + d[len - xf + i] * (1 - t);
    }
    return buf;
  }
}

/**
 * Algorithmic reverb impulse response: a few discrete early reflections, then decorrelated stereo noise with an
 * exponential decay whose spectrum darkens over time (one-pole lowpass whose cutoff falls with t).
 */
export function makeImpulse(ctx: Ctx, seconds: number, opts: { predelay?: number; bright?: number; early?: number; seed?: number } = {}): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = newBuffer(ctx, 2, len, sr);
  const r = new Prng(opts.seed ?? 0xbeef);
  const pre = Math.floor(sr * (opts.predelay ?? 0.018));
  const bright = opts.bright ?? 0.6;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      const env = Math.pow(1 - t, 2.2) * Math.exp(-t * 3.2);
      // cutoff coefficient decreasing over the tail (bright start, dark end)
      const a = clamp(bright * (1 - t * 0.85), 0.04, 0.98);
      const w = r.next() * 2 - 1;
      lp += a * (w - lp);
      d[i] = lp * env;
    }
    // early reflections
    const early = opts.early ?? 0.5;
    for (let k = 0; k < 9; k++) {
      const at = pre + Math.floor(sr * (0.004 + r.next() * 0.075));
      if (at < len) d[at] += (r.next() < 0.5 ? -1 : 1) * early * (0.9 - k * 0.07);
    }
    // fade in to soften the onset
    const fi = Math.floor(sr * 0.004);
    for (let i = 0; i < fi && pre + i < len; i++) d[pre + i] *= i / fi;
  }
  // normalise energy so different lengths sound similar in level
  let e = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) e += d[i] * d[i];
  }
  const k = 1 / Math.sqrt(Math.max(1e-9, e / 2)) * 0.9;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  return buf;
}

const curveCache = new Map<number, Float32Array<ArrayBuffer>>();
/** soft-clip transfer curve (tanh-ish), cached by amount */
export function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(amount * 10);
  let c = curveCache.get(key);
  if (c) return c;
  const n = 1024;
  c = new Float32Array(new ArrayBuffer(n * 4));
  const k = Math.max(0.1, key / 10);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  curveCache.set(key, c);
  return c;
}

const waveCache = new WeakMap<Ctx, Map<string, PeriodicWave>>();
/** Warm band-limited waves: 'warm' (soft saw), 'hollow' (odd harmonics, soft square), 'organ', 'glass'. */
export function periodicWave(ctx: Ctx, kind: 'warm' | 'hollow' | 'organ' | 'reed'): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  let w = m.get(kind);
  if (w) return w;
  const N = 24;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    let a = 0;
    if (kind === 'warm') a = 1 / Math.pow(n, 1.45);
    else if (kind === 'hollow') a = n % 2 ? 1 / Math.pow(n, 1.2) : 0.04 / n;
    else if (kind === 'organ') a = n === 1 ? 1 : n === 2 ? 0.55 : n === 3 ? 0.3 : n === 4 ? 0.22 : n === 6 ? 0.12 : n === 8 ? 0.1 : 0.01 / n;
    else a = (n <= 6 ? 0.8 : 1.2 / n) * (n % 3 === 0 ? 0.4 : 1) / Math.sqrt(n);
    im[n] = a;
  }
  w = ctx.createPeriodicWave(re, im, { disableNormalization: false });
  m.set(kind, w);
  return w;
}

// ─────────────────────────────────────────────────────────────── voice builder

export type OscKind = OscillatorType | 'warm' | 'hollow' | 'organ' | 'reed';

/**
 * Builder for one synthesised event. `out` is the voice output (connect it wherever); `t` the start time.
 * `p` = pitch multiplier, `far` = 0 (close) … 1 (distant: duller, more reverb).
 */
export class Voice {
  readonly nyq: number;
  /** latest scheduled stop time of any source (→ voice length) */
  end: number;
  constructor(
    readonly ctx: Ctx,
    readonly noise: NoiseBank,
    readonly out: AudioNode,
    /** reverb send input (may be null) */
    readonly rev: AudioNode | null,
    readonly t: number,
    readonly p = 1,
    readonly far = 0,
    readonly r: Prng = rnd,
  ) {
    this.nyq = ctx.sampleRate * 0.45;
    this.end = t;
  }

  /** clamp a frequency into the valid range (low end allows sub-audio LFO rates) */
  f(hz: number): number {
    return clamp(hz, 0.05, this.nyq);
  }

  osc(kind: OscKind, freq: number, t0 = this.t, t1 = t0 + 1, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (kind === 'warm' || kind === 'hollow' || kind === 'organ' || kind === 'reed') o.setPeriodicWave(periodicWave(this.ctx, kind));
    else o.type = kind;
    o.frequency.setValueAtTime(this.f(freq), t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    o.start(t0);
    o.stop(t1);
    if (t1 > this.end) this.end = t1;
    return o;
  }

  noiseSrc(kind: NoiseKind, t0 = this.t, t1 = t0 + 1, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    const b = this.noise.get(kind);
    s.buffer = b;
    s.loop = true;
    s.playbackRate.setValueAtTime(rate, t0);
    const off = this.r.next() * Math.max(0, b.duration - 0.1);
    s.start(t0, off);
    s.stop(t1);
    if (t1 > this.end) this.end = t1;
    return s;
  }

  buffer(buf: AudioBuffer, t0 = this.t, rate = 1, t1 = t0 + buf.duration / Math.max(0.05, rate)): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.setValueAtTime(rate, t0);
    s.start(t0);
    s.stop(t1);
    if (t1 > this.end) this.end = t1;
    return s;
  }

  gain(v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filt(type: BiquadFilterType, freq: number, q = 0.707, t0 = this.t): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(this.f(freq), t0);
    f.Q.setValueAtTime(q, t0);
    return f;
  }

  shaper(amount: number): WaveShaperNode {
    const s = this.ctx.createWaveShaper();
    s.curve = driveCurve(amount);
    s.oversample = 'none';
    return s;
  }

  pan(x: number): AudioNode {
    if (typeof this.ctx.createStereoPanner !== 'function') return this.gain(1);
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(x, -1, 1);
    return p;
  }

  /** connect nodes in series; returns the first */
  chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[0];
  }

  /** route a node to the voice output (and optionally the reverb send at `wet`) */
  toOut(node: AudioNode, wet = 0): void {
    node.connect(this.out);
    if (wet > 0 && this.rev) {
      const s = this.gain(wet);
      node.connect(s);
      s.connect(this.rev);
    }
  }

  /** percussive envelope: 0 → peak in `a`, exponential fall to silence over `d` */
  perc(param: AudioParam, t: number, peak: number, a: number, d: number): number {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
    param.setTargetAtTime(0, t + a, d / 5);
    param.setValueAtTime(0, t + a + d + 0.01);
    return t + a + d;
  }

  /** attack / hold / release envelope */
  ahr(param: AudioParam, t: number, peak: number, a: number, h: number, r: number): number {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + Math.max(0.002, a));
    param.setValueAtTime(peak, t + a + h);
    param.linearRampToValueAtTime(0, t + a + h + Math.max(0.005, r));
    return t + a + h + r;
  }

  /** exponential sweep of a frequency-like param */
  sweep(param: AudioParam, t: number, from: number, to: number, dur: number): void {
    param.setValueAtTime(this.f(from), t);
    param.exponentialRampToValueAtTime(this.f(to), t + Math.max(0.005, dur));
  }

  /** a short filtered noise grain (debris, droplets, clicks) */
  grain(t: number, kind: NoiseKind, type: BiquadFilterType, freq: number, q: number, amp: number, dur: number, dest: AudioNode = this.out, pan = 0): void {
    const s = this.noiseSrc(kind, t, t + dur + 0.02);
    const f = this.filt(type, freq, q, t);
    const g = this.gain(0);
    this.perc(g.gain, t, amp, 0.002, dur);
    if (pan && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.pan(pan);
      this.chain(s, f, g, p);
      p.connect(dest);
    } else {
      this.chain(s, f, g);
      g.connect(dest);
    }
  }

  /** a short pitched blip (sine/triangle) with optional pitch glide */
  blip(t: number, kind: OscKind, f0: number, f1: number, amp: number, dur: number, dest: AudioNode = this.out, a = 0.003): void {
    const o = this.osc(kind, f0, t, t + dur + 0.03);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(this.f(f1), t + dur);
    const g = this.gain(0);
    this.perc(g.gain, t, amp, a, dur);
    this.chain(o, g);
    g.connect(dest);
  }
}
