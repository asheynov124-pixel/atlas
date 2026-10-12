import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { checkLot, lotCost, FEATURE_KINDS, featureKind, makeFeature } from '../lib/lot';
import { LotEditor } from '../components/LotEditor';
import { Button, Chip, Kicker, Field, Note, Stat, Section } from '../components/ui';
import { fmtRange, fmtMoney } from '../lib/takeoff';
import type { LotFeatureKind } from '../lib/types';

const MATERIALS: Record<string, string[]> = { deck: ['cedar', 'ipe', 'composite', 'pressure-treated'], patio: ['bluestone', 'pavers', 'poured concrete', 'gravel'], pool: ['gunite', 'fiberglass', 'vinyl'], shed: ['cedar', 'painted pine'], path: ['gravel', 'bluestone', 'stepping stones'], fence: ['cedar horizontal', 'cedar picket', 'black aluminum'], driveway: ['asphalt', 'pavers', 'gravel'] };

export default function LotPage() {
  const lot = useStore((s) => s.lot);
  const setLot = useStore((s) => s.setLot);
  const addLotFeature = useStore((s) => s.addLotFeature);
  const updateLotFeature = useStore((s) => s.updateLotFeature);
  const removeLotFeature = useStore((s) => s.removeLotFeature);
  const addItem = useStore((s) => s.addItem);
  const rooms = useStore((s) => s.house.rooms);
  const [selected, setSelected] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const [added, setAdded] = useState(false);
  const check = useMemo(() => checkLot(lot), [lot]);
  const cost = useMemo(() => lotCost(lot), [lot]);
  const flagged = new Set(check.issues.filter((i) => i.featureId).map((i) => i.featureId!));
  const sel = lot.features.find((f) => f.id === selected);
  const deckRoom = rooms.find((r) => r.type === 'deck');

  function toList() {
    const roomId = deckRoom?.id ?? (rooms.length ? useStore.getState().addRoom('deck', 'Outside') : useStore.getState().addRoom('deck', 'Outside'));
    for (const f of lot.features) {
      const k = featureKind(f.kind);
      const qty = k.unit === 'each' ? 1 : k.unit === 'linear ft' ? Math.max(f.w, f.h) : f.w * f.h;
      addItem({ roomId, name: `${f.label ?? k.name}${f.material ? `, ${f.material}` : ''}`, category: f.kind === 'planting' || f.kind === 'tree' ? 'other' : 'surfaces', qty: Math.round(qty), unit: k.unit, price: f.cost ?? 0, estimate: f.cost ? undefined : k.cost, status: 'idea', notes: k.note });
    }
    setAdded(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="relative h-[46dvh] shrink-0 bg-canvas p-3 md:h-full md:min-h-0 md:flex-1">
        <LotEditor lot={lot} envelope={check.envelope} selected={selected} flagged={flagged} onSelect={setSelected} onMoveHouse={(p) => setLot({ house: { ...lot.house, ...p } })} onMoveFeature={updateLotFeature} />
        <span className="pointer-events-none absolute bottom-5 left-5 hidden rounded-full bg-ink/80 px-3 py-1 text-xs text-paper md:block">Drag the house or anything on the lot. One square foot per unit; the street is the bottom edge.</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-5 md:w-[28rem] md:flex-none md:border-t-0 md:border-l">
        <div className="flex flex-col gap-6 pb-10">
          <div>
            <Kicker>Outside</Kicker>
            <h1 className="mt-1 display text-3xl">Draw the lot</h1>
            <p className="mt-2 text-sm text-muted">Your survey's numbers, the setbacks from the zoning table, and the deck, patio and plantings you are thinking about. The warnings move when the rules do.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Lot" value={`${lot.width}×${lot.depth}`} sub={`${(lot.width * lot.depth).toLocaleString()} sq ft`} />
            <Stat label="Coverage" value={`${(check.coverage * 100).toFixed(1)}%`} sub={`of ${Math.round(lot.maxCoverage * 100)}% allowed`} />
            <Stat label="To fix" value={check.issues.filter((i) => i.level === 'stop').length} sub={`${check.issues.filter((i) => i.level === 'hmm').length} to check`} />
          </div>
          <div className="flex flex-col gap-2">{check.issues.map((i, n) => <Note key={n} level={i.level} title={i.title} body={i.body} action={i.featureId ? <Button kind="quiet" className="px-0" onClick={() => setSelected(i.featureId!)}>Show me</Button> : undefined} />)}</div>

          <Section label="Add to the lot">
            <div className="flex flex-wrap gap-2">{FEATURE_KINDS.map((k) => <Chip key={k.id} onClick={() => { setSelected(addLotFeature(makeFeature(k.id, lot))); setPick(false); }}><Plus className="mr-1 size-3" />{k.name}</Chip>)}</div>
            {pick && null}
          </Section>

          {sel && (
            <Section label={`Selected: ${sel.label ?? featureKind(sel.kind).name}`} hint={featureKind(sel.kind).note}>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <Field label="Label" value={sel.label ?? ''} placeholder={featureKind(sel.kind).name} onChange={(e) => updateLotFeature(sel.id, { label: e.target.value || undefined })} />
                <label className="flex flex-col gap-1 text-xs text-muted">Kind<select value={sel.kind} onChange={(e) => updateLotFeature(sel.id, { kind: e.target.value as LotFeatureKind })}>{FEATURE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
                {MATERIALS[sel.kind] && <label className="flex flex-col gap-1 text-xs text-muted">Material<select value={sel.material ?? ''} onChange={(e) => updateLotFeature(sel.id, { material: e.target.value || undefined })}><option value="">—</option>{MATERIALS[sel.kind].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>}
                <Field label="Width" type="number" suffix="ft" value={sel.w} onChange={(e) => updateLotFeature(sel.id, { w: Math.max(1, Number(e.target.value)) })} />
                <Field label="Depth" type="number" suffix="ft" value={sel.h} onChange={(e) => updateLotFeature(sel.id, { h: Math.max(1, Number(e.target.value)) })} />
                {(sel.kind === 'deck' || sel.kind === 'spa' || sel.kind === 'shed') && <Field label="Height above grade" type="number" step={0.5} suffix="ft" value={sel.height ?? 1.5} onChange={(e) => updateLotFeature(sel.id, { height: Number(e.target.value) })} />}
                <Field label="From west line" type="number" suffix="ft" value={sel.x} onChange={(e) => updateLotFeature(sel.id, { x: Number(e.target.value) })} />
                <Field label="From rear line" type="number" suffix="ft" value={sel.y} onChange={(e) => updateLotFeature(sel.id, { y: Number(e.target.value) })} />
                <Field label="Cost override" type="number" suffix={`$/${featureKind(sel.kind).unit}`} value={sel.cost ?? ''} placeholder={`${featureKind(sel.kind).cost[0]}–${featureKind(sel.kind).cost[1]}`} onChange={(e) => updateLotFeature(sel.id, { cost: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
              <Button kind="danger" className="self-start" onClick={() => { removeLotFeature(sel.id); setSelected(null); }}><Trash2 className="size-4" />Remove</Button>
            </Section>
          )}

          <Section label="The lot and the rules" hint="from the survey and the zoning table">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Field label="Place" value={lot.place ?? ''} placeholder="Oakland, New Jersey" onChange={(e) => setLot({ place: e.target.value })} className="col-span-2 md:col-span-3" />
              <Field label="Lot width" type="number" suffix="ft" value={lot.width} onChange={(e) => setLot({ width: Math.max(20, Number(e.target.value)) })} />
              <Field label="Lot depth" type="number" suffix="ft" value={lot.depth} onChange={(e) => setLot({ depth: Math.max(20, Number(e.target.value)) })} />
              <Field label="Max coverage" type="number" suffix="%" value={Math.round(lot.maxCoverage * 100)} onChange={(e) => setLot({ maxCoverage: Number(e.target.value) / 100 })} />
              <Field label="House width" type="number" suffix="ft" value={lot.house.w} onChange={(e) => setLot({ house: { ...lot.house, w: Math.max(10, Number(e.target.value)) } })} />
              <Field label="House depth" type="number" suffix="ft" value={lot.house.h} onChange={(e) => setLot({ house: { ...lot.house, h: Math.max(10, Number(e.target.value)) } })} />
              <Field label="Low-deck height" type="number" step={0.5} suffix="ft" value={lot.lowDeckHeight} onChange={(e) => setLot({ lowDeckHeight: Number(e.target.value) })} />
              <Field label="Front setback" type="number" suffix="ft" value={lot.setbacks.front} onChange={(e) => setLot({ setbacks: { ...lot.setbacks, front: Number(e.target.value) } })} />
              <Field label="Rear setback" type="number" suffix="ft" value={lot.setbacks.rear} onChange={(e) => setLot({ setbacks: { ...lot.setbacks, rear: Number(e.target.value) } })} />
              <Field label="Side setback" type="number" suffix="ft" value={lot.setbacks.side} onChange={(e) => setLot({ setbacks: { ...lot.setbacks, side: Number(e.target.value) } })} />
            </div>
            <p className="text-xs text-muted">Typical New Jersey borough residential: 30–35 ft front, 25–30 ft rear, 10–15 ft side, 25–35% coverage, decks under 30 inches may enter the rear yard by half. Your town's table wins. Call the zoning officer; they answer the phone.</p>
          </Section>

          <Section label="Outside budget" hint={fmtRange(cost)}>
            <ul className="grid gap-1 text-sm">{lot.features.map((f) => { const k = featureKind(f.kind); const qty = k.unit === 'each' ? 1 : k.unit === 'linear ft' ? Math.max(f.w, f.h) : f.w * f.h; return <li key={f.id} className="flex justify-between rounded-xl bg-surface px-3 py-2"><span>{f.label ?? k.name} · {Math.round(qty)} {k.unit}</span><span className="tabular-nums text-muted">{f.cost ? fmtMoney(qty * f.cost) : fmtRange([qty * k.cost[0], qty * k.cost[1]])}</span></li>; })}</ul>
            {lot.features.length > 0 && <Button kind="ghost" className="self-start" onClick={toList}>{added ? 'On the list' : `Put it on the ${deckRoom ? deckRoom.name : 'Outside'} list`}</Button>}
            <Link to="/budget" className="text-sm text-oak">See the whole budget</Link>
          </Section>
          <Section label="Notes"><textarea className="field min-h-20" placeholder="The survey pin at the NE corner is under the hedge. The sewer line runs along the east side." value={lot.notes ?? ''} onChange={(e) => setLot({ notes: e.target.value })} /></Section>
        </div>
      </div>
    </div>
  );
}
