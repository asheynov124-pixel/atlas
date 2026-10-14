import type { Dossier } from '@/lib/queries';
import { STATUS_LABEL, TIER_LABEL } from '@/lib/format';

export function Summary({ d }: { d: Dossier }) {
  const o = d.offender;
  const notes = (o.notes ?? {}) as Record<string, any>;
  const tiles: { v: string; u: string; l: string }[] = notes.tiles ?? defaultTiles(d);
  const chips = [
    `${STATUS_LABEL[o.legalStatus]}${o.proven ? ` · ${o.proven} count${o.proven === 1 ? '' : 's'}` : ''}`,
    o.firstKillingYear ? `Active ${o.firstKillingYear} – ${o.lastKillingYear}` : null,
    ...o.methods.map(cap), o.mobility,
  ].filter(Boolean) as string[];
  const conflictsOnOffender = d.conflicts.filter((c) => c.subjectType === 'offender');
  const img = notes.imageSlot as { caption: string; note: string } | undefined;

  return (
    <section aria-label="Summary" className="stack" style={{ paddingTop: 48 }}>
      <div style={{ flex: '999 1 640px', minWidth: 0 }}>
        <div className="k" style={{ color: 'var(--ox)' }}>{o.caption ?? (o.legalStatus === 'unidentified' ? 'Unidentified · no proceeding on record' : 'Court caption not established')}</div>
        <h1 className="h1">{o.name}</h1>
        {o.alias && <p className="serif" style={{ margin: '16px 0 0', fontStyle: 'italic', fontSize: 24, color: 'var(--ink2)' }}>{o.alias}</p>}
        <p className="lede">{o.lede ?? <span className="ne">Dossier narrative not yet written. The figures below are computed from the proceedings on file; see “What the totals rest on.”</span>}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 26 }}>
          {chips.map((c, i) => <span key={i} className="chip">{i === 0 && <span className="sw" style={{ background: 'var(--ink)' }} />}{c}</span>)}
        </div>
        <section aria-label="Key figures" className="panel tiles" style={{ marginTop: 40 }}>
          {tiles.map((t, i) => (
            <div key={i} className="tile"><div className="big">{t.v}{t.u && <small>{t.u}</small>}</div><div className="tile-l">{t.l}</div></div>
          ))}
        </section>
      </div>
      <aside aria-label="Case vitals" style={{ flex: '1 1 340px', maxWidth: 420 }}>
        <figure className="panel" style={{ margin: 0 }}>
          <div style={{ aspectRatio: '4 / 5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'repeating-linear-gradient(135deg,#E9E5DB 0 10px,#E3DED2 10px 20px)' }}>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#8C8B86" strokeWidth="1.2" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{img?.caption ?? 'No image on file'}</span>
          </div>
          <figcaption className="mono" style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--rule)' }}>{img?.note ?? 'Image slot · public-record source and credit line required'}</figcaption>
        </figure>
        <dl className="vitals">
          {(o.vitals?.length ? o.vitals : fallbackVitals(d)).map((v, i) => (
            <div key={i} style={{ display: 'contents' }}><dt className="k">{v.k}</dt><dd>{v.v}</dd></div>
          ))}
        </dl>
        {conflictsOnOffender.length > 0 && (
          <p className="mono" style={{ fontSize: 11, color: 'var(--ox)', marginTop: 10 }}>{conflictsOnOffender.length} field{conflictsOnOffender.length > 1 ? 's' : ''} with conflicting sources</p>
        )}
      </aside>
    </section>
  );
}

function defaultTiles(d: Dossier) {
  const o = d.offender;
  const gap = o.caughtYear != null && o.lastKillingYear != null ? o.caughtYear - o.lastKillingYear : null;
  const t: { v: string; u: string; l: string }[] = [
    { v: String(o.proven), u: '', l: o.proven ? 'Murders established by conviction or plea, computed from the proceedings on file' : 'No murder established by a court' },
    { v: String(o.attributed), u: '', l: 'Highest credible attributed total, with its tier and source' },
  ];
  if (o.firstKillingYear && o.lastKillingYear) t.push({ v: String(o.lastKillingYear - o.firstKillingYear + 1), u: 'yrs', l: `Span of known killings, ${o.firstKillingYear}–${o.lastKillingYear}` });
  if (gap != null) t.push({ v: String(gap), u: 'yrs', l: gap === 0 ? 'Caught in the year of the last known killing' : 'From the last known killing to capture' });
  if (o.legalStatus === 'unidentified') t.push({ v: '—', u: '', l: 'Never identified. Open case.' });
  return t;
}
function fallbackVitals(d: Dossier) {
  const o = d.offender;
  const v: { k: string; v: string }[] = [];
  v.push({ k: 'Status', v: STATUS_LABEL[o.legalStatus] });
  if (o.caughtYear) v.push({ k: 'Caught', v: `${o.caughtYear}${o.howCaughtText ? ` · ${o.howCaughtText}` : ''}` });
  if (o.diedYear) v.push({ k: 'Died', v: String(o.diedYear) });
  v.push({ k: 'States', v: o.statesNote ?? o.states.join(', ') });
  v.push({ k: 'Method', v: o.methods.map(cap).join(', ') });
  v.push({ k: 'Victims', v: o.victimology ?? 'not established' });
  for (const p of d.proceedings) v.push({ k: p.outcome === 'guilty_plea' ? 'Pleaded' : 'Convicted', v: `${p.counts} count${p.counts === 1 ? '' : 's'}${p.date ? ` · ${p.date}` : ''} · ${TIER_LABEL[p.tier]}` });
  return v;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
