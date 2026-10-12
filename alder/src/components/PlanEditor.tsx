import { useEffect, useRef, useState } from 'react';
import type { HouseRoom, Placed } from '../lib/types';
import { piece } from '../data/pieces';
import { paint } from '../data/palette';
import { FLOORS, opt } from '../data/materials';

interface Props {
  room: HouseRoom;
  /** Show mesh and sensor reach, and camera sightlines. */
  overlays?: boolean;
  selected?: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, p: Partial<Placed>) => void;
}

const SNAP = 0.25; // feet

/** A top-down plan you can drag furniture around. One foot = one grid square. */
export function PlanEditor({ room, selected, onSelect, onMove, overlays }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dz: number } | null>(null);
  const L = room.length, W = room.width;
  const PAD = 1.2;
  const vb = `${-PAD} ${-PAD} ${L + PAD * 2} ${W + PAD * 2}`;
  const floorHex = opt(FLOORS, room.surfaces.floor).hex ?? '#c9a673';
  const wallHex = paint(room.surfaces.wall).hex;

  function toRoom(e: { clientX: number; clientY: number }) {
    const s = svg.current!; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: p.x, z: p.y };
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const { x, z } = toRoom(e);
      const p = room.placed.find((q) => q.id === drag.id); const def = p && piece(p.pieceId); if (!p || !def) return;
      const w = (p.w ?? def.w) / 12, d = (p.d ?? def.d) / 12;
      const rot = ((p.rot % 180) + 180) % 180;
      const fw = rot === 90 ? d : w, fd = rot === 90 ? w : d;
      const nx = Math.round((x - drag.dx) / SNAP) * SNAP, nz = Math.round((z - drag.dz) / SNAP) * SNAP;
      onMove(drag.id, { x: Math.max(fw / 2, Math.min(L - fw / 2, nx)), z: Math.max(fd / 2, Math.min(W - fd / 2, nz)) });
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, room.placed, L, W]);

  const ordered = [...room.placed].sort((a, b) => (piece(a.pieceId)?.shape === 'rug' ? -1 : 0) - (piece(b.pieceId)?.shape === 'rug' ? -1 : 0) || ((piece(a.pieceId)?.ceiling ? 1 : 0) - (piece(b.pieceId)?.ceiling ? 1 : 0)));

  return (
    <svg ref={svg} viewBox={vb} className="h-full w-full touch-none select-none rounded-[1.25rem] bg-surface" onPointerDown={(e) => { if (e.target === svg.current) onSelect(null); }}>
      <defs>
        <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(128,128,128,0.18)" strokeWidth="0.02" /></pattern>
      </defs>
      {/* walls */}
      <rect x={-0.35} y={-0.35} width={L + 0.7} height={W + 0.7} fill={wallHex} stroke="var(--line)" strokeWidth={0.05} />
      <rect x={0} y={0} width={L} height={W} fill={floorHex} />
      <rect x={0} y={0} width={L} height={W} fill="url(#grid)" />
      {/* openings */}
      {room.openings.map((o) => {
        const t = 0.35;
        const r = o.wall === 0 ? { x: o.offset, y: -t, w: o.width, h: t } : o.wall === 2 ? { x: o.offset, y: W, w: o.width, h: t } : o.wall === 3 ? { x: -t, y: o.offset, w: t, h: o.width } : { x: L, y: o.offset, w: t, h: o.width };
        const isWin = o.kind === 'window';
        return (
          <g key={o.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={isWin ? '#9fc1dd' : 'var(--surface)'} />
            {!isWin && o.kind === 'door' && (o.wall === 0 || o.wall === 2 ? <path d={`M ${r.x} ${o.wall === 0 ? 0 : W} A ${o.width} ${o.width} 0 0 ${o.wall === 0 ? 1 : 0} ${r.x + o.width} ${o.wall === 0 ? o.width : W - o.width}`} fill="none" stroke="var(--muted)" strokeWidth={0.04} strokeDasharray="0.15 0.1" /> : <path d={`M ${o.wall === 3 ? 0 : L} ${r.y} A ${o.width} ${o.width} 0 0 ${o.wall === 3 ? 0 : 1} ${o.wall === 3 ? o.width : L - o.width} ${r.y + o.width}`} fill="none" stroke="var(--muted)" strokeWidth={0.04} strokeDasharray="0.15 0.1" />)}
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 0.1} fontSize={0.28} textAnchor="middle" fill="var(--fg)" style={{ pointerEvents: 'none' }}>{isWin ? 'W' : 'D'}</text>
          </g>
        );
      })}
      {/* dimension labels */}
      <text x={L / 2} y={-0.6} fontSize={0.4} textAnchor="middle" fill="var(--muted)">{L}′</text>
      <text x={-0.65} y={W / 2} fontSize={0.4} textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 ${-0.65} ${W / 2})`}>{W}′</text>
      <text x={L - 0.1} y={W + 0.9} fontSize={0.3} textAnchor="end" fill="var(--muted)">N ↑ is the top wall</text>
      {/* smart coverage, clipped to the room */}
      <defs><clipPath id={`clip-${room.id}`}><rect x={0} y={0} width={L} height={W} /></clipPath></defs>
      {overlays && <g clipPath={`url(#clip-${room.id})`}>{room.placed.map((p) => {
        const def = piece(p.pieceId); if (!def || (!def.reach && !def.fov)) return null;
        if (def.fov) {
          const r = def.reach ?? 20, a = (-p.rot - 90) * Math.PI / 180, half = (def.fov / 2) * Math.PI / 180;
          const x1 = p.x + Math.cos(a - half) * r, z1 = p.z + Math.sin(a - half) * r, x2 = p.x + Math.cos(a + half) * r, z2 = p.z + Math.sin(a + half) * r;
          return <path key={`c-${p.id}`} d={`M ${p.x} ${p.z} L ${x1} ${z1} A ${r} ${r} 0 ${def.fov > 180 ? 1 : 0} 1 ${x2} ${z2} Z`} fill="var(--oak)" opacity="0.14" stroke="var(--oak)" strokeWidth="0.04" strokeDasharray="0.3 0.2" />;
        }
        return <circle key={`c-${p.id}`} cx={p.x} cy={p.z} r={def.reach} fill={def.id === 'mesh' ? 'var(--good)' : 'var(--oak)'} opacity="0.1" stroke={def.id === 'mesh' ? 'var(--good)' : 'var(--oak)'} strokeWidth="0.04" strokeDasharray="0.3 0.2" />;
      })}</g>}
      {/* furniture */}
      {ordered.map((p) => {
        const def = piece(p.pieceId); if (!def) return null;
        const w = (p.w ?? def.w) / 12, d = (p.d ?? def.d) / 12;
        const sel = p.id === selected;
        const isRug = def.shape === 'rug', isCeil = !!def.ceiling;
        const fill = isRug ? 'rgba(200,180,140,0.55)' : isCeil ? 'rgba(224,176,122,0.25)' : def.wall ? 'rgba(138,106,69,0.55)' : 'rgba(120,110,100,0.7)';
        return (
          <g key={p.id} transform={`translate(${p.x} ${p.z}) rotate(${p.rot})`} onPointerDown={(e) => { e.stopPropagation(); onSelect(p.id); const { x, z } = toRoom(e); setDrag({ id: p.id, dx: x - p.x, dz: z - p.z }); (e.target as Element).setPointerCapture?.(e.pointerId); }} style={{ cursor: 'grab' }}>
            {isCeil ? <circle r={w / 2} fill={fill} stroke={sel ? 'var(--oak)' : 'var(--fg)'} strokeWidth={sel ? 0.08 : 0.03} strokeDasharray="0.12 0.08" /> : <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={def.shape === 'tub' ? d / 2 : def.shape === 'plant' ? w / 2 : 0.08} fill={fill} stroke={sel ? 'var(--oak)' : 'var(--fg)'} strokeWidth={sel ? 0.08 : 0.03} />}
            {def.shape === 'sofa' && <rect x={-w / 2 + 0.08} y={-d / 2 + 0.08} width={w - 0.16} height={d * 0.28} fill="rgba(0,0,0,0.18)" />}
            {def.shape === 'bed' && <><rect x={-w / 2 + 0.1} y={-d / 2 + 0.3} width={w * 0.42} height={0.9} rx={0.1} fill="rgba(255,255,255,0.4)" /><rect x={w / 2 - 0.1 - w * 0.42} y={-d / 2 + 0.3} width={w * 0.42} height={0.9} rx={0.1} fill="rgba(255,255,255,0.4)" /></>}
            {isCeil ? (
              <text y={-w / 2 - 0.12} fontSize={0.26} textAnchor="middle" fill="var(--oak)" style={{ pointerEvents: 'none' }} transform={`rotate(${-p.rot})`}>{p.label ?? def.name}</text>
            ) : (<>
              <text y={0.12} fontSize={Math.min(0.34, w / 5)} textAnchor="middle" fill="var(--fg)" style={{ pointerEvents: 'none' }} transform={`rotate(${-p.rot})`}>{p.label ?? def.name}</text>
              <text y={0.12 + Math.min(0.34, w / 5)} fontSize={0.22} textAnchor="middle" fill="var(--muted)" style={{ pointerEvents: 'none' }} transform={`rotate(${-p.rot})`}>{Math.round(w * 12)}″×{Math.round(d * 12)}″</text>
            </>)}
          </g>
        );
      })}
    </svg>
  );
}
