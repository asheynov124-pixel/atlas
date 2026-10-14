import Link from 'next/link';

type Facets = Record<'status' | 'method' | 'state' | 'how', [string, string][]>;
type Active = { status: string; method: string; state: string; how: string; sort: string; from: number; to: number };

export function IndexFilters({ facets, active }: { facets: Facets; active: Active }) {
  const q = (patch: Partial<Record<string, string | number>>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number> = { status: active.status, method: active.method, state: active.state, how: active.how, sort: active.sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'sort' && v === 'first')) p.set(k, String(v));
    const s = p.toString(); return s ? `/?${s}` : '/';
  };
  const chips: [string, string][] = [];
  if (active.status) chips.push(['status', `Status: ${facets.status.find((f) => f[0] === active.status)?.[1] ?? active.status}`]);
  if (active.method) chips.push(['method', `Method: ${active.method}`]);
  if (active.state) chips.push(['state', `State: ${active.state}`]);
  if (active.how) chips.push(['how', `Caught: ${facets.how.find((f) => f[0] === active.how)?.[1] ?? active.how}`]);
  return (
    <div className="panel" style={{ marginTop: 30, padding: '18px 20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span className="k" style={{ marginRight: 6, color: 'var(--ink)' }}>Query</span>
        {chips.length ? chips.map(([k, l], i) => (
          <span key={k} style={{ display: 'contents' }}>{i > 0 && <span className="mono" style={{ fontSize: 12, color: 'var(--ox)', fontWeight: 600 }}>AND</span>}
            <Link href={q({ [k]: '' })} className="chip" title="Remove" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12.5, background: '#E4ECF6', borderColor: '#B7CBE3', color: '#14161A' }}>{l} ×</Link></span>
        )) : <span className="chip" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12.5 }}>All cases</span>}
        <span style={{ flex: 1 }} />
        <span className="k">Sort</span>
        {[['first', 'First killing'], ['proven', 'Court-proven count'], ['free', 'Years at large']].map(([k, l]) => <Link key={k} href={q({ sort: k })} className={`chip${active.sort === k ? ' on' : ''}`}>{l}</Link>)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rule2)' }}>
        <span className="k" style={{ marginRight: 6 }}>Facets</span>
        {(['method', 'state', 'how', 'status'] as const).map((k) => (
          <details key={k} style={{ position: 'relative' }}>
            <summary className="chip" style={{ cursor: 'pointer', listStyle: 'none' }}>{{ method: 'Method', state: 'State', how: 'How caught', status: 'Legal status' }[k]} ▾</summary>
            <div className="panel" style={{ position: 'absolute', zIndex: 6, marginTop: 4, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200, maxHeight: 280, overflowY: 'auto' }}>
              {facets[k].map(([v, l]) => <Link key={v} href={q({ [k]: v })} style={{ padding: '6px 8px', fontSize: 13.5, color: 'var(--ink)', background: active[k] === v ? '#E4ECF6' : undefined }}>{l}</Link>)}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
