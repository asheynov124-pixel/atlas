import { SiteHeader } from '@/components/SiteHeader';
import { getAtlas, listOffenders } from '@/lib/queries';
import { AtlasMap, type ClusterLite } from '@/components/AtlasMap';
import { n, pct } from '@/lib/format';
import { slugify } from '@/lib/links';
export const dynamic = 'force-dynamic';

export default async function Atlas() {
  const [{ full, decade, stats }, offenders] = await Promise.all([getAtlas(), listOffenders()]);
  const lite = (c: (typeof full)[number]): ClusterLite => ({ id: c.id, lens: c.lens, decade: c.decade, county: c.county, state: c.state, weapon: c.weapon, weaponClass: c.weaponClass, victims: c.victims, solved: c.solved, firstYear: c.firstYear, lastYear: c.lastYear, note: c.note });
  const bases = offenders.filter((o) => o.homeBaseCounty && o.homeBaseState).map((o) => ({ slug: o.slug, name: o.name, county: o.homeBaseCounty!, state: o.homeBaseState! }));
  const totals = stats.method?.totals ?? {}; const th = stats.method?.thresholds ?? { minVictims: 6, maxSolvedShare: 1 / 3 };
  const nogun = full.filter((c) => c.weapon !== 'Firearm').length;
  const maxV = Math.max(...full.map((c) => c.victims));
  const rank = full.slice(0, 12);
  const dec: { decade: number; victims: number; unsolved: number }[] = stats.unsolvedFemaleByDecade ?? [];
  const wpn: { weapon: string; unsolved: number }[] = stats.unsolvedFemaleByWeapon ?? [];
  const wMax = Math.max(...wpn.map((w) => w.unsolved), 1);
  const caveats: string[] = stats.caveats ?? [];
  const LINE: Record<string, string> = { strangulation_or_suffocation: '#3987e5', other_unknown: '#d95926', other_named: '#199e70' };
  return (
    <>
      <SiteHeader active="atlas" />
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <section style={{ paddingTop: 44 }}>
          <div className="k" style={{ color: 'var(--ox)' }}>Atlas · Murder Accountability Project data · 638,454 homicides, 1980–2014</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(40px,5.6vw,80px)', lineHeight: .96, letterSpacing: '-.02em' }}>Where women's murders<br /><em style={{ fontWeight: 500 }}>go unsolved</em></h1>
          <p className="serif" style={{ margin: '20px 0 0', fontSize: 20, lineHeight: 1.55, maxWidth: 840, color: 'var(--ink2)' }}>MAP's method, rerun on its own file: group every female victim by county and weapon, then flag groups with at least {th.minVictims} victims and a third or fewer solved. An uncaught serial killer drags a group's clearance rate down. A flag is a reason to look, not a finding.</p>
        </section>
        <section aria-label="Key figures" className="panel tiles" style={{ marginTop: 28, gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))' }}>
          <div className="tile" style={{ padding: '20px 22px' }}><div className="big" style={{ fontSize: 46 }}>{n(totals.femaleVictims ?? 0)}</div><div className="tile-l" style={{ fontSize: 14 }}>Female homicide victims in the file</div></div>
          <div className="tile" style={{ padding: '20px 22px' }}><div className="big" style={{ fontSize: 46 }}>{n(totals.femaleUnsolved ?? 0)}</div><div className="tile-l" style={{ fontSize: 14 }}>Unsolved: {pct(totals.femaleUnsolved ?? 0, totals.femaleVictims ?? 1, 1)}, about one in four</div></div>
          <div className="tile" style={{ padding: '20px 22px' }}><div className="big" style={{ fontSize: 46, color: 'var(--ox)' }}>{full.length}</div><div className="tile-l" style={{ fontSize: 14 }}>Flagged county–weapon clusters across the full 35 years</div></div>
          <div className="tile" style={{ padding: '20px 22px' }}><div className="big" style={{ fontSize: 46 }}>{nogun}<small style={{ color: 'var(--muted)' }}> of {full.length}</small></div><div className="tile-l" style={{ fontSize: 14 }}>Flags that involve no gun: strangulation, suffocation, fire, or an unknown weapon</div></div>
        </section>

        <section className="sec" aria-labelledby="h-map">
          <div className="sh">
            <div><h2 id="h-map" className="h2">The {full.length} flagged clusters</h2><p className="dek">Circle area is unsolved victims. Diamonds are the home bases of the offenders in the Index, where a source gives one.</p></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13.5, color: 'var(--ink2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: '#2a78d6' }} />Strangulation or suffocation</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: '#eb6834' }} />Weapon other or unknown</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="sw" style={{ background: '#1baf7a' }} />Fire or firearm</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ display: 'inline-block', width: 8, height: 8, transform: 'rotate(45deg)', background: '#14161A' }} />Offender in Index</span>
            </div>
          </div>
          <AtlasMap full={full.map(lite)} decade={decade.map(lite)} bases={bases} caveat={`Read with care: ${caveats.slice(0, 2).map((c) => c.charAt(0).toLowerCase() + c.slice(1)).join(' and ')}`} />
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
          <section className="sec" aria-labelledby="h-rank" style={{ flex: '1 1 420px', minWidth: 0 }}>
            <div className="sh"><h2 id="h-rank" className="h2">Ranked by unsolved</h2></div>
            <div className="panel" style={{ padding: '12px 20px 14px' }}>
              <div className="rk" style={{ borderTop: 0, paddingTop: 4 }}><span /><span className="k" style={{ fontSize: 10 }}>Cluster · solved (dark) and unsolved</span><span className="k" style={{ fontSize: 10, textAlign: 'right' }}>Solved</span></div>
              {rank.map((c, i) => { const u = c.victims - c.solved; return (
                <div key={c.id} className="rk" id={slugify(c.county + '-' + c.state)}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}><span style={{ fontWeight: 600 }}>{c.county}, {c.state}</span><span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.firstYear}–{c.lastYear}</span></div>
                    <div style={{ display: 'flex', gap: 2, height: 9, marginTop: 6 }}><span style={{ display: 'block', height: '100%', width: `${(c.solved / maxV) * 100}%`, background: '#14161A', borderRadius: '2px 0 0 2px' }} /><span style={{ display: 'block', height: '100%', width: `${(u / maxV) * 100}%`, background: LINE[c.weaponClass ?? 'other_unknown'], borderRadius: '0 2px 2px 0' }} /></div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 5 }}>{c.weapon} · {c.solved} solved of {c.victims}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{pct(c.solved, c.victims)}</span>
                </div>); })}
            </div>
          </section>
          <section className="sec" aria-labelledby="h-dw" style={{ flex: '1 1 520px', minWidth: 0 }}>
            <div className="sh"><div><h2 id="h-dw" className="h2">Sharper lens: one decade at a time</h2><p className="dek">Thirty-five years of solved cases can bury a bad stretch. Run the test inside each decade and new groups surface, including King County in the 1980s, the Green River years.</p></div></div>
            <div className="panel scroll-x" style={{ padding: '16px 8px 6px' }}>
              <table className="tb" style={{ minWidth: 520 }}>
                <thead><tr><th scope="col">County</th><th scope="col">Weapon</th><th scope="col">Decade</th><th scope="col">Victims</th><th scope="col">Solved</th><th scope="col">Known context</th></tr></thead>
                <tbody>{decade.sort((a, b) => b.victims - a.victims).map((d) => (
                  <tr key={d.id}><td style={{ fontWeight: 600 }}>{d.county}, {d.state}</td><td style={{ fontSize: 13 }}>{d.weapon}</td><td className="mono" style={{ fontSize: 12.5 }}>{d.decade}s</td><td className="mono" style={{ fontSize: 12.5 }}>{d.victims}</td>
                    <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap', ...(d.solved / d.victims < .15 ? { color: 'var(--ox)', fontWeight: 600 } : {}) }}>{d.solved} ({pct(d.solved, d.victims)})</td><td style={{ fontSize: 13, color: 'var(--ink2)' }}>{d.note ?? '—'}</td></tr>))}</tbody>
              </table>
            </div>
          </section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: 28 }}>
          <section className="sec" aria-labelledby="h-dec">
            <div className="sh"><h2 id="h-dec" className="h2">Getting better, slowly</h2></div>
            <div className="panel" style={{ padding: '20px 22px' }}>
              <div className="k" style={{ marginBottom: 14, color: 'var(--ink)' }}>Share of female victims unsolved, by decade</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dec.length},minmax(0,1fr))`, gap: 18, alignItems: 'end', height: 200, borderBottom: '1px solid var(--ink)' }}>
                {dec.map((d) => { const p = (d.unsolved / d.victims) * 100; return <div key={d.decade} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', gap: 6 }}><span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{p.toFixed(1)}%</span><span style={{ display: 'block', width: '56%', height: `${(p / 30) * 100}%`, background: 'var(--ox)', borderRadius: '4px 4px 0 0' }} /></div>; })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dec.length},minmax(0,1fr))`, gap: 18, marginTop: 8 }}>{dec.map((d) => <div key={d.decade} style={{ textAlign: 'center' }}><div className="mono" style={{ fontSize: 12 }}>{d.decade}s</div><div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{n(d.victims)} victims</div></div>)}</div>
              <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>2010s covers 2010–2014 only. Recent cases have had less time to be cleared.</p>
            </div>
          </section>
          <section className="sec" aria-labelledby="h-wpn">
            <div className="sh"><h2 id="h-wpn" className="h2">How the unsolved died</h2></div>
            <div className="panel" style={{ padding: '20px 22px' }}>
              <div className="k" style={{ marginBottom: 6, color: 'var(--ink)' }}>Unsolved female victims by weapon · {n(totals.femaleUnsolved ?? 0)}</div>
              {wpn.map((w) => <div key={w.weapon} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 64px', gap: 10, alignItems: 'center', padding: '7px 0' }}><span style={{ fontSize: 13.5 }}>{w.weapon}</span><span style={{ height: 12, background: '#E6E1D5', display: 'block' }}><span style={{ display: 'block', height: '100%', width: `${(w.unsolved / wMax) * 100}%`, background: /strang|suffoc/i.test(w.weapon) ? '#2a78d6' : /other or unknown/i.test(w.weapon) ? '#eb6834' : '#7A7C82', borderRadius: '0 3px 3px 0' }} /></span><span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{n(w.unsolved)}</span></div>)}
              <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>Guns account for the most unsolved deaths, yet only one flagged cluster is a firearm cluster. Gun killings spread across many groups. Strangulation concentrates.</p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
