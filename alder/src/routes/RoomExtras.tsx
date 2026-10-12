import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import type { HouseRoom, RoomVersion, Scene } from '../lib/types';
import { ROOM_PHASES, PHASE_LABEL } from '../lib/types';
import { piece } from '../data/pieces';
import { paint } from '../data/palette';
import { FLOORS, METALS, opt } from '../data/materials';
import { roomBrief } from '../lib/brief';
import { Button, Chip, Section, Field, Confirm, ExportSheet, Empty } from '../components/ui';
import { DecisionCard } from './Decisions';

function useRoomItems(roomId: string) {
  const all = useStore((s) => s.house.items);
  return useMemo(() => all.filter((i) => i.roomId === roomId), [all, roomId]);
}

// ---------------- DECIDE ----------------
export function DecideTab({ room }: { room: HouseRoom }) {
  const allDecisions = useStore((s) => s.decisions);
  const decisions = useMemo(() => allDecisions.filter((d) => d.roomId === room.id), [allDecisions, room.id]);
  const updateRoom = useStore((s) => s.updateRoom);
  const open = decisions.filter((d) => d.status !== 'decided');
  const done = decisions.filter((d) => d.status === 'decided');
  return (
    <div className="flex flex-col gap-5 pb-10">
      <Section label="Phase">
        <div className="flex flex-wrap gap-2">{ROOM_PHASES.map((p) => <Chip key={p} on={(room.phase ?? 'concept') === p} onClick={() => updateRoom(room.id, { phase: p })}>{PHASE_LABEL[p]}</Chip>)}</div>
        <p className="text-xs text-muted">Concept is talk. Design is drawings. Permitting is the borough. In progress is dust. Done is a bowl on the table.</p>
      </Section>
      <Section label="On the table" hint={`${open.length} open`}>
        {open.length === 0 ? <p className="text-sm text-muted">Nothing open for this room.</p> : <div className="flex flex-col gap-3">{open.map((d) => <DecisionCard key={d.id} d={d} roomName={room.name} />)}</div>}
        <Link to={`/decisions?room=${room.id}`} className="text-sm text-oak">Open a decision, or vote as someone else</Link>
      </Section>
      {done.length > 0 && <Section label="Already called"><ul className="grid gap-1 text-sm">{done.map((d) => <li key={d.id} className="flex justify-between rounded-xl bg-surface px-3 py-2"><span>{d.title}</span><span className="text-muted">{d.options.find((o) => o.id === d.chosen)?.label}</span></li>)}</ul></Section>}
    </div>
  );
}

// ---------------- SCENES ----------------
const PRESETS: Omit<Scene, 'id'>[] = [
  { name: 'Morning', hour: 7, warmth: 50, level: 0.4, off: [], note: 'Daylight does the work. One lamp, low, for the coffee.' },
  { name: 'Daylight', hour: 12, warmth: 45, level: 0, off: [], note: 'Everything off. If the room needs a lamp at noon, the window is wrong.' },
  { name: 'Dinner', hour: 19, warmth: 85, level: 0.7, off: [], note: 'The pendant takes the table. Overheads to a third.' },
  { name: 'Cinema', hour: 21, warmth: 90, level: 0.2, off: [], note: 'Only the picture light and one lamp behind the sofa.' },
  { name: 'Wind-down', hour: 23, warmth: 95, level: 0.3, off: [], note: 'Candle-warm. Nothing overhead.' },
  { name: 'Away', hour: 20, warmth: 80, level: 0.25, off: [], note: 'One lamp on a timer so the house looks lived in.' },
];

export function ScenesTab({ room, active, setActive }: { room: HouseRoom; active: string | null; setActive: (id: string | null) => void }) {
  const addScene = useStore((s) => s.addScene);
  const updateScene = useStore((s) => s.updateScene);
  const removeScene = useStore((s) => s.removeScene);
  const scenes = room.scenes ?? [];
  const sc = scenes.find((s) => s.id === active);
  const lamps = room.placed.filter((p) => piece(p.pieceId)?.lamp);
  return (
    <div className="flex flex-col gap-5 pb-10">
      <Section label="Scenes" hint="what the lights do, by hour">
        <p className="text-sm text-muted">A scene is a time of day, a warmth, an overall level, and which lamps are off. Pick one and the 3D view shows it. Give the list to the electrician as the dimmer plan.</p>
        <div className="flex flex-wrap gap-2">
          <Chip on={!active} onClick={() => setActive(null)}>As set</Chip>
          {scenes.map((s) => <Chip key={s.id} on={active === s.id} onClick={() => setActive(s.id)}>{s.name}</Chip>)}
        </div>
        {scenes.length === 0 && <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <Chip key={p.name} onClick={() => setActive(addScene(room.id, p))}><Plus className="mr-1 size-3" />{p.name}</Chip>)}</div>}
        {scenes.length > 0 && <div className="flex flex-wrap gap-2"><Button kind="ghost" onClick={() => { PRESETS.filter((p) => !scenes.some((s) => s.name === p.name)).forEach((p) => addScene(room.id, p)); }}>Add the usual six</Button><Button kind="ghost" onClick={() => setActive(addScene(room.id, { name: 'New scene', hour: 19, warmth: 80, level: 0.5, off: [] }))}><Plus className="size-4" />New</Button></div>}
      </Section>
      {sc && (
        <Section label={sc.name}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" value={sc.name} onChange={(e) => updateScene(room.id, sc.id, { name: e.target.value })} />
            <Field label="Hour (0–23)" type="number" min={0} max={23} value={sc.hour} onChange={(e) => updateScene(room.id, sc.id, { hour: Math.max(0, Math.min(23, Number(e.target.value))) })} />
          </div>
          <label className="text-xs text-muted">Lamps, overall level {Math.round(sc.level * 100)}%</label>
          <input type="range" min={0} max={100} value={Math.round(sc.level * 100)} onChange={(e) => updateScene(room.id, sc.id, { level: Number(e.target.value) / 100 })} className="h-11 w-full" />
          <label className="text-xs text-muted">Warmth, north to candle</label>
          <input type="range" min={0} max={100} value={sc.warmth} onChange={(e) => updateScene(room.id, sc.id, { warmth: Number(e.target.value) })} className="h-11 w-full" />
          <p className="kicker mt-2">Lamps in this scene</p>
          {lamps.length === 0 ? <p className="text-sm text-muted">No lamps on the plan. Add a floor lamp, a pendant, or sconces on the Plan tab.</p> : (
            <div className="flex flex-wrap gap-2">{lamps.map((p) => { const d = piece(p.pieceId)!; const on = !sc.off.includes(p.id); return <Chip key={p.id} on={on} onClick={() => updateScene(room.id, sc.id, { off: on ? [...sc.off, p.id] : sc.off.filter((x) => x !== p.id) })}>{p.label ?? d.name}{on ? '' : ' · off'}</Chip>; })}</div>
          )}
          <textarea className="field min-h-16 text-sm" placeholder="What this scene is for" value={sc.note ?? ''} onChange={(e) => updateScene(room.id, sc.id, { note: e.target.value })} />
          <Confirm label="Remove scene" confirmLabel="Remove" onConfirm={() => { removeScene(room.id, sc.id); setActive(null); }} />
        </Section>
      )}
      {scenes.length > 0 && (
        <Section label="Dimmer plan" hint="for the electrician">
          <ul className="grid gap-1 text-sm">{scenes.map((s) => <li key={s.id} className="rounded-xl bg-surface px-3 py-2"><span className="font-medium">{s.name}</span> <span className="text-muted">· {s.hour}:00 · lamps at {Math.round(s.level * 100)}%{s.off.length ? ` · off: ${s.off.map((id) => { const p = room.placed.find((x) => x.id === id); return p ? (p.label ?? piece(p.pieceId)?.name) : ''; }).filter(Boolean).join(', ')}` : ''}</span>{s.note && <span className="block text-xs text-muted">{s.note}</span>}</li>)}</ul>
          <p className="text-xs text-muted">Every circuit in this list needs its own dimmer. Smart dimmers are on the Pieces list under Smart.</p>
        </Section>
      )}
    </div>
  );
}

// ---------------- VERSIONS ----------------
export function VersionsTab({ room }: { room: HouseRoom }) {
  const snapshotRoom = useStore((s) => s.snapshotRoom);
  const restoreVersion = useStore((s) => s.restoreVersion);
  const removeVersion = useStore((s) => s.removeVersion);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<RoomVersion['kind']>('planned');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const versions = [...(room.versions ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="flex flex-col gap-5 pb-10">
      <Section label="Record this state" hint="as found, as it is, as it will be">
        <p className="text-sm text-muted">A version is the room as it stands right now: dimensions, surfaces, plan. Record "As found" before you touch anything. Record the plan you are leaning toward as "Planned". Open any of them later and the room becomes that.</p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Field label="Label" value={label} placeholder="As found · White Dove · Long island" onChange={(e) => setLabel(e.target.value)} />
          <label className="flex flex-col gap-1 text-xs text-muted">Kind<select value={kind} onChange={(e) => setKind(e.target.value as RoomVersion['kind'])}><option value="past">Past</option><option value="current">Current</option><option value="planned">Planned</option></select></label>
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button className="self-start" disabled={!label.trim()} onClick={() => { snapshotRoom(room.id, label.trim(), kind, date); setLabel(''); }}>Record</Button>
      </Section>
      {versions.length === 0 ? <Empty title="No recorded states" body="Record the room as found, then as each idea settles. The timeline fills in." /> : (
        <ol className="flex flex-col gap-3">
          {versions.map((v) => (
            <li key={v.id} className={`card p-4 ${v.kind === 'current' ? 'border border-oak' : v.kind === 'planned' ? 'border border-dashed border-line' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-3"><span className={`text-xs ${v.kind === 'current' ? 'text-oak' : 'text-muted'}`}>{v.kind === 'past' ? 'Past' : v.kind === 'current' ? 'Current' : 'Planned'}</span><h3 className="display text-xl">{v.label}</h3></div>
                <span className="text-xs text-muted tabular-nums">{v.date}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="size-7 rounded-full border border-line" style={{ background: paint(v.snapshot.surfaces.wall).hex }} title={paint(v.snapshot.surfaces.wall).name} />
                <span className="size-7 rounded-full border border-line" style={{ background: opt(FLOORS, v.snapshot.surfaces.floor).hex }} title={opt(FLOORS, v.snapshot.surfaces.floor).name} />
                <span className="size-7 rounded-full border border-line" style={{ background: opt(METALS, v.snapshot.surfaces.metal).hex }} title={opt(METALS, v.snapshot.surfaces.metal).name} />
                <span className="self-center text-xs text-muted">{paint(v.snapshot.surfaces.wall).name} · {opt(FLOORS, v.snapshot.surfaces.floor).name} · {v.snapshot.placed.length} pieces · {v.snapshot.length}×{v.snapshot.width}</span>
              </div>
              {v.note && <p className="mt-2 text-sm text-muted">{v.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button kind="ghost" onClick={() => restoreVersion(room.id, v.id)}>Open this state</Button>
                <Confirm label="Remove" confirmLabel="Remove version" className="min-h-11 px-3 text-xs" icon={<Trash2 className="size-3" />} onConfirm={() => removeVersion(room.id, v.id)} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------- BRIEF ----------------
export function BriefButton({ room }: { room: HouseRoom }) {
  const items = useRoomItems(room.id);
  const settings = useStore((s) => s.house.settings);
  const decisions = useStore((s) => s.decisions);
  const seats = useStore((s) => s.seats);
  const [open, setOpen] = useState(false);
  const text = useMemo(() => (open ? roomBrief(room, items, settings, decisions, seats) : ''), [open, room, items, settings, decisions, seats]);
  return (
    <>
      <Button kind="ghost" onClick={() => setOpen(true)}>Contractor brief</Button>
      <ExportSheet open={open} onClose={() => setOpen(false)} title={`${room.name}, brief`} filename={`${room.name.replace(/\s+/g, '-').toLowerCase()}-brief.txt`} content={text} />
    </>
  );
}
