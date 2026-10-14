import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { listOffenders, type OffenderRow } from '@/lib/queries';
import { STATUS_LABEL, STATUS_COLOR, HOW_LABEL, piecewise } from '@/lib/format';
import { IndexFilters } from '@/components/IndexFilters';

export const dynamic = 'force-dynamic';
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

export default async function IndexPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await listOffenders();
  const f = { status: one(sp.status), method: one(sp.method), state: one(sp.state), how: one(sp.how), sort: one(sp.sort) || 'first', from: +one(sp.from) || 0, to: +one(sp.to) || 9999 };
  let rows = all.filter((o) => (!f.status || o.legalStatus === f.status) && (!f.method || o.methods.includes(f.method)) && (!f.state || o.states.includes(f.state)) && (!f.how || o.howCaught === f.how)
    && (o.firstKillingYear ?? 0) >= f.from && (o.lastKillingYear ?? 9999) <= f.to);
  rows = rows.sort((a, b) => f.sort === 'proven' ? b.proven - a.proven : f.sort === 'free' ? free(b) - free(a) : (a.firstKillingYear ?? 0) - (b.firstKillingYear ?? 0) || a.name.localeCompare(b.name));
  const facets = {
    status: uniq(all.map((o) => o.legalStatus)).map((v) => [v, STATUS_LABEL[v]] as [string, string]),
    method: uniq(all.flatMap((o) => o.methods)).map((v) => [v, cap(v)] as [string, string]),
    state: uniq(all.flatMap((o) => o.states)).sort().map((v) => [v, v] as [string, string]),
    how: uniq(all.map((o) => o.howCaught).filter((x): x is NonNullable<typeof x> => !!x)).map((v) => [v, HOW_LABEL[v]] as [string, string]),
  };

  // Key figures, all computed
  const proven = rows.reduce((a, o) => a + o.proven, 0), attributed = rows.reduce((a, o) => a + o.attributed, 0);
  const widest = [...rows].sort((a, b) => b.attributed - b.proven - (a.attributed - a.proven))[0];
  const caught = rows.filter((o) => o.caughtYear != null && o.lastKillingYear != null);
  const sameYear = caught.filter((o) => o.caughtYear === o.lastKillingYear).length;
  const quiet = [...caught].sort((a, b) => (b.caughtYear! - b.lastKillingYear!) - (a.caughtYear! - a.lastKillingYear!))[0];
  const identified = rows.filter((o) => o.legalStatus !== 'unidentified').length;

  // Careers chart
  const y0 = Math.min(...rows.map((o) => o.firstKillingYear ?? 9999), 1930), y1 = 2026;
  const mid = y0 + 30;
  const X = piecewise([y0, mid, y1], [0, 14, 100]);
  const ticks = [1935, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].filter((y) => y >= y0);
  const career = [...rows].sort((a, b) => (a.firstKillingYear ?? 0) - (b.firstKillingYear ?? 0));
  const gap = [...rows].sort((a, b) => b.attributed - a.attributed);
  const howCats = ['forensic_science', 'traffic_stop', 'survivor_or_witness', 'records', 'investigation', 'surrendered', 'still_open'] as const;
  const how = howCats.map((k) => ({ k, label: HOW_LABEL[k], who: rows.filter((o) => o.howCaught === k) })).filter((h) => h.who.length);
  const howMax = Math.max(...how.map((h) => h.who.length), 1);

  return (
    <>
      <SiteHeader active="index" />
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <section style={{ paddingTop: 44 }}>
          <div className="k" style={{ color: 'var(--ox)' }}>The index · {rows.length === all.length ? `${all.length} cases` : `${rows.length} of ${all.length} cases`} · verified Oct 2026</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(40px,6vw,84px)', lineHeight: .95, letterSpacing: '-.02em' }}>What the courts proved,<br /><em style={{ fontWeight: 500 }}>and what we only believe</em></h1>
          <p className="serif" style={{ margin: '22px 0 0', fontSize: 20, lineHeight: 1.55, maxWidth: 820, color: 'var(--ink2)' }}>{words(identified)} identified killers and {words(rows.length - identified).toLowerCase()} who were never named. Every count below is split into what a conviction or plea established and what is attributed by confession, investigators or reporting.</p>
          <IndexFilters facets={facets} active={f} />
        </section>

        <section aria-label="Key figures" className="panel tiles" style={{ marginTop: 28, gridTemplateColumns: 'repeat(auto-fit,minmax(min(230px,100%),1fr))' }}>
          <div className="tile" style={{ padding: 22 }}><div className="big" style={{ fontSize: 50 }}>{proven}<small style={{ color: 'var(--muted)' }}> / {attributed}</small></div><div className="tile-l" style={{ fontSize: 14.5 }}>Murders proven in court, against the total attributed to these {rows.length}. {attributed ? `${Math.round((1 - proven / attributed) * 100)}% of the folklore is unproven.` : ''}</div></div>
          {widest && <div className="tile" style={{ padding: 22 }}><div className="big" style={{ fontSize: 50 }}>{widest.attributed}<small style={{ color: 'var(--muted)' }}> vs {widest.proven}</small></div><div className="tile-l" style={{ fontSize: 14.5 }}>{widest.name}'s attributed total against {widest.proven ? 'the convictions' : 'no court result'}, the widest gap in the set</div></div>}
          <div className="tile" style={{ padding: 22 }}><div className="big" style={{ fontSize: 50 }}>{sameYear}<small style={{ color: 'var(--muted)' }}> of {caught.length}</small></div><div className="tile-l" style={{ fontSize: 14.5 }}>Caught in the same year as their last known killing. Most stop because they are caught.</div></div>
          {quiet && <div className="tile" style={{ padding: 22 }}><div className="big" style={{ fontSize: 50 }}>{quiet.caughtYear! - quiet.lastKillingYear!}<small style={{ color: 'var(--muted)' }}> yrs</small></div><div className="tile-l" style={{ fontSize: 14.5 }}>{quiet.name.split(' ').pop()}'s quiet years between the last murder ({quiet.lastKillingYear}) and the arrest ({quiet.caughtYear})</div></div>}
        </section>

        <section className="sec" aria-labelledby="h-car">
          <div className="sh">
            <div><h2 id="h-car" className="h2">Careers on one clock</h2><p className="dek">The bar runs from first to last known killing. The dotted tail is the time they stayed free afterward. The ones who stopped on their own stand out.</p></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13.5, color: 'var(--ink2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: '#2a78d6' }} />Convicted or pleaded</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: '#1baf7a' }} />Died before trial</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: '#eb6834' }} />Unidentified</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ display: 'inline-block', width: 22, borderTop: '2px dotted #14161A' }} />Free after last killing</span>
            </div>
          </div>
          <div className="panel scroll-x" style={{ padding: '20px 20px 16px' }}>
            <div style={{ minWidth: 900 }}>
              <div className="row" style={{ height: 22 }}><span /><div style={{ position: 'relative', height: 22 }}>{ticks.map((y) => <span key={y} className="tick" style={{ left: `${X(y)}%`, top: 3 }}>{y}</span>)}</div><span className="k" style={{ fontSize: 10 }}>At large</span></div>
              {career.map((o) => {
                const col = STATUS_COLOR[o.legalStatus]; const f0 = o.firstKillingYear ?? y0, l = o.lastKillingYear ?? f0;
                const end = o.caughtYear ?? (o.legalStatus === 'unidentified' ? y1 : o.diedYear);
                const lag = o.caughtYear != null ? o.caughtYear - l : null;
                return (
                  <div key={o.id} className="row">
                    <Link href={`/case/${o.slug}`} className="nm">{o.shortName ?? o.name}</Link>
                    <div style={{ position: 'relative', height: 24 }}>
                      {ticks.map((y) => <span key={y} className="gv" style={{ left: `${X(y)}%`, ...(y === mid ? { background: 'none', borderLeft: '1px dashed #B49A8C' } : {}) }} />)}
                      {end != null && end > l && <span style={{ position: 'absolute', top: 11, height: 0, borderTop: `2px dotted ${o.legalStatus === 'unidentified' ? '#D6B49B' : '#14161A'}`, left: `${X(l + 0.9)}%`, width: `${X(end) - X(l + 0.9)}%` }} />}
                      <span style={{ position: 'absolute', top: 8, height: 8, borderRadius: 2, left: `${X(f0)}%`, width: `${Math.max(X(l + 0.9) - X(f0), 0.6)}%`, background: col }} />
                      {o.caughtYear != null && <span style={{ position: 'absolute', top: 5, width: 2, height: 14, background: '#14161A', left: `${X(o.caughtYear + 0.9)}%` }} />}
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: lag != null && lag >= 10 ? 'var(--ox)' : 'var(--ink2)' }}>{o.legalStatus === 'unidentified' ? 'never caught' : lag == null ? (o.diedYear ? `died ${o.diedYear}` : '—') : lag === 0 ? 'same year' : `+${lag} yrs`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
          <section className="sec" aria-labelledby="h-gap" style={{ flex: '999 1 620px', minWidth: 0 }}>
            <div className="sh"><div><h2 id="h-gap" className="h2">Proven vs attributed</h2><p className="dek">Dark dot: murders established by conviction or plea. Open dot: the highest credible attributed count. The line between them is the unproven remainder.</p></div></div>
            <div className="panel" style={{ padding: '20px 20px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 64px', gap: '0 14px', height: 22, alignItems: 'center' }}><span /><div style={{ position: 'relative', height: 20 }}>{[0, 20, 40, 60, 80, 100].map((v) => <span key={v} className="tick" style={{ left: `${v}%` }}>{v}</span>)}</div><span className="k" style={{ fontSize: 10 }}>Proven</span></div>
              {gap.map((o) => {
                const col = STATUS_COLOR[o.legalStatus]; const c = o.proven, cl = Math.min(o.attributed, 100); const hasCourt = o.legalStatus !== 'unidentified' && o.legalStatus !== 'died_uncharged';
                return (
                  <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 64px', gap: '0 14px', height: 22, alignItems: 'center' }}>
                    <Link href={`/case/${o.slug}`} className="nm" style={{ fontSize: 13 }}>{o.shortName ?? o.name}</Link>
                    <div style={{ position: 'relative', height: 22 }}>
                      {[0, 20, 40, 60, 80, 100].map((v) => <span key={v} className="gv" style={{ left: `${v}%` }} />)}
                      <span style={{ position: 'absolute', top: 10, height: 2, background: '#C9C3B5', left: `${c}%`, width: `${Math.max(cl - c, 0)}%` }} />
                      <span style={{ position: 'absolute', top: 6, width: 10, height: 10, marginLeft: -5, borderRadius: '50%', border: `2px solid ${col}`, background: 'var(--panel)', left: `${cl}%` }} />
                      {hasCourt && <span style={{ position: 'absolute', top: 6, width: 10, height: 10, marginLeft: -5, borderRadius: '50%', background: '#14161A', boxShadow: '0 0 0 2px #FBFAF6', left: `${c}%` }} />}
                    </div>
                    <span className="mono" style={{ fontSize: 12 }}>{hasCourt ? `${Math.round((c / o.attributed) * 100)}%` : '0%'}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="sec" aria-labelledby="h-how" style={{ flex: '1 1 360px', maxWidth: 460 }}>
            <div className="sh"><div><h2 id="h-how" className="h2">How they were caught</h2><p className="dek">Forensic science leads, but a third were caught by a cop on the road or a person who got away.</p></div></div>
            <div className="panel" style={{ padding: '20px 22px' }}>
              {how.map((h) => (
                <div key={h.k} style={{ padding: '12px 0', borderTop: '1px solid var(--rule2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}><Link href={`/?how=${h.k}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{h.label}</Link><span style={{ fontWeight: 700, fontSize: 20 }}>{h.who.length}</span></div>
                  <div style={{ height: 8, background: '#E6E1D5', marginTop: 7 }}><div style={{ height: '100%', width: `${(h.who.length / howMax) * 100}%`, background: h.k === 'still_open' ? '#eb6834' : '#14161A', borderRadius: '0 3px 3px 0' }} /></div>
                  <div style={{ marginTop: 7, fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink2)' }}>{h.who.map((o) => o.shortName ?? o.name).join(', ')}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="sec" aria-labelledby="h-tbl">
          <div className="sh"><div><h2 id="h-tbl" className="h2">All {rows.length} cases</h2><p className="dek">Every row opens a dossier like the Ridgway file. Methods and victimology are as stated in court records or the cited source.</p></div>
            <div style={{ display: 'flex', gap: 6 }}><a className="chip" href="/api/export/offenders.csv">Export CSV</a></div></div>
          <div className="panel scroll-x" style={{ padding: '18px 6px 6px' }}>
            <table className="tb" style={{ minWidth: 1180 }}>
              <thead><tr><th scope="col">Offender</th><th scope="col">Status</th><th scope="col">Proven / attributed</th><th scope="col">Active</th><th scope="col">Caught</th><th scope="col">States</th><th scope="col">Method</th><th scope="col">Victims</th><th scope="col">How caught</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/case/${o.slug}`} style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 15 }}>{o.name}</Link><div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{o.alias ?? ' '}</div></td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}><span className="sw" style={{ background: STATUS_COLOR[o.legalStatus] }} /> {STATUS_LABEL[o.legalStatus]}</td>
                    <td className="mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{o.legalStatus === 'unidentified' || o.legalStatus === 'died_uncharged' ? '—' : o.proven} / {o.attributed}</td>
                    <td className="mono" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{o.firstKillingYear === o.lastKillingYear ? o.firstKillingYear : `${o.firstKillingYear}–${o.lastKillingYear}`}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{o.caughtYear ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 12, maxWidth: 140 }}>{o.statesNote ?? o.states.join(' ')}</td>
                    <td style={{ fontSize: 13 }}>{o.methods.join(', ')}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink2)', maxWidth: 240 }}>{o.victimology}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink2)', maxWidth: 240 }}>{o.howCaughtText ?? (o.howCaught ? HOW_LABEL[o.howCaught] : 'not established')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mono" style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>Counts are judgment calls where sources differ: Ridgway's 71 is his own unverified claim; Little's 8 combines CA trial, TX and OH pleas (FBI has linked 60+); Kemper's 8 excludes his grandparents (juvenile case); Wilmer was named by the FBI in Jan 2026 but never charged.</p>
        </section>
      </main>
    </>
  );
}

const free = (o: OffenderRow) => (o.caughtYear ?? 2026) - (o.lastKillingYear ?? 2026);
const uniq = <T,>(a: T[]) => [...new Set(a)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const W = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four', 'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine', 'Thirty'];
const words = (n: number) => W[n] ?? String(n);
