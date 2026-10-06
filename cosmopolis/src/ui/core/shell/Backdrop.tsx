/**
 * OWNER: ui-core.
 * MenuBackdrop — the cinematic main-menu background: CSS nebula, three canvas2D star layers, a ringed homeworld
 * with city lights, an orbiting moon, twinkles and shooting stars. Parallax follows the pointer / touch and a slow
 * Lissajous drift; all motion is transform-only on composited layers (cheap on iPhone) and stops with reduce motion.
 */
import { useEffect, useRef } from 'preact/hooks';
import { Rng } from '../../../core/rng';
import { reduceMotion } from '../env';
import { paintPlanet, paintStars } from './art';

/** The painted homeworld survives menu → game → menu round trips. */
let heroCache: HTMLCanvasElement | null = null;

export function MenuBackdrop({ planetType = 'terran' as const }: { planetType?: 'terran' }) {
  const root = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLCanvasElement>(null);
  const mid = useRef<HTMLCanvasElement>(null);
  const near = useRef<HTMLCanvasElement>(null);
  const planet = useRef<HTMLCanvasElement>(null);
  const planetWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const w = Math.max(320, window.innerWidth) * 1.12;
    const h = Math.max(320, window.innerHeight) * 1.12;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (far.current) paintStars(far.current, w, h, dpr, { count: Math.round((w * h) / 2600), minR: 0.35, maxR: 0.9, seed: 11, alpha: 0.7 });
    if (mid.current) paintStars(mid.current, w, h, dpr, { count: Math.round((w * h) / 9000), minR: 0.5, maxR: 1.3, seed: 23, glow: 0.12 });
    if (near.current) paintStars(near.current, w, h, dpr, { count: Math.round((w * h) / 30000) + 8, minR: 0.8, maxR: 2.1, seed: 37, glow: 0.6 });
    const token = { cancelled: false };
    const pc = planet.current;
    if (pc) {
      // planet disc radius ≈ 36 % of the width on phones, 30 % of the height on wide screens
      const discR = Math.min(window.innerWidth * 0.36, window.innerHeight * 0.3);
      const css = Math.round(discR / 0.27);
      const px = Math.min(1200, Math.round(css * Math.min(dpr, 1.5)));
      pc.style.width = css + 'px';
      pc.style.height = css + 'px';
      if (heroCache && heroCache.width === px) {
        // returning to the menu: reuse the painted homeworld instead of repainting it
        pc.width = px;
        pc.height = px;
        pc.getContext('2d')?.drawImage(heroCache, 0, 0);
        planetWrap.current?.classList.add('is-ready');
      } else {
        void paintPlanet(pc, { type: planetType, seed: 2350, size: px, rings: true, cityLights: true, discFrac: 0.27, light: [-0.62, -0.38, 0.62], rowsPerFrame: 48, token }).then(() => {
          if (token.cancelled) return;
          try {
            const keep = document.createElement('canvas');
            keep.width = pc.width;
            keep.height = pc.height;
            keep.getContext('2d')?.drawImage(pc, 0, 0);
            heroCache = keep;
          } catch {
            /* the cache is optional */
          }
          planetWrap.current?.classList.add('is-ready');
        });
      }
    }
    // parallax loop
    if (reduceMotion()) return () => void (token.cancelled = true);
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    const layers = [far.current, mid.current, near.current, planetWrap.current];
    const depth = [5, 12, 24, -16];
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const t = (now - t0) / 1000;
      const dx = Math.sin(t * 0.07) * 0.6 + tx * 0.8;
      const dy = Math.sin(t * 0.053 + 1.3) * 0.4 + ty * 0.8;
      cx += (dx - cx) * 0.04;
      cy += (dy - cy) * 0.04;
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        if (l) l.style.transform = `translate3d(${(-cx * depth[i]).toFixed(2)}px, ${(-cy * depth[i]).toFixed(2)}px, 0)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      token.cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    };
  }, []);

  // twinkling stars (DOM, CSS-animated)
  const rng = new Rng(99);
  const twinkles = Array.from({ length: 26 }, (_, i) => ({
    i,
    x: rng.range(2, 98),
    y: rng.range(2, 96),
    s: rng.range(1.2, 2.6),
    d: rng.range(0, 6),
    dur: rng.range(2.6, 5.5),
  }));

  return (
    <div class="mb-root" ref={root} aria-hidden="true">
      <div class="mb-nebula" />
      <canvas class="mb-layer mb-far" ref={far} />
      <canvas class="mb-layer mb-mid" ref={mid} />
      <div class="mb-twinkles">
        {twinkles.map((t) => (
          <span key={t.i} style={{ left: t.x + '%', top: t.y + '%', width: t.s + 'px', height: t.s + 'px', animationDelay: `-${t.d}s`, animationDuration: t.dur + 's' }} />
        ))}
      </div>
      <div class="mb-planet-wrap" ref={planetWrap}>
        <div class="mb-planet-glow" />
        <canvas class="mb-planet" ref={planet} />
        <div class="mb-moon-orbit">
          <div class="mb-moon" />
        </div>
      </div>
      <canvas class="mb-layer mb-near" ref={near} />
      <div class="mb-shooting">
        <span />
        <span />
      </div>
      <div class="mb-vignette" />
    </div>
  );
}
