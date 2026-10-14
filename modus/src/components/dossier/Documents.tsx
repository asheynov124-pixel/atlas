import type { SourceRow } from '@/lib/queries';

const KIND: Record<string, string> = { charging_document: 'Charging document', plea: 'Plea', judgment: 'Judgment', evidence_summary: 'Evidence summary', opinion: 'Opinion', agency: 'Agency', dataset: 'Dataset', reporting: 'Reporting', reporting_archive: 'Reporting archive', book: 'Book', encyclopedia: 'Encyclopedia', other: 'Other' };
export const kindLabel = (k: string) => KIND[k] ?? k;

export function Documents({ docs, reviewOpen }: { docs: SourceRow[]; reviewOpen: number }) {
  return (
    <section id="documents" className="sec" aria-labelledby="h-docs">
      <div className="sh"><h2 id="h-docs" className="h2">Court records &amp; sources</h2></div>
      {docs.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 14 }}>
          {docs.map((d) => (
            <a key={d.id} href={d.archiveUrl ?? d.url ?? '#'} className="panel doc">
              <span className="k" style={{ color: 'var(--ox)' }}>{kindLabel(d.kind)}</span>
              <span className="serif" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.25 }}>{d.title}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{[d.publisher, d.date ? `filed ${d.date}` : null, d.pages ? `${d.pages} pp.` : null, d.archiveUrl ? 'archived copy' : d.url ? 'original link' : null].filter(Boolean).join(' · ')}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ padding: '20px 22px', fontSize: 14.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
          No court record is attached to this file yet. {reviewOpen > 0 ? `${reviewOpen} review item${reviewOpen > 1 ? 's are' : ' is'} open for it.` : ''} The research skill attaches the judgment or plea record and the count-level citations.
        </div>
      )}
    </section>
  );
}
