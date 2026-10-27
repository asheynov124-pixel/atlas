/**
 * Vertical clip player with a playback fallback chain:
 *   embed → direct source → "open original" card.
 *
 * Mock URLs (mock-embed://, mock-source://) render the procedural clip;
 * http(s) URLs use a sandboxed iframe or a <video>; imported stills render
 * full-screen. Either way the parent gets the same handle (play/pause/seek)
 * and progress callbacks.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PlaybackOption, VideoDetail, VideoSummary } from '../data/types';
import { drawFrame, visualParams } from './renderer';
import { performerLookup } from '../state/taxonomy';
import { useStore } from '../state/store';
import { IconExternal } from '../components/Icons';
import { openImport } from '../components/sheets/ImportSheets';

export interface PlayerHandle {
  seek: (fraction: number) => void;
  time: () => number;
  duration: () => number;
}

interface Props {
  summary: VideoSummary;
  detail: VideoDetail | null;
  /** Should be animating/playing right now. */
  playing: boolean;
  /** Mounted ahead of time: render a first frame, don't animate. */
  muted: boolean;
  onProgress?: (deltaSec: number, looped: boolean) => void;
  /** High-frequency time callback for the scrubber (called from rAF). */
  onTime?: (t: number, duration: number) => void;
  onResolved?: (kind: PlaybackOption['kind'] | 'failed') => void;
}

const isMock = (url: string) => url.startsWith('mock-');
const fails = (url: string) => /[?&]fail=1/.test(url);

export const ClipPlayer = forwardRef<PlayerHandle, Props>(function ClipPlayer(
  { summary, detail, playing, muted, onProgress, onTime, onResolved },
  ref,
) {
  const [optIndex, setOptIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const options = detail?.playback ?? [];
  const opt = options[optIndex];

  // Reset when the video changes.
  useEffect(() => {
    setOptIndex(0);
    setReady(false);
  }, [summary.id]);

  // Resolve the current option (simulated for mock URLs).
  useEffect(() => {
    if (!opt) return;
    setReady(false);
    if (opt.kind === 'original') {
      onResolved?.(options.length > 1 ? 'failed' : 'original');
      return;
    }
    if (isMock(opt.url)) {
      const delay = opt.kind === 'embed' ? 140 + Math.random() * 220 : 60;
      const timer = setTimeout(() => {
        if (fails(opt.url)) setOptIndex((i) => i + 1);
        else {
          setReady(true);
          onResolved?.(opt.kind);
        }
      }, delay);
      return () => clearTimeout(timer);
    }
    // Real network sources resolve in their element's load/error handlers.
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opt?.url, opt?.kind]);

  const advance = useCallback(() => setOptIndex((i) => i + 1), []);

  if (!detail || !opt) {
    return summary.source === 'import' ? <RemoteBackdrop url={summary.thumbnailUrl} /> : <ProceduralStill summary={summary} />;
  }
  if (opt.kind === 'original') {
    const imported = summary.source === 'import';
    const pageOnly = imported && summary.mediaType === 'page';
    return (
      <div className="player-fallback">
        {imported ? <RemoteBackdrop url={summary.thumbnailUrl} /> : <ProceduralStill summary={summary} dim />}
        <div className="player-fallback__card" data-no-gesture>
          <strong>{pageOnly ? 'Gallery page' : 'Can’t play this one here'}</strong>
          <span>
            {pageOnly
              ? `Could not read images from ${hostLabel(opt.url)}. Open the page, copy direct image links, and paste those into Import.`
              : imported
                ? 'The file didn’t load here (moved, private, or hotlink-protected).'
                : 'Embed and direct source both failed.'}
          </span>
          <a className="btn btn--primary" href={opt.url} target="_blank" rel="noopener noreferrer">
            {pageOnly ? 'Open page' : 'Open original'} <IconExternal />
          </a>
          {pageOnly && (
            <button type="button" className="btn btn--ghost" onClick={() => openImport()}>
              Paste links
            </button>
          )}
        </div>
      </div>
    );
  }
  if (opt.kind === 'image') {
    return <ImageStill key={opt.url} ref={ref} src={opt.url} clip={summary.clipDuration} playing={playing} onError={advance} onReady={() => onResolved?.('image')} onProgress={onProgress} onTime={onTime} />;
  }
  if (isMock(opt.url)) {
    return (
      <>
        {!ready && <ProceduralStill summary={summary} />}
        {ready && (
          <ProceduralCanvas ref={ref} summary={summary} detail={detail} playing={playing} onProgress={onProgress} onTime={onTime} />
        )}
        {!ready && <div className="player-loading" aria-label="Loading clip" />}
      </>
    );
  }
  if (opt.kind === 'source') {
    return (
      <NativeVideo
        ref={ref}
        src={opt.url}
        playing={playing}
        muted={muted}
        onError={advance}
        onReady={() => onResolved?.('source')}
        onProgress={onProgress}
        onTime={onTime}
      />
    );
  }
  return <EmbedFrame src={opt.url} onTimeout={advance} onReady={() => onResolved?.('embed')} />;
});

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'the site';
  }
}

function RemoteBackdrop({ url }: { url?: string }) {
  if (!url) return <div className="player-canvas player-canvas--dim player-remote-empty" />;
  return <div className="player-image__backdrop player-image__backdrop--dim" style={{ backgroundImage: `url("${url.replace(/"/g, '%22')}")` }} />;
}

/** Long looks at a still count like a replay, but only after a real stare. */
const STILL_LOOP_SEC = 20;

interface StillProps {
  src: string;
  clip: number;
  playing: boolean;
  onError: () => void;
  onReady: () => void;
  onProgress?: (dt: number, looped: boolean) => void;
  onTime?: (t: number, d: number) => void;
}

/**
 * Full-screen still. "Playing" means on screen and in focus: dwell time
 * accrues like watch time, so lingering teaches the model just as a video does.
 */
const ImageStill = forwardRef<PlayerHandle, StillProps>(function ImageStill({ src, clip, playing, onError, onReady, onProgress, onTime }, ref) {
  const fit = useStore((s) => s.settings.imageFit);
  const [loaded, setLoaded] = useState(false);
  const tRef = useRef(0);
  const cbRef = useRef({ onProgress, onTime });
  cbRef.current = { onProgress, onTime };
  const imgRef = useRef<HTMLImageElement>(null);
  useImperativeHandle(ref, () => ({ seek: () => undefined, time: () => tRef.current, duration: () => clip }), [clip]);
  // Keyed by src (a new src is a new element), so there's no reset effect to race the load event.
  // A cached image can finish before React wires onLoad: catch that here.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0 && !loaded) {
      setLoaded(true);
      onReady();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!playing || !loaded) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const prev = tRef.current;
      tRef.current = prev + dt;
      const looped = Math.floor(tRef.current / STILL_LOOP_SEC) > Math.floor(prev / STILL_LOOP_SEC);
      cbRef.current.onProgress?.(dt, looped);
      cbRef.current.onTime?.(Math.min(tRef.current, clip), clip);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, loaded, clip]);
  const bg = `url("${src.replace(/"/g, '%22')}")`;
  return (
    <div className={`player-image player-image--${fit}`}>
      {fit === 'contain' && loaded && <div className="player-image__backdrop" style={{ backgroundImage: bg }} />}
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => {
          if (loaded) return;
          setLoaded(true);
          onReady();
        }}
        onError={onError}
      />
      {!loaded && <div className="player-loading" aria-label="Loading image" />}
    </div>
  );
});

/** Single static frame — used for preloading slots and loading states. */
export function ProceduralStill({ summary, dim }: { summary: VideoSummary; dim?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const p = visualParams(summary, summary.performerIds.map(performerLookup));
    c.style.filter = p.cssFilter;
    const draw = () => {
      const { w, h } = sizeCanvas(c);
      drawFrame(ctx, p, 0, w, h);
    };
    draw();
    // Resizing a canvas clears it (iOS toolbar collapse, rotation): redraw.
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [summary]);
  return <canvas ref={canvasRef} className={`player-canvas${dim ? ' player-canvas--dim' : ''}`} />;
}

function sizeCanvas(c: HTMLCanvasElement): { w: number; h: number } {
  const rect = c.getBoundingClientRect();
  // Abstract visuals look fine at reduced resolution and it keeps us at 60fps.
  const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.55;
  const w = Math.max(120, Math.round((rect.width || 390) * scale));
  const h = Math.max(200, Math.round((rect.height || 844) * scale));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return { w, h };
}

interface CanvasProps {
  summary: VideoSummary;
  detail: VideoDetail;
  playing: boolean;
  onProgress?: (dt: number, looped: boolean) => void;
  onTime?: (t: number, d: number) => void;
}

const ProceduralCanvas = forwardRef<PlayerHandle, CanvasProps>(function ProceduralCanvas({ summary, detail, playing, onProgress, onTime }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const cbRef = useRef({ onProgress, onTime });
  cbRef.current = { onProgress, onTime };
  const clip = summary.clipDuration;

  useImperativeHandle(ref, () => ({
    seek: (fraction) => {
      tRef.current = Math.max(0, Math.min(0.999, fraction)) * clip;
    },
    time: () => tRef.current,
    duration: () => clip,
  }), [clip]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return;
    const params = visualParams(summary, detail.performers);
    c.style.filter = params.cssFilter;
    let { w, h } = sizeCanvas(c);
    const ro = new ResizeObserver(() => {
      ({ w, h } = sizeCanvas(c));
      // A resize clears the canvas; repaint now so paused clips don't go black.
      drawFrame(ctx, params, tRef.current, w, h);
    });
    ro.observe(c);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing) {
        const prev = tRef.current;
        let t = prev + dt;
        let looped = false;
        if (t >= clip) {
          t -= clip;
          looped = true;
        }
        tRef.current = t;
        cbRef.current.onProgress?.(dt, looped);
      }
      drawFrame(ctx, params, tRef.current, w, h);
      cbRef.current.onTime?.(tRef.current, clip);
      if (playing) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [summary, detail, playing, clip]);

  return <canvas ref={canvasRef} className="player-canvas" />;
});

interface NativeProps {
  src: string;
  playing: boolean;
  muted: boolean;
  onError: () => void;
  onReady: () => void;
  onProgress?: (dt: number, looped: boolean) => void;
  onTime?: (t: number, d: number) => void;
}

const NativeVideo = forwardRef<PlayerHandle, NativeProps>(function NativeVideo({ src, playing, muted, onError, onReady, onProgress, onTime }, ref) {
  const vRef = useRef<HTMLVideoElement>(null);
  const lastT = useRef(0);
  useImperativeHandle(ref, () => ({
    seek: (f) => {
      const v = vRef.current;
      if (v && v.duration) v.currentTime = f * v.duration;
    },
    time: () => vRef.current?.currentTime ?? 0,
    duration: () => vRef.current?.duration || 0,
  }));
  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing]);
  return (
    <video
      ref={vRef}
      className="player-video"
      src={src}
      muted={muted}
      playsInline
      loop
      autoPlay={playing}
      preload="auto"
      onError={onError}
      onLoadedData={onReady}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        const t = v.currentTime;
        const looped = t < lastT.current - 0.5;
        onProgress?.(looped ? t : Math.max(0, t - lastT.current), looped);
        lastT.current = t;
        onTime?.(t, v.duration || 0);
      }}
    />
  );
});

function EmbedFrame({ src, onTimeout, onReady }: { src: string; onTimeout: () => void; onReady: () => void }) {
  const loaded = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded.current) onTimeout();
    }, 7000);
    return () => clearTimeout(timer);
  }, [src, onTimeout]);
  return (
    <iframe
      className="player-embed"
      src={src}
      title="Embedded player"
      allow="autoplay; fullscreen; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      referrerPolicy="no-referrer"
      onLoad={() => {
        loaded.current = true;
        onReady();
      }}
    />
  );
}
