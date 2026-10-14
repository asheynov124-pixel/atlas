import type { Dossier } from '@/lib/queries';
import { HOW_LABEL } from '@/lib/format';

export function Caught({ d }: { d: Dossier }) {
  const o = d.offender;
  const notes = (o.notes ?? {}) as Record<string, any>;
  const chain = o.chain ?? [];
  const title = notes.caughtTitle ?? (o.legalStatus === 'unidentified' ? 'Never caught' : o.caughtYear ? `Caught in ${o.caughtYear}` : 'How the case ended');
  const dek = notes.caughtDek ?? (o.howCaught ? `${HOW_LABEL[o.howCaught]}${o.howCaughtText ? `: ${o.howCaughtText}.` : '.'}` : null);
  const callout = notes.caughtCallout as { big: string; text: string } | undefined;
  return (
    <section id="caught" className="sec" aria-labelledby="h-caught">
      <div className="sh"><div><h2 id="h-caught" className="h2">{title}</h2>{dek && <p className="dek">{dek}</p>}</div></div>
      {chain.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(170px,100%),1fr))', gap: '22px 0' }}>
          {chain.map((s, i) => (
            <div key={i} className="step">
              <span className={`node${s.key ? ' key' : ''}`} />
              <div style={{ fontWeight: 700, fontSize: 30, letterSpacing: '-.01em', fontStretch: '87%' }}>{s.y}</div>
              <div className="k" style={{ marginTop: 4, color: s.key ? 'var(--ox)' : 'var(--muted)' }}>{s.h}</div>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--ink2)', paddingRight: 8 }}>{s.t}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ padding: '20px 22px', fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink2)' }}>
          {o.legalStatus === 'unidentified'
            ? <>The case remains open. {o.lastKillingYear ? `The last killing attributed to this offender was in ${o.lastKillingYear}.` : ''} The sequence of the investigation has not yet been written into this file.</>
            : <>The step-by-step account of the arrest has not yet been written into this file. What is on record: {o.howCaught ? HOW_LABEL[o.howCaught].toLowerCase() : 'not established'}{o.howCaughtText ? ` (${o.howCaughtText})` : ''}{o.caughtYear ? `, ${o.caughtYear}` : ''}.</>}
        </div>
      )}
      {callout && <div className="callout" style={{ marginTop: 26 }}><span style={{ fontWeight: 700, fontSize: 26, color: 'var(--ox)', whiteSpace: 'nowrap' }}>{callout.big}</span><span style={{ fontSize: 15, lineHeight: 1.5 }}>{callout.text}</span></div>}
    </section>
  );
}
