/**
 * OWNER: space & post agent.
 * PostFX — post-processing chain (bloom, grading, vignette, tilt-shift, grain) + quality management.
 * (Foundation stub: plain render.)
 *
 * CONTRACT: params (PostParams, live-editable by photo mode), setSize(w,h,dpr), setQuality(tier),
 *           render(scene, camera, dt), dispose().
 */
import type { Camera, Scene } from 'three';
import type { Engine } from '../Engine';

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

export class PostFX {
  params: PostParams = { ...DEFAULT_POST };
  constructor(private engine: Engine) {}
  setSize(_w: number, _h: number, _dpr: number): void {}
  setQuality(_tier: number): void {}
  render(scene: Scene, camera: Camera, _dt: number): void {
    this.engine.renderer.toneMappingExposure = this.params.exposure;
    this.engine.renderer.render(scene, camera);
  }
  dispose(): void {}
}
