/**
 * Engine — owns the WebGLRenderer, canvas sizing, quality tier and the post-processing chain (FOUNDATION).
 * Post-processing itself lives in render/post/PostFX.ts (owned by the space & post agent).
 */
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { bus } from '../core/events';
import { settings, type QualitySetting } from '../core/settings';
import { PostFX } from './post/PostFX';
import type { View } from './View';

/** tier → max pixel ratio */
export const TIER_PIXEL_RATIO = [1, 1.5, 2, 2.5];
export const TIER_NAMES = ['Low', 'Medium', 'High', 'Ultra'];

export function detectMobile(): boolean {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) || matchMedia('(pointer: coarse)').matches;
}

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly post: PostFX;
  readonly mobile = detectMobile();
  width = 1;
  height = 1;
  pixelRatio = 1;
  /** 0 low · 1 medium · 2 high · 3 ultra */
  tier = 2;
  private onResize = () => this.resize();

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'scene';
    parent.prepend(this.canvas);
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x02030a, 1);
    this.tier = Engine.tierFor(settings.value.quality, this.mobile);
    this.post = new PostFX(this);
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 250));
    this.resize();
  }

  static tierFor(q: QualitySetting, mobile: boolean): number {
    switch (q) {
      case 'low':
        return 0;
      case 'medium':
        return 1;
      case 'high':
        return 2;
      case 'ultra':
        return 3;
      default:
        return mobile ? 1 : 2;
    }
  }

  setQuality(tier: number): void {
    const t = Math.max(0, Math.min(3, Math.round(tier)));
    if (t === this.tier) return;
    this.tier = t;
    this.resize();
    this.post.setQuality(t);
    bus.emit('quality:changed', { tier: t });
  }

  resize(): void {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv?.width ?? window.innerWidth));
    const h = Math.max(1, Math.round(vv?.height ?? window.innerHeight));
    this.width = w;
    this.height = h;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, TIER_PIXEL_RATIO[this.tier]);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, true);
    this.post.setSize(w, h, this.pixelRatio);
    this.resizeListeners.forEach((fn) => fn(w, h));
  }

  private resizeListeners = new Set<(w: number, h: number) => void>();
  onResized(fn: (w: number, h: number) => void): () => void {
    this.resizeListeners.add(fn);
    return () => this.resizeListeners.delete(fn);
  }

  render(view: View, dt: number): void {
    if (view.camera.aspect !== this.width / this.height) {
      view.camera.aspect = this.width / this.height;
      view.camera.updateProjectionMatrix();
    }
    this.post.render(view.scene, view.camera, dt);
  }

  /** Render one frame and return it as a PNG blob (photo mode). */
  async capture(view: View, scale = 1): Promise<Blob | null> {
    const prev = this.pixelRatio;
    if (scale !== 1) {
      this.renderer.setPixelRatio(prev * scale);
      this.post.setSize(this.width, this.height, prev * scale);
    }
    this.render(view, 0);
    const blob = await new Promise<Blob | null>((res) => this.canvas.toBlob(res, 'image/png'));
    if (scale !== 1) {
      this.renderer.setPixelRatio(prev);
      this.post.setSize(this.width, this.height, prev);
    }
    return blob;
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number; programs: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.post.dispose();
    this.renderer.dispose();
  }
}
