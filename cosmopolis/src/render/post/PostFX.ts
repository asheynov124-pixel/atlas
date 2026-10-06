/**
 * OWNER: space-post.
 * PostFX — the post-processing chain ("postprocessing" library) + adaptive quality.
 *
 *   RenderPass (HDR half-float target, MSAA on WebGL2)
 *   → EffectPass [ tilt-shift? · mipmap-blur bloom (luminance threshold: windows, neon, lava, the sun) · CosmoGrade ]
 *        CosmoGrade = exposure → white balance (temperature) → ACES filmic → lift/gamma/gain, contrast, S-curve,
 *        saturation, hue, split toning (preset), fade, mono, vignette
 *   → EffectPass [ SMAA ]                   (tier ≥ 2)
 *   → EffectPass [ chromatic aberration ]   (only while params.chromatic > 0)
 *   → film grain on the last pass (after anti-aliasing), dithered output
 *
 * Tiers: 0 Low → direct render (renderer ACES, no composer) · 1 Medium → MSAA, half-res bloom + grade ·
 *        2 High → + SMAA, tilt-shift capable · 3 Ultra → full-res bloom chain, more bloom levels, ultra SMAA.
 * Tilt-shift on Medium only while photo mode is open. The composer is rebuilt only when the topology changes
 * (tier / bloom on-off / tilt / chromatic / grain); every slider is a live uniform. Grade presets cross-fade.
 * If anything in the chain throws, we log once and fall back to direct rendering for good — never a black screen.
 * With the composer active renderer.toneMapping is NoToneMapping (tone mapping happens in CosmoGrade).
 * renderer.info is reset once per frame so draw-call stats include every pass.
 *
 * CONTRACT: params (PostParams, live-editable by photo mode), setSize(w,h,dpr), setQuality(tier),
 *           render(scene, camera, dt), dispose().
 * Extras:   hint({ exposure, warmth, night }) — per-frame scene hints from the planet's SpaceEnvironment
 *           (ignored unless given this frame); fps (smoothed); composerActive; GRADE_PRESETS (re-exported).
 */
import {
  ACESFilmicToneMapping,
  Color,
  HalfFloatType,
  NoToneMapping,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
} from 'three';
import {
  BlendFunction,
  ChromaticAberrationEffect,
  EdgeDetectionMode,
  type Effect,
  EffectComposer,
  EffectPass,
  KernelSize,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  TiltShiftEffect,
} from 'postprocessing';
import { settings } from '../../core/settings';
import { ui } from '../../ui/store';
import type { Engine } from '../Engine';
import { CosmoBloom, GradeEffect, GrainEffect, blendGrade, createGradeState } from './effects';
import { gradeLook } from './grades';
import { QualityManager } from './QualityManager';

export { GRADE_PRESETS, type GradePresetInfo } from './grades';

export interface PostParams {
  /** 0..2 bloom strength */
  bloom: number;
  exposure: number;
  /** 0..2 */
  saturation: number;
  /** 0..2 */
  contrast: number;
  /** 0..1 */
  vignette: number;
  /** 0..1 miniature-style blur at the top & bottom */
  tiltShift: number;
  /** 0..1 film grain */
  grain: number;
  /** 0..1 chromatic aberration */
  chromatic: number;
  /** −1 cool … +1 warm */
  temperature: number;
  /** colour-grade preset name ('none', 'cinematic', 'retro', 'noir', 'vapor', 'dream'…) */
  grade: string;
}

export const DEFAULT_POST: PostParams = {
  bloom: 0.9,
  exposure: 1,
  saturation: 1.08,
  contrast: 1.05,
  vignette: 0.25,
  tiltShift: 0,
  grain: 0,
  chromatic: 0,
  temperature: 0,
  grade: 'none',
};

const _size = new Vector2();
const _clear = new Color();

interface SceneHints {
  exposure: number;
  warmth: number;
  night: number;
}

export class PostFX {
  params: PostParams = { ...DEFAULT_POST };
  readonly quality = new QualityManager();

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private passes: EffectPass[] = [];
  private bloom: CosmoBloom | null = null;
  private grade: GradeEffect | null = null;
  private grain: GrainEffect | null = null;
  private tilt: TiltShiftEffect | null = null;
  private chroma: ChromaticAberrationEffect | null = null;
  private topology = '';
  private bloomThreshold = 0.92;
  private tier: number;
  private failed = false;
  private halfFloat = true;
  private frame = 0;
  private hints: SceneHints = { exposure: 1, warmth: 0, night: 0 };
  private hintFrame = -1;
  private state = createGradeState();
  private stateInit = false;
  private scene: Scene | null = null;
  private camera: Camera | null = null;
  private grainSeed = 0;
  private user = { exposure: 1, contrast: 1, saturation: 1, vignette: 0, temperature: 0 };
  /** 1×1 target bound while (re)setting the clear colour, so three stores it in linear space for our HDR buffers */
  private clearTarget: WebGLRenderTarget | null = null;

  constructor(private engine: Engine) {
    this.tier = engine.tier;
    const r = engine.renderer;
    r.info.autoReset = false;
    try {
      const ext = r.extensions;
      this.halfFloat = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    } catch {
      this.halfFloat = false;
    }
  }

  /** true while the composer chain is in use (tier ≥ 1 and healthy) */
  get composerActive(): boolean {
    return !!this.composer && this.tier > 0 && !this.failed;
  }

  /** smoothed frames per second measured by the quality manager */
  get fps(): number {
    return this.quality.fps;
  }

  /** Per-frame scene hints (exposure lift at night, warmth at golden hour). Applied only on the frame they're given. */
  hint(h: SceneHints): void {
    this.hints = h;
    this.hintFrame = this.frame;
  }

  setSize(_w: number, _h: number, _dpr: number): void {
    try {
      this.resizeComposer();
    } catch (e) {
      this.fail(e);
    }
  }

  setQuality(tier: number): void {
    this.tier = Math.max(0, Math.min(3, Math.round(tier)));
    this.topology = '';
    if (this.tier === 0) this.teardown();
  }

  render(scene: Scene, camera: Camera, dt: number): void {
    const engine = this.engine;
    const r = engine.renderer;
    // hints given since the previous render (hint() stamps the current frame count) apply to this one
    const hints = this.hintFrame === this.frame ? this.hints : null;
    this.frame++;
    r.info.reset();
    const next = this.quality.sample(performance.now(), engine.tier, settings.value.quality, engine.mobile);
    if (next !== null && next !== engine.tier) {
      console.info(`[post] auto quality → tier ${next} (${this.quality.fps.toFixed(0)} fps)`);
      engine.setQuality(next);
    }
    const p = this.params;
    const look = gradeLook(p.grade);
    const k = this.stateInit ? 1 - Math.exp(-Math.max(0, dt) * 5) : 1;
    this.stateInit = true;
    const u = this.user;
    u.exposure = p.exposure;
    u.contrast = p.contrast;
    // day-for-night: a touch cooler and less saturated after dark, so nights read moody-blue (lights stay warm)
    const night = hints ? Math.max(0, Math.min(1, hints.night)) : 0;
    u.saturation = p.saturation * (1 - 0.14 * night);
    u.vignette = p.vignette;
    u.temperature = p.temperature + (hints?.warmth ?? 0) - 0.22 * night;
    blendGrade(this.state, look, u, k);
    const exposureMul = hints?.exposure ?? 1;

    if (this.tier > 0 && !this.failed) {
      try {
        this.ensure(scene, camera);
        this.apply(dt, look.bloom, night, exposureMul);
        r.toneMapping = NoToneMapping;
        this.syncClearColor();
        this.composer!.render(dt);
        return;
      } catch (e) {
        this.fail(e);
      }
    }
    // direct path (Low tier / fallback)
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = this.state.exposure * exposureMul;
    r.setRenderTarget(null);
    if (!r.autoClear) r.clear();
    r.render(scene, camera);
  }

  /**
   * three converts the clear colour to the colour space of the target bound when it is set; the last pass renders
   * to the (sRGB) screen, so re-set it with a linear target bound before the RenderPass clears our HDR buffer.
   */
  private syncClearColor(): void {
    const r = this.engine.renderer;
    if (!this.clearTarget) this.clearTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    r.getClearColor(_clear);
    const a = r.getClearAlpha();
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.clearTarget);
    r.setClearColor(_clear, a);
    r.setRenderTarget(prev);
  }

  /** Match the composer's buffers to the renderer's drawing-buffer size (never touches the canvas). */
  private resizeComposer(): void {
    if (!this.composer) return;
    const s = this.engine.renderer.getSize(_size);
    this.composer.setSize(s.x, s.y, false);
  }

  private fail(e: unknown): void {
    if (!this.failed) console.error('[post] post-processing failed — falling back to direct rendering', e);
    this.failed = true;
    this.teardown();
  }

  /** Build or rebuild the composer when the effect topology changes. */
  private ensure(scene: Scene, camera: Camera): void {
    const p = this.params;
    const tier = this.tier;
    const tiltOn = p.tiltShift > 0.01 && (tier >= 2 || ui.photo.value);
    const bloomOn = settings.value.bloom && p.bloom > 0.01;
    const smaaOn = tier >= 2;
    const caOn = p.chromatic > 0.01;
    const grainOn = p.grain > 0.01;
    const key = `${tier}|${tiltOn}|${bloomOn}|${smaaOn}|${caOn}|${grainOn}`;
    const r = this.engine.renderer;
    if (!this.composer) {
      this.composer = new EffectComposer(r, { frameBufferType: this.halfFloat ? HalfFloatType : UnsignedByteType, stencilBuffer: false, depthBuffer: true });
      this.renderPass = new RenderPass(scene, camera);
      this.composer.addPass(this.renderPass);
      this.scene = scene;
      this.camera = camera;
      this.topology = '';
    }
    const composer = this.composer;
    if (key !== this.topology) {
      this.topology = key;
      const maxSamples = (r.capabilities as { maxSamples?: number }).maxSamples ?? 4;
      composer.multisampling = Math.min(4, maxSamples);
      for (const pass of this.passes) {
        composer.removePass(pass);
        pass.dispose();
      }
      this.passes = [];
      this.bloom = this.tilt = this.chroma = this.grain = null;
      const main: Effect[] = [];
      if (tiltOn) {
        this.tilt = new TiltShiftEffect({ offset: 0, rotation: 0, focusArea: 0.45, feather: 0.25, kernelSize: tier >= 3 ? KernelSize.LARGE : KernelSize.MEDIUM, resolutionScale: 0.5 });
        main.push(this.tilt);
      }
      if (bloomOn) {
        this.bloomThreshold = this.halfFloat ? 0.92 : 0.78;
        const bloom = new CosmoBloom({
          blendFunction: BlendFunction.ADD,
          mipmapBlur: true,
          luminanceThreshold: this.bloomThreshold,
          luminanceSmoothing: 0.32,
          intensity: p.bloom,
          radius: 0.74,
          levels: tier >= 3 ? 8 : tier >= 2 ? 7 : 5,
        });
        bloom.half = tier <= 1;
        this.bloom = bloom;
        main.push(bloom);
      }
      this.grade = new GradeEffect();
      main.push(this.grade);
      // one convolution effect per pass: SMAA and chromatic aberration each get their own; grain rides on the last
      const groups: Effect[][] = [main];
      if (smaaOn) groups.push([new SMAAEffect({ preset: tier >= 3 ? SMAAPreset.ULTRA : SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR })]);
      if (caOn) {
        this.chroma = new ChromaticAberrationEffect({ offset: new Vector2(0.001, 0.0006), radialModulation: true, modulationOffset: 0.2 });
        groups.push([this.chroma]);
      }
      if (grainOn) {
        this.grain = new GrainEffect();
        groups[groups.length - 1].push(this.grain);
      }
      this.passes = groups.map((g) => new EffectPass(camera, ...g));
      const last = this.passes[this.passes.length - 1];
      for (const pass of this.passes) pass.dithering = pass === last;
      for (const pass of this.passes) composer.addPass(pass);
      this.resizeComposer();
    }
    if (scene !== this.scene || camera !== this.camera) {
      this.scene = scene;
      this.camera = camera;
      composer.setMainScene(scene);
      composer.setMainCamera(camera);
    }
  }

  /** Push live parameters into the effects. */
  private apply(dt: number, bloomMul: number, night: number, exposureMul: number): void {
    const p = this.params;
    if (this.bloom) {
      // nights: a lower threshold so lit windows, street lamps and neon glow; days: only true highlights bloom
      const n = Math.max(0, Math.min(1, night));
      this.bloom.intensity = p.bloom * bloomMul * (1 + 0.55 * n);
      this.bloom.luminanceMaterial.threshold = this.bloomThreshold * (1 - 0.32 * n);
    }
    if (this.tilt) {
      const t = Math.max(0, Math.min(1, p.tiltShift));
      this.tilt.focusArea = 0.62 - 0.42 * t;
      this.tilt.feather = 0.3 - 0.12 * t;
    }
    if (this.chroma) {
      const a = Math.max(0, Math.min(1, p.chromatic)) * 0.0045;
      this.chroma.offset.set(a, a * 0.6);
    }
    if (this.grain) {
      this.grainSeed = (this.grainSeed + 0.6180339 + dt) % 64;
      this.grain.set(Math.max(0, Math.min(1, p.grain)), this.grainSeed);
    }
    this.grade?.apply(this.state, exposureMul);
  }

  private teardown(): void {
    for (const pass of this.passes) {
      this.composer?.removePass(pass);
      pass.dispose();
    }
    this.passes = [];
    this.bloom = this.tilt = this.chroma = this.grain = this.grade = null;
    if (this.composer) {
      try {
        this.composer.dispose();
      } catch {
        /* already gone */
      }
    }
    this.composer = null;
    this.renderPass = null;
    this.topology = '';
    this.scene = null;
    this.camera = null;
    this.engine.renderer.autoClear = true;
  }

  dispose(): void {
    this.teardown();
    this.clearTarget?.dispose();
    this.clearTarget = null;
  }
}
