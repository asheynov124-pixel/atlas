import type { Dossier } from '@/lib/queries';
import { TIER_LABEL, TIER_RANK, fmtDate } from '@/lib/format';

/** Generic for every dossier: the proceedings and attributions the totals are computed from. */
export function Totals({ d }: { d: Dossier }) {
  const o = d.offender;
  return (
    <section id="totals" className="sec" aria-labelledby="h-totals">
      <div className="sh">
        <div><h2 id="h-totals" className="h2">What the totals rest on</h2>
          <p className="dek">{o.proven} proven in court, {o.attributed} attributed. The proven figure is computed from the proceedings below; nothing is typed in. Each attribution carries its tier.</p></div>
        {d.reviewOpen > 0 && <span className="chip" style={{ color: 'var(--ox)', borderColor: '#E2C9BC', background: '#F5E9E3' }}>{d.reviewOpen} open review item{d.reviewOpen > 1 ? 's' : ''}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(360px,100%),1fr))', gap: 18 }}>
        <div className="panel" style={{ padding: '20px 22px' }}>
          <div className="k" style={{ color: 'var(--ink)' }}>Court results · tiers 1–2</div>
          {d.proceedings.length ? d.proceedings.map((p) => (
            <div key={p.id} style={{ padding: '12px 0', borderTop: '1px solid var(--rule2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{p.label}</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{['acquittal', 'vacated', 'dismissed'].includes(p.outcome) ? `−${p.counts}` : p.counts}</span>
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>T{TIER_RANK[p.tier]} {TIER_LABEL[p.tier]}{p.court ? ` · ${p.court}` : ''}{p.caseNumber ? ` · ${p.caseNumber}` : ''}{p.date ? ` · ${fmtDate(p.date)}` : ''}</div>
              {p.note && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{p.note}</div>}
              <div style={{ fontSize: 13, marginTop: 4 }}>{p.source ? <a href={p.source.archiveUrl ?? p.source.url ?? '#'}>{p.source.title}</a> : <span className="ne">Citation pending</span>}</div>
            </div>
          )) : <p style={{ fontSize: 14, color: 'var(--ink2)' }}>No proceeding on record{o.legalStatus === 'unidentified' ? ': the offender was never identified.' : '.'}</p>}
        </div>
        <div className="panel" style={{ padding: '20px 22px' }}>
          <div className="k" style={{ color: 'var(--ink)' }}>Attributions · tiers 3–10</div>
          {d.attributions.length ? d.attributions.map((a) => (
            <div key={a.id} style={{ padding: '12px 0', borderTop: '1px solid var(--rule2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>T{TIER_RANK[a.tier]} · {TIER_LABEL[a.tier]}</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{a.totalCount}</span>
              </div>
              {a.note && <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{a.note}</div>}
              <div style={{ fontSize: 13, marginTop: 4 }}>{a.source ? <a href={a.source.archiveUrl ?? a.source.url ?? '#'}>{a.source.title}</a> : <span className="ne">Citation pending</span>}</div>
            </div>
          )) : <p style={{ fontSize: 14, color: 'var(--ink2)' }}>No attribution beyond the court record.</p>}
          {d.conflicts.length > 0 && <p className="mono" style={{ fontSize: 11, color: 'var(--ox)', marginTop: 12 }}>{d.conflicts.length} source conflict{d.conflicts.length > 1 ? 's' : ''} on this file: {d.conflicts.map((c) => `${c.field.replace(/_/g, ' ')} (${c.claims.map((x) => x.value).join(' vs ')})`).join('; ')}</p>}
        </div>
      </div>
    </section>
  );
}
