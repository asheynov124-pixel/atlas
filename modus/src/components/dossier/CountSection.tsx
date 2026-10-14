import Link from 'next/link';
import type { Dossier, CountRow, SourceRow } from '@/lib/queries';
import { fmtDate, decYear, TIER_LABEL } from '@/lib/format';

export function CountSection({ d, c, standalone = false }: { d: Dossier; c: CountRow; standalone?: boolean }) {
  const id = `count-${c.label.toLowerCase()}`;
  const conflicts = d.conflicts.filter((x) => x.subjectType === 'count' && x.subjectId === c.id);
  const ageConflict = conflicts.find((x) => x.field === 'age_at_death');
  const t0 = decYear(c.lastSeen), t1 = decYear(c.found);
  const days = t0 != null && t1 != null ? Math.max(0, Math.round((t1 - t0) * 365.25)) : null;
  const src = d.documents.filter((s) => s.id === c.sourceId || s.kind === 'charging_document');
  const proceeding = d.proceedings.find((p) => p.id === c.proceedingId);
  const Head = standalone ? 'h1' : 'h2';
  return (
    <section id={id} className="sec" aria-labelledby={`h-${id}`}>
      <div className="sh">
        <div>
          <div className="k" style={{ color: 'var(--ox)' }}>Count {c.label} · {proceeding?.label.includes('aggravated') ? 'Aggravated murder in the first degree' : 'Murder'}</div>
          <Head id={`h-${id}`} className="h2" style={{ marginTop: 8 }}>
            {c.victimName ?? <span className="ne">Name not established</span>}{c.ageAtDeath != null && <>, {c.ageAtDeath}</>}
            {ageConflict && <span className="conflict" title={ageConflict.claims.map((x) => `${x.value} (${x.note ?? x.source_id})`).join(' vs ')}>sources differ: {ageConflict.claims.map((x) => x.value).join(' / ')}</span>}
            {c.janeDoeLabel && <span className="conflict" style={{ color: 'var(--muted)', borderColor: 'var(--rule)', background: 'var(--panel)' }}>pleaded as Jane Doe {c.janeDoeLabel}{c.identifiedYear ? ` · identified ${c.identifiedYear}` : ''}</span>}
          </Head>
        </div>
        {standalone ? <Link href={`/case/${d.offender.slug}#ledger`} className="mono" style={{ fontSize: 12.5 }}>← Back to the ledger</Link>
          : <Link href={`/case/${d.offender.slug}/count/${c.label}`} className="mono" style={{ fontSize: 12.5 }}>Open this count →</Link>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'stretch' }}>
        <div className="panel" style={{ flex: '999 1 560px', minWidth: 0, padding: '26px 28px' }}>
          <div className="k" style={{ color: 'var(--P)', marginBottom: 12 }}>What the record establishes</div>
          {c.narrative?.establishes?.length ? (
            <ol style={{ margin: 0, paddingLeft: 22, fontFamily: 'var(--serif)', fontSize: 18.5, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.narrative.establishes.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 22, fontFamily: 'var(--serif)', fontSize: 18.5, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li>Last seen {fmtDate(c.lastSeen)}. Remains found {fmtDate(c.found)}{c.recoverySite ? ` at ${c.recoverySite}` : ''}.</li>
              {c.janeDoeLabel && <li>Pleaded as Jane Doe {c.janeDoeLabel}{c.identifiedYear ? `; identified in ${c.identifiedYear}` : ''}.</li>}
              {proceeding && <li>{proceeding.outcome === 'guilty_plea' ? 'Pleaded guilty' : 'Convicted'} {proceeding.date ? `on ${fmtDate(proceeding.date)}` : ''} ({TIER_LABEL[proceeding.tier]}).</li>}
              <li className="ne">The narrative for this count has not yet been written from the record.</li>
            </ol>
          )}
        </div>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel" style={{ padding: '18px 20px' }}>
            <div className="k" style={{ marginBottom: 10 }}>Evidence on this count</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 14 }}>
              <Row k="DNA match" yes={c.dna} />
              <Row k="Trace evidence" yes={c.paint} />
              <Row k="Led investigators to the remains" yes={c.ledToRemains} />
              <Row k="Confession" yes={c.basis === 'confession' || c.disposition === 'guilty'} text={proceeding?.date ? `Yes, ${proceeding.date.slice(0, 4)}` : undefined} />
              <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Days missing before found</span>{days != null ? <strong>{days}</strong> : <span className="ne">not established</span>}</span>
            </div>
          </div>
          <div className="panel" style={{ padding: '18px 20px' }}>
            <div className="k" style={{ marginBottom: 10 }}>Sources</div>
            {src.length ? src.map((s: SourceRow) => <a key={s.id} href={s.archiveUrl ?? s.url ?? '#'} style={{ display: 'block', fontSize: 14, lineHeight: 1.45, marginTop: 8 }}>{s.title}{s.id === c.sourceId && c.pinpoint ? `, ${c.pinpoint}` : ''}{s.kind === 'charging_document' ? `, Count ${c.label}` : ''}</a>)
              : <p className="ne" style={{ margin: 0, fontSize: 14 }}>No source attached</p>}
            {!c.pinpoint && <p className="mono" style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)' }}>Pinpoint pages to be added on import</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
function Row({ k, yes, text }: { k: string; yes: boolean; text?: string }) {
  return <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span>{yes ? <strong style={{ color: 'var(--P)' }}>{text ?? 'Yes'}</strong> : <span className="mono" style={{ color: 'var(--muted)' }}>No</span>}</span>;
}
