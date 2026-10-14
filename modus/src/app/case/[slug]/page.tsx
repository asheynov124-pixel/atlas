import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { getDossier, listOffenders, getAtlas } from '@/lib/queries';
import { computeLinks } from '@/lib/links';
import { Summary } from '@/components/dossier/Summary';
import { RecordTimeline } from '@/components/dossier/RecordTimeline';
import { RecoveryMap } from '@/components/dossier/RecoveryMap';
import { BasisPanel, AgePanel, MapLensPanel } from '@/components/dossier/Panels';
import { Caught } from '@/components/dossier/Caught';
import { CountSection } from '@/components/dossier/CountSection';
import { Ledger, type LedgerRow } from '@/components/dossier/Ledger';
import { Totals } from '@/components/dossier/Totals';
import { Connections } from '@/components/dossier/Connections';
import { Documents } from '@/components/dossier/Documents';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await getDossier((await params).slug);
  return { title: d ? d.offender.name : 'Not found' };
}

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [d, all, atlas] = await Promise.all([getDossier(slug), listOffenders(), getAtlas()]);
  if (!d) notFound();
  const o = d.offender;
  const notes = (o.notes ?? {}) as Record<string, any>;
  const groups = computeLinks(o, all, [...atlas.full, ...atlas.decade]);
  const hasCounts = d.counts.length > 0;
  const narrated = d.counts.filter((c) => c.narrative?.establishes?.length);
  const ledgerRows: LedgerRow[] = d.counts.map((c) => {
    const conf = d.conflicts.find((x) => x.subjectType === 'count' && x.subjectId === c.id && x.field === 'age_at_death');
    return { id: c.id, label: c.label, victimName: c.victimName, ageAtDeath: c.ageAtDeath, lastSeen: c.lastSeen, found: c.found, recoverySite: c.recoverySite, basis: c.basis, dna: c.dna, paint: c.paint, ledToRemains: c.ledToRemains, janeDoeLabel: c.janeDoeLabel, identifiedYear: c.identifiedYear, ageConflict: conf ? `Sources differ: ${conf.claims.map((x) => `${x.value} (${x.note ?? x.source_id})`).join(' vs ')}` : null };
  });
  const does = d.counts.filter((c) => c.janeDoeLabel);
  const lastId = Math.max(0, ...does.map((c) => c.identifiedYear ?? 0));
  const ledgerDek = `All ${d.counts.length} counts, as charged.${does.length ? ` ${does.length === 1 ? 'One victim was' : `${does.length} victims were`} pleaded as Jane Doe${does.length > 1 ? 's' : ''} and named later${lastId ? `, the last in ${lastId}` : ''}.` : ''}`;
  const toc = [
    hasCounts && ['#record', 'The record'], hasCounts && ['#map', 'Recovery sites'], ['#caught', o.legalStatus === 'unidentified' ? 'The case' : 'How they were caught'],
    ...narrated.map((c) => [`#count-${c.label.toLowerCase()}`, `Count ${c.label}`]), hasCounts && ['#ledger', 'Ledger'], ['#totals', 'Totals'], ['#links', 'Connections'], ['#documents', 'Documents'],
  ].filter(Boolean) as [string, string][];
  const next = groups.flatMap((g) => g.rows.map((r) => ({ ...r, why: g.why }))).find((r) => r.href.startsWith('/case/'));

  return (
    <>
      <SiteHeader />
      <div className="subbar">
        <div className="wrap">
          <span className="k">On this file</span>
          {toc.map(([h, l]) => <a key={h} href={h}>{l}</a>)}
          <span style={{ flex: 1 }} />
          {notes.recordStatus && <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{notes.recordStatus}</span>}
        </div>
      </div>
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <Summary d={d} />
        {hasCounts && <RecordTimeline d={d} />}
        {hasCounts && (
          <section id="map" className="sec" aria-labelledby="h-map">
            <div className="sh"><div><h2 id="h-map" className="h2">Where the remains were found</h2>
              <p className="dek">{notes.mapNote ?? 'Recovery sites as named in the record.'} Points sharing a site are fanned out so each victim stays visible; positions are approximate to the named site.</p></div></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
              <RecoveryMap d={d} />
              <div style={{ flex: '1 1 340px', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <BasisPanel d={d} /><AgePanel d={d} /><MapLensPanel d={d} />
              </div>
            </div>
          </section>
        )}
        <Caught d={d} />
        {narrated.map((c) => <CountSection key={c.id} d={d} c={c} />)}
        {hasCounts && <Ledger rows={ledgerRows} slug={o.slug} dek={ledgerDek} />}
        <Totals d={d} />
        <Connections groups={groups} />
        <Documents docs={d.documents} reviewOpen={d.reviewOpen} />
        {next && (
          <Link href={next.href} className="nextcard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="mono" style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--gold)', textTransform: 'uppercase' }}>Next · {next.why}</span><span style={{ color: 'var(--gold)' }}>→</span></div>
            <div className="serif" style={{ marginTop: 6, fontSize: 21, fontWeight: 600 }}>{next.name}</div>
            <div style={{ marginTop: 3, fontSize: 12.5, color: '#B9BCC2' }}>{next.court != null ? `${next.court} proven` : 'no court result'} · {next.meta}</div>
          </Link>
        )}
      </main>
    </>
  );
}
