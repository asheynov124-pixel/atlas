/**
 * OWNER: audio.
 * Soundscape — the world's ambient bed, steered ~4×/s by AudioEngine with an `AmbState` describing what the camera
 * sees: how close to the ground, how built-up the focus is, how big the city is, water / biome mix, night, air.
 *
 * Continuous beds (two shared noise sources feed every filter, so the cost is ~2 sources + a few filters):
 *   traffic hum (brown → lowpass)            murmur (pink → two wandering vowel bandpasses = distant voices)
 *   wind (pink → wandering bandpass + gusts)  surf (brown → lowpass with slow asymmetric swells)
 *   cicadas (pink → 5 kHz band, 38 Hz AM)     space hum (two low sines + a soft whoosh) for orbit & cosmos views
 * Events (Poisson, scaled by the state): birdsong (3 species), crickets, owls, frogs, gulls, car horns, distant
 * sirens, construction clanks (on growth near the camera), crystal tinkles, alien chirps, lava blorps, ice creaks.
 * When everything has been silent for a few seconds the graph is torn down to save CPU and rebuilt on demand.
 */
import { clamp, Prng, smooth, Voice, type Ctx, type NoiseBank } from './dsp';
import type { SampleBank } from './samples';

export interface AmbState {
  /** planet view, in game */
  active: boolean;
  /** 0..1 space hum (orbit or cosmos views) */
  space: number;
  /** 0 orbit … 1 street level */
  near: number;
  /** 0 day … 1 night */
  night: number;
  /** 0..1 how built-up the camera focus is */
  city: number;
  /** 0..1 city size (population, log scale) */
  cityGlobal: number;
  /** 0..1 water around the focus */
  water: number;
  birds: number;
  insects: number;
  cold: number;
  hot: number;
  lava: number;
  crystal: number;
  alien: number;
  swamp: number;
  /** 0..1 baseline windiness (planet / weather) */
  wind: number;
  /** 0..1 atmosphere density (how much sound carries) */
  atmo: number;
  paused: boolean;
}

export const EMPTY_AMB: AmbState = {
  active: false,
  space: 0,
  near: 0,
  night: 0,
  city: 0,
  cityGlobal: 0,
  water: 0,
  birds: 0,
  insects: 0,
  cold: 0,
  hot: 0,
  lava: 0,
  crystal: 0,
  alien: 0,
  swamp: 0,
  wind: 0,
  atmo: 1,
  paused: false,
};

interface Graph {
  srcs: AudioScheduledSourceNode[];
  traffic: GainNode;
  murmur: GainNode;
  m1: BiquadFilterNode;
  m2: BiquadFilterNode;
  mg1: GainNode;
  mg2: GainNode;
  wind: GainNode;
  windBp: BiquadFilterNode;
  surf: GainNode;
  cicada: GainNode;
  space: GainNode;
  all: AudioNode[];
}

export class Soundscape {
  private g: Graph | null = null;
  private silentFor = 0;
  private r = new Prng();
  private surfPhase = 0;
  private surfPeriod = 8;
  private gust = 0.8;
  private windF = 450;
  private construction = 0;
  /** last night value (dawn / dusk detection) */
  private prevNight = -1;
  /** remaining birds of a dawn chorus */
  private chorus = 0;
  /** seconds of extra cricket song after dusk */
  private dusk = 0;
  /** levels last applied (for debugging / tests) */
  readonly levels = { traffic: 0, murmur: 0, wind: 0, surf: 0, cicada: 0, space: 0 };
  events = 0;
  /** event voices still sounding: root nodes are disconnected once they have finished */
  private live: { v: Voice; nodes: AudioNode[] }[] = [];

  constructor(
    private ctx: Ctx,
    private noise: NoiseBank,
    private bank: SampleBank,
    private out: AudioNode,
    private rev: AudioNode,
  ) {}

  /** a building grew near the camera: a few distant construction clanks */
  construct(): void {
    this.construction = Math.min(3, this.construction + 1);
  }

  update(dt: number, s: AmbState, now: number): void {
    this.reap(now);
    const L = this.levels;
    const near = clamp(s.near, 0, 1);
    const z = 1 - near;
    const atmo = clamp(s.atmo, 0, 1);
    const act = s.active ? 1 : 0;
    const night = clamp(s.night, 0, 1);
    L.traffic = act * Math.pow(near, 1.3) * (0.12 + 0.88 * s.city) * clamp(s.cityGlobal * 1.4 + s.city * 0.6, 0, 1) * (s.paused ? 0.5 : 1) * (1 - 0.25 * night) * 0.5 * (0.4 + 0.6 * atmo);
    L.murmur = act * Math.pow(near, 1.6) * s.city * Math.sqrt(s.cityGlobal) * (1 - 0.6 * night) * 0.42 * atmo;
    L.wind =
      act *
      atmo *
      ((0.07 + 0.26 * s.wind) * (0.3 + 0.7 * smooth(0.1, 0.5, z)) * (1 - smooth(0.62, 0.92, z)) + 0.2 * (s.cold + s.hot) * near) *
      (1 - 0.75 * s.city * near);
    L.surf = act * s.water * Math.pow(near, 1.1) * atmo * 0.55;
    L.cicada = act * s.insects * (1 - night) * near * atmo * 0.1;
    L.space = clamp(s.space, 0, 1) * 0.2;

    const total = L.traffic + L.murmur + L.wind + L.surf + L.cicada + L.space;
    if (!this.g) {
      if (total < 0.004) return;
      this.build(now);
    }
    if (total < 0.004) {
      this.silentFor += dt;
      if (this.silentFor > 5) {
        this.teardown(now);
        return;
      }
    } else this.silentFor = 0;
    const g = this.g!;
    const tau = 0.7;
    g.traffic.gain.setTargetAtTime(L.traffic, now, tau);
    g.murmur.gain.setTargetAtTime(L.murmur, now, tau);
    g.cicada.gain.setTargetAtTime(L.cicada, now, tau);
    g.space.gain.setTargetAtTime(L.space, now, 1.2);
    // murmur: wandering vowels & syllable-rate level changes → distant voices
    if (L.murmur > 0.001) {
      g.m1.frequency.setTargetAtTime(this.r.range(380, 820), now, 0.09);
      g.m2.frequency.setTargetAtTime(this.r.range(1100, 2300), now, 0.09);
      g.mg1.gain.setTargetAtTime(this.r.range(0.25, 1), now, 0.07);
      g.mg2.gain.setTargetAtTime(this.r.range(0.15, 0.8), now, 0.07);
    }
    // wind: gusts & a wandering howl
    this.gust = clamp(this.gust + (this.r.next() - 0.5) * 0.35, 0.45, 1.25);
    this.windF = clamp(this.windF + (this.r.next() - 0.5) * 120, 260, 820);
    g.wind.gain.setTargetAtTime(L.wind * this.gust, now, 0.5);
    g.windBp.frequency.setTargetAtTime(this.windF, now, 0.6);
    // surf: slow asymmetric swells (quick rise, long wash)
    this.surfPhase += dt / this.surfPeriod;
    if (this.surfPhase >= 1) {
      this.surfPhase -= 1;
      this.surfPeriod = this.r.range(6, 10);
    }
    const ph = this.surfPhase;
    const sw = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) : Math.pow(1 - (ph - 0.3) / 0.7, 1.6);
    g.surf.gain.setTargetAtTime(L.surf * (0.3 + 0.7 * sw), now, 0.3);

    if (!s.active) {
      this.prevNight = -1;
      return;
    }
    // ── dawn chorus & dusk swell (the light changing at the camera focus)
    if (this.prevNight >= 0) {
      if (this.prevNight > 0.6 && night < 0.45 && s.birds > 0.15) this.chorus = 6 + Math.floor(this.r.next() * 6);
      if (this.prevNight < 0.4 && night > 0.6) this.dusk = 14;
    }
    this.prevNight = night;
    // ── events (Poisson over this update interval)
    const ev = (rate: number) => rate > 0 && this.r.next() < rate * dt;
    const free = (1 - s.city * 0.75) * near * atmo;
    if (this.chorus > 0 && free > 0.15 && ev(1.6)) {
      this.chorus--;
      this.bird(now);
    }
    if (this.dusk > 0) {
      this.dusk -= dt;
      if (ev(2.5 * Math.max(s.birds, s.insects) * free)) this.cricket(now);
      if (this.dusk <= 0 && s.birds > 0.3 && free > 0.3 && this.r.chance(0.5)) this.owl(now);
    }
    if (ev(0.75 * s.birds * (1 - night) * free)) this.bird(now);
    if (ev(2.4 * (s.birds * 0.6 + s.insects * 0.6) * night * free)) this.cricket(now);
    if (ev(0.035 * s.birds * night * free)) this.owl(now);
    if (ev(0.6 * s.swamp * night * free)) this.frog(now);
    if (ev(0.1 * s.water * (1 - night) * near * atmo)) this.gull(now);
    if (!s.paused && ev(0.09 * s.city * Math.sqrt(s.cityGlobal) * near * atmo)) this.horn(now);
    if (!s.paused && s.cityGlobal > 0.55 && ev(0.012 * near * atmo)) this.siren(now);
    if (ev(0.6 * s.crystal * near)) this.tinkle(now);
    if (ev(0.5 * s.alien * near * (0.4 + 0.6 * atmo))) this.alienChirp(now);
    if (ev(1.6 * s.lava * near)) this.blorp(now);
    if (ev(0.12 * s.cold * near)) this.creak(now);
    if (this.construction > 0 && near > 0.25 && ev(0.9)) {
      this.construction--;
      this.clanks(now, near);
    }
  }

  // ─────────────────────────────────────────── graph
  private build(now: number): void {
    const v = new Voice(this.ctx, this.noise, this.out, this.rev, now);
    const srcs: AudioScheduledSourceNode[] = [];
    const loopSrc = (kind: 'pink' | 'brown') => {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise.get(kind);
      s.loop = true;
      s.start(now, this.r.next() * 2);
      srcs.push(s);
      return s;
    };
    const pink = loopSrc('pink');
    const brown = loopSrc('brown');
    const all: AudioNode[] = [pink, brown];
    const mk = <T extends AudioNode>(n: T): T => {
      all.push(n);
      return n;
    };
    // traffic hum
    const tlp = mk(v.filt('lowpass', 320, 0.8, now));
    const tbp = mk(v.filt('peaking', 110, 1.2, now));
    tbp.gain.value = 6;
    const traffic = mk(v.gain(0));
    v.chain(brown, tlp, tbp, traffic);
    traffic.connect(this.out);
    // murmur (two wandering formants)
    const m1 = mk(v.filt('bandpass', 600, 3, now));
    const m2 = mk(v.filt('bandpass', 1600, 4, now));
    const mg1 = mk(v.gain(0.5));
    const mg2 = mk(v.gain(0.4));
    const murmur = mk(v.gain(0));
    pink.connect(m1);
    pink.connect(m2);
    m1.connect(mg1);
    m2.connect(mg2);
    mg1.connect(murmur);
    mg2.connect(murmur);
    murmur.connect(this.out);
    const mrev = mk(v.gain(0.4));
    murmur.connect(mrev);
    mrev.connect(this.rev);
    // wind
    const windBp = mk(v.filt('bandpass', 450, 1.8, now));
    const wlp = mk(v.filt('lowpass', 1400, 0.7, now));
    const wind = mk(v.gain(0));
    v.chain(pink, windBp, wind);
    const wbroad = mk(v.gain(0.35));
    v.chain(pink, wlp, wbroad, wind);
    wind.connect(this.out);
    // surf
    const slp = mk(v.filt('lowpass', 950, 0.7, now));
    const shp = mk(v.filt('highpass', 90, 0.7, now));
    const surf = mk(v.gain(0));
    v.chain(brown, slp, shp, surf);
    const sp = mk(v.gain(0.6));
    pink.connect(sp);
    sp.connect(slp);
    surf.connect(this.out);
    // cicadas
    const cbp = mk(v.filt('bandpass', 5200, 6, now));
    const cam = mk(v.gain(0.5));
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 38;
    srcs.push(lfo);
    lfo.start(now);
    const lg = mk(v.gain(0.5));
    lfo.connect(lg);
    lg.connect(cam.gain);
    const cicada = mk(v.gain(0));
    v.chain(pink, cbp, cam, cicada);
    cicada.connect(this.out);
    // space hum
    const space = mk(v.gain(0));
    for (const [f, a] of [
      [55, 0.5],
      [82.4, 0.25],
      [110.2, 0.12],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      o.start(now);
      srcs.push(o);
      const og = mk(v.gain(a));
      o.connect(og);
      og.connect(space);
    }
    const shlp = mk(v.filt('lowpass', 260, 0.7, now));
    const shg = mk(v.gain(0.5));
    v.chain(pink, shlp, shg, space);
    space.connect(this.out);
    const srev = mk(v.gain(0.5));
    space.connect(srev);
    srev.connect(this.rev);
    this.g = { srcs, traffic, murmur, m1, m2, mg1, mg2, wind, windBp, surf, cicada, space, all };
    this.silentFor = 0;
  }

  private teardown(now: number): void {
    const g = this.g;
    if (!g) return;
    this.g = null;
    for (const s of g.srcs) {
      try {
        s.stop(now + 0.05);
      } catch {
        /* ignore */
      }
    }
    for (const n of g.all) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  dispose(): void {
    this.teardown(this.ctx.currentTime);
    this.reap(Infinity);
  }

  // ─────────────────────────────────────────── events
  private voice(now: number, wet = 0.3): Voice {
    this.events++;
    const pan = typeof this.ctx.createStereoPanner === 'function' ? this.ctx.createStereoPanner() : null;
    const g = this.ctx.createGain();
    if (pan) {
      pan.pan.value = this.r.range(-0.85, 0.85);
      g.connect(pan);
      pan.connect(this.out);
    } else g.connect(this.out);
    const sg = this.ctx.createGain();
    sg.gain.value = wet;
    g.connect(sg);
    sg.connect(this.rev);
    const v = new Voice(this.ctx, this.noise, g, this.rev, now + 0.02 + this.r.next() * 0.1, 1, 0.5, this.r);
    this.live.push({ v, nodes: pan ? [g, pan, sg] : [g, sg] });
    return v;
  }

  private reap(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      if (now < e.v.end + 0.5) continue;
      for (const n of e.nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.live.splice(i, 1);
    }
  }

  private bird(now: number): void {
    const v = this.voice(now, 0.35);
    const r = this.r;
    const kind = r.int(0, 2);
    let t = v.t;
    const base = r.range(2400, 4200);
    if (kind === 0) {
      // tweets
      const n = r.int(2, 5);
      for (let i = 0; i < n; i++) {
        const f = base * r.range(0.9, 1.15);
        v.blip(t, 'sine', f, f * r.range(1.15, 1.45), r.range(0.03, 0.055), r.range(0.04, 0.07));
        t += r.range(0.07, 0.11);
      }
    } else if (kind === 1) {
      // warble
      const o = v.osc('sine', base * 0.8, t, t + 0.4);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 0.32);
      const vib = v.osc('sine', r.range(24, 36), t, t + 0.4);
      const vg = v.gain(base * 0.12);
      vib.connect(vg);
      vg.connect(o.frequency);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.035, 0.03, 0.25, 0.06);
      o.connect(g);
      g.connect(v.out);
    } else {
      // two-note whistle "whee-oo"
      const f = base * 0.6;
      const o = v.osc('sine', f, t, t + 0.6);
      o.frequency.exponentialRampToValueAtTime(f * 1.33, t + 0.16);
      o.frequency.setValueAtTime(f * 1.15, t + 0.26);
      o.frequency.exponentialRampToValueAtTime(f * 0.95, t + 0.5);
      const g = v.gain(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.04);
      g.gain.linearRampToValueAtTime(0.005, t + 0.22);
      g.gain.linearRampToValueAtTime(0.045, t + 0.28);
      g.gain.linearRampToValueAtTime(0, t + 0.55);
      o.connect(g);
      g.connect(v.out);
    }
  }

  private cricket(now: number): void {
    const v = this.voice(now, 0.25);
    const f = this.r.range(4100, 4800);
    const n = this.r.int(3, 4);
    const amp = this.r.range(0.012, 0.028);
    for (let i = 0; i < n; i++) v.blip(v.t + i * 0.032, 'sine', f, f * 0.98, amp, 0.016, v.out, 0.002);
  }

  private owl(now: number): void {
    const v = this.voice(now, 0.55);
    const t = v.t;
    const hoo = (at: number, d: number, a: number) => {
      const o = v.osc('sine', 390, at, at + d + 0.05);
      o.frequency.linearRampToValueAtTime(360, at + d);
      const g = v.gain(0);
      v.ahr(g.gain, at, a, 0.06, d * 0.5, d * 0.4);
      o.connect(g);
      g.connect(v.out);
    };
    hoo(t, 0.42, 0.05);
    hoo(t + 0.62, 0.16, 0.035);
    hoo(t + 0.84, 0.32, 0.045);
  }

  private frog(now: number): void {
    const v = this.voice(now, 0.2);
    const f = this.r.range(110, 210);
    for (let i = 0; i < 2; i++) {
      const t = v.t + i * 0.09;
      const o = v.osc('square', f, t, t + 0.06);
      o.frequency.linearRampToValueAtTime(f * 1.25, t + 0.05);
      const bp = v.filt('bandpass', 800, 4, t);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.06, 0.005, 0.03, 0.02);
      v.chain(o, bp, g);
      g.connect(v.out);
    }
  }

  private gull(now: number): void {
    const v = this.voice(now, 0.45);
    let t = v.t;
    const n = this.r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const d = i === 0 ? 0.36 : 0.16;
      const f = this.r.range(1500, 1800);
      const o = v.osc('triangle', f, t, t + d + 0.05);
      o.frequency.exponentialRampToValueAtTime(f * 0.68, t + d);
      const vib = v.osc('sine', 13, t, t + d + 0.05);
      const vg = v.gain(40);
      vib.connect(vg);
      vg.connect(o.frequency);
      const bp = v.filt('bandpass', 1800, 1, t);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.03, 0.02, d * 0.6, d * 0.4);
      v.chain(o, bp, g);
      g.connect(v.out);
      t += d + 0.08;
    }
  }

  private horn(now: number): void {
    const v = this.voice(now, 0.4);
    const n = this.r.chance(0.35) ? 2 : 1;
    const base = this.r.range(330, 420);
    const lp = v.filt('lowpass', this.r.range(900, 1800), 0.8, v.t);
    lp.connect(v.out);
    for (let k = 0; k < n; k++) {
      const t = v.t + k * 0.28;
      const d = this.r.range(0.12, 0.35);
      const g = v.gain(0);
      v.ahr(g.gain, t, 0.035, 0.01, d, 0.05);
      for (const f of [base, base * 1.26]) v.osc('square', f, t, t + d + 0.08).connect(g);
      g.connect(lp);
    }
  }

  private siren(now: number): void {
    const v = this.voice(now, 0.65);
    const t = v.t;
    const o = v.osc('triangle', 700, t, t + 3.2);
    for (let k = 0; k < 2; k++) {
      o.frequency.linearRampToValueAtTime(1000, t + k * 1.5 + 0.75);
      o.frequency.linearRampToValueAtTime(700, t + k * 1.5 + 1.5);
    }
    const lp = v.filt('lowpass', 1500, 0.7, t);
    const g = v.gain(0);
    v.ahr(g.gain, t, 0.014, 0.6, 1.8, 0.8);
    v.chain(o, lp, g);
    g.connect(v.out);
  }

  private clanks(now: number, near: number): void {
    const v = this.voice(now, 0.4);
    const n = this.r.int(2, 4);
    const a = 0.03 * (0.5 + 0.5 * near);
    for (let k = 0; k < n; k++) {
      const t = v.t + k * this.r.range(0.28, 0.5);
      v.grain(t, 'white', 'bandpass', this.r.range(1800, 3200), 10, a, 0.06);
      const f = this.r.range(900, 1400);
      v.blip(t, 'triangle', f, f * 0.97, a * 0.5, 0.12);
    }
  }

  private tinkle(now: number): void {
    const v = this.voice(now, 0.6);
    const notes = [84, 86, 88, 91, 93, 96, 98, 100];
    const n = this.r.int(1, 3);
    for (let k = 0; k < n; k++) {
      const { buf, rate } = this.bank.get('glock', this.r.pick(notes));
      const s = v.buffer(buf, v.t + k * this.r.range(0.08, 0.2), rate);
      const g = v.gain(this.r.range(0.02, 0.045));
      s.connect(g);
      g.connect(v.out);
    }
  }

  private alienChirp(now: number): void {
    const v = this.voice(now, 0.45);
    const t = v.t;
    const f = this.r.range(500, 1300);
    const o = v.osc('sine', f, t, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(f * this.r.range(1.4, 2.2), t + 0.15);
    o.frequency.exponentialRampToValueAtTime(f * this.r.range(0.6, 1), t + 0.42);
    const m = v.osc('sine', this.r.range(14, 40), t, t + 0.5);
    const mg = v.gain(f * 0.25);
    m.connect(mg);
    mg.connect(o.frequency);
    const g = v.gain(0);
    v.ahr(g.gain, t, 0.03, 0.03, 0.3, 0.12);
    o.connect(g);
    g.connect(v.out);
  }

  private blorp(now: number): void {
    const v = this.voice(now, 0.2);
    const f = this.r.range(110, 260);
    v.blip(v.t, 'sine', f, f * this.r.range(2.2, 3.2), 0.05, 0.06);
    v.grain(v.t, 'brown', 'lowpass', 400, 0.7, 0.04, 0.08);
  }

  private creak(now: number): void {
    const v = this.voice(now, 0.5);
    const t = v.t;
    const o = v.osc('sawtooth', this.r.range(90, 140), t, t + 0.6);
    o.frequency.linearRampToValueAtTime(this.r.range(70, 110), t + 0.55);
    const bp = v.filt('bandpass', 520, 9, t);
    const g = v.gain(0);
    v.ahr(g.gain, t, 0.03, 0.1, 0.3, 0.15);
    v.chain(o, bp, g);
    g.connect(v.out);
  }
}
