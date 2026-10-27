/**
 * Aspect Capture: the clip pauses, you circle (or box) what caught your eye,
 * optionally say or type what it is, and the AI turns it into a new path.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '../../state/ui';
import { lookupVideo } from '../../state/selectors';
import { performerLookup } from '../../state/taxonomy';
import { hitTest, visualParams } from '../../player/renderer';
import type { FacetWeights } from '../../data/types';
import { IconMic, IconTarget, IconX } from '../../components/Icons';
import { haptic } from '../../gestures/haptics';

type Tool = 'lasso' | 'box';
type Pt = { x: number; y: number };

const QUICK: { facet: keyof FacetWeights; label: string }[] = [
  { facet: 'face', label: 'This face' },
  { facet: 'body', label: 'This body type' },
  { facet: 'pose', label: 'This pose / energy' },
  { facet: 'composition', label: 'This look & light' },
];

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function CaptureLayer() {
  const capture = useUI((s) => s.capture)!;
  const setCapture = useUI((s) => s.setCapture);
  const setAspectDraft = useUI((s) => s.setAspectDraft);
  const openSheet = useUI((s) => s.openSheet);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('lasso');
  const [points, setPoints] = useState<Pt[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [text, setText] = useState('');
  const [quick, setQuick] = useState<keyof FacetWeights | undefined>();
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const video = lookupVideo(capture.videoId);
  const Speech = useMemo(speechCtor, []);

  const region = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.max(0, Math.min(...xs));
    const y = Math.max(0, Math.min(...ys));
    const w = Math.min(1, Math.max(...xs)) - x;
    const h = Math.min(1, Math.max(...ys)) - y;
    return w * h > 0.0015 ? { x, y, w, h } : null;
  }, [points]);

  // Imported media is never read by a face/body model, so a mark on it is only a note; words steer.
  const imported = video?.source === 'import';
  const hit = useMemo(() => {
    if (!region || !video || video.source === 'import') return null;
    const el = canvasRef.current;
    const aspect = el ? el.clientHeight / el.clientWidth : 844 / 390;
    return hitTest(visualParams(video, video.performerIds.map(performerLookup)), capture.time, region, aspect);
  }, [region, video, capture.time]);

  // Draw the user's mark.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const W = c.clientWidth;
    const H = c.clientHeight;
    ctx.clearRect(0, 0, W, H);
    if (points.length < 2) return;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.95)';
    ctx.fillStyle = 'rgba(167, 139, 250, 0.16)';
    ctx.shadowColor = 'rgba(167, 139, 250, 0.8)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    if (tool === 'box' && region) {
      if (typeof ctx.roundRect === 'function') ctx.roundRect(region.x * W, region.y * H, region.w * W, region.h * H, 14);
      else ctx.rect(region.x * W, region.y * H, region.w * W, region.h * H);
    } else {
      ctx.moveTo(points[0].x * W, points[0].y * H);
      for (const p of points.slice(1)) ctx.lineTo(p.x * W, p.y * H);
      if (!drawing) ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }, [points, tool, region, drawing]);

  const norm = (e: React.PointerEvent): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const exit = () => {
    recRef.current?.stop();
    setCapture(null);
  };

  const submit = () => {
    if (!video) return exit();
    haptic('success');
    recRef.current?.stop();
    setAspectDraft({ videoId: video.id, hit: hit?.weights ?? {}, regionLabel: hit?.label, text, quickFacet: quick });
    setCapture(null);
    openSheet({ kind: 'aspect-result', videoId: video.id });
  };

  const toggleMic = () => {
    if (!Speech) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Speech();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const before = text ? `${text} ` : '';
    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(before + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const breakdown = hit
    ? (Object.entries(hit.weights) as [string, number][])
        .filter(([, w]) => w > 0.06)
        .sort((a, b) => b[1] - a[1])
        .map(([f, w]) => `${f} ${Math.round(w * 100)}%`)
        .join(' · ')
    : null;

  return (
    <div className="capture" data-no-gesture>
      <canvas
        ref={canvasRef}
        className="capture__canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrawing(true);
          setPoints([norm(e)]);
        }}
        onPointerMove={(e) => {
          if (!drawing) return;
          const p = norm(e);
          setPoints((pts) => (tool === 'box' ? [pts[0], p] : [...pts, p]));
        }}
        onPointerUp={() => {
          setDrawing(false);
          if (points.length > 1) haptic('selection');
        }}
      />
      <div className="capture__top">
        <button type="button" className="icon-btn icon-btn--glass" aria-label="Cancel capture" onClick={exit}>
          <IconX size={20} />
        </button>
        <div className="capture__title">
          <IconTarget size={16} /> Aspect Capture
        </div>
        <div className="segmented segmented--small">
          <button type="button" className={`segmented__item${tool === 'lasso' ? ' segmented__item--on' : ''}`} onClick={() => setTool('lasso')}>
            Circle
          </button>
          <button type="button" className={`segmented__item${tool === 'box' ? ' segmented__item--on' : ''}`} onClick={() => setTool('box')}>
            Box
          </button>
        </div>
      </div>
      {!region && (
        <div className="capture__hint">
          {imported ? 'Mark what caught your eye, then say why — on imports your words steer the new path.' : 'Circle what caught your eye — a face, a body, a pose, or the light.'}
        </div>
      )}
      {breakdown && <div className="capture__read">Reads as: {breakdown}</div>}
      {imported && region && <div className="capture__read">Noted. Imports aren’t read by a face or body model — describe it below.</div>}
      <div className="capture__panel">
        <div className="capture__quick">
          {QUICK.filter((q) => !imported || q.facet === 'pose' || q.facet === 'composition').map((q) => (
            <button key={q.facet} type="button" className={`chip chip--button${quick === q.facet ? ' chip--active' : ''}`} onClick={() => setQuick(quick === q.facet ? undefined : q.facet)}>
              <span className="chip__body">{q.label}</span>
            </button>
          ))}
        </div>
        <div className="capture__input">
          <input
            type="text"
            value={text}
            placeholder="Describe it (optional) — “warm lighting”, “her smile”…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            enterKeyHint="go"
          />
          {Speech && (
            <button type="button" className={`icon-btn${listening ? ' icon-btn--rec' : ''}`} aria-label={listening ? 'Stop dictation' : 'Describe by voice'} onClick={toggleMic}>
              <IconMic size={20} />
            </button>
          )}
        </div>
        <div className="row row--end">
          {points.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setPoints([])}>
              Clear
            </button>
          )}
          <button type="button" className="btn btn--primary btn--capture" onClick={submit}>
            <IconTarget size={18} /> Find more like this
          </button>
        </div>
      </div>
    </div>
  );
}
