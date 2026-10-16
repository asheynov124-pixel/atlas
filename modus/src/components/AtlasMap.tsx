'use client';
import { useEffect, useMemo, useState } from 'react';
import { geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import centroids from '@/data/county-centroids.json';

/** us-atlas is a public, versioned dataset: fetched at runtime (pre-projected Albers USA, 975×610) instead of bundled. */
const US_ATLAS = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json';
const W = 975, H = 610;
function useUsMap() {
  const [m, setM] = useState<{ nation: string; borders: string } | null>(null);
  useEffect(() => {
    let on = true;
    fetch(US_ATLAS).then((r) => r.json()).then((t: Topology<{ nation: GeometryCollection; states: GeometryCollection }>) => {
      const path = geoPath();
      if (on) setM({ nation: path(feature(t, t.objects.nation)) ?? '', borders: path(mesh(t, t.objects.states, (a, b) => a !== b)) ?? '' });
    }).catch(() => {});
    return () => { on = false; };
  }, []);
  return m;
}

export type ClusterLite = { id: number; lens: string; decade: number | null; county: string; state: string; weapon: string; weaponClass: string | null; victims: number; solved: number; firstYear: number | null; lastYear: number | null; note: string | null };
type Base = { slug: string; name: string; county: string; state: string };
const FILL: Record<string, string> = { strangulation_or_suffocation: 'rgba(57,135,229,.42)', other_unknown: 'rgba(217,89,38,.42)', other_named: 'rgba(25,158,112,.5)' };
const LINE: Record<string, string> = { strangulation_or_suffocation: '#3987e5', other_unknown: '#d95926', other_named: '#199e70' };
const classOf = (c: ClusterLite) => c.weaponClass ?? (/strang|suffoc/i.test(c.weapon) ? 'strangulation_or_suffocation' : /other|unknown/i.test(c.weapon) ? 'other_unknown' : 'other_named');
const C = centroids as Record<string, { x: number; y: number; fips: string }>;

export function AtlasMap({ full, decade, bases, caveat }: { full: ClusterLite[]; decade: ClusterLite[]; bases: Base[]; caveat: string }) {
  const [lens, setLens] = useState<'full' | 'decade'>('full');
  const [maxShare, setMaxShare] = useState(33);
  const [minVictims, setMinVictims] = useState(6);
  const [layers, setLayers] = useState({ clusters: true, bases: true });
  const src = lens === 'full' ? full : decade;
  const shown = useMemo(() => src.filter((c) => c.victims >= minVictims && c.solved / c.victims <= maxShare / 100 + 1e-9).sort((a, b) => (b.victims - b.solved) - (a.victims - a.solved)), [src, minVictims, maxShare]);
  const top = shown.slice(0, 8);
  const usMap = useUsMap(); const width = W, height = H;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
      <div style={{ flex: '999 1 760px', minWidth: 0, background: 'var(--dark-panel)', border: '1px solid var(--dark-rule)' }}>
        <div className="mapbox" style={{ aspectRatio: `${width} / ${height}` }}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${shown.length} flagged clusters on a map of the United States`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {usMap ? <><path d={usMap.nation} fill="#22272E" /><path d={usMap.borders} fill="none" stroke="#39404A" strokeWidth="0.8" strokeLinejoin="round" /></> : <text x={width / 2} y={height / 2} textAnchor="middle" fontFamily="var(--mono)" fontSize="12" fill="#8A9099">loading county base map…</text>}
            {layers.clusters && shown.map((c) => { const p = C[`${c.county}|${c.state}`]; if (!p) return null; const u = c.victims - c.solved; const r = Math.max(Math.sqrt(u) * 2.7, 4); const k = classOf(c);
              return <circle key={c.id} id={`cl-${c.id}`} cx={p.x} cy={p.y} r={r} fill={FILL[k]} stroke={LINE[k]} strokeWidth="1.5"><title>{`${c.county}, ${c.state} · ${c.weapon}${c.decade ? ` · ${c.decade}s` : ''} · ${c.solved} solved of ${c.victims}`}</title></circle>; })}
            {layers.bases && bases.map((b) => { const p = C[`${b.county}|${b.state}`]; if (!p) return null; return <rect key={b.slug} x={p.x - 3.5} y={p.y - 3.5} width="7" height="7" transform={`rotate(45 ${p.x} ${p.y})`} fill="#E8E6E0" stroke="#101317" strokeWidth="1.5"><title>{b.name}</title></rect>; })}
            {layers.clusters && top.map((c, i) => { const p = C[`${c.county}|${c.state}`]; if (!p) return null; const u = c.victims - c.solved; const dx = Math.sqrt(u) * 2.7 + 6; const left = p.x > width * 0.8;
              return <text key={'t' + c.id} x={left ? p.x - dx : p.x + dx} y={p.y + 4 + (i % 2 ? 12 : -8)} fontFamily="var(--mono)" fontSize="11" fontWeight="500" fill="#E8E6E0" textAnchor={left ? 'end' : 'start'} style={{ paintOrder: 'stroke', stroke: '#101317', strokeWidth: 3 }}>{`${c.county.toUpperCase()}${c.county.includes('city') || c.county === 'District of Columbia' ? '' : ' CO.'}, ${c.state} · ${u}`}</text>; })}
          </svg>
          <div className="mono" style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 10, color: '#8A9099' }}>Albers USA · us-atlas counties · MAP SHR 1980–2014</div>
          {!bases.length && layers.bases && <div className="mono" style={{ position: 'absolute', left: 12, bottom: 10, fontSize: 10, color: '#8A9099' }}>Home bases: none sourced yet</div>}
        </div>
      </div>
      <aside aria-label="Map controls" style={{ flex: '1 1 280px', maxWidth: 330, background: 'var(--dark-panel)', border: '1px solid var(--dark-rule)', color: 'var(--dark-ink)', padding: '20px 22px' }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.14em', color: '#A9AEB5' }}>LENS</div>
        <div role="group" aria-label="Time lens" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 10 }}>
          {(['full', 'decade'] as const).map((k) => <button key={k} type="button" aria-pressed={lens === k} onClick={() => setLens(k)} style={{ height: 40, cursor: 'pointer', background: lens === k ? 'var(--gold)' : 'transparent', border: lens === k ? 0 : '1px solid #3A414B', color: lens === k ? '#14161A' : '#D9D7D0', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: lens === k ? 600 : 400 }}>{k === 'full' ? 'Full 35 years' : 'By decade'}</button>)}
        </div>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.14em', color: '#A9AEB5', marginTop: 22 }}>THRESHOLD</div>
        <label style={{ display: 'block', marginTop: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Max share solved</span><span className="mono" style={{ color: 'var(--gold)' }}>{maxShare}%</span></div>
          <input type="range" min={5} max={100} step={1} value={maxShare} onChange={(e) => setMaxShare(+e.target.value)} style={{ width: '100%', accentColor: 'var(--gold)', marginTop: 8 }} /></label>
        <label style={{ display: 'block', marginTop: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Min victims</span><span className="mono" style={{ color: 'var(--gold)' }}>{minVictims}</span></div>
          <input type="range" min={1} max={60} step={1} value={minVictims} onChange={(e) => setMinVictims(+e.target.value)} style={{ width: '100%', accentColor: 'var(--gold)', marginTop: 8 }} /></label>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.14em', color: '#A9AEB5', marginTop: 22 }}>LAYERS</div>
        <label className="lay"><input type="checkbox" checked={layers.clusters} onChange={(e) => setLayers({ ...layers, clusters: e.target.checked })} /><span>Flagged clusters · {shown.length}</span></label>
        <label className="lay"><input type="checkbox" checked={layers.bases} onChange={(e) => setLayers({ ...layers, bases: e.target.checked })} /><span>Offender home bases · {bases.length}</span></label>
        <label className="lay" style={{ opacity: .5 }}><input type="checkbox" disabled /><span>All counties, solve rate (needs the raw file)</span></label>
        <label className="lay" style={{ opacity: .5 }}><input type="checkbox" disabled /><span>Non-reporting years (needs the raw file)</span></label>
        <p style={{ margin: '18px 0 0', paddingTop: 14, borderTop: '1px solid var(--dark-rule)', fontSize: 13, lineHeight: 1.5, color: '#B9BCC2' }}>{caveat}{(maxShare < 33 || minVictims > 6) ? ' Tighter thresholds filter the flagged set; loosening below MAP’s defaults needs the raw file.' : ''}</p>
      </aside>
    </div>
  );
}
