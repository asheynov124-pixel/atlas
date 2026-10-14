import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { listOffenders } from '@/lib/queries';
export const dynamic = 'force-dynamic';

export default async function Unidentified() {
  const rows = (await listOffenders()).filter((o) => o.legalStatus === 'unidentified');
  return (
    <>
      <SiteHeader active="unidentified" />
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <section style={{ paddingTop: 44 }}>
          <div className="k" style={{ color: 'var(--ox)' }}>Unidentified · {rows.length} cases · no proceeding on record</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(40px,6vw,84px)', lineHeight: .95, letterSpacing: '-.02em' }}>Never named,<br /><em style={{ fontWeight: 500 }}>never tried</em></h1>
          <p className="serif" style={{ margin: '22px 0 0', fontSize: 20, lineHeight: 1.55, maxWidth: 820, color: 'var(--ink2)' }}>Each of these files has victims and a pattern but no defendant. Every count is an attribution by investigators, never a court result, and the proven column stays empty until someone is charged.</p>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 18, marginTop: 36 }}>
          {rows.map((o) => (
            <Link key={o.id} href={`/case/${o.slug}`} className="panel doc">
              <span className="k" style={{ color: 'var(--ox)' }}>{o.statesNote ?? o.states.join(' · ')} · {o.firstKillingYear === o.lastKillingYear ? o.firstKillingYear : `${o.firstKillingYear}–${o.lastKillingYear}`}</span>
              <span className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{o.name}</span>
              <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{o.victimology}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{o.attributed} attributed · {o.methods.join(', ')}</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
