import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { listSources } from '@/lib/queries';
import { kindLabel } from '@/components/dossier/Documents';
export const dynamic = 'force-dynamic';

export default async function Records() {
  const rows = await listSources();
  return (
    <>
      <SiteHeader active="records" />
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <section style={{ paddingTop: 44 }}>
          <div className="k" style={{ color: 'var(--ox)' }}>Court records &amp; sources · {rows.length} on file</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(40px,6vw,84px)', lineHeight: .95, letterSpacing: '-.02em' }}>Every document<br /><em style={{ fontWeight: 500 }}>cited anywhere</em></h1>
          <p className="serif" style={{ margin: '22px 0 0', fontSize: 20, lineHeight: 1.55, maxWidth: 820, color: 'var(--ink2)' }}>Archive copies are preferred over original links. A fact without a row on this page is not in the database.</p>
        </section>
        <div className="panel scroll-x" style={{ marginTop: 36, padding: '18px 6px 6px' }}>
          <table className="tb" style={{ minWidth: 900 }}>
            <thead><tr><th scope="col">Kind</th><th scope="col">Title</th><th scope="col">Publisher</th><th scope="col">Date</th><th scope="col">Cited on</th><th scope="col">Link</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="k" style={{ color: 'var(--ox)', whiteSpace: 'nowrap' }}>{kindLabel(s.kind)}</td>
                  <td style={{ fontWeight: 600 }}>{s.title}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink2)' }}>{s.publisher ?? '—'}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{s.date ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{s.offenders.length ? s.offenders.map((o) => <Link key={o.slug} href={`/case/${o.slug}`} style={{ marginRight: 8 }}>{o.name}</Link>) : <span className="ne">dataset / general</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.archiveUrl ? <a href={s.archiveUrl}>archive</a> : null}{s.archiveUrl && s.url ? ' · ' : ''}{s.url ? <a href={s.url}>original</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
