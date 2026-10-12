import { useEffect, useRef, useState } from 'react';
import type { Lot, LotFeature } from '../lib/types';
import { featureKind } from '../lib/lot';
import { textOn } from '../lib/color';

interface Props {
  lot: Lot;
  envelope: { x: number; y: number; w: number; h: number };
  selected: string | null;
  flagged: Set<string>;
  onSelect: (id: string | null) => void;
  onMoveHouse: (p: { x: number; y: number }) => void;
  onMoveFeature: (id: string, p: Partial<LotFeature>) => void;
}

const SNAP = 1;

/** The lot, north up, the street along the bottom edge. Drag the house or any feature. */
export function LotEditor({ lot, envelope, selected, flagged, onSelect, onMoveHouse, onMoveFeature }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const W = lot.width, D = lot.depth, PAD = 10;

  function toLot(e: { clientX: number; clientY: number }) {
    const s = svg.current!; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const { x, y } = toLot(e);
      const nx = Math.round((x - drag.dx) / SNAP) * SNAP, ny = Math.round((y - drag.dy) / SNAP) * SNAP;
      if (drag.id === 'house') onMoveHouse({ x: Math.max(0, Math.min(W - lot.house.w, nx)), y: Math.max(0, Math.min(D - lot.house.h, ny)) });
      else { const f = lot.features.find((q) => q.id === drag.id); if (f) onMoveFeature(f.id, { x: Math.max(-2, Math.min(W - f.w + 2, nx)), y: Math.max(-2, Math.min(D - f.h + 2, ny)) }); }
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, lot, W, D]);

  const start = (id: string, cur: { x: number; y: number }) => (e: React.PointerEvent) => { e.stopPropagation(); onSelect(id); const { x, y } = toLot(e); setDrag({ id, dx: x - cur.x, dy: y - cur.y }); (e.target as Element).setPointerCapture?.(e.pointerId); };

  return (
    <svg ref={svg} viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${D + PAD * 2}`} className="h-full w-full touch-none select-none rounded-xl bg-surface" onPointerDown={(e) => { if (e.target === svg.current) onSelect(null); }}>
      <defs><pattern id="setback" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M-1 3 L3 -1 M0 4 L4 0" stroke="var(--muted)" strokeWidth="0.3" opacity="0.5" /></pattern></defs>
      <rect x={0} y={0} width={W} height={D} fill="#7f9a6c" opacity="0.35" />
      {/* setbacks hatched */}
      <rect x={0} y={0} width={W} height={lot.setbacks.rear} fill="url(#setback)" />
      <rect x={0} y={D - lot.setbacks.front} width={W} height={lot.setbacks.front} fill="url(#setback)" />
      <rect x={0} y={0} width={lot.setbacks.side} height={D} fill="url(#setback)" />
      <rect x={W - lot.setbacks.side} y={0} width={lot.setbacks.side} height={D} fill="url(#setback)" />
      <rect x={envelope.x} y={envelope.y} width={envelope.w} height={envelope.h} fill="none" stroke="var(--oak)" strokeWidth="0.5" strokeDasharray="2 1.5" />
      <line x1={0} x2={W} y1={lot.setbacks.rear / 2} y2={lot.setbacks.rear / 2} stroke="var(--good)" strokeWidth="0.35" strokeDasharray="0.6 1" />
      {/* features below house */}
      {lot.features.map((f) => {
        const k = featureKind(f.kind); const sel = selected === f.id; const bad = flagged.has(f.id);
        return (
          <g key={f.id} onPointerDown={start(f.id, f)} style={{ cursor: 'grab' }}>
            {f.kind === 'tree' ? <circle cx={f.x + f.w / 2} cy={f.y + f.h / 2} r={f.w / 2} fill={k.hex} opacity="0.9" stroke={sel ? 'var(--oak)' : bad ? 'var(--stop)' : 'var(--ink)'} strokeWidth={sel || bad ? 0.8 : 0.3} />
              : <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={f.kind === 'pool' ? 2 : 0.5} fill={k.hex} opacity={f.kind === 'planting' ? 0.7 : 0.95} stroke={sel ? 'var(--oak)' : bad ? 'var(--stop)' : 'var(--ink)'} strokeWidth={sel || bad ? 0.8 : 0.3} />}
            {f.kind === 'deck' && Array.from({ length: Math.floor(f.w / 1.2) }).map((_, i) => <line key={i} x1={f.x + 0.6 + i * 1.2} x2={f.x + 0.6 + i * 1.2} y1={f.y} y2={f.y + f.h} stroke="#8d5a34" strokeWidth="0.12" opacity="0.45" />)}
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 + 1} fontSize={Math.min(2.6, f.w / 4)} textAnchor="middle" fill={textOn(k.hex)} style={{ pointerEvents: 'none' }}>{f.label ?? k.name}</text>
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 + 3.6} fontSize="1.8" textAnchor="middle" fill={textOn(k.hex)} opacity="0.75" style={{ pointerEvents: 'none' }}>{f.kind === 'tree' ? `${f.w}′ canopy` : `${f.w}×${f.h}${f.height ? ` · ${f.height}′ high` : ''}`}</text>
          </g>
        );
      })}
      {/* house */}
      <g onPointerDown={start('house', lot.house)} style={{ cursor: 'grab' }}>
        <rect x={lot.house.x} y={lot.house.y} width={lot.house.w} height={lot.house.h} fill="var(--ink)" opacity="0.9" stroke={selected === 'house' ? 'var(--oak)' : 'none'} strokeWidth="0.8" />
        <text x={lot.house.x + lot.house.w / 2} y={lot.house.y + lot.house.h / 2 + 1} fontSize="3" textAnchor="middle" fill="var(--paper)" style={{ pointerEvents: 'none' }}>House</text>
        <text x={lot.house.x + lot.house.w / 2} y={lot.house.y + lot.house.h / 2 + 4.4} fontSize="1.8" textAnchor="middle" fill="var(--paper)" opacity="0.7" style={{ pointerEvents: 'none' }}>{lot.house.w}×{lot.house.h}</text>
      </g>
      <rect x={0} y={0} width={W} height={D} fill="none" stroke="var(--fg)" strokeWidth="0.5" />
      <g fontSize="2.6" fill="var(--muted)">
        <text x={W / 2} y={D + 6} textAnchor="middle">Street · {W}′ wide</text>
        <text x={W + 4} y={D / 2} transform={`rotate(90 ${W + 4} ${D / 2})`} textAnchor="middle">{D}′ deep</text>
        <text x={1.5} y={D - lot.setbacks.front + 3}>front setback {lot.setbacks.front}′</text>
        <text x={1.5} y={lot.setbacks.rear - 1}>rear setback {lot.setbacks.rear}′</text>
        <text x={1.5} y={lot.setbacks.rear / 2 - 0.8} fill="var(--good)">low-deck line</text>
        <text x={W - 1} y={4} textAnchor="end">N ↑</text>
      </g>
    </svg>
  );
}
