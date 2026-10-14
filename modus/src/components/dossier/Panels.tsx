import type { Dossier } from '@/lib/queries';
import { pct } from '@/lib/format';

export function BasisPanel({ d }: { d: Dossier }) {
  const b = d.basis; const total = Object.values(b).reduce((a, x) => a + x, 0);
  if (!total) return null;
  const notes = (d.offender.notes ?? {}) as Record<string, any>;
  const names = (basis: string) => d.counts.filter((c) => c.basis === basis).map((c) => c.victimName?.split(' ').pop()).join(', ');
  const dna = d.counts.filter((c) => c.dna).map((c) => c.victimName?.split(' ').pop()); const paint = d.counts.filter((c) => c.paint).map((c) => c.victimName?.split(' ').pop());
  const ledYears = [...new Set(d.counts.filter((c) => c.ledToRemains).map((c) => c.found?.slice(0, 4)))].join('/');
  const rows: [number, string, string][] = [
    [b.physical ?? 0, 'var(--P)', `Physical evidence${dna.length ? `: DNA (${dna.join(', ')})` : ''}${paint.length ? `${dna.length ? ' or' : ':'} trace evidence (${paint.join(', ')})` : ''}`],
    [b.led_to_remains ?? 0, 'var(--L)', `Remains ${d.offender.name.split(' ').pop()} led investigators to${ledYears ? ` in ${ledYears}` : ''} (${names('led_to_remains')})`],
    [b.confession ?? 0, 'var(--C)', 'Confession and knowledge of the sites'],
    [(b.witness ?? 0) + (b.other ?? 0), 'var(--ink2)', 'Witness or other'],
  ];
  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div className="k" style={{ color: 'var(--ink)' }}>What the {total} convictions rest on</div>
      <div style={{ display: 'flex', gap: 2, height: 26, marginTop: 16 }}>
        {rows.filter((r) => r[0] > 0).map((r, i) => <div key={i} style={{ flex: r[0], background: r[1] }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 14px', marginTop: 16, fontSize: 14, lineHeight: 1.4, alignItems: 'baseline' }}>
        {rows.filter((r) => r[0] > 0).map((r, i) => <div key={i} style={{ display: 'contents' }}><span style={{ fontWeight: 700, fontSize: 22 }}>{r[0]}</span><span><span className="sw" style={{ background: r[1], marginRight: 6 }} />{r[2]}</span></div>)}
      </div>
      {notes.basisNote && <p style={{ margin: '14px 0 0', paddingTop: 12, borderTop: '1px solid var(--rule2)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>{notes.basisNote}</p>}
    </div>
  );
}

export function AgePanel({ d }: { d: Dossier }) {
  const ages = d.counts.map((c) => c.ageAtDeath).filter((a): a is number => a != null).sort((a, b) => a - b);
  if (!ages.length) return null;
  const med = ages[Math.floor(ages.length / 2)], lo = ages[0], hi = ages[ages.length - 1];
  const cnt: Record<number, number> = {}; ages.forEach((a) => (cnt[a] = (cnt[a] || 0) + 1));
  const maxC = Math.max(...Object.values(cnt));
  const bins: number[] = []; for (let a = lo; a <= hi; a++) bins.push(a);
  const minors = ages.filter((a) => a <= 17).length, young = ages.filter((a) => a <= 15).length;
  const labels = [lo, ...[1, 2, 3, 4, 5].map((i) => Math.round(lo + (hi - lo) * i / 6)), hi];
  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div className="k" style={{ color: 'var(--ink)' }}>Age at death</div>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink2)' }}>median {med} · range {lo}–{hi}{ages.length < d.counts.length ? ` · ${d.counts.length - ages.length} not established` : ''}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, marginTop: 16, borderBottom: '1px solid var(--ink)' }}>
        {bins.map((a) => <div key={a} title={`${a}: ${cnt[a] || 0}`} style={{ flex: 1, height: `${((cnt[a] || 0) / maxC) * 100}%`, background: a <= 18 ? 'var(--ox)' : '#7A7C82', borderRadius: '3px 3px 0 0', minHeight: cnt[a] ? 2 : 0 }} />)}
      </div>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>{labels.map((l, i) => <span key={i}>{l}</span>)}</div>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>{words(minors)} of the {d.counts.length} were minors, 17 or younger. {words(young)} {young === 1 ? 'was' : 'were'} 15 or under.</p>
    </div>
  );
}

export function MapLensPanel({ d }: { d: Dossier }) {
  const notes = (d.offender.notes ?? {}) as Record<string, any>;
  const s = notes.mapStat as { label: string; solved: number; victims: number; usFemaleClearance: number; source: string } | undefined;
  if (!s) return null;
  const share = (s.solved / s.victims) * 100;
  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div className="k" style={{ color: 'var(--ink)' }}>Through MAP's algorithm</div>
      <p style={{ margin: '10px 0 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--ink2)' }}>{notes.mapLensText}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>All female victims, U.S., 1980–2014</span><span className="mono" style={{ fontWeight: 600 }}>{s.usFemaleClearance}%</span></div>
          <div style={{ height: 10, background: '#E6E1D5', marginTop: 6 }}><div style={{ width: `${s.usFemaleClearance}%`, height: '100%', background: '#7A7C82', borderRadius: '0 3px 3px 0' }} /></div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{s.label}</span><span className="mono" style={{ fontWeight: 600, color: 'var(--ox)' }}>{share.toFixed(1)}%</span></div>
          <div style={{ height: 10, background: '#E6E1D5', marginTop: 6 }}><div style={{ width: `${share}%`, height: '100%', background: 'var(--ox)', borderRadius: '0 3px 3px 0' }} /></div>
          <div className="mono" style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>{s.solved} solved of {s.victims} ({pct(s.solved, s.victims, 1)}) · source: {s.source}</div>
        </div>
      </div>
    </div>
  );
}

const W = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const words = (n: number) => W[n] ?? String(n);
