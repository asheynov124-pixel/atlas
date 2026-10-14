import Link from 'next/link';
import type { LinkGroup } from '@/lib/links';

export function Connections({ groups }: { groups: LinkGroup[] }) {
  return (
    <section id="links" className="sec" aria-labelledby="h-links">
      <div className="sh">
        <div><h2 id="h-links" className="h2">Connections</h2><p className="dek">Every link names the trait it shares with this file. Follow one and the next page offers its own.</p></div>
        <Link href="/" className="mono" style={{ fontSize: 12.5 }}>Open the full index →</Link>
      </div>
      {groups.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 18 }}>
          {groups.map((g) => (
            <div key={g.why} className="panel" style={{ padding: '20px 22px' }}>
              <div className="k" style={{ color: 'var(--ox)' }}>{g.why}</div>
              <p style={{ margin: '8px 0 14px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink2)' }}>{g.d}</p>
              {g.rows.map((x) => (
                <Link key={x.href + x.name} href={x.href} className="linkrow">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span className="serif" style={{ fontSize: 19, fontWeight: 600 }}>{x.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{x.meta}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
                    <span style={{ display: 'block', position: 'relative', height: 6, flex: 1, background: '#E6E1D5' }}>
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(x.claim ?? 0, 100)}%`, background: '#C9C3B5' }} />
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(x.court ?? 0, 100)}%`, background: 'var(--ink)' }} />
                    </span>
                    <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{x.court ?? '—'} / {x.claim ?? '—'}</span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : <p className="ne">No connection computed yet.</p>}
      <p className="mono" style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)' }}>Bar: dark = murders established in court · light = highest credible attributed count · scale 0–100</p>
    </section>
  );
}
