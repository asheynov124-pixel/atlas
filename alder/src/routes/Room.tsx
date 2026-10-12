import { useMemo, useRef, useState } from 'react';

function useRoomItems(roomId: string) {
  const all = useStore((s) => s.house.items);
  return useMemo(() => all.filter((i) => i.roomId === roomId), [all, roomId]);
}
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2, RotateCw, Copy, Plus, Box, Grid2x2, RotateCcw, Camera, ArrowLeft, ChevronUp, ChevronDown, Palette, Lamp, ListChecks, History, CheckCircle2, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { ROOM_TYPES, roomType } from '../data/rooms';
import { PAINTS, paint } from '../data/palette';
import { FLOORS, FINISHES, FRAMES, METALS, CLOTHS, CEILINGS, COUNTERS, TILES, HARDWARE, WINDOW_TREATMENTS, opt } from '../data/materials';
import { PIECES, PIECE_GROUPS, piece } from '../data/pieces';
import { CATALOG, catalogForPiece, catalogItem, midPrice } from '../data/catalog';
import { takeoff, ftIn, fmtMoney, fmtRange } from '../lib/takeoff';
import { critique, critiquePlan } from '../lib/critique';
import { roomRollup, lineBest, CATEGORY_LABEL } from '../lib/budget';
import { itemsCsv, saveFile, dataUrlToBlob } from '../lib/export';
import { RoomStage, type StageHandle } from '../stage/RoomStage';
import { houseSpec } from '../stage/spec';
import { PlanEditor } from '../components/PlanEditor';
import { ShopLinks } from '../components/ShopLinks';
import { Button, Chip, Section, Swatch, OptionCard, Note, Field, Stat, Img, Confirm, ExportSheet, TabRail, IconButton } from '../components/ui';
import { ITEM_CATEGORIES, ITEM_STATUSES, STATUS_LABEL, PHASE_LABEL, type HouseItem, type ItemStatus, type SurfaceKey, type StudioState, type Opening } from '../lib/types';
import { DecideTab, ScenesTab, VersionsTab, BriefButton } from './RoomExtras';
import { Wifi } from 'lucide-react';
import { CARE_PRESETS } from '../lib/decide';

const HOURS = [['Dawn', 7], ['Morning', 10], ['Noon', 13], ['Afternoon', 16], ['Dusk', 18], ['Evening', 21]] as const;
type Tab = 'plan' | 'shell' | 'list' | 'decide' | 'scenes' | 'versions' | 'read';

export default function Room() {
  const { roomId = '' } = useParams();
  const room = useStore((s) => s.house.rooms.find((r) => r.id === roomId));
  const [tab, setTab] = useState<Tab>('plan');
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [big, setBig] = useState(false);
  /** The view follows the work: the plan for placing, the room itself for finishes and light. The buttons still override. */
  function pickTab(t: Tab) { setTab(t); if (t === 'plan') setView('2d'); else if (t === 'shell' || t === 'scenes' || t === 'read' || t === 'versions') setView('3d'); }
  const [selected, setSelected] = useState<string | null>(null);
  const [overlays, setOverlays] = useState(false);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const stage = useRef<StageHandle>(null);
  const scene = room?.scenes?.find((x) => x.id === sceneId) ?? null;
  const spec = useMemo(() => (room ? houseSpec(room, selected ?? undefined, scene) : null), [room, selected, scene]);
  if (!room || !spec) return <div className="p-6"><p className="text-muted">That room is gone.</p><Link to="/" className="text-oak">Back to the Overview</Link></div>;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className={`relative shrink-0 bg-canvas transition-[height] md:h-full md:min-h-0 md:flex-1 ${big ? 'h-[68dvh]' : 'h-[44dvh]'}`}>
        {view === '3d' ? <RoomStage ref={stage} spec={spec} /> : <div className="h-full w-full p-3"><PlanEditor room={room} selected={selected} overlays={overlays} onSelect={setSelected} onMove={(id, p) => useStore.getState().updatePlaced(room.id, id, p)} /></div>}
        {scene && <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-oak px-3 py-1 text-xs text-ink">Scene · {scene.name}</span>}
        <div className="absolute top-3 right-3 flex gap-2">
          <button type="button" aria-label="Plan" onClick={() => setView('2d')} className={`grid size-11 place-items-center rounded-full ${view === '2d' ? 'bg-fg text-bg shadow-sm' : 'border border-line bg-surface text-fg shadow-sm'}`}><Grid2x2 className="size-4" /></button>
          <button type="button" aria-label="3D" onClick={() => setView('3d')} className={`grid size-11 place-items-center rounded-full ${view === '3d' ? 'bg-fg text-bg shadow-sm' : 'border border-line bg-surface text-fg shadow-sm'}`}><Box className="size-4" /></button>
          {view === '2d' && <button type="button" aria-label="Coverage overlays" onClick={() => setOverlays(!overlays)} className={`grid size-11 place-items-center rounded-full ${overlays ? 'bg-fg text-bg shadow-sm' : 'border border-line bg-surface text-fg shadow-sm'}`}><Wifi className="size-4" /></button>}
          {view === '3d' && <button type="button" aria-label="Reset view" onClick={() => stage.current?.resetView()} className="grid size-11 place-items-center rounded-full border border-line bg-surface text-fg shadow-sm"><RotateCcw className="size-4" /></button>}
          {view === '3d' && <button type="button" aria-label="Snapshot" onClick={() => { const u = stage.current?.screenshot(); if (u) void saveFile(`${room.name.replace(/\s+/g, '-').toLowerCase()}.jpg`, dataUrlToBlob(u)); }} className="grid size-11 place-items-center rounded-full border border-line bg-surface text-fg shadow-sm"><Camera className="size-4" /></button>}
          <button type="button" aria-label={big ? 'Smaller model' : 'Larger model'} onClick={() => setBig(!big)} className="grid size-11 place-items-center rounded-full border border-line bg-surface text-fg shadow-sm md:hidden">{big ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</button>
        </div>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink/80 px-3 py-1 text-xs text-paper">{view === '2d' ? 'Drag pieces. Tap one to edit it. One square is one foot.' : 'Drag to turn. Pinch or scroll to come closer.'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-5 md:w-[28rem] md:flex-none md:border-t-0 md:border-l">
        <Header room={room} tab={tab} setTab={pickTab} />
        {tab === 'plan' && <PlanTab room={room} selected={selected} setSelected={setSelected} />}
        {tab === 'shell' && <ShellTab room={room} />}
        {tab === 'list' && <ListTab room={room} />}
        {tab === 'decide' && <DecideTab room={room} />}
        {tab === 'scenes' && <ScenesTab room={room} active={sceneId} setActive={(id) => { setSceneId(id); if (id) setView('3d'); }} />}
        {tab === 'versions' && <VersionsTab room={room} />}
        {tab === 'read' && <ReadTab room={room} setSelected={(id) => { setSelected(id); setView('2d'); }} />}
      </div>
    </div>
  );
}

type R = NonNullable<ReturnType<typeof useStore.getState>['house']['rooms'][number]>;

function Header({ room, tab, setTab }: { room: R; tab: Tab; setTab: (t: Tab) => void }) {
  const nav = useNavigate();
  const updateRoom = useStore((s) => s.updateRoom);
  const removeRoom = useStore((s) => s.removeRoom);
  const duplicateRoom = useStore((s) => s.duplicateRoom);
  const items = useRoomItems(room.id);
  const settings = useStore((s) => s.house.settings);
  const roll = roomRollup(room, items, settings);
  const plan = critiquePlan(room);
  const bad = plan.filter((n) => n.level !== 'good').length;
  const openDec = useStore((s) => s.decisions.filter((d) => d.roomId === room.id && d.status !== 'decided').length);
  return (
    <div className="mb-5">
      <Link to="/" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Overview</Link>
      <div className="flex items-center justify-between gap-3">
        <input className="w-full min-w-0 flex-1 bg-transparent display text-2xl outline-none md:text-3xl" value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} aria-label="Room name" />
        <div className="flex shrink-0 items-center gap-1.5">
          <BriefButton room={room} />
          <IconButton label="Duplicate room" onClick={() => nav(`/house/${duplicateRoom(room.id)}`)}><Copy className="size-4" /></IconButton>
          <Confirm label="" icon={<Trash2 className="size-4" />} confirmLabel="Delete room and list" className="min-h-11 px-2!" onConfirm={() => { removeRoom(room.id); nav('/'); }} />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{roomType(room.type).name} · {ftIn(room.length)} × {ftIn(room.width)} · {ftIn(room.height)} ceiling · {Math.round(room.length * room.width)} sq ft · <span className="font-medium text-fg">{PHASE_LABEL[room.phase ?? 'concept']}</span></p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="At the door" value={fmtMoney(roll.total + (roll.hasShellLines ? 0 : roll.shellMid * (1 + settings.taxRate)))} sub={roll.hasShellLines ? `${roll.count} lines` : `${roll.count} lines + shell est.`} />
        <Stat label="Room budget" value={room.budget ? fmtMoney(room.budget) : '—'} sub={room.budget ? (roll.total > room.budget ? <span className="text-stop">over by {fmtMoney(roll.total - room.budget)}</span> : `${fmtMoney(room.budget - roll.total)} left`) : <input type="number" className="w-28 border-b border-line bg-transparent text-xs outline-none placeholder:text-muted" placeholder="Set one" aria-label="Room budget" onBlur={(e) => { const v = Number(e.target.value); if (v > 0) updateRoom(room.id, { budget: v }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />} />
      </div>
      <TabRail<Tab> className="mt-4" value={tab} onChange={setTab} tabs={[
        { id: 'plan', label: 'Plan', icon: Grid2x2, hint: 'Place the pieces to scale' },
        { id: 'shell', label: 'Finishes', icon: Palette, hint: 'Walls, floor, trim, tile, counters, quantities' },
        { id: 'scenes', label: 'Light', icon: Lamp, hint: 'Scenes by hour; the dimmer plan' },
        { id: 'list', label: 'List', icon: ListChecks, badge: items.length, hint: 'Everything this room needs, priced' },
        { id: 'decide', label: 'Decisions', icon: Users, badge: openDec, hint: 'Phase and open choices' },
        { id: 'versions', label: 'Versions', icon: History, hint: 'As found, as is, as planned' },
        { id: 'read', label: 'Review', icon: CheckCircle2, badge: bad, hint: 'Clearances and color checks' },
      ]} />
    </div>
  );
}

// ---------------- PLAN ----------------
function PlanTab({ room, selected, setSelected }: { room: R; selected: string | null; setSelected: (id: string | null) => void }) {
  const addPlaced = useStore((s) => s.addPlaced);
  const updatePlaced = useStore((s) => s.updatePlaced);
  const removePlaced = useStore((s) => s.removePlaced);
  const addItem = useStore((s) => s.addItem);
  const items = useRoomItems(room.id);
  const [pick, setPick] = useState(false);
  const sel = room.placed.find((p) => p.id === selected);
  const def = sel ? piece(sel.pieceId) : undefined;
  const linked = sel ? items.find((i) => i.pieceId === sel.id) : undefined;
  const t = takeoff(room);
  const [shop, setShop] = useState<string | null>(null);

  function addToList(placedId: string, pieceId: string, catalogId?: string) {
    const d = piece(pieceId)!; const c = catalogId ? catalogItem(catalogId) : undefined;
    const p = room.placed.find((x) => x.id === placedId);
    addItem({ roomId: room.id, name: c?.name ?? d.name, category: c?.budgetCategory ?? (d.group === 'Light' ? 'lighting' : d.group === 'Cloth & art' ? (pieceId === 'art' || pieceId === 'mirror' ? 'art' : 'textiles') : d.group === 'Kitchen & bath' ? 'plumbing' : 'furniture'), qty: 1, unit: 'each', price: c ? midPrice(c) : 0, estimate: c?.price ?? d.price, status: 'idea', pieceId: placedId, catalogId, lead: c?.lead, dims: [Math.round(p?.w ?? d.w), Math.round(p?.d ?? d.d), Math.round(p?.h ?? d.h)], notes: c?.why ?? d.note });
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Section label="On the plan" hint={`${room.placed.length} pieces · rug wants ${t.rugSuggestion}`}>
        <div className="flex flex-wrap gap-2">
          {room.placed.map((p) => { const d = piece(p.pieceId); return <Chip key={p.id} on={selected === p.id} onClick={() => setSelected(selected === p.id ? null : p.id)}>{p.label ?? d?.name ?? p.pieceId}</Chip>; })}
          <Button kind="ghost" onClick={() => setPick(!pick)}><Plus className="size-4" />Add a piece</Button>
        </div>
        {pick && (
          <div className="card mt-2 p-3">
            {PIECE_GROUPS.map((g) => <div key={g} className="mt-2"><p className="mb-1 text-xs text-muted uppercase">{g}</p><div className="flex flex-wrap gap-2">{PIECES.filter((x) => x.group === g).map((x) => <Chip key={x.id} onClick={() => { setSelected(addPlaced(room.id, x.id)); setPick(false); }} title={`${x.w}×${x.d}×${x.h}″`}>{x.name}</Chip>)}</div></div>)}
          </div>
        )}
      </Section>

      {sel && def ? (
        <Section label={`Selected: ${sel.label ?? def.name}`} hint={def.clearance}>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Width" type="number" suffix="in" value={sel.w ?? def.w} onChange={(e) => updatePlaced(room.id, sel.id, { w: Number(e.target.value) })} />
            <Field label="Depth" type="number" suffix="in" value={sel.d ?? def.d} onChange={(e) => updatePlaced(room.id, sel.id, { d: Number(e.target.value) })} />
            <Field label="Height" type="number" suffix="in" value={sel.h ?? def.h} onChange={(e) => updatePlaced(room.id, sel.id, { h: Number(e.target.value) })} />
            <Field label="From west wall" type="number" step={0.25} suffix="ft" value={Math.round(sel.x * 100) / 100} onChange={(e) => updatePlaced(room.id, sel.id, { x: Number(e.target.value) })} />
            <Field label="From north wall" type="number" step={0.25} suffix="ft" value={Math.round(sel.z * 100) / 100} onChange={(e) => updatePlaced(room.id, sel.id, { z: Number(e.target.value) })} />
            <Field label="Label" value={sel.label ?? ''} placeholder={def.name} onChange={(e) => updatePlaced(room.id, sel.id, { label: e.target.value || undefined })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button kind="ghost" onClick={() => updatePlaced(room.id, sel.id, { rot: (sel.rot + 90) % 360 })}><RotateCw className="size-4" />Rotate</Button>
            <Button kind="ghost" onClick={() => { const n = addPlaced(room.id, sel.pieceId, { x: Math.min(room.length - 1, sel.x + 1), z: Math.min(room.width - 1, sel.z + 1) }); updatePlaced(room.id, n, { w: sel.w, d: sel.d, h: sel.h, rot: sel.rot }); setSelected(n); }}><Copy className="size-4" />Duplicate</Button>
            <Button kind="danger" onClick={() => { removePlaced(room.id, sel.id); setSelected(null); }}><Trash2 className="size-4" />Remove</Button>
          </div>
          {def.note && <p className="text-sm text-muted">{def.note}</p>}
          <div className="card p-3">
            <p className="kicker">Buy it</p>
            {linked ? <p className="mt-1 text-sm">On the list as <span className="font-medium">{linked.name}</span>, {STATUS_LABEL[linked.status]}, {fmtMoney(lineBest(linked))}.</p> : (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-sm text-muted">Typical: {fmtRange(def.price)}. Pick a catalog match, or add it plain and price it later.</p>
                <div className="flex flex-wrap gap-2">
                  {catalogForPiece(sel.pieceId).map((c) => <Chip key={c.id} onClick={() => addToList(sel.id, sel.pieceId, c.id)}>{c.name} · {fmtMoney(midPrice(c))}</Chip>)}
                  <Chip onClick={() => addToList(sel.id, sel.pieceId)}>Add plain</Chip>
                </div>
              </div>
            )}
            <button type="button" className="mt-2 text-sm text-oak" onClick={() => setShop(shop ? null : sel.pieceId)}>Hunt for one</button>
            {shop && <div className="mt-2"><ShopLinks compact query={`${def.name} ${Math.round(sel.w ?? def.w)} inch`} markets={catalogForPiece(sel.pieceId)[0]?.markets ?? ['wayfair', 'westelm', 'etsy', 'facebook']} /></div>}
          </div>
        </Section>
      ) : (
        <p className="text-sm text-muted">Tap a piece on the plan to resize it, rotate it, or put it on the shopping list with a price.</p>
      )}

      <Section label="Clearances" hint="in inches">
        <ul className="grid gap-1 text-sm">
          {roomType(room.type).checklist.map((c) => <li key={c} className="rounded-xl bg-surface px-3 py-2">{c}</li>)}
        </ul>
      </Section>
    </div>
  );
}

// ---------------- SHELL ----------------
function ShellTab({ room }: { room: R }) {
  const updateRoom = useStore((s) => s.updateRoom);
  const updateSurfaces = useStore((s) => s.updateSurfaces);
  const addOpening = useStore((s) => s.addOpening);
  const updateOpening = useStore((s) => s.updateOpening);
  const removeOpening = useStore((s) => s.removeOpening);
  const addItem = useStore((s) => s.addItem);
  const removeItem = useStore((s) => s.removeItem);
  const items = useRoomItems(room.id);
  const s = room.surfaces;
  const t = takeoff(room);
  const [showAll, setShowAll] = useState(false);
  const isWet = room.type === 'kitchen' || room.type === 'bath' || room.type === 'powder' || room.type === 'mudroom';

  function shellLines(): Omit<HouseItem, 'id' | 'at'>[] {
    const f = opt(FLOORS, s.floor), fin = opt(FINISHES, s.finish), fr = opt(FRAMES, s.trim), ce = opt(CEILINGS, s.ceiling);
    const mid = (o: { cost?: [number, number] }) => (o.cost ? (o.cost[0] + o.cost[1]) / 2 : 0);
    const lines: Omit<HouseItem, 'id' | 'at'>[] = [
      { roomId: room.id, name: `${f.name} flooring`, category: 'surfaces', qty: t.flooringSqftWithWaste, unit: 'sq ft', price: 0, estimate: f.cost, status: 'idea', surface: 'floor', notes: `${t.floorSqft} sq ft + ${Math.round(room.waste * 100)}% waste. ${f.note}` },
      { roomId: room.id, name: `${fin.name}, walls in ${paint(s.wall).name}`, category: 'surfaces', qty: Math.round(t.netWallSqft * (1 - (s.wainscot ?? 0))), unit: 'sq ft', price: 0, estimate: fin.cost, status: 'idea', surface: 'walls', notes: `${t.paintGallonsWalls} gal paint, ${t.primerGallons} gal primer, two coats. Near: ${paint(s.wall).near[0]}.` },
      { roomId: room.id, name: `Ceiling, ${ce.name.toLowerCase()}`, category: 'surfaces', qty: ce.unit?.includes('linear') ? Math.ceil(room.length / 3) * room.width : t.ceilingSqft, unit: ce.unit?.includes('linear') ? 'linear ft' : 'sq ft', price: 0, estimate: ce.cost, status: 'idea', surface: 'ceiling', notes: `${t.paintGallonsCeiling} gal in ${paint(s.ceilingColor || 'chalk').name}.` },
      { roomId: room.id, name: `${fr.name} casing + base`, category: 'millwork', qty: Math.round(t.baseboardFt + t.casingFt), unit: 'linear ft', price: 0, estimate: fr.cost, status: 'idea', surface: 'trim', notes: `${Math.round(t.baseboardFt)} ft base, ${Math.round(t.casingFt)} ft casing around ${t.doorCount} doors and ${t.windowCount} windows. ${t.paintGallonsTrim} gal satin in ${paint(s.trimColor || 'chalk').name}.` },
    ];
    if (s.tile && (s.tileSqft || s.wainscot)) { const ti = opt(TILES, s.tile); lines.push({ roomId: room.id, name: `${ti.name} tile`, category: 'surfaces', qty: t.tileSqftWithWaste, unit: 'sq ft', price: 0, estimate: ti.cost, status: 'idea', surface: 'tile', notes: `${ti.note} Plus grout, thinset, and a setter.` }); }
    if (s.counters && s.counterSqft) { const co = opt(COUNTERS, s.counters); lines.push({ roomId: room.id, name: `${co.name} counters`, category: 'surfaces', qty: s.counterSqft, unit: 'sq ft', price: 0, estimate: co.cost, status: 'idea', surface: 'counters', notes: co.note }); }
    if (s.windows && t.windowCount) { const wt = opt(WINDOW_TREATMENTS, s.windows); const qty = wt.unit === 'panel' ? t.curtainPanels : wt.unit === 'sq ft' ? room.openings.filter((o) => o.kind === 'window').reduce((a, w) => a + w.width * w.height, 0) : t.windowCount; if (wt.cost && wt.cost[1] > 0) lines.push({ roomId: room.id, name: wt.name, category: 'textiles', qty: Math.round(qty), unit: wt.unit ?? 'each', price: 0, estimate: wt.cost, status: 'idea', surface: 'windows', notes: `${t.windowCount} windows. ${wt.note}${wt.unit === 'panel' ? ` ${t.curtainRods} rods.` : ''}` }); }
    if (s.hardware && room.type === 'kitchen') { const hw = opt(HARDWARE, s.hardware); lines.push({ roomId: room.id, name: `${hw.name}, cabinet hardware`, category: 'hardware', qty: 24, unit: 'each', price: 0, estimate: hw.cost, status: 'idea', notes: 'Count the drawers and doors. Order two extra.' }); }
    return lines;
  }
  const existing = items.filter((i) => i.surface);
  function regenerate() {
    existing.forEach((i) => removeItem(i.id));
    shellLines().forEach((l) => addItem(l));
  }
  const p = (k: Partial<R>) => updateRoom(room.id, k);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <Section label="Dimensions" hint="decimal feet: 8′6″ is 8.5">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Length (W–E)" type="number" step={0.25} min={3} value={room.length} onChange={(e) => p({ length: Math.max(3, Number(e.target.value)) })} suffix="ft" />
          <Field label="Width (N–S)" type="number" step={0.25} min={3} value={room.width} onChange={(e) => p({ width: Math.max(3, Number(e.target.value)) })} suffix="ft" />
          <Field label="Ceiling" type="number" step={0.25} min={6} value={room.height} onChange={(e) => p({ height: Math.max(6, Number(e.target.value)) })} suffix="ft" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Main window faces</span>{(['N', 'E', 'S', 'W'] as const).map((f) => <Chip key={f} on={room.facing === f} onClick={() => p({ facing: f })}>{f}</Chip>)}
          <span className="ml-2 text-muted">Type</span>
          <select value={room.type} onChange={(e) => p({ type: e.target.value })} className="min-h-9 py-1 text-sm">{ROOM_TYPES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </div>
        <Link to="/learn/measure" className="text-sm text-oak">How to measure a room</Link>
      </Section>

      <Section label="Doors and windows" hint="offset from the wall's left end, looking at it from inside">
        <div className="flex flex-col gap-2">
          {room.openings.map((o) => (
            <div key={o.id} className="card grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] items-end gap-2 p-2">
              <select value={o.kind} onChange={(e) => updateOpening(room.id, o.id, { kind: e.target.value as Opening['kind'] })} className="min-h-9 py-1 text-xs"><option value="door">Door</option><option value="window">Window</option><option value="opening">Opening</option></select>
              <label className="text-xs text-muted">Wall<select value={o.wall} onChange={(e) => updateOpening(room.id, o.id, { wall: Number(e.target.value) as Opening['wall'] })} className="mt-1 min-h-9 w-full py-1 text-xs"><option value={0}>North (top)</option><option value={1}>East</option><option value={2}>South</option><option value={3}>West</option></select></label>
              <Field label="Offset" type="number" step={0.25} value={o.offset} onChange={(e) => updateOpening(room.id, o.id, { offset: Number(e.target.value) })} className="text-xs" />
              <Field label="Width" type="number" step={0.25} value={o.width} onChange={(e) => updateOpening(room.id, o.id, { width: Number(e.target.value) })} className="text-xs" />
              <Field label={o.kind === 'window' ? 'Height / sill' : 'Height'} type="number" step={0.25} value={o.height} onChange={(e) => updateOpening(room.id, o.id, { height: Number(e.target.value) })} className="text-xs" />
              <button type="button" aria-label="Remove" className="grid size-11 place-items-center text-muted hover:text-stop" onClick={() => removeOpening(room.id, o.id)}><Trash2 className="size-4" /></button>
              {o.kind === 'window' && <Field label="Sill height" type="number" step={0.25} value={o.sill ?? 2.5} onChange={(e) => updateOpening(room.id, o.id, { sill: Number(e.target.value) })} className="col-start-5 text-xs" />}
            </div>
          ))}
        </div>
        <div className="flex gap-2"><Button kind="ghost" onClick={() => addOpening(room.id, { kind: 'door', wall: 2, offset: 1, width: 3, height: 6.67 })}>+ Door</Button><Button kind="ghost" onClick={() => addOpening(room.id, { kind: 'window', wall: 0, offset: 1, width: 3, height: 4.5, sill: 2.5 })}>+ Window</Button></div>
      </Section>

      <Section label="Takeoff" hint="what the dimensions imply">
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          <Cell k="Floor" v={`${t.floorSqft} sq ft`} s={`order ${t.flooringSqftWithWaste} with waste`} />
          <Cell k="Walls, net" v={`${Math.round(t.netWallSqft)} sq ft`} s={`${t.paintGallonsWalls} gal + ${t.primerGallons} primer`} />
          <Cell k="Ceiling" v={`${t.ceilingSqft} sq ft`} s={`${t.paintGallonsCeiling} gal`} />
          <Cell k="Baseboard" v={`${Math.round(t.baseboardFt)} lin ft`} s={`+ ${Math.round(t.casingFt)} ft casing`} />
          <Cell k="Curtains" v={`${t.curtainPanels} panels`} s={`${t.curtainRods} rods, 2.25× fullness`} />
          <Cell k="Rug" v={t.rugSuggestion} s="front legs on it" />
          <Cell k="Light" v={`${t.lumensTarget.toLocaleString()} lm`} s="across two or three heights" />
          {t.tileSqftWithWaste > 0 && <Cell k="Tile" v={`${t.tileSqftWithWaste} sq ft`} s="with 12% waste" />}
          <Cell k="Waste factor" v={<input type="number" className="w-16 bg-transparent outline-none" min={0} max={30} value={Math.round(room.waste * 100)} onChange={(e) => p({ waste: Number(e.target.value) / 100 })} />} s="% on floor and tile" />
        </div>
        <div className="card p-3">
          <div className="flex items-baseline justify-between"><p className="kicker">Shell estimate</p><span className="text-sm">{fmtRange([Object.values(t.cost).reduce((a, c) => a + c[0], 0), Object.values(t.cost).reduce((a, c) => a + c[1], 0)])}</span></div>
          <ul className="mt-2 grid gap-1 text-sm">{Object.entries(t.cost).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="tabular-nums">{fmtRange(v)}</span></li>)}</ul>
          <Button kind="ghost" className="mt-3" onClick={regenerate}>{existing.length ? 'Regenerate shell lines on the list' : 'Put the shell on the list'}</Button>
          <p className="mt-2 text-xs text-muted">Installed-cost ranges, typical for the Northeast. Replace with real quotes on the list.</p>
        </div>
      </Section>

      <Section label="Walls" hint={`${paint(s.wall).name} · LRV ${paint(s.wall).lrv}`}>
        <div className="flex flex-wrap gap-2">{(showAll ? PAINTS : PAINTS.filter((x) => x.group !== 'deep' || x.id === s.wall || room.type === 'lounge' || room.type === 'dining' || room.type === 'powder')).map((x) => <Swatch key={x.id} hex={x.hex} name={x.name} sub={`${x.undertone} · ${x.lrv}`} selected={s.wall === x.id} onSelect={() => updateSurfaces(room.id, { wall: x.id })} />)}</div>
        {!showAll && <button type="button" className="text-left text-sm text-oak" onClick={() => setShowAll(true)}>Show the deep colors too</button>}
        <p className="text-sm text-muted">{paint(s.wall).note} Near: {paint(s.wall).near.join(' · ')}.</p>
        <div className="flex flex-wrap gap-2">{FINISHES.map((f) => <Chip key={f.id} on={s.finish === f.id} onClick={() => updateSurfaces(room.id, { finish: f.id })}>{f.name}</Chip>)}</div>
        <p className="text-sm text-muted">{opt(FINISHES, s.finish).note}</p>
        {isWet && <div className="flex items-center gap-2 text-sm"><span className="text-muted">Wainscot or tile up the wall</span><input type="range" min={0} max={100} value={Math.round((s.wainscot ?? 0) * 100)} onChange={(e) => updateSurfaces(room.id, { wainscot: Number(e.target.value) / 100 })} className="flex-1" /><span className="w-10 text-right">{Math.round((s.wainscot ?? 0) * 100)}%</span></div>}
      </Section>

      <Section label="Trim" hint="casing, base, doors">
        <div className="grid gap-2">{FRAMES.map((f) => <OptionCard key={f.id} name={f.name} note={f.note} selected={s.trim === f.id} onSelect={() => updateSurfaces(room.id, { trim: f.id })} right={f.cost ? `$${f.cost[0]}–${f.cost[1]}/lf` : undefined} />)}</div>
        <div className="flex flex-wrap gap-2">{PAINTS.filter((x) => ['chalk', 'bone', 'candle', 'linen', 'ink', 'moss', 'forest', 'navy', 'oakshadow', 'putty'].includes(x.id)).map((x) => <Swatch key={x.id} hex={x.hex} name={x.name} selected={s.trimColor === x.id} onSelect={() => updateSurfaces(room.id, { trimColor: x.id })} />)}</div>
      </Section>

      <Section label="Ceiling">
        <div className="flex flex-wrap gap-2">{CEILINGS.map((c) => <Chip key={c.id} on={s.ceiling === c.id} onClick={() => updateSurfaces(room.id, { ceiling: c.id })}>{c.name}</Chip>)}</div>
        {s.ceiling !== 'same-as-wall' && <div className="flex flex-wrap gap-2">{PAINTS.filter((x) => ['chalk', 'candle', 'bone', 'linen', 'brassdust', 'walnut'].includes(x.id)).map((x) => <Swatch key={x.id} hex={x.hex} name={x.name} selected={s.ceilingColor === x.id} onSelect={() => updateSurfaces(room.id, { ceilingColor: x.id })} />)}</div>}
        <p className="text-sm text-muted">{opt(CEILINGS, s.ceiling).note}</p>
      </Section>

      <Section label="Floor">
        <div className="grid gap-2">{FLOORS.map((f) => <OptionCard key={f.id} name={f.name} note={f.note} hex={f.hex} selected={s.floor === f.id} onSelect={() => updateSurfaces(room.id, { floor: f.id })} right={f.cost ? `$${f.cost[0]}–${f.cost[1]}/sf` : undefined} />)}</div>
      </Section>

      {isWet && (<>
        <Section label="Tile" hint="backsplash, shower, wainscot">
          <div className="grid gap-2"><OptionCard name="No tile" selected={!s.tile} onSelect={() => updateSurfaces(room.id, { tile: undefined })} />{TILES.map((x) => <OptionCard key={x.id} name={x.name} note={x.note} hex={x.hex} selected={s.tile === x.id} onSelect={() => updateSurfaces(room.id, { tile: x.id })} right={x.cost ? `$${x.cost[0]}–${x.cost[1]}/sf` : undefined} />)}</div>
          {s.tile && <Field label="Tile area, if not from the wainscot slider" type="number" suffix="sq ft" value={s.tileSqft ?? ''} placeholder="e.g. 30 for a backsplash" onChange={(e) => updateSurfaces(room.id, { tileSqft: e.target.value ? Number(e.target.value) : undefined })} />}
        </Section>
        <Section label="Counters">
          <div className="grid gap-2"><OptionCard name="No counters" selected={!s.counters} onSelect={() => updateSurfaces(room.id, { counters: undefined })} />{COUNTERS.map((x) => <OptionCard key={x.id} name={x.name} note={x.note} hex={x.hex} selected={s.counters === x.id} onSelect={() => updateSurfaces(room.id, { counters: x.id })} right={x.cost ? `$${x.cost[0]}–${x.cost[1]}/sf` : undefined} />)}</div>
          {s.counters && <Field label="Counter area" type="number" suffix="sq ft" value={s.counterSqft ?? ''} placeholder="a 10-ft run × 2 ft is 20" onChange={(e) => updateSurfaces(room.id, { counterSqft: e.target.value ? Number(e.target.value) : undefined })} />}
        </Section>
        {room.type === 'kitchen' && <Section label="Cabinet hardware"><div className="grid gap-2">{HARDWARE.map((x) => <OptionCard key={x.id} name={x.name} note={x.note} selected={s.hardware === x.id} onSelect={() => updateSurfaces(room.id, { hardware: x.id })} right={x.cost ? `$${x.cost[0]}–${x.cost[1]} ea` : undefined} />)}</div></Section>}
      </>)}

      <Section label="Windows" hint={`${t.windowCount} windows · ${t.curtainPanels} panels if curtains`}>
        <div className="grid gap-2">{WINDOW_TREATMENTS.map((x) => <OptionCard key={x.id} name={x.name} note={x.note} selected={s.windows === x.id} onSelect={() => updateSurfaces(room.id, { windows: x.id })} right={x.cost && x.cost[1] ? `$${x.cost[0]}–${x.cost[1]}/${x.unit}` : undefined} />)}</div>
      </Section>

      <Section label="Metal and cloth">
        <div className="flex flex-wrap gap-2">{METALS.map((m) => <Swatch key={m.id} hex={m.hex!} name={m.name} selected={s.metal === m.id} onSelect={() => updateSurfaces(room.id, { metal: m.id })} />)}</div>
        <p className="text-sm text-muted">{opt(METALS, s.metal).note}</p>
        <div className="flex flex-wrap gap-2">{CLOTHS.map((c) => <Swatch key={c.id} hex={c.hex!} name={c.name} selected={s.cloth === c.id} onSelect={() => updateSurfaces(room.id, { cloth: c.id })} />)}</div>
      </Section>

      <Section label="Light in the 3D view">
        <div className="flex flex-wrap gap-2">{HOURS.map(([n, h]) => <Chip key={n} on={room.hour === h} onClick={() => p({ hour: h })}>{n}</Chip>)}</div>
        <input type="range" min={0} max={100} value={room.warmth} aria-label="Lamp warmth" onChange={(e) => p({ warmth: Number(e.target.value) })} className="h-10 w-full" />
      </Section>

      <Section label="Notes">
        <textarea className="field min-h-24" placeholder="The radiator is under the east window. Outlet only on the south wall. Floor creaks by the door." value={room.notes ?? ''} onChange={(e) => p({ notes: e.target.value })} />
      </Section>
    </div>
  );
}

function Cell({ k, v, s }: { k: string; v: React.ReactNode; s?: string }) {
  return <div className="rounded-xl bg-surface px-3 py-2"><p className="text-xs text-muted">{k}</p><p className="mt-0.5 font-medium">{v}</p>{s && <p className="text-xs text-muted">{s}</p>}</div>;
}

// ---------------- LIST ----------------
function ListTab({ room }: { room: R }) {
  const items = useRoomItems(room.id);
  const settings = useStore((s) => s.house.settings);
  const addItem = useStore((s) => s.addItem);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const setItemStatus = useStore((s) => s.setItemStatus);
  const rooms = useStore((s) => s.house.rooms);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [catalogPick, setCatalogPick] = useState(false);
  const [q, setQ] = useState('');
  const roll = roomRollup(room, items, settings);
  const [filter, setFilter] = useState<'all' | ItemStatus>('all');
  const [csv, setCsv] = useState(false);
  const list = items.filter((i) => filter === 'all' || i.status === filter).sort((a, b) => ITEM_CATEGORIES.indexOf(a.category) - ITEM_CATEGORIES.indexOf(b.category) || a.at - b.at);
  const it = open ? items.find((i) => i.id === open) : undefined;
  const sugg = CATALOG.filter((c) => c.rooms.includes(room.type) && !items.some((i) => i.catalogId === c.id) && (!q || `${c.name} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))).slice(0, q ? 12 : 8);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Items" value={fmtMoney(roll.subtotal)} sub={`${roll.count} lines`} />
        <Stat label="+ tax, delivery" value={fmtMoney(roll.tax + roll.shipping)} />
        <Stat label="At the door" value={fmtMoney(roll.total)} sub={`${Math.round(settings.contingency * 100)}% contingency in`} />
      </div>
      {!roll.hasShellLines && <p className="text-xs text-muted">The shell (floor, walls, trim) is not on this list yet; it is estimated at {fmtMoney(roll.shellMid)}. Put it on from the Finishes tab.</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { setAdding(!adding); setCatalogPick(false); }}><Plus className="size-4" />Add a line</Button>
        <Button kind="ghost" onClick={() => { setCatalogPick(!catalogPick); setAdding(false); }}>From the catalog</Button>
        <Button kind="ghost" onClick={() => setCsv(true)}>CSV</Button>
        <ExportSheet open={csv} onClose={() => setCsv(false)} title="Room list, CSV" filename={`${room.name.replace(/\s+/g, '-').toLowerCase()}-list.csv`} content={itemsCsv(items, rooms, settings)} type="text/csv" />
      </div>
      {adding && <NewLine roomId={room.id} onDone={(l) => { addItem(l); setAdding(false); }} />}
      {catalogPick && (
        <div className="card p-3">
          <input className="field" placeholder="Search the catalog" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 grid gap-2">{sugg.map((c) => (
            <button type="button" key={c.id} className="flex items-center gap-3 rounded-xl bg-raised p-2 text-left" onClick={() => { addItem({ roomId: room.id, name: c.name, category: c.budgetCategory, qty: 1, unit: c.unit, price: midPrice(c), estimate: c.price, status: 'shortlist', catalogId: c.id, lead: c.lead, dims: c.dims, notes: c.why }); }}>
              <Img src={c.image} className="size-12 shrink-0 rounded-lg" kind={c.rooms[0]} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.name}</span><span className="text-xs text-muted">{fmtRange(c.price)} / {c.unit}</span></span><Plus className="size-4 text-oak" />
            </button>
          ))}{sugg.length === 0 && <p className="text-sm text-muted">Nothing left to suggest for this room type. Search for something.</p>}</div>
        </div>
      )}
      <div className="scroll-row"><Chip on={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>{ITEM_STATUSES.map((s) => items.some((i) => i.status === s) && <Chip key={s} on={filter === s} onClick={() => setFilter(s)}>{STATUS_LABEL[s]}</Chip>)}</div>
      {list.length === 0 && <p className="text-sm text-muted">Nothing on the list. Put the shell on from the Finishes tab, add pieces from the plan, or pick from the catalog.</p>}
      <div className="flex flex-col gap-2">
        {list.map((i) => (
          <div key={i.id} className={`card p-3 ${i.status === 'returned' ? 'opacity-50' : ''}`}>
            <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === i.id ? null : i.id)}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-tight">{i.name}{i.priority === 'must' && <span className="ml-2 text-xs text-oak">must</span>}</span>
                <span className="block text-xs text-muted">{CATEGORY_LABEL[i.category]} · {i.qty} {i.unit}{i.price ? ` × ${fmtMoney(i.price)}` : i.estimate ? ` × ${fmtRange(i.estimate)} est.` : ''}{i.lead ? ` · ${i.lead} wk` : ''}</span>
              </span>
              <span className="text-right"><span className="block tabular-nums">{fmtMoney(lineBest(i))}</span><span className={`text-xs ${i.status === 'installed' || i.status === 'delivered' ? 'text-good' : i.status === 'ordered' ? 'text-oak' : 'text-muted'}`}>{STATUS_LABEL[i.status]}</span></span>
            </button>
            {open === i.id && it && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 md:grid-cols-3">
                <Field label="Name" value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} className="col-span-2 md:col-span-3" />
                <Field label="Qty" type="number" min={0} step={0.5} value={it.qty} onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) })} />
                <Field label="Unit" value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} />
                <Field label="Unit price (0 = use estimate)" type="number" min={0} value={it.price} onChange={(e) => updateItem(it.id, { price: Number(e.target.value) })} />
                <label className="flex flex-col gap-1 text-xs text-muted">Category<select value={it.category} onChange={(e) => updateItem(it.id, { category: e.target.value as HouseItem['category'] })}>{ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-xs text-muted">Status<select value={it.status} onChange={(e) => setItemStatus(it.id, e.target.value as ItemStatus)}>{ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-xs text-muted">Priority<select value={it.priority ?? ''} onChange={(e) => updateItem(it.id, { priority: (e.target.value || undefined) as HouseItem['priority'] })}><option value="">—</option><option value="must">Must</option><option value="want">Want</option><option value="later">Later</option></select></label>
                <Field label="Retailer" value={it.retailer ?? ''} onChange={(e) => updateItem(it.id, { retailer: e.target.value })} />
                <Field label="SKU / order #" value={it.sku ?? ''} onChange={(e) => updateItem(it.id, { sku: e.target.value })} />
                <Field label="Lead time" type="number" min={0} suffix="wk" value={it.lead ?? ''} onChange={(e) => updateItem(it.id, { lead: e.target.value ? Number(e.target.value) : undefined })} />
                <Field label="Link" value={it.url ?? ''} placeholder="https://" onChange={(e) => updateItem(it.id, { url: e.target.value })} className="col-span-2" />
                <Field label="Delivery, if known" type="number" min={0} value={it.shipping ?? ''} placeholder={`${Math.round(settings.shippingDefault * 100)}% default`} onChange={(e) => updateItem(it.id, { shipping: e.target.value ? Number(e.target.value) : undefined })} />
                <Field label="Installed on" type="date" value={it.installedAt ?? ''} onChange={(e) => updateItem(it.id, { installedAt: e.target.value || undefined })} />
                <Field label="Warranty" type="number" min={0} suffix="months" value={it.warrantyMonths ?? ''} placeholder={`${CARE_PRESETS[it.category]?.warranty ?? ''}`} onChange={(e) => updateItem(it.id, { warrantyMonths: e.target.value ? Number(e.target.value) : undefined })} />
                <Field label="Care every" type="number" min={0} suffix="months" value={it.careEvery ?? ''} placeholder={`${CARE_PRESETS[it.category]?.every ?? ''}`} onChange={(e) => updateItem(it.id, { careEvery: e.target.value ? Number(e.target.value) : undefined })} />
                <Field label="Care note" value={it.careNote ?? ''} placeholder={CARE_PRESETS[it.category]?.note} onChange={(e) => updateItem(it.id, { careNote: e.target.value || undefined })} className="col-span-2 md:col-span-3" />
                <label className="col-span-2 flex flex-col gap-1 text-xs text-muted md:col-span-3">Notes<textarea className="field min-h-16" value={it.notes ?? ''} onChange={(e) => updateItem(it.id, { notes: e.target.value })} /></label>
                <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-3">
                  <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={it.taxable ?? it.category !== 'labor'} onChange={(e) => updateItem(it.id, { taxable: e.target.checked })} />Taxable</label>
                  <label className="flex flex-col gap-1 text-xs text-muted">Move to<select value={it.roomId} onChange={(e) => updateItem(it.id, { roomId: e.target.value, pieceId: undefined })}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                  {it.catalogId && <Link to={`/catalog?piece=${it.catalogId}`} className="text-sm text-oak">Catalog entry</Link>}
                  <button type="button" className="ml-auto inline-flex items-center gap-1 text-sm text-stop" onClick={() => { removeItem(it.id); setOpen(null); }}><Trash2 className="size-4" />Remove</button>
                </div>
                {it.catalogId && catalogItem(it.catalogId) && <div className="col-span-2 md:col-span-3"><ShopLinks compact query={catalogItem(it.catalogId)!.query} markets={catalogItem(it.catalogId)!.markets} /></div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewLine({ roomId, onDone }: { roomId: string; onDone: (l: Omit<HouseItem, 'id' | 'at'>) => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('each');
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState<HouseItem['category']>('furniture');
  return (
    <div className="card grid grid-cols-2 gap-2 p-3 md:grid-cols-5">
      <Field label="What" value={name} placeholder="Electrician, two sconces" onChange={(e) => setName(e.target.value)} className="col-span-2" autoFocus />
      <Field label="Qty" type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      <Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <Field label="Unit price" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      <label className="col-span-2 flex flex-col gap-1 text-xs text-muted md:col-span-3">Category<select value={category} onChange={(e) => setCategory(e.target.value as HouseItem['category'])}>{ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
      <Button className="col-span-2 self-end" disabled={!name.trim()} onClick={() => onDone({ roomId, name: name.trim(), qty, unit, price, category, status: 'idea' })}>Add to list</Button>
    </div>
  );
}

// ---------------- READ ----------------
function ReadTab({ room, setSelected }: { room: R; setSelected: (id: string) => void }) {
  const updateSurfaces = useStore((s) => s.updateSurfaces);
  const updateRoom = useStore((s) => s.updateRoom);
  const plan = critiquePlan(room);
  const s = room.surfaces;
  const studio: StudioState = { room: roomType(room.type).studio, wall: s.wall, floor: s.floor, frame: s.trim, finish: s.finish, metal: s.metal, cloth: s.cloth, ceiling: s.ceiling, trim: s.trimColor, warmth: room.warmth, hour: room.hour, pieces: room.placed.map((p) => p.pieceId) };
  const shell = critique(studio);
  function apply(fix: Partial<StudioState>) {
    const { wall, floor, frame, finish, metal, cloth, ceiling, warmth } = fix;
    updateSurfaces(room.id, { ...(wall ? { wall } : {}), ...(floor ? { floor } : {}), ...(frame ? { trim: frame } : {}), ...(finish ? { finish } : {}), ...(metal ? { metal } : {}), ...(cloth ? { cloth } : {}), ...(ceiling ? { ceiling } : {}) });
    if (warmth != null) updateRoom(room.id, { warmth });
  }
  return (
    <div className="flex flex-col gap-5 pb-10">
      <Section label="The plan" hint="clearances and overlaps">
        <div className="flex flex-col gap-2">{plan.map((n, i) => <Note key={i} level={n.level} title={n.title} body={n.body} action={n.placedId ? <Button kind="quiet" className="px-0" onClick={() => setSelected(n.placedId!)}>Show me</Button> : undefined} />)}</div>
      </Section>
      <Section label="The shell" hint="color, light, metal, texture">
        <div className="flex flex-col gap-2">{shell.map((n, i) => <Note key={i} level={n.level} title={n.title} body={n.body} action={n.fix && !n.fix.pieces ? <Button kind="quiet" className="px-0" onClick={() => apply(n.fix!)}>Try the fix</Button> : undefined} />)}</div>
      </Section>
      <Section label="Before you order">
        <ul className="grid gap-1 text-sm">
          <li className="rounded-xl bg-surface px-3 py-2">Tape every footprint on the real floor and walk it for a day.</li>
          <li className="rounded-xl bg-surface px-3 py-2">Measure the door, the hall and the stair for the biggest piece ({room.placed.map((p) => piece(p.pieceId)).filter(Boolean).sort((a, b) => b!.w * b!.d - a!.w * a!.d)[0]?.name ?? 'the sofa'}).</li>
          <li className="rounded-xl bg-surface px-3 py-2">Paint a board in {paint(s.wall).name} and look at it at 3pm and 9pm in this room.</li>
          <li className="rounded-xl bg-surface px-3 py-2">Order the longest lead items first. <Link to="/orders" className="text-oak">What to order first</Link>.</li>
        </ul>
      </Section>
    </div>
  );
}

