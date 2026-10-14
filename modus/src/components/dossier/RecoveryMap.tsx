import type { Dossier } from '@/lib/queries';
import { SCHEMATICS } from '@/data/presentation';
import { PugetSoundBase } from '@/data/puget-sound';

const DOT: Record<string, string> = { physical: '#3987e5', led_to_remains: '#d95926', confession: '#199e70', witness: '#A9AEB5', other: '#A9AEB5' };

export function RecoveryMap({ d }: { d: Dossier }) {
  const o = d.offender;
  const sch = SCHEMATICS[o.slug];
  const notes = (o.notes ?? {}) as Record<string, any>;
  const onMap = d.counts.filter((c) => c.schematicX != null && c.schematicY != null);
  if (!sch || !onMap.length) return null;
  const offMap = sch.offMap ? d.counts.filter((c) => sch.offMap!.match.test(c.recoverySite ?? '')) : [];
  const sites = sch.sites.map((s) => ({ ...s, n: d.counts.filter((c) => s.match.test(c.recoverySite ?? '')).length })).filter((s) => s.n > 0);
  return (
    <figure style={{ flex: '999 1 720px', minWidth: 0, margin: 0, alignSelf: 'flex-start', background: 'var(--dark-panel)', border: '1px solid var(--dark-rule)', padding: 0 }}>
      <div className="mapbox" style={{ aspectRatio: sch.aspect }}>
        {o.slug === 'gary-ridgway' && <PugetSoundBase />}
        {sch.places.map((p) => <span key={p.name} className="plab" style={{ left: `${p.x}%`, top: `${p.y}%` }}>{p.name}</span>)}
        {sch.roads.map((r) => <span key={r.label} className="mlab" style={{ left: `${r.x}%`, top: `${r.y}%`, color: r.color ?? '#A9AEB5', fontSize: r.size }}>{r.label}</span>)}
        {onMap.map((c) => <span key={c.id} className="mdot" title={`${c.label} · ${c.victimName} · ${c.recoverySite}`} style={{ left: `${c.schematicX}%`, top: `${c.schematicY}%`, background: DOT[c.basis] }} />)}
        {sites.map((s) => <span key={s.label} className="mlab" style={{ left: `${s.x}%`, top: `${s.y}%` }}>{s.label} · {s.n}</span>)}
        {offMap.length > 0 && sch.offMap && (
          <div style={{ position: 'absolute', left: 14, bottom: 14, maxWidth: 250, padding: '12px 14px', background: 'rgba(21,24,29,.94)', border: '1px solid #39404A' }}>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#A9AEB5' }}>{sch.offMap.title}</div>
            <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.45, color: '#E8E6E0' }}>{notes.offMapNote ?? `${offMap.length} victims: ${offMap.map((c) => c.victimName?.split(' ').pop()).join(', ')}.`}</div>
          </div>
        )}
        <div className="mono" style={{ position: 'absolute', right: 12, top: 10, fontSize: 10, color: '#8A9099' }}>{sch.base}</div>
      </div>
    </figure>
  );
}
