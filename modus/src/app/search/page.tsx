import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { SiteHeader } from '@/components/SiteHeader';
import { raw } from '@/db';
export const dynamic = 'force-dynamic';

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  const like = `%${q}%`;
  const [offenders, counts, clusters] = q ? await Promise.all([
    raw<{ slug: string; name: string; alias: string | null; victimology: string | null; proven: number; attributed: number }>(sql`
      SELECT o.slug, o.name, o.alias, o.victimology, t.proven, t.attributed FROM offenders o JOIN offender_totals t ON t.offender_id = o.id
      WHERE o.name ILIKE ${like} OR o.alias ILIKE ${like} OR o.victimology ILIKE ${like} OR o.case_number ILIKE ${like} OR array_to_string(o.methods, ' ') ILIKE ${like} OR array_to_string(o.states, ' ') ILIKE ${like}
      ORDER BY similarity(o.name, ${q}) DESC LIMIT 20`),
    raw<{ slug: string; name: string; label: string; victim_name: string; recovery_site: string | null }>(sql`
      SELECT o.slug, o.name, c.label, c.victim_name, c.recovery_site FROM counts c JOIN offenders o ON o.id = c.offender_id
      WHERE c.victim_name ILIKE ${like} OR c.recovery_site ILIKE ${like} ORDER BY c.seq LIMIT 30`),
    raw<{ county: string; state: string; weapon: string; victims: number; solved: number }>(sql`
      SELECT county, state, weapon, victims, solved FROM map_clusters WHERE lens = 'full' AND (county ILIKE ${like} OR state ILIKE ${q}) ORDER BY victims - solved DESC LIMIT 20`),
  ]) : [[], [], []];
  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ paddingBottom: 96 }}>
        <section style={{ paddingTop: 44 }}>
          <div className="k" style={{ color: 'var(--ox)' }}>Search</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 'clamp(36px,5vw,64px)', lineHeight: .98 }}>{q ? <>Results for <em>{q}</em></> : 'Name, method, county, case no.'}</h1>
        </section>
        {q && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 18, marginTop: 36 }}>
            <div className="panel" style={{ padding: '20px 22px' }}><div className="k" style={{ color: 'var(--ink)' }}>Offenders · {offenders.length}</div>
              {offenders.map((o) => <Link key={o.slug} href={`/case/${o.slug}`} className="linkrow"><span className="serif" style={{ fontSize: 19, fontWeight: 600 }}>{o.name}</span><div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{o.alias ? `${o.alias} · ` : ''}{o.proven} / {o.attributed}</div></Link>)}
              {!offenders.length && <p className="ne">none</p>}</div>
            <div className="panel" style={{ padding: '20px 22px' }}><div className="k" style={{ color: 'var(--ink)' }}>Victims &amp; sites · {counts.length}</div>
              {counts.map((c) => <Link key={c.slug + c.label} href={`/case/${c.slug}/count/${c.label}`} className="linkrow"><span style={{ fontWeight: 600 }}>{c.victim_name}</span><div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>Count {c.label} · {c.name}{c.recovery_site ? ` · ${c.recovery_site}` : ''}</div></Link>)}
              {!counts.length && <p className="ne">none</p>}</div>
            <div className="panel" style={{ padding: '20px 22px' }}><div className="k" style={{ color: 'var(--ink)' }}>MAP clusters · {clusters.length}</div>
              {clusters.map((c) => <Link key={c.county + c.state + c.weapon} href="/atlas" className="linkrow"><span style={{ fontWeight: 600 }}>{c.county}, {c.state}</span><div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{c.weapon} · {c.solved} solved of {c.victims}</div></Link>)}
              {!clusters.length && <p className="ne">none</p>}</div>
          </div>
        )}
      </main>
    </>
  );
}
