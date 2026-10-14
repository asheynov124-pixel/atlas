import { SiteHeader } from '@/components/SiteHeader';
import { listReview } from '@/lib/queries';
export const dynamic = 'force-dynamic';

export default async function Review() {
  const rows = await listReview();
  const open = rows.filter((r) => r.status === 'open');
  const byKind = Object.entries(open.reduce<Record<string, number>>((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {}));
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <section style={{ paddingTop: 44 }}>
          <div className="k" style={{ color: 'var(--ox)' }}>Review queue · {open.length} open</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(40px,6vw,84px)', lineHeight: .95, letterSpacing: '-.02em' }}>What is not yet<br /><em style={{ fontWeight: 500 }}>nailed down</em></h1>
          <p className="serif" style={{ margin: '22px 0 0', fontSize: 20, lineHeight: 1.55, maxWidth: 820, color: 'var(--ink2)' }}>Everything the importer or the verifier could not confirm lands here. {byKind.map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(' · ')}.</p>
        </section>
        <div className="panel scroll-x" style={{ marginTop: 36, padding: '18px 6px 6px' }}>
          <table className="tb" style={{ minWidth: 800 }}>
            <thead><tr><th scope="col">#</th><th scope="col">Kind</th><th scope="col">Subject</th><th scope="col">What is needed</th><th scope="col">Status</th><th scope="col"></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.status === 'open' ? 1 : .55 }}>
                <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.id}</td>
                <td className="k" style={{ color: 'var(--ox)', whiteSpace: 'nowrap' }}>{r.kind.replace(/_/g, ' ')}</td>
                <td style={{ fontWeight: 600 }}>{r.subjectLabel ?? `${r.subjectType} ${r.subjectId}`}</td>
                <td style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{r.message}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.status}</td>
                <td style={{ whiteSpace: 'nowrap' }}><form method="post" action="/api/review" style={{ display: 'flex', gap: 4 }}><input type="hidden" name="id" value={r.id} />{r.status === 'open' ? <><button className="chip" name="action" value="resolved">Resolve</button><button className="chip" name="action" value="dismissed">Dismiss</button></> : <button className="chip" name="action" value="open">Reopen</button>}</form></td>
              </tr>))}</tbody>
          </table>
        </div>
      </main>
    </>
  );
}
