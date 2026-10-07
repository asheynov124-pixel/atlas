/**
 * OWNER: audio.
 * AudioEngine — 100% procedural Web Audio for Cosmopolis: generative music, a synthesised voice for every SfxName,
 * loops for every LoopName and a living soundscape. Nothing is loaded from disk.
 *
 *   music        8 moods (music.ts / moods.ts) chosen automatically: main menu → menu · system view → space ·
 *                galaxy & universe → galaxy · Architect Studio → studio · planet → day / night (env.daylight at the
 *                camera focus, hysteresis) · destructive god powers → tension, planet-ending ones → apocalypse.
 *                Crossfades between moods; explicit setMood() calls are honoured as hints for a few seconds.
 *                City size and game speed raise the music's energy sections; milestones & unlocks add an arpeggio
 *                flourish in key; month ends in the black ring a soft coin. Instrument samples, noise textures and
 *                the reverb IR are synthesised in a Web Worker (synth.ts) so warming up never costs a frame.
 *   sfx          sfx.ts — UI clicks, building thunks, rewards, elements, creatures, cosmic catastrophes. Voice cap
 *                (28) with priority stealing, per-sound rate limits and caps, random pitch variance, distance-ish
 *                colouring from the camera zoom (far = duller, softer, wetter), music & ambience ducking under big
 *                sounds.
 *                Tonal sounds (chimes, coins, fanfares, unlocks) are transposed into the key of the music playing,
 *                and player placements get a category accent (accents.ts: power sparks, park birdsong, station chime…).
 *   loops        loops.ts — smooth fade in / out, live volume, auto-stop when the planet unloads.
 *   soundscape   ambience.ts — city bed scaled by population & camera zoom, biome nature, surf, orbit hum.
 *   global       soft click on any plain <button> press (ui-core Buttons play their own), settings applied live
 *                (masterVolume / musicVolume / sfxVolume / muted), suspends when the page is hidden or muted,
 *                iOS unlock on the first gesture (resume + silent buffer), algorithmic reverb + tempo delay,
 *                master compressor → limiter. Scheduling uses a lookahead on the audio clock; no per-frame
 *                allocations beyond the nodes of newly started sounds.
 *
 * CONTRACT (unchanged): unlocked · mood · unlock() · sfx(name, opts?) · loop(name, opts?) → LoopHandle ·
 *   setMood(mood) · update(dt)
 * Extras: moodOverride (null = automatic) · sfxAt(name, worldPos, opts?) · stopLoops(fade?) · state() (debug
 *   snapshot) · diagnose(opts?) → Promise<report> (renders every sfx / loop / mood offline and measures peak,
 *   RMS, duration, clipping) · context (AudioContext | null)
 * URL params: &audio=0 (disable) · &mood=<MusicMood> (pin a mood) · &audiodiag=1 (log a diagnose() report)
 */
import { bus } from '../core/events';
import { settings } from '../core/settings';
import { Biome, Feature, type LoopName, type MusicMood, type SfxName } from '../core/types';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { Planet } from '../world/planet';
import { shared } from '../render/materials';
import { ui } from '../ui/store';
import { EMPTY_AMB, Soundscape, type AmbState } from './ambience';
import { clamp, makeImpulse, NOISE_KINDS, NoiseBank, rnd, smooth, toBuffer, Voice, volCurve } from './dsp';
import { LOOPS, LoopKit, type LoopVoice } from './loops';
import { MusicEngine } from './music';
import { MOODS, WARM } from './moods';
import { SampleBank } from './samples';
import { SynthClient } from './synth';
import { SFX, type SfxDef } from './sfx';
import { ACCENTS } from './accents';
import { getItem } from '../content/catalog';
import { diagnose, type DiagnoseOptions, type DiagnoseReport } from './diagnose';

/** profiling helper: record the worst section time, return a fresh timestamp */
function lap(p: Record<string, number>, k: string, t: number): number {
  const n = performance.now();
  if (n - t > p[k]) p[k] = Math.round((n - t) * 100) / 100;
  return n;
}

export interface SfxOpts {
  volume?: number;
  /** playback-rate multiplier */
  pitch?: number;
  /** −1..1 */
  pan?: number;
}

export interface LoopHandle {
  setVolume(v: number): void;
  stop(fadeSeconds?: number): void;
}

const MAX_VOICES = 28;
const MAX_LOOPS = 16;

interface ActiveVoice {
  name: string;
  start: number;
  end: number;
  prio: number;
  gain: GainNode;
  nodes: AudioNode[];
}

interface DisasterEntry {
  count: number;
  apoc: boolean;
  until: number;
}

/** AudioContext constructor (webkit-prefixed on old iOS) */
function audioCtor(): typeof AudioContext | undefined {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext;
}

/** Live loop instance (also a LoopHandle). Starts lazily when the audio context is running. */
class LoopInst implements LoopHandle {
  voice: LoopVoice | null = null;
  gain: GainNode | null = null;
  send: GainNode | null = null;
  stopped = false;
  deadAt = Infinity;
  constructor(
    private eng: AudioEngine,
    readonly name: LoopName,
    public vol: number,
  ) {}

  start(): void {
    if (this.voice || this.stopped) return;
    const e = this.eng;
    const ctx = e.context;
    const n = e.noiseBank;
    if (!ctx || !n || !e.sfxIn) return;
    const def = LOOPS[this.name];
    if (!def) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(def.gain * this.vol, now + 0.8);
    try {
      const kit = new LoopKit(ctx, n, g, null, now + 0.01);
      this.voice = def.build(kit);
      this.voice.out.connect(g);
    } catch (err) {
      console.error('[audio] loop build failed', this.name, err);
      this.stopped = true;
      this.deadAt = 0;
      return;
    }
    g.connect(e.sfxIn);
    if (e.revIn) {
      const s = ctx.createGain();
      s.gain.value = 0.12;
      g.connect(s);
      s.connect(e.revIn);
      this.send = s;
    }
    this.gain = g;
  }

  setVolume(v: number): void {
    this.vol = clamp(Number.isFinite(v) ? v : 0, 0, 2);
    const ctx = this.eng.context;
    if (!this.gain || !ctx || this.stopped) return;
    this.gain.gain.setTargetAtTime(LOOPS[this.name].gain * this.vol, ctx.currentTime, 0.12);
  }

  stop(fade = 1): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.eng.context;
    if (!ctx || !this.gain || !this.voice) {
      this.deadAt = 0;
      return;
    }
    const now = ctx.currentTime;
    const f = Math.max(0.02, Number.isFinite(fade) ? fade : 1);
    const g = this.gain.gain;
    const cur = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    g.linearRampToValueAtTime(0, now + f);
    this.voice.stop(now + f + 0.05);
    this.deadAt = now + f + 0.3;
  }

  tick(now: number): void {
    if (this.voice?.tick && !this.stopped) this.voice.tick(now, this.vol);
  }

  dispose(): void {
    for (const n of [this.gain, this.send, this.voice?.out]) {
      try {
        n?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.voice = null;
    this.gain = null;
  }
}

export class AudioEngine implements System {
  unlocked = false;
  mood: MusicMood = 'menu';
  /** pin a mood (debug / settings); null = automatic */
  moodOverride: MusicMood | null = null;
  enabled = true;

  private ctx: AudioContext | null = null;
  private noise: NoiseBank | null = null;
  private bank: SampleBank | null = null;
  private music: MusicEngine | null = null;
  private scape: Soundscape | null = null;
  // graph
  private master: GainNode | null = null;
  private musicVol: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private sfxVol: GainNode | null = null;
  private uiVol: GainNode | null = null;
  private ambVol: GainNode | null = null;
  private ambDuck: GainNode | null = null;
  private rev: GainNode | null = null;
  private dly: DelayNode | null = null;
  private dlyIn: GainNode | null = null;
  private dlyFb: GainNode | null = null;
  private conv: ConvolverNode | null = null;
  private synth: SynthClient | null = null;
  // state
  private voices: ActiveVoice[] = [];
  private lastPlay = new Map<string, number>();
  private lastAccentAt = 0;
  private lastFlourishAt = 0;
  private lastMonthAt = 0;
  private loops: LoopInst[] = [];
  private pending: { name: SfxName; opts?: SfxOpts; at: number }[] = [];
  private resuming = false;
  private lastSfxAt = 0;
  private lastClickAt = 0;
  private lastPlaceAt = 0;
  private duckUntil = 0;
  private moodTimer = 0;
  private ambTimer = 0;
  private sampleTimer = 0;
  private moodChangedAt = -1e9;
  private hint: { mood: MusicMood; at: number } | null = null;
  private night = false;
  private disasters = new Map<string, DisasterEntry>();
  private amb: AmbState = { ...EMPTY_AMB };
  private local = { city: 0, water: 0, birds: 0, insects: 0, cold: 0, hot: 0, lava: 0, crystal: 0, alien: 0, swamp: 0 };
  private offs: (() => void)[] = [];
  private listening = false;
  private diagRequested = false;
  private frames = 0;
  private decisions = 0;
  /** worst-case milliseconds per update section (debug) */
  private prof: Record<string, number> = { mood: 0, music: 0, warm: 0, voices: 0, amb: 0 };
  /** a mood is waiting for its samples to be rendered before it starts */
  private waitingMood = false;
  /** music breathers: day / night music rests every few minutes so the soundscape can breathe */
  private playingSince = 0;
  private restUntil = 0;
  private restAfter = 210 + Math.random() * 120;

  constructor(private game: Game) {}

  // ─────────────────────────────────────────────── accessors (used by LoopInst / diagnostics)
  get context(): AudioContext | null {
    return this.ctx;
  }
  get noiseBank(): NoiseBank | null {
    return this.noise;
  }
  get sfxIn(): AudioNode | null {
    return this.sfxVol;
  }
  get revIn(): AudioNode | null {
    return this.rev;
  }

  // ─────────────────────────────────────────────── lifecycle
  init(): void {
    let params: URLSearchParams | null = null;
    try {
      params = new URLSearchParams(location.search);
    } catch {
      params = null;
    }
    if (params?.get('audio') === '0') this.enabled = false;
    const pin = params?.get('mood') as MusicMood | null;
    if (pin && MOODS.includes(pin)) this.moodOverride = pin;
    this.diagRequested = params?.get('audiodiag') === '1';
    if (!this.enabled || typeof window === 'undefined') return;
    const AC = audioCtor();
    if (!AC) {
      this.enabled = false;
      return;
    }
    // unlock on the first gestures (iOS needs a resume() + a started buffer inside the gesture)
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const) {
      window.addEventListener(ev, this.onGesture, opts);
      this.offs.push(() => window.removeEventListener(ev, this.onGesture, opts));
    }
    document.addEventListener('click', this.onDocClick, false);
    this.offs.push(() => document.removeEventListener('click', this.onDocClick, false));
    document.addEventListener('visibilitychange', this.onVisibility);
    this.offs.push(() => document.removeEventListener('visibilitychange', this.onVisibility));
    window.addEventListener('pagehide', this.onVisibility);
    window.addEventListener('pageshow', this.onVisibility);
    this.offs.push(() => window.removeEventListener('pagehide', this.onVisibility));
    this.offs.push(() => window.removeEventListener('pageshow', this.onVisibility));
    this.listening = true;
    this.offs.push(bus.on('settings:changed', () => this.applySettings()));
    this.offs.push(bus.on('disaster:start', (e) => this.onDisasterStart(e.powerId)));
    this.offs.push(bus.on('disaster:end', (e) => this.onDisasterEnd(e.powerId)));
    this.offs.push(bus.on('view:changed', () => (this.moodTimer = 0)));
    // rewards ripple through the score: an arpeggio in the current key after the fanfare
    this.offs.push(bus.on('milestone:reached', () => this.flourish(1.4)));
    this.offs.push(
      bus.on('unlock', (e) => {
        if (e.kind !== 'item') this.flourish(0.9);
      }),
    );
    // month end: a soft coin when the books close in the black
    this.offs.push(
      bus.on('sim:month', () => {
        const t = performance.now();
        if (t - this.lastMonthAt < 25000 || ui.view.value !== 'planet' || ui.screen.value !== 'game') return;
        if ((ui.income.value ?? 0) <= 0) return;
        this.lastMonthAt = t;
        this.sfx('money', { volume: 0.25 });
      }),
    );
    this.offs.push(
      bus.on('building:added', (e) => {
        try {
          this.onBuildingAdded(e.id);
        } catch {
          /* optional */
        }
      }),
    );
  }

  onPlanetLoaded(_planet: Planet): void {
    this.moodTimer = 0;
    this.local.city = -1;
  }

  onPlanetUnloading(_planet: Planet): void {
    this.stopLoops(0.5);
    this.disasters.clear();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.listening = false;
    this.stopLoops(0.05);
    this.music?.dispose();
    this.scape?.dispose();
    this.synth?.dispose();
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }

  // ─────────────────────────────────────────────── unlock / context
  private onGesture = (): void => {
    if (!this.enabled) return;
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running') return;
    // muted on purpose (settings) → stay suspended once unlocked
    if (this.unlocked && (settings.value.muted || settings.value.masterVolume <= 0.001)) return;
    this.unlock();
  };

  /**
   * Create / resume the AudioContext. Must run inside a user gesture on iOS (touchend / click): a silent buffer is
   * started and resume() is called on every gesture until the context actually runs (a resume() issued from a
   * non-activating event such as pointerdown may stay pending, so it is never treated as "in flight").
   */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this.create();
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state === 'running') {
        this.onRunning();
        return;
      }
      if (document.hidden) return;
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
      this.resuming = true;
      ctx
        .resume()
        .then(() => this.onRunning())
        .catch(() => {
          /* not allowed yet — retried on the next gesture */
        })
        .finally(() => (this.resuming = false));
    } catch (e) {
      console.warn('[audio] unlock failed', e);
    }
  }

  private create(): void {
    const AC = audioCtor();
    if (!AC) {
      this.enabled = false;
      return;
    }
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'ambient';
    } catch {
      /* optional API */
    }
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      ctx = new AC();
    }
    this.ctx = ctx;
    this.noise = new NoiseBank(ctx);
    this.bank = new SampleBank(ctx);
    try {
      this.synth = new SynthClient();
    } catch {
      this.synth = null;
    }
    this.buildGraph(ctx);
    this.requestAssets(ctx);
    this.music = new MusicEngine({
      ctx,
      noise: this.noise,
      bank: this.bank,
      input: this.musicVol!,
      rev: this.rev!,
      dly: this.dlyIn!,
      setDelay: (sec, fb, at) => this.setDelay(sec, fb, at),
    });
    this.scape = new Soundscape(ctx, this.noise, this.bank, this.ambVol!, this.rev!);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.onRunning();
    };
    this.applySettings();
  }

  private buildGraph(ctx: AudioContext): void {
    const g = (v: number) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const master = g(0);
    master.connect(ctx.destination);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(master);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.25;
    comp.connect(limiter);
    const pre = g(0.9);
    pre.connect(comp);
    // reverb (algorithmic IR), highpassed input so the tail never gets muddy
    const rev = g(1);
    const rhp = ctx.createBiquadFilter();
    rhp.type = 'highpass';
    rhp.frequency.value = 140;
    const conv = ctx.createConvolver();
    this.conv = conv;
    const revOut = g(0.6);
    rev.connect(rhp);
    rhp.connect(conv);
    conv.connect(revOut);
    revOut.connect(pre);
    // music bus + ducking
    const musicVol = g(0);
    const musicDuck = g(1);
    musicVol.connect(musicDuck);
    musicDuck.connect(pre);
    // tempo delay (music sends), feedback through a darkening lowpass
    const dlyIn = g(1);
    const dly = ctx.createDelay(3);
    dly.delayTime.value = 0.5;
    const dlyFb = g(0.35);
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2600;
    const dhp = ctx.createBiquadFilter();
    dhp.type = 'highpass';
    dhp.frequency.value = 220;
    dlyIn.connect(dhp);
    dhp.connect(dly);
    dly.connect(dlp);
    dlp.connect(dlyFb);
    dlyFb.connect(dly);
    const dlyOut = g(0.5);
    dly.connect(dlyOut);
    dlyOut.connect(musicDuck);
    const dlyRev = g(0.25);
    dlyOut.connect(dlyRev);
    dlyRev.connect(rev);
    // sfx / ui / ambience
    const sfxVol = g(0);
    sfxVol.connect(pre);
    const uiVol = g(0);
    uiVol.connect(pre);
    const ambVol = g(0);
    const ambDuck = g(1);
    ambVol.connect(ambDuck);
    ambDuck.connect(pre);
    this.master = master;
    this.musicVol = musicVol;
    this.musicDuck = musicDuck;
    this.sfxVol = sfxVol;
    this.uiVol = uiVol;
    this.ambVol = ambVol;
    this.ambDuck = ambDuck;
    this.rev = rev;
    this.dly = dly;
    this.dlyIn = dlyIn;
    this.dlyFb = dlyFb;
  }

  /** reverb IR + noise textures from the synth worker (main-thread fallback if it is unavailable) */
  private requestAssets(ctx: AudioContext): void {
    const IR = { seconds: 3.4, opts: { predelay: 0.02, bright: 0.55 } };
    const syncIR = () => {
      if (this.conv && !this.conv.buffer) this.conv.buffer = makeImpulse(ctx, IR.seconds, IR.opts);
    };
    const synth = this.synth;
    if (!synth || !synth.ok) {
      syncIR();
      return;
    }
    synth.request({ kind: 'impulse', seconds: IR.seconds, sr: ctx.sampleRate, opts: IR.opts }, (r) => {
      if (r.error || !r.chans.length || !this.conv) syncIR();
      else if (!this.conv.buffer) this.conv.buffer = toBuffer(ctx, r.chans, r.sr);
    });
    setTimeout(syncIR, 4000);
    for (const kind of NOISE_KINDS) {
      synth.request({ kind: 'noise', name: kind, sr: ctx.sampleRate }, (r) => {
        if (!r.error && r.chans.length) this.noise?.adopt(kind, r.chans[0]);
      });
    }
  }

  private setDelay(sec: number, fb: number, at: number): void {
    if (!this.dly || !this.dlyFb) return;
    const s = clamp(sec, 0.05, 2.9);
    this.dly.delayTime.setTargetAtTime(s, at, 0.5);
    this.dlyFb.gain.setTargetAtTime(clamp(fb, 0, 0.7), at, 0.5);
  }

  private onRunning(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const first = !this.unlocked;
    this.unlocked = true;
    this.applySettings();
    this.moodTimer = 0;
    if (first) {
      this.warmMoods();
      if (this.diagRequested) {
        this.diagRequested = false;
        setTimeout(() => {
          this.diagnose()
            .then((r) => console.info('[audio] diagnose', JSON.stringify(r.summary)))
            .catch((e) => console.warn('[audio] diagnose failed', e));
        }, 500);
      }
    }
    for (const l of this.loops) l.start();
    // flush sounds requested during the unlock gesture
    const t = performance.now();
    const p = this.pending;
    this.pending = [];
    for (const e of p) if (t - e.at < 600) this.sfx(e.name, e.opts);
  }

  private onVisibility = (): void => {
    this.updatePower();
  };

  /** suspend while hidden or muted (battery), resume otherwise */
  private updatePower(): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked) return;
    const hidden = document.hidden;
    const muted = settings.value.muted || settings.value.masterVolume <= 0.001;
    try {
      if (hidden || muted) {
        if (ctx.state === 'running') void ctx.suspend().catch(() => {});
      } else if (ctx.state !== 'running') {
        this.resuming = true;
        ctx
          .resume()
          .then(() => this.onRunning())
          .catch(() => {
            /* iOS may refuse outside a gesture — onGesture retries */
          })
          .finally(() => (this.resuming = false));
      }
    } catch {
      /* ignore */
    }
  }

  private applySettings(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const st = settings.value;
    const now = ctx.currentTime;
    const sfx = volCurve(st.sfxVolume);
    this.master.gain.setTargetAtTime(st.muted ? 0 : volCurve(st.masterVolume), now, 0.05);
    this.musicVol!.gain.setTargetAtTime(volCurve(st.musicVolume) * 0.9, now, 0.08);
    this.sfxVol!.gain.setTargetAtTime(sfx, now, 0.05);
    this.uiVol!.gain.setTargetAtTime(sfx * 0.9, now, 0.05);
    this.ambVol!.gain.setTargetAtTime(sfx * 0.85, now, 0.2);
    // muted → suspend shortly after the fade-out
    if (st.muted || st.masterVolume <= 0.001) setTimeout(() => this.updatePower(), 350);
    else this.updatePower();
    if (st.musicVolume <= 0.001 && this.music?.current) this.music.stop(now, 0.5);
    else this.moodTimer = 0;
  }

  // ─────────────────────────────────────────────── sfx
  sfx(name: SfxName, opts?: SfxOpts): void {
    this.play(name, opts, -1);
  }

  /** play an sfx at a world position: pan + distance attenuation / colouring from the planet camera */
  sfxAt(name: SfxName, pos: { x: number; y: number; z: number }, opts?: SfxOpts): void {
    const cam = this.game.planetView?.camera;
    const planet = this.game.planet;
    if (!cam || !planet || ui.view.value !== 'planet') {
      this.sfx(name, opts);
      return;
    }
    const e = cam.matrixWorld.elements;
    const dx = pos.x - cam.position.x;
    const dy = pos.y - cam.position.y;
    const dz = pos.z - cam.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const pan = clamp(((dx * e[0] + dy * e[1] + dz * e[2]) / d) * 1.2, -0.9, 0.9);
    const R = planet.radius;
    const att = clamp(1.6 / (1 + d / (R * 0.22)), 0.12, 1);
    this.play(name, { volume: (opts?.volume ?? 1) * att, pitch: opts?.pitch, pan: opts?.pan ?? pan }, smooth(R * 0.12, R * 1.8, d));
  }

  private play(name: SfxName, opts: SfxOpts | undefined, farOverride: number): void {
    if (!this.enabled) return;
    this.lastSfxAt = performance.now();
    if (name === 'place' || name === 'placeBig') this.lastPlaceAt = this.lastSfxAt;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      if (this.ctx && (this.resuming || !this.unlocked) && this.pending.length < 4) this.pending.push({ name, opts, at: this.lastSfxAt });
      return;
    }
    if (settings.value.muted) return;
    const def: SfxDef | undefined = SFX[name];
    if (def) this.emit(def, name, opts, farOverride);
  }

  /** build and route one synthesised voice (SFX or placement accent) with rate limits, caps and ducking */
  private emit(def: SfxDef, name: string, opts: SfxOpts | undefined, farOverride: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.noise || !this.bank) return;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1e9;
    if (now - last < (def.gap ?? 0.03)) return;
    const vol = clamp((opts?.volume ?? 1) * def.gain, 0, 2);
    if (!(vol > 0.001)) return;
    this.reapVoices(now);
    const prio = def.prio ?? (def.ui ? 1 : 0);
    // per-sound cap
    let same = 0;
    let oldestSame: ActiveVoice | null = null;
    for (const v of this.voices) {
      if (v.name !== name || v.end <= now) continue;
      same++;
      if (!oldestSame || v.start < oldestSame.start) oldestSame = v;
    }
    if (same >= (def.max ?? 4)) {
      if (prio >= 2 && oldestSame) this.kill(oldestSame, now);
      else return;
    }
    // global cap with priority stealing
    if (this.voices.length >= MAX_VOICES) {
      let victim: ActiveVoice | null = null;
      for (const v of this.voices) if (v.prio <= prio && (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start))) victim = v;
      if (!victim) return;
      // fades out in 40 ms and is reaped (disconnected) on a following frame
      this.kill(victim, now);
    }
    this.lastPlay.set(name, now);
    const far = def.ui ? 0 : farOverride >= 0 ? farOverride : this.farness();
    let pitch = clamp((opts?.pitch ?? 1) * (1 + (rnd.next() * 2 - 1) * (def.vary ?? 0)), 0.1, 4);
    // tonal sounds are written in C: move them into the key of the music that is playing
    const cur = this.music?.current;
    if (def.tonal && cur && cur.stopAt === Infinity) pitch *= Math.pow(2, cur.keyShift / 12);
    const out = ctx.createGain();
    out.gain.value = vol;
    const nodes: AudioNode[] = [out];
    let tail: AudioNode = out;
    if (!def.ui && far > 0.3) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 18000 - 15000 * smooth(0.3, 1, far);
      tail.connect(lp);
      tail = lp;
      nodes.push(lp);
    }
    if (opts?.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      tail.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(def.ui ? this.uiVol! : this.sfxVol!);
    const wet = def.wet * (1 + far * 0.9);
    if (wet > 0.005 && this.rev) {
      const s = ctx.createGain();
      s.gain.value = wet;
      tail.connect(s);
      s.connect(this.rev);
      nodes.push(s);
    }
    const v = new Voice(ctx, this.noise, out, this.rev, now + 0.004, pitch, far);
    try {
      def.play(v, { bank: this.bank });
    } catch (e) {
      console.error('[audio] sfx failed', name, e);
      for (const n of nodes) n.disconnect();
      return;
    }
    const av: ActiveVoice = { name, start: now, end: v.end + 0.05, prio, gain: out, nodes };
    this.voices.push(av);
    if (def.duck) this.duck(def.duck * Math.min(1, vol / def.gain), Math.min(6, v.end - now));
  }

  private kill(v: ActiveVoice, now: number): void {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 0.04);
    } catch {
      /* ignore */
    }
    v.end = Math.min(v.end, now + 0.06);
  }

  private reapVoices(now: number): void {
    const vs = this.voices;
    for (let i = vs.length - 1; i >= 0; i--) {
      if (vs[i].end > now) continue;
      for (const n of vs[i].nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
      vs.splice(i, 1);
    }
  }

  /** duck music (and ambience) under a big sound */
  private duck(strength: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicDuck || !this.ambDuck || strength <= 0.02) return;
    const now = ctx.currentTime;
    const until = now + Math.max(0.3, seconds * 0.55);
    if (until < this.duckUntil - 0.2 && strength < 0.5) return;
    this.duckUntil = Math.max(this.duckUntil, until);
    for (const [node, depth] of [
      [this.musicDuck, 0.72],
      [this.ambDuck, 0.55],
    ] as const) {
      const p = node.gain;
      const cur = p.value;
      p.cancelScheduledValues(now);
      p.setValueAtTime(cur, now);
      p.setTargetAtTime(Math.min(cur, 1 - depth * clamp(strength, 0, 1)), now, 0.05);
      p.setTargetAtTime(1, this.duckUntil, 0.9 + seconds * 0.15);
    }
  }

  /** 0 close … 1 far, from the camera zoom on the planet */
  private farness(): number {
    if (ui.view.value !== 'planet') return 0.3;
    const z = this.game.camera?.zoom01;
    return typeof z === 'number' ? smooth(0.3, 0.98, z) : 0.2;
  }

  // ─────────────────────────────────────────────── loops
  loop(name: LoopName, opts?: SfxOpts): LoopHandle {
    if (!this.enabled || !LOOPS[name]) return { setVolume() {}, stop() {} };
    const inst = new LoopInst(this, name, clamp(opts?.volume ?? 0.6, 0, 2));
    this.loops.push(inst);
    let live = 0;
    for (const l of this.loops) if (!l.stopped) live++;
    if (live > MAX_LOOPS) {
      const oldest = this.loops.find((l) => !l.stopped && l !== inst);
      oldest?.stop(0.4);
    }
    if (this.ctx && this.ctx.state === 'running') inst.start();
    return inst;
  }

  /** fade out every running loop */
  stopLoops(fade = 1): void {
    for (const l of this.loops) l.stop(fade);
  }

  private updateLoops(now: number): void {
    const ls = this.loops;
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (l.stopped) {
        if (now >= l.deadAt) {
          l.dispose();
          ls.splice(i, 1);
        }
      } else l.tick(now);
    }
  }

  // ─────────────────────────────────────────────── music
  setMood(m: MusicMood): void {
    if (!MOODS.includes(m)) return;
    this.hint = { mood: m, at: performance.now() / 1000 };
    this.moodTimer = 0;
  }

  private warmMoods(): void {
    const bank = this.bank;
    if (!bank) return;
    // the sfx instruments first, then every mood (current one first)
    bank.warm('glock', [84, 88, 92, 96, 100]);
    bank.warm('bell', [84, 88, 92, 96]);
    for (const m of [this.mood, ...MOODS.filter((x) => x !== this.mood)]) for (const [inst, notes] of WARM[m]) bank.warm(inst, notes);
  }

  private computeMood(nowS: number): MusicMood {
    if (ui.screen.value !== 'game') return 'menu';
    const h = this.hint;
    if (h && nowS - h.at < 6 && h.mood !== 'day' && h.mood !== 'night' && h.mood !== 'menu') return h.mood;
    const view = ui.view.value;
    if (view === 'studio') return 'studio';
    if (view === 'system') return 'space';
    if (view === 'galaxy' || view === 'universe') return 'galaxy';
    let apoc = false;
    let any = false;
    for (const [id, e] of this.disasters) {
      if (e.count <= 0 && nowS > e.until) {
        this.disasters.delete(id);
        continue;
      }
      if (nowS > e.until) {
        this.disasters.delete(id);
        continue;
      }
      any = true;
      if (e.apoc) apoc = true;
    }
    if (apoc) return 'apocalypse';
    if (any) return 'tension';
    const dl = this.daylight();
    if (this.night) {
      if (dl > 0.45) this.night = false;
    } else if (dl < 0.28) this.night = true;
    return this.night ? 'night' : 'day';
  }

  /** 0..1 daylight at the camera focus */
  private daylight(): number {
    const env = this.game.planetView?.env as { daylight?: number } | undefined;
    if (env && typeof env.daylight === 'number' && Number.isFinite(env.daylight)) return env.daylight;
    const t = this.game.camera?.target;
    if (!t) return 1;
    const s = shared.uSunDir.value;
    return smooth(-0.15, 0.2, s.x * t.x + s.y * t.y + s.z * t.z);
  }

  /** 0..1 musical energy from the game: bigger cities, faster clocks and danger make the music busier */
  private gameEnergy(): number {
    const m = this.mood;
    if (m === 'tension' || m === 'apocalypse') return 0.85;
    if (m === 'menu' || m === 'space' || m === 'galaxy') return 0.5;
    const pop = typeof ui.population.value === 'number' ? ui.population.value : 0;
    const city = clamp(Math.log10(pop + 1) / 5, 0, 1);
    const speed = this.game.clock?.speed ?? 1;
    return clamp(0.2 + 0.5 * city + (speed >= 3 ? 0.25 : speed === 0 ? -0.15 : 0), 0, 1);
  }

  private decideMood(): void {
    this.decisions++;
    const cur = this.music?.current;
    if (cur) cur.energy = this.gameEnergy();
    const nowS = performance.now() / 1000;
    const want = this.moodOverride ?? this.computeMood(nowS);
    if (want !== this.mood) {
      const prev = this.mood;
      const urgent =
        want === 'tension' ||
        want === 'apocalypse' ||
        want === 'menu' ||
        prev === 'menu' ||
        want === 'space' ||
        want === 'galaxy' ||
        want === 'studio' ||
        prev === 'space' ||
        prev === 'galaxy' ||
        prev === 'studio' ||
        this.moodOverride !== null;
      if (!urgent && nowS - this.moodChangedAt < 9) return;
      this.mood = want;
      this.moodChangedAt = nowS;
      this.restUntil = 0;
    }
    this.applyMood();
    this.maybeRest();
  }

  private applyMood(): void {
    const ctx = this.ctx;
    const music = this.music;
    if (!ctx || !music || ctx.state !== 'running') return;
    const st = settings.value;
    if (st.musicVolume <= 0.001 || st.muted) return;
    const cur = music.current;
    if (cur && cur.mood === this.mood) return;
    const from = cur?.mood ?? null;
    const to = this.mood;
    // let the mood's instrument samples render first (amortised over a few frames) so starting never hitches
    const bank = this.bank;
    if (bank && !bank.ready(WARM[to]) && performance.now() / 1000 - this.moodChangedAt < 2.5) {
      for (const [inst, notes] of WARM[to]) bank.warm(inst, notes, true);
      this.waitingMood = true;
      this.moodTimer = Math.min(this.moodTimer, 0.1);
      return;
    }
    this.waitingMood = false;
    // resting between pieces (only the calm planet moods rest; menus, cosmos and danger never wait)
    const nowS = performance.now() / 1000;
    if ((to === 'day' || to === 'night') && nowS < this.restUntil && this.moodOverride === null) return;
    let fin = 3;
    let fout = 3.5;
    if (!from) {
      fin = 2.5;
      fout = 1;
    } else if (to === 'tension') {
      fin = 1.2;
      fout = 2;
    } else if (to === 'apocalypse') {
      fin = 0.8;
      fout = 1.5;
    } else if ((from === 'day' && to === 'night') || (from === 'night' && to === 'day')) {
      fin = 6;
      fout = 7;
    } else if (from === 'tension' || from === 'apocalypse') {
      fin = 5;
      fout = 5;
    } else if (to === 'studio' || from === 'studio') {
      fin = 2;
      fout = 2.5;
    }
    music.play(to, ctx.currentTime, fin, fout);
    this.playingSince = nowS;
  }

  /** after a few minutes of day / night music, fade out for 20–45 s; the next piece starts with fresh variations */
  private maybeRest(): void {
    const ctx = this.ctx;
    const cur = this.music?.current;
    if (!ctx || !cur || this.moodOverride !== null || (cur.mood !== 'day' && cur.mood !== 'night')) return;
    const nowS = performance.now() / 1000;
    if (nowS - this.playingSince < this.restAfter) return;
    this.music!.stop(ctx.currentTime, 12);
    this.restUntil = nowS + 12 + 20 + rnd.next() * 25;
    this.restAfter = 200 + rnd.next() * 160;
  }

  private flourish(delay: number): void {
    const ctx = this.ctx;
    const cur = this.music?.current;
    const t = performance.now();
    if (!ctx || ctx.state !== 'running' || !cur || cur.stopAt !== Infinity || t - this.lastFlourishAt < 3000) return;
    this.lastFlourishAt = t;
    try {
      cur.flourish(ctx.currentTime + delay);
    } catch (e) {
      console.error('[audio] flourish failed', e);
    }
  }

  // ─────────────────────────────────────────────── disasters
  private onDisasterStart(id: string): void {
    const list = (this.game as unknown as { god?: { powers?: { id: string; planetEnding?: boolean; category?: string; danger?: number }[] } }).god?.powers;
    const def = Array.isArray(list) ? list.find((p) => p.id === id) : undefined;
    const apoc = !!def?.planetEnding || def?.category === 'apocalypse';
    const danger = def?.danger ?? 2;
    if (!apoc && danger < 2) return;
    const nowS = performance.now() / 1000;
    const e = this.disasters.get(id) ?? { count: 0, apoc, until: 0 };
    e.count++;
    e.apoc = e.apoc || apoc;
    e.until = nowS + 150;
    this.disasters.set(id, e);
    this.moodTimer = 0;
  }

  private onDisasterEnd(id: string): void {
    const e = this.disasters.get(id);
    if (!e) return;
    e.count = Math.max(0, e.count - 1);
    if (e.count === 0) e.until = performance.now() / 1000 + 6;
  }

  // ─────────────────────────────────────────────── soundscape
  private onBuildingAdded(id: number): void {
    if (!this.scape || ui.view.value !== 'planet' || ui.screen.value !== 'game') return;
    const planet = this.game.planet;
    const cam = this.game.camera;
    const b = planet?.buildings.get(id);
    if (!planet || !b || !cam) return;
    const since = performance.now() - this.lastPlaceAt;
    if (since < 250) {
      // the player just placed it: layer the category's signature on top of the thunk
      const def = getItem(b.defId);
      const acc = def && !def.growable ? ACCENTS[def.category] : undefined;
      const t = performance.now();
      if (acc && t - this.lastAccentAt > 140) {
        this.lastAccentAt = t;
        this.emit(acc, 'accent:' + def!.category, { volume: def!.footprint > 1 ? 1 : 0.8 }, -1);
      }
      return;
    }
    if (since < 700) return;
    const target = cam.targetTile();
    const ang = planet.grid.angle(target, b.tile);
    if (ang * planet.radius < Math.max(6, cam.distance * 0.7)) this.scape.construct();
  }

  private sampleLocal(): void {
    const L = this.local;
    const planet = this.game.planet;
    const cam = this.game.camera;
    L.city = L.water = L.birds = L.insects = L.cold = L.hot = L.lava = L.crystal = L.alien = L.swamp = 0;
    if (!planet || !cam) return;
    const tile = cam.targetTile();
    if (!(tile >= 0 && tile < planet.count)) return;
    const tiles = planet.grid.disk(tile, 3);
    const n = tiles.length || 1;
    const breath = planet.spec.atmosphere.breathable;
    for (const i of tiles) {
      if (planet.building[i] >= 0) L.city += 1;
      else if (planet.road[i] > 0) L.city += 0.6;
      else if (planet.zone[i] > 0) L.city += 0.15;
      if (planet.isWater(i)) {
        L.water += 1;
        continue;
      }
      const b = planet.biome[i] as Biome;
      const f = planet.feature[i] as Feature;
      let life = 0;
      let bugs = 0;
      switch (b) {
        case Biome.Grass:
          life = 0.8;
          bugs = 0.4;
          break;
        case Biome.Meadow:
          life = 1;
          bugs = 0.6;
          break;
        case Biome.Forest:
          life = 1;
          bugs = 0.4;
          break;
        case Biome.Jungle:
          life = 1;
          bugs = 1;
          break;
        case Biome.Savanna:
          life = 0.6;
          bugs = 0.8;
          L.hot += 0.3;
          break;
        case Biome.Swamp:
          life = 0.7;
          bugs = 0.8;
          L.swamp += 1;
          break;
        case Biome.Beach:
          life = 0.4;
          L.water += 0.3;
          break;
        case Biome.Tundra:
          life = 0.3;
          L.cold += 0.5;
          break;
        case Biome.Snow:
        case Biome.Ice:
          L.cold += 1;
          break;
        case Biome.Mountain:
          L.cold += 0.5;
          break;
        case Biome.Desert:
        case Biome.Salt:
          L.hot += 1;
          bugs = 0.15;
          break;
        case Biome.Ash:
          L.hot += 0.5;
          break;
        case Biome.Volcanic:
          L.lava += 0.5;
          break;
        case Biome.Lava:
          L.lava += 1;
          break;
        case Biome.Crystal:
          L.crystal += 1;
          break;
        case Biome.Fungal:
          L.alien += 1;
          break;
        case Biome.Toxic:
          L.alien += 0.8;
          break;
        case Biome.Coral:
          L.alien += 0.3;
          life = 0.3;
          break;
        default:
          break;
      }
      if (f === Feature.Trees || f === Feature.DenseTrees || f === Feature.Flowers) life += 0.5;
      else if (f === Feature.AlienFlora) L.alien += 0.8;
      else if (f === Feature.CrystalDeposit) L.crystal += 0.7;
      else if (f === Feature.GeoVent) L.lava += 0.5;
      if (breath) {
        L.birds += Math.min(1, life);
        L.insects += Math.min(1, bugs);
      } else L.alien += 0.5 * Math.min(1, life);
    }
    for (const k of Object.keys(L) as (keyof typeof L)[]) L[k] = clamp(L[k] / n, 0, 1);
  }

  private gatherAmb(): AmbState {
    const s = this.amb;
    s.active = false;
    s.space = 0;
    if (ui.screen.value !== 'game') return s;
    const view = ui.view.value;
    if (view !== 'planet') {
      s.space = view === 'studio' ? 0 : 0.7;
      return s;
    }
    const g = this.game;
    const planet = g.planet;
    if (!planet || !g.planetView) return s;
    const z = typeof g.camera?.zoom01 === 'number' ? g.camera.zoom01 : 0.5;
    if (this.local.city < 0 || (this.sampleTimer -= 0.25) <= 0) {
      this.sampleTimer = 1;
      this.sampleLocal();
    }
    const L = this.local;
    const spec = planet.spec;
    s.active = true;
    s.near = 1 - smooth(0.12, 0.8, z);
    s.space = smooth(0.72, 1, z) * 0.8;
    s.night = 1 - smooth(0.22, 0.6, this.daylight());
    const pop = typeof ui.population.value === 'number' ? ui.population.value : 0;
    s.cityGlobal = clamp(Math.log10(pop + 1) / 5, 0, 1);
    s.city = L.city;
    s.water = L.water;
    s.birds = L.birds;
    s.insects = L.insects;
    s.cold = L.cold;
    s.hot = L.hot;
    s.lava = L.lava;
    s.crystal = L.crystal;
    s.alien = L.alien;
    s.swamp = L.swamp;
    s.atmo = clamp(spec.atmosphere.density, 0, 1.2) / 1.2 + (spec.atmosphere.density > 0.3 ? 0.17 : 0);
    s.atmo = clamp(s.atmo, 0, 1);
    s.wind = clamp(0.25 + spec.cloudCover * 0.4 + spec.mountains * 0.25, 0, 1);
    s.paused = g.clock.speed === 0;
    return s;
  }

  // ─────────────────────────────────────────────── global button click
  private onDocClick = (e: MouseEvent): void => {
    if (!this.enabled || !this.unlocked) return;
    const now = performance.now();
    if (now - this.lastSfxAt < 90 || now - this.lastClickAt < 60) return;
    const t = e.target as Element | null;
    if (!t || typeof t.closest !== 'function') return;
    const el = t.closest('button, [role="button"], [role="tab"], [role="switch"], summary, select, label') as HTMLElement | null;
    if (!el) return;
    if (el.closest('.cz-btn, .cz-ibtn, [data-silent], [data-sound="off"]')) return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    this.lastClickAt = now;
    this.sfx('tap', { volume: 0.55 });
  };

  // ─────────────────────────────────────────────── frame update
  update(dt: number): void {
    this.frames++;
    const ctx = this.ctx;
    if (!ctx) return;
    const P = this.prof;
    let t = performance.now();
    if ((this.moodTimer -= dt) <= 0) {
      this.moodTimer = 0.4;
      try {
        this.decideMood();
      } catch (e) {
        console.error('[audio] mood failed', e);
      }
      t = lap(P, 'mood', t);
    }
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    try {
      this.music?.pump(now);
    } catch (e) {
      console.error('[audio] music failed', e);
    }
    t = lap(P, 'music', t);
    // amortised warm-up: one noise texture or ~1 ms of instrument samples per frame (more while a mood waits)
    const synth = this.synth;
    if (synth && synth.ok) {
      if (this.bank && this.bank.pending) this.bank.dispatch(this.sendSample, this.waitingMood ? 6 : 3);
    } else if (this.noise && this.noise.warmOne()) {
      /* one texture this frame */
    } else if (this.bank && this.bank.pending) this.bank.tick(this.waitingMood ? 6 : 1.2);
    t = lap(P, 'warm', t);
    this.reapVoices(now);
    this.updateLoops(now);
    t = lap(P, 'voices', t);
    if ((this.ambTimer -= dt) <= 0) {
      this.ambTimer = 0.25;
      try {
        this.scape?.update(0.25, this.gatherAmb(), now);
      } catch (e) {
        console.error('[audio] ambience failed', e);
      }
      lap(P, 'amb', t);
    }
  }

  /** worker request for one instrument note */
  private sendSample = (inst: Parameters<SampleBank['adopt']>[0], base: number): void => {
    const bank = this.bank;
    if (!bank || !this.synth) return;
    this.synth.request({ kind: 'sample', inst, midi: base }, (r) => {
      if (r.error || !r.chans.length) bank.failed(inst, base);
      else bank.adopt(inst, base, { data: r.chans[0], sr: r.sr, f0: r.f0 ?? 440 });
    });
  };

  // ─────────────────────────────────────────────── debug / tests
  /** machine-readable snapshot (tests, debug overlay) */
  state(): Record<string, unknown> {
    return {
      enabled: this.enabled,
      unlocked: this.unlocked,
      ctx: this.ctx?.state ?? 'none',
      sampleRate: this.ctx?.sampleRate ?? 0,
      mood: this.mood,
      playing: this.music?.mood ?? null,
      players: this.music?.players.length ?? 0,
      section: this.music?.current?.section ?? null,
      voices: this.voices.length,
      loops: this.loops.filter((l) => !l.stopped).map((l) => l.name),
      samples: this.bank?.generated ?? 0,
      samplesPending: (this.bank?.pending ?? 0) + (this.bank?.busy ?? 0),
      worker: this.synth ? { ok: this.synth.ok, served: this.synth.served, pending: this.synth.pending } : null,
      reverb: !!this.conv?.buffer,
      ambience: this.scape ? { ...this.scape.levels, events: this.scape.events } : null,
      amb: { ...this.amb },
      disasters: [...this.disasters.keys()],
      listening: this.listening,
      screen: ui.screen.value,
      view: ui.view.value,
      override: this.moodOverride,
      hint: this.hint ? { mood: this.hint.mood, ago: Math.round((performance.now() / 1000 - this.hint.at) * 10) / 10 } : null,
      changedAgo: Math.round((performance.now() / 1000 - this.moodChangedAt) * 10) / 10,
      daylight: Math.round(this.daylight() * 100) / 100,
      frames: this.frames,
      decisions: this.decisions,
      moodTimer: Math.round(this.moodTimer * 100) / 100,
      prof: { ...this.prof },
      resting: Math.max(0, Math.round(this.restUntil - performance.now() / 1000)),
      nextRestIn: Math.round(this.restAfter - (performance.now() / 1000 - this.playingSince)),
    };
  }

  /** Render every sfx / loop / mood offline and measure it (see diagnose.ts). */
  diagnose(opts?: DiagnoseOptions): Promise<DiagnoseReport> {
    return diagnose(opts, this.bank ?? undefined);
  }
}

