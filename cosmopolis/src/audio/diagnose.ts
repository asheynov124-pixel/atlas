/**
 * OWNER: audio.
 * Offline diagnostics: renders every SFX, loop and music mood through an OfflineAudioContext (same recipes, same
 * reverb / delay topology as the live graph, minus the master dynamics) and measures each result:
 *   peak · RMS (over the audible part) · onset · audible duration (last sample above −60 dBFS) · clipped samples ·
 *   NaN / Inf · for loops: sustained level in the last seconds · for moods: 2-second RMS windows (no dead air).
 * Exposed as `game.audio.diagnose()` (and `&audiodiag=1`); used by the headless verification script because
 * nothing can be listened to in CI.
 */
import type { LoopName, MusicMood, SfxName } from '../core/types';
import { makeImpulse, NoiseBank, Voice } from './dsp';
import { LOOPS, LoopKit } from './loops';
import { createMood, MOODS } from './moods';
import type { MusicEnv } from './player';
import { SampleBank } from './samples';
import { SFX } from './sfx';

export interface DiagnoseOptions {
  sfx?: SfxName[] | boolean;
  loops?: LoopName[] | boolean;
  moods?: MusicMood[] | boolean;
  /** seconds rendered per mood (default 16) */
  moodSeconds?: number;
  sampleRate?: number;
}

export interface SoundStats {
  name: string;
  kind: 'sfx' | 'loop' | 'mood';
  peak: number;
  rms: number;
  onset: number;
  duration: number;
  clipped: number;
  /** loops: RMS of the final 2 s · moods: minimum 2-s window RMS after the intro */
  sustain?: number;
  windows?: number[];
  ms: number;
  ok: boolean;
  issues: string[];
}

export interface DiagnoseReport {
  sampleRate: number;
  items: SoundStats[];
  summary: { total: number; ok: number; issues: string[]; ms: number };
}

type OAC = typeof OfflineAudioContext;

function analyse(buf: AudioBuffer, name: string, kind: SoundStats['kind']): SoundStats {
  const sr = buf.sampleRate;
  const n = buf.length;
  let peak = 0;
  let first = -1;
  let last = -1;
  let clipped = 0;
  let bad = false;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    for (const d of chans) {
      const x = d[i];
      if (!Number.isFinite(x)) {
        bad = true;
        continue;
      }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      if (a > 0.001) {
        if (first < 0) first = i;
        last = i;
      }
    }
  }
  let sum = 0;
  let cnt = 0;
  if (first >= 0) {
    for (let i = first; i <= last; i++) for (const d of chans) {
      const x = d[i];
      if (Number.isFinite(x)) {
        sum += x * x;
        cnt++;
      }
    }
  }
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return {
    name,
    kind,
    peak: r(peak),
    rms: r(cnt ? Math.sqrt(sum / cnt) : 0),
    onset: r(first < 0 ? -1 : first / sr),
    duration: r(last < 0 ? 0 : last / sr),
    clipped,
    ms: 0,
    ok: !bad,
    issues: bad ? ['NaN/Inf samples'] : [],
  };
}

function windowRms(buf: AudioBuffer, from: number, win: number): number[] {
  const sr = buf.sampleRate;
  const out: number[] = [];
  const d0 = buf.getChannelData(0);
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  for (let s = Math.floor(from * sr); s + win * sr <= buf.length; s += Math.floor(win * sr)) {
    let sum = 0;
    const e = s + Math.floor(win * sr);
    for (let i = s; i < e; i++) sum += d0[i] * d0[i] + d1[i] * d1[i];
    out.push(Math.round(Math.sqrt(sum / (2 * (e - s))) * 10000) / 10000);
  }
  return out;
}

interface Rig {
  ctx: OfflineAudioContext;
  noise: NoiseBank;
  out: GainNode;
  rev: GainNode;
  dly: GainNode;
  delay: DelayNode;
  fb: GainNode;
}

function rig(Ctor: OAC, seconds: number, sr: number): Rig {
  const ctx = new Ctor(2, Math.ceil(seconds * sr), sr);
  const noise = new NoiseBank(ctx);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const rev = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.4, { predelay: 0.02, bright: 0.55 });
  const rg = ctx.createGain();
  rg.gain.value = 0.6;
  rev.connect(conv);
  conv.connect(rg);
  rg.connect(ctx.destination);
  const dly = ctx.createGain();
  const delay = ctx.createDelay(3);
  delay.delayTime.value = 0.5;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  dly.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  const dout = ctx.createGain();
  dout.gain.value = 0.5;
  delay.connect(dout);
  dout.connect(ctx.destination);
  return { ctx, noise, out, rev, dly, delay, fb };
}

const pick = <T extends string>(v: T[] | boolean | undefined, all: readonly T[]): T[] => (v === false ? [] : Array.isArray(v) ? v : [...all]);

export async function diagnose(opts: DiagnoseOptions = {}, shared?: SampleBank): Promise<DiagnoseReport> {
  const Ctor = (globalThis as { OfflineAudioContext?: OAC; webkitOfflineAudioContext?: OAC }).OfflineAudioContext ?? (globalThis as { webkitOfflineAudioContext?: OAC }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error('OfflineAudioContext unavailable');
  const sr = opts.sampleRate ?? 44100;
  const t0 = performance.now();
  const items: SoundStats[] = [];
  let bank = shared;

  for (const name of pick(opts.sfx, Object.keys(SFX) as SfxName[])) {
    const def = SFX[name];
    const a = performance.now();
    const R = rig(Ctor, 8, sr);
    bank ??= new SampleBank(R.ctx);
    const v = new Voice(R.ctx, R.noise, R.out, R.rev, 0.02, 1, 0);
    R.out.gain.value = def.gain;
    const send = R.ctx.createGain();
    send.gain.value = def.wet;
    R.out.connect(send);
    send.connect(R.rev);
    def.play(v, { bank });
    const buf = await R.ctx.startRendering();
    const st = analyse(buf, name, 'sfx');
    st.ms = Math.round(performance.now() - a);
    const minPeak = def.ui ? 0.02 : 0.06;
    if (st.peak < 0.005) st.issues.push('silent');
    else if (st.peak < minPeak) st.issues.push('quiet');
    if (st.peak > 1.4) st.issues.push('hot');
    if (st.duration > 9) st.issues.push('long');
    if (v.end - 0.02 > 7.5) st.issues.push('voice longer than render');
    st.ok = st.issues.length === 0;
    items.push(st);
  }

  for (const name of pick(opts.loops, Object.keys(LOOPS) as LoopName[])) {
    const def = LOOPS[name];
    const a = performance.now();
    const R = rig(Ctor, 6, sr);
    const kit = new LoopKit(R.ctx, R.noise, R.out, null, 0);
    const lv = def.build(kit);
    R.out.gain.value = def.gain * 0.6;
    lv.out.connect(R.out);
    for (let t = 0; t < 6; t += 0.1) lv.tick?.(t, 0.6);
    const buf = await R.ctx.startRendering();
    const st = analyse(buf, name, 'loop');
    st.ms = Math.round(performance.now() - a);
    const w = windowRms(buf, 4, 2);
    st.sustain = w[0] ?? 0;
    if (st.peak < 0.005) st.issues.push('silent');
    if ((st.sustain ?? 0) < 0.01) st.issues.push('does not sustain');
    if (st.peak > 1.4) st.issues.push('hot');
    st.ok = st.issues.length === 0;
    items.push(st);
  }

  const secs = opts.moodSeconds ?? 16;
  for (const mood of pick(opts.moods, MOODS)) {
    const a = performance.now();
    const R = rig(Ctor, secs, sr);
    bank ??= new SampleBank(R.ctx);
    const env: MusicEnv = {
      ctx: R.ctx,
      noise: R.noise,
      bank,
      input: R.out,
      rev: R.rev,
      dly: R.dly,
      setDelay: (s, f) => {
        R.delay.delayTime.value = s;
        R.fb.gain.value = f;
      },
    };
    const p = createMood(mood, env, 4242);
    env.setDelay((p.delayBeats * 60) / p.bpm, p.delayFeedback, 0);
    p.start(0, 1);
    p.pump(secs - 0.5, 0);
    const buf = await R.ctx.startRendering();
    const st = analyse(buf, mood, 'mood');
    st.ms = Math.round(performance.now() - a);
    st.windows = windowRms(buf, 0, 2);
    st.sustain = Math.min(...st.windows.slice(1));
    if (st.peak < 0.01) st.issues.push('silent');
    if ((st.sustain ?? 0) < 0.004) st.issues.push('dead air');
    if (st.peak > 1.6) st.issues.push('hot');
    st.ok = st.issues.length === 0;
    items.push(st);
  }

  const issues = items.filter((i) => !i.ok).map((i) => `${i.kind}:${i.name}(${i.issues.join(',')})`);
  return {
    sampleRate: sr,
    items,
    summary: { total: items.length, ok: items.length - issues.length, issues, ms: Math.round(performance.now() - t0) },
  };
}
