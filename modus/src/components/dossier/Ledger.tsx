'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BASIS_LABEL, BASIS_VAR, fmtDate, gapText, decYear } from '@/lib/format';

export type LedgerRow = { id: number; label: string; victimName: string | null; ageAtDeath: number | null; lastSeen: string | null; found: string | null; recoverySite: string | null;
  basis: string; dna: boolean; paint: boolean; ledToRemains: boolean; janeDoeLabel: string | null; identifiedYear: number | null; ageConflict: string | null };

const FILTERS: [string, string, (r: LedgerRow) => boolean][] = [
  ['all', 'All', () => true], ['physical', 'Physical evidence', (r) => r.basis === 'physical'], ['led', 'Led to remains', (r) => r.ledToRemains], ['doe', 'Jane Does', (r) => !!r.janeDoeLabel],
];

export function Ledger({ rows, slug, dek }: { rows: LedgerRow[]; slug: string; dek: string }) {
  const [f, setF] = useState('all');
  const shown = rows.filter(FILTERS.find((x) => x[0] === f)![2]);
  const maxGap = Math.max(...rows.map((r) => { const a = decYear(r.lastSeen), b = decYear(r.found); return a != null && b != null ? b - a : 0; }), 1);
  const csv = () => {
    const head = ['count', 'victim', 'age', 'last_seen', 'found', 'recovery_site', 'basis', 'dna', 'trace', 'led_to_remains', 'jane_doe', 'identified'];
    const body = rows.map((r) => [r.label, r.victimName, r.ageAtDeath, r.lastSeen, r.found, r.recoverySite, r.basis, r.dna, r.paint, r.ledToRemains, r.janeDoeLabel, r.identifiedYear].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug}-ledger.csv`; a.click();
  };
  return (
    <section id="ledger" className="sec" aria-labelledby="h-ledger">
      <div className="sh">
        <div><h2 id="h-ledger" className="h2">The ledger</h2><p className="dek">{dek}</p></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {FILTERS.map(([k, l]) => <button key={k} type="button" className={`chip${f === k ? ' on' : ''}`} aria-pressed={f === k} onClick={() => setF(k)}>{k === 'all' ? `All ${rows.length}` : l}</button>)}
          <button type="button" className="chip" onClick={csv}>Export CSV</button>
        </div>
      </div>
      <div className="panel scroll-x" style={{ padding: '18px 6px 6px' }}>
        <table className="tb" style={{ minWidth: 1080 }}>
          <thead><tr><th scope="col">Count</th><th scope="col">Victim</th><th scope="col">Age</th><th scope="col">Last seen</th><th scope="col">Found</th><th scope="col">Missing</th><th scope="col">Recovery site</th><th scope="col" style={{ textAlign: 'center' }}>DNA</th><th scope="col" style={{ textAlign: 'center' }}>Trace</th><th scope="col" style={{ textAlign: 'center' }}>Led</th><th scope="col">Identified</th><th scope="col">Basis</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const a = decYear(r.lastSeen), b = decYear(r.found);
              const g = a != null && b != null ? Math.min((b - a) / maxGap, 1) : 0;
              return (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</td>
                  <td style={{ fontWeight: 600 }}><Link href={`/case/${slug}/count/${r.label}`} style={{ color: 'var(--ink)' }}>{r.victimName ?? <span className="ne">not established</span>}</Link></td>
                  <td className="mono" style={{ fontSize: 13 }}>{r.ageAtDeath ?? '—'}{r.ageConflict && <span className="conflict" title={r.ageConflict}>!</span>}</td>
                  <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.lastSeen ? fmtDate(r.lastSeen) : <span className="ne">unknown</span>}</td>
                  <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(r.found)}</td>
                  <td style={{ minWidth: 140 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'block', height: 6, background: '#E6E1D5', width: 70, position: 'relative' }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${g * 100}%`, background: BASIS_VAR[r.basis] }} /></span><span className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{gapText(a, b)}</span></div></td>
                  <td style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{r.recoverySite ?? <span className="ne">not established</span>}</td>
                  <td style={{ textAlign: 'center' }}><span className={r.dna ? 'gl' : 'gl-off'} /></td>
                  <td style={{ textAlign: 'center' }}><span className={r.paint ? 'gl' : 'gl-off'} /></td>
                  <td style={{ textAlign: 'center' }}><span className={r.ledToRemains ? 'gl' : 'gl-off'} /></td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.janeDoeLabel ? `${r.janeDoeLabel} → ${r.identifiedYear ?? '?'}` : r.identifiedYear && r.found && r.identifiedYear > +r.found.slice(0, 4) ? String(r.identifiedYear) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}><span className="sw" style={{ background: BASIS_VAR[r.basis] }} /> {BASIS_LABEL[r.basis]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
