import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Columns2, RotateCcw, Camera, ArrowLeftRight } from 'lucide-react';
import { useStore } from '../lib/store';
import { PAINTS, paint } from '../data/palette';
import { FLOORS, FINISHES, FRAMES, METALS, CLOTHS, CEILINGS, opt } from '../data/materials';
import { PIECES, PIECE_GROUPS } from '../data/pieces';
import { STUDIO_ROOMS, roomName, ROOM_TYPES } from '../data/rooms';
import { critique } from '../lib/critique';
import { parseIdea } from '../lib/parse';
import { harmonize, lrv, undertone, textOn } from '../lib/color';
import { RoomStage, type StageHandle } from '../stage/RoomStage';
import { studioSpec, colorOf } from '../stage/spec';
import { Button, Chip, Section, Swatch, OptionCard, Note, Pill } from '../components/ui';
import { AddOwn } from '../components/AddOwn';
import type { StudioState } from '../lib/types';

const HOURS = [['Dawn', 7], ['Morning', 10], ['Noon', 13], ['Afternoon', 16], ['Dusk', 18], ['Evening', 21]] as const;

export default function Studio() {
  const studio = useStore((s) => s.studio);
  const compare = useStore((s) => s.compare);
  const customs = useStore((s) => s.customs);
  const setCompare = useStore((s) => s.setCompare);
  const swapCompare = useStore((s) => s.swapCompare);
  const stage = useRef<StageHandle>(null);
  const stageB = useRef<StageHandle>(null);
  const spec = useMemo(() => studioSpec(studio, customs), [studio, customs]);
  const specB = useMemo(() => (compare ? studioSpec(compare, customs) : null), [compare, customs]);

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className={`relative h-[46dvh] shrink-0 bg-ink md:h-full md:min-h-0 md:flex-1 ${specB ? 'grid grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1' : ''}`}>
        <div className="relative h-full min-h-0">
          <RoomStage ref={stage} spec={spec} />
          {specB && <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-ink/80 px-3 py-1 text-xs text-oak">A · {paint(studio.wall).name}</span>}
        </div>
        {specB && (
          <div className="relative h-full min-h-0 border-t border-line md:border-t-0 md:border-l">
            <RoomStage ref={stageB} spec={specB} />
            <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-ink/80 px-3 py-1 text-xs text-oak">B · {paint(compare!.wall).name}</span>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 flex gap-2">
          <span className="rounded-full bg-ink/80 px-3 py-1 text-xs text-paper">Drag to turn. Pinch or scroll to come closer.</span>
        </div>
        <div className="absolute top-3 right-3 flex gap-2">
          <button type="button" aria-label="Reset view" onClick={() => { stage.current?.resetView(); stageB.current?.resetView(); }} className="grid size-10 place-items-center rounded-full bg-ink/80 text-paper"><RotateCcw className="size-4" /></button>
          <button type="button" aria-label={specB ? 'Close compare' : 'Compare'} onClick={() => setCompare(specB ? null : { ...studio })} className={`grid size-10 place-items-center rounded-full ${specB ? 'bg-oak text-ink' : 'bg-ink/80 text-paper'}`}><Columns2 className="size-4" /></button>
          {specB && <button type="button" aria-label="Swap A and B" onClick={swapCompare} className="grid size-10 place-items-center rounded-full bg-ink/80 text-paper"><ArrowLeftRight className="size-4" /></button>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-5 md:w-[26rem] md:flex-none md:border-t-0 md:border-l">
        <Controls stage={stage} />
      </div>
    </div>
  );
}

function Controls({ stage }: { stage: React.RefObject<StageHandle | null> }) {
  const nav = useNavigate();
  const studio = useStore((s) => s.studio);
  const compare = useStore((s) => s.compare);
  const patchStudio = useStore((s) => s.patchStudio);
  const loadRoom = useStore((s) => s.loadRoom);
  const resetRoom = useStore((s) => s.resetRoom);
  const togglePiece = useStore((s) => s.togglePiece);
  const saveItem = useStore((s) => s.saveItem);
  const customs = useStore((s) => s.customs);
  const addRoom = useStore((s) => s.addRoom);
  const updateSurfaces = useStore((s) => s.updateSurfaces);
  const updateRoom = useStore((s) => s.updateRoom);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'shell' | 'pieces' | 'read'>('shell');

  const customColors = customs.filter((c) => c.kind === 'color' && c.hex);
  const customHex = Object.fromEntries(customColors.map((c) => [c.id, c.hex!]));
  const wallHex = colorOf(studio.wall, customs);
  const wallName = customColors.find((c) => c.id === studio.wall)?.text ?? paint(studio.wall).name;
  const wallNote = customColors.find((c) => c.id === studio.wall) ? `A color you added. ${undertone(wallHex)} undertone, LRV ${lrv(wallHex)}.` : paint(studio.wall).note;
  const notes = useMemo(() => critique(studio, customHex), [studio, customs]);
  const harm = useMemo(() => harmonize(wallHex), [wallHex]);
  const p = (x: Partial<StudioState>) => { patchStudio(x); setSaved(false); };

  function makeReal() {
    const type = ROOM_TYPES.find((r) => r.studio === studio.room)?.id ?? 'living';
    const id = addRoom(type, `${roomName(studio.room)} from the studio`);
    updateSurfaces(id, { wall: PAINTS.some((x) => x.id === studio.wall) ? studio.wall : 'bone', finish: studio.finish, floor: studio.floor, trim: studio.frame, metal: studio.metal, cloth: CLOTHS.some((x) => x.id === studio.cloth) ? studio.cloth : 'oat-linen', ceiling: studio.ceiling });
    updateRoom(id, { warmth: studio.warmth, hour: studio.hour });
    nav(`/house/${id}`);
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <p className="kicker">Studio</p>
        <h1 className="mt-1 display text-3xl italic">Build the room</h1>
        <p className="mt-2 text-sm text-muted">A live model for color, framing, texture, light and what you add. When it feels right, make it a real room with your measurements.</p>
      </div>
      <div className="flex gap-2">{(['shell', 'pieces', 'read'] as const).map((t) => <Chip key={t} on={tab === t} onClick={() => setTab(t)}>{t === 'shell' ? 'Shell' : t === 'pieces' ? 'Pieces' : `Read it (${notes.filter((n) => n.level !== 'good').length})`}</Chip>)}</div>

      {tab === 'shell' && (<>
        <Section label="Add your own">
          <p className="text-sm text-muted">Type a color, a thing to include, or an idea. Colors land on the walls. Options the room can build get added.</p>
          <AddOwn onAdded={(c) => {
            if (c.kind === 'color') { p({ wall: c.id }); return; }
            const parsed = parseIdea(c.text);
            const pieces = parsed.pieces?.length ? [...new Set([...studio.pieces, ...parsed.pieces])] : undefined;
            const { pieces: _p, ...rest } = parsed;
            if (pieces || Object.keys(rest).length) p({ ...rest, ...(pieces ? { pieces } : {}) });
          }} />
        </Section>
        <Section label="Starting room">
          <div className="flex flex-wrap gap-2">{STUDIO_ROOMS.map((r) => <Chip key={r.id} on={studio.room === r.id} onClick={() => loadRoom(r.id)}>{r.name}</Chip>)}</div>
          <p className="text-xs text-muted">Switching rooms restores that room's pieces. Your colors stay.</p>
        </Section>
        <Section label="Wall color" hint={`${wallName} · LRV ${lrv(wallHex)}`}>
          {customColors.length > 0 && <div className="flex flex-col gap-2"><p className="text-xs text-muted uppercase">Yours</p><div className="flex flex-wrap gap-2">{customColors.map((c) => <Swatch key={c.id} hex={c.hex!} name={c.text} selected={studio.wall === c.id} onSelect={() => p({ wall: c.id })} />)}</div></div>}
          {(['light', 'mid', 'deep'] as const).map((g) => (
            <div key={g} className="flex flex-col gap-2"><p className="text-xs text-muted uppercase">{g}</p>
              <div className="flex flex-wrap gap-2">{PAINTS.filter((x) => x.group === g).map((x) => <Swatch key={x.id} hex={x.hex} name={x.name} sub={`${x.undertone} · ${x.lrv}`} selected={studio.wall === x.id} onSelect={() => p({ wall: x.id })} />)}</div>
            </div>
          ))}
          <p className="text-sm text-muted">{wallNote}</p>
          {PAINTS.some((x) => x.id === studio.wall) && <p className="text-xs text-muted">Near: {paint(studio.wall).near.join(' · ')}. Sample in the room; these are neighbors, not twins.</p>}
          <div className="mt-1 rounded-2xl bg-surface p-3">
            <p className="text-xs text-muted">A palette from this wall</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(harm).map(([k, hex]) => <span key={k} className="rounded-full px-3 py-1 text-xs" style={{ background: hex, color: textOn(hex) }}>{k}</span>)}
            </div>
            <Button kind="quiet" className="mt-1 px-0" onClick={() => saveItem({ kind: 'palette', title: `Palette from ${wallName}`, subtitle: 'Trim, ceiling, dark, accent, cloth', body: Object.values(harm).join(' '), palette: [studio.wall] })}>Save palette</Button>
          </div>
        </Section>
        <Section label="Wall texture" hint={opt(FINISHES, studio.finish).note}>
          <div className="flex flex-wrap gap-2">{FINISHES.map((f) => <Chip key={f.id} on={studio.finish === f.id} onClick={() => p({ finish: f.id })}>{f.name}</Chip>)}</div>
        </Section>
        <Section label="Ceiling">
          <div className="flex flex-wrap gap-2">{CEILINGS.map((c) => <Chip key={c.id} on={studio.ceiling === c.id} onClick={() => p({ ceiling: c.id })}>{c.name}</Chip>)}</div>
          <p className="text-sm text-muted">{opt(CEILINGS, studio.ceiling).note}</p>
        </Section>
        <Section label="Floor">
          <div className="grid gap-2">{FLOORS.map((f) => <OptionCard key={f.id} name={f.name} note={f.note} hex={f.hex} selected={studio.floor === f.id} onSelect={() => p({ floor: f.id })} right={f.cost ? `$${f.cost[0]}–${f.cost[1]}/sf` : undefined} />)}</div>
        </Section>
        <Section label="Framing">
          <div className="grid gap-2">{FRAMES.map((f) => <OptionCard key={f.id} name={f.name} note={f.note} selected={studio.frame === f.id} onSelect={() => p({ frame: f.id })} />)}</div>
          <Link to="/learn/framing" className="text-sm text-oak">Why frames matter</Link>
        </Section>
        <Section label="Cloth">
          <div className="flex flex-wrap gap-2">
            {customColors.map((c) => <Swatch key={c.id} hex={c.hex!} name={c.text} selected={studio.cloth === c.id} onSelect={() => p({ cloth: c.id })} />)}
            {CLOTHS.map((c) => <Swatch key={c.id} hex={c.hex!} name={c.name} selected={studio.cloth === c.id} onSelect={() => p({ cloth: c.id })} />)}
          </div>
        </Section>
        <Section label="Metal" hint={opt(METALS, studio.metal).note}>
          <div className="flex flex-wrap gap-2">{METALS.map((m) => <Swatch key={m.id} hex={m.hex!} name={m.name} selected={studio.metal === m.id} onSelect={() => p({ metal: m.id })} />)}</div>
        </Section>
        <Section label="Light">
          <div className="flex flex-wrap gap-2">{HOURS.map(([n, h]) => <Chip key={n} on={studio.hour === h} onClick={() => p({ hour: h })}>{n}</Chip>)}</div>
          <label className="mt-1 text-xs text-muted">Lamps, north to candle</label>
          <input type="range" min={0} max={100} value={studio.warmth} aria-label="Light warmth" onChange={(e) => p({ warmth: Number(e.target.value) })} className="h-10 w-full" />
          <p className="text-sm text-muted">{studio.warmth < 35 ? 'Cool north day. Brass looks tired here; warm the lamps or accept the daylight.' : studio.warmth < 65 ? 'Afternoon. Most paints tell the truth at this setting.' : 'Evening lamps at 2700K. Every warm white holds; the cool ones go gray.'}</p>
        </Section>
      </>)}

      {tab === 'pieces' && (
        <Section label="Additions" hint={`${studio.pieces.length} in the room`}>
          {PIECE_GROUPS.map((g) => (
            <div key={g} className="mt-2"><p className="mb-2 text-xs text-muted uppercase">{g}</p>
              <div className="flex flex-wrap gap-2">{PIECES.filter((x) => x.group === g).map((x) => <Chip key={x.id} on={studio.pieces.includes(x.id)} onClick={() => { togglePiece(x.id); setSaved(false); }} title={x.clearance}>{x.name}</Chip>)}</div>
            </div>
          ))}
          <p className="mt-2 text-xs text-muted">Pieces land in sensible places. For a plan you can drag around, make this a real room.</p>
        </Section>
      )}

      {tab === 'read' && (
        <Section label="What the atelier sees" hint="Rules, not taste">
          <div className="flex flex-col gap-2">{notes.map((n, i) => <Note key={i} level={n.level} title={n.title} body={n.body} action={n.fix ? <Button kind="quiet" className="px-0" onClick={() => p(n.fix!)}>Try the fix</Button> : undefined} />)}</div>
          <div className="mt-2 flex flex-wrap gap-2">{[studio.wall, studio.cloth].map((id) => <Pill key={id} hex={colorOf(id, customs)}>{customColors.find((c) => c.id === id)?.text ?? paint(id).name ?? id}</Pill>)}<Pill hex={opt(METALS, studio.metal).hex!}>{opt(METALS, studio.metal).name}</Pill><Pill hex={opt(FLOORS, studio.floor).hex ?? '#c9a673'}>{opt(FLOORS, studio.floor).name}</Pill></div>
          {compare && <p className="text-sm text-muted">Comparing against B: {paint(compare.wall).name}, {opt(FLOORS, compare.floor).name}, {opt(METALS, compare.metal).name}.</p>}
        </Section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { saveItem({ kind: 'room', title: `${roomName(studio.room)} room`, subtitle: wallName, body: 'A studio model. Open it to keep editing.', studio, image: stage.current?.screenshot() }); setSaved(true); }}>{saved ? 'Saved to boards' : 'Save this room'}</Button>
        <Button kind="ghost" onClick={makeReal}>Make it a real room</Button>
        <Button kind="ghost" onClick={() => { const url = stage.current?.screenshot(); if (url) { const a = document.createElement('a'); a.href = url; a.download = 'alder-room.jpg'; a.click(); } }}><Camera className="size-4" />Snapshot</Button>
        <Button kind="quiet" onClick={() => { resetRoom(); setSaved(false); }}>Reset this room</Button>
      </div>
      <Link to={`/?room=${studio.room}`} className="text-sm text-oak">See photoreal studies of this kind of room</Link>
    </div>
  );
}
