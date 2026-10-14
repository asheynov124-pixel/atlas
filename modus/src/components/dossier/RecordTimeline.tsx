import type { Dossier } from '@/lib/queries';
import { decYear, fmtDate, piecewise, BASIS_VAR } from '@/lib/format';
import { TIMELINE_BREAKS } from '@/data/presentation';

const LANES = [['investigation', 'Investigation'], ['forensics', 'Forensics & identification'], ['court', 'Court']] as const;

export function RecordTimeline({ d }: { d: Dossier }) {
  const o = d.offender;
  const rows = d.counts.map((c) => ({ c, t0: decYear(c.lastSeen), t1: decYear(c.found)! }))
    .filter((r) => r.t1 != null)
    .sort((a, b) => (a.t0 ?? a.t1 - 0.001) - (b.t0 ?? b.t1 - 0.001));
  const evs = d.events.map((e, i) => ({ ...e, n: i + 1, t: decYear(e.date)! }));
  const allT = [...rows.flatMap((r) => [r.t0 ?? r.t1, r.t1]), ...evs.map((e) => e.t)];
  const y0 = Math.floor(Math.min(...allT)), y1 = Math.ceil(Math.max(...allT)) + 1;
  const cfg = TIMELINE_BREAKS[o.slug] ?? generic(y0, y1);
  const X = piecewise(cfg.domain, cfg.range);
  const lanes = LANES.map(([key, name]) => {
    const items = evs.filter((e) => e.lane === key);
    const last: number[] = [];
    const pins = items.map((e) => { let r = 0; const x = X(e.t); while (last[r] != null && x - last[r] < 2.1) r++; last[r] = x; return { n: e.n, x, row: r }; });
    const h = 16 + Math.max(...pins.map((p) => p.row), 0) * 22 + 22;
    return { key, name, items, pins, h };
  }).filter((l) => l.items.length);

  return (
    <section id="record" className="sec" aria-labelledby="h-record">
      <div className="sh">
        <div>
          <h2 id="h-record" className="h2">Vanished, recovered, identified</h2>
          <p className="dek">One line per conviction, from the day she was last seen (open circle) to the day her remains were found (filled). A diamond marks a later identification. {lanes.length ? 'Below, the investigation on the same clock. ' : ''}{cfg.breaks.length ? 'Dashed lines mark where the time scale compresses.' : ''}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13.5, color: 'var(--ink2)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: 'var(--P)' }} />Physical evidence (DNA or paint)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: 'var(--L)' }} />Led investigators to the remains</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: 'var(--C)' }} />Confession and site knowledge</span>
        </div>
      </div>
      <div className="panel scroll-x" style={{ padding: '22px 22px 18px' }}>
        <div style={{ minWidth: 980 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: '0 14px' }}>
            <div />
            <div style={{ position: 'relative', height: 22 }}>{cfg.ticks.map(([y, l]) => <span key={y} className="tick" style={{ left: `${X(y)}%` }}>{l}</span>)}</div>
            <div>
              {rows.map(({ c }) => (
                <div key={c.id} style={{ height: 13, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontSize: 11.5, lineHeight: '13px', whiteSpace: 'nowrap', fontStretch: '87%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.victimName ?? 'not established'}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', width: 44, textAlign: 'right' }}>{c.label}</span>
                </div>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              {cfg.ticks.map(([y]) => <div key={y} className="grid-v" style={{ left: `${X(y)}%`, ...(cfg.breaks.includes(y) ? { background: 'none', borderLeft: '1px dashed #B49A8C' } : {}) }} />)}
              {rows.map(({ c, t0, t1 }) => {
                const col = BASIS_VAR[c.basis];
                return (
                  <div key={c.id} className="tl-row" title={`${c.label} · ${c.victimName} · ${fmtDate(c.lastSeen)} → ${fmtDate(c.found)}`}>
                    {t0 != null && <div className="seg" style={{ left: `${X(t0)}%`, width: `${Math.max(X(t1) - X(t0), 0.25)}%`, background: col }} />}
                    {t0 != null && <div className="d0" style={{ left: `${X(t0)}%`, borderColor: col }} />}
                    <div className="d1" style={{ left: `${X(t1)}%`, background: col }} />
                    {c.identifiedYear != null && c.identifiedYear > Math.floor(t1) && <div className="did" style={{ left: `${X(c.identifiedYear + 0.5)}%` }} />}
                  </div>
                );
              })}
            </div>
          </div>
          {lanes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: '0 14px', marginTop: 22, borderTop: '1px solid var(--ink)' }}>
              {lanes.map((l) => (
                <div key={l.key} style={{ display: 'contents' }}>
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--rule2)', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{l.items.length} events</span>
                  </div>
                  <div style={{ position: 'relative', height: l.h, borderBottom: '1px solid var(--rule2)' }}>
                    {cfg.ticks.map(([y]) => <div key={y} className="grid-v" style={{ left: `${X(y)}%`, ...(cfg.breaks.includes(y) ? { background: 'none', borderLeft: '1px dashed #B49A8C' } : {}) }} />)}
                    {l.pins.map((p) => <span key={p.n} className={`pin pin-${l.key[0]}`} style={{ left: `${p.x}%`, top: 8 + p.row * 22 }}>{p.n}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {lanes.length > 0 && (
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: '0 36px' }}>
          {lanes.map((l) => (
            <div key={l.key}>
              <div className="k" style={{ padding: '10px 0 6px', color: 'var(--ink)' }}>{l.name}</div>
              {l.items.map((e) => (
                <div key={e.n} className="ev">
                  <span className={`badge pin-${l.key[0]}`}>{e.n}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 2 }}>{fmtDate(e.date)}</span>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function generic(y0: number, y1: number) {
  const span = y1 - y0;
  const ticks: [number, string][] = [];
  if (span <= 14) { for (let y = y0; y <= y1; y++) ticks.push([y, y === y0 ? String(y) : `'${String(y).slice(2)}`]); return { domain: [y0, y1], range: [0, 100], ticks, breaks: [] as number[] }; }
  const mid = y0 + 10;
  for (let y = y0; y <= mid; y++) ticks.push([y, y === y0 ? String(y) : `'${String(y).slice(2)}`]);
  for (let y = Math.ceil((mid + 1) / 5) * 5; y <= y1; y += 5) ticks.push([y, String(y)]);
  return { domain: [y0, mid, y1], range: [0, 62, 100], ticks, breaks: [mid] };
}
