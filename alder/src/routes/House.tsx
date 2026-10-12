import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Download, Upload, ArrowRight, Sparkles, Compass, LayoutGrid, Lightbulb, BookOpen, TreePine } from 'lucide-react';
import { useStore } from '../lib/store';
import { ROOM_TYPES } from '../data/rooms';
import { paint } from '../data/palette';
import { FLOORS, opt } from '../data/materials';
import { rollup, roomRollup } from '../lib/budget';
import { houseJson } from '../lib/export';
import { ftIn, fmtMoney } from '../lib/takeoff';
import { Button, Chip, Stat, Confirm, ExportSheet, PageHeader, Section } from '../components/ui';
import { PHASE_LABEL } from '../lib/types';
import { careSchedule, splitOf } from '../lib/decide';
import { checkLot } from '../lib/lot';

const EXPLORE = [
  { to: '/studio', icon: Sparkles, label: 'Studio', hint: 'Try a wall color under evening light before you buy a gallon.' },
  { to: '/studies', icon: Compass, label: 'Studies', hint: 'Ten finished rooms, taken apart so you can see why they work.' },
  { to: '/catalog', icon: LayoutGrid, label: 'Catalog', hint: 'Pieces with honest price ranges and lead times.' },
  { to: '/ideas', icon: Lightbulb, label: 'Ideas', hint: 'Compose a room from a mood and your own notes.' },
  { to: '/learn', icon: BookOpen, label: 'Lessons', hint: 'Four-minute lessons on color, light, scale and measuring.' },
];

export default function House() {
  const house = useStore((s) => s.house);
  const addRoom = useStore((s) => s.addRoom);
  const updateSettings = useStore((s) => s.updateSettings);
  const importHouse = useStore((s) => s.importHouse);
  const decisions = useStore((s) => s.decisions);
  const seats = useStore((s) => s.seats);
  const lot = useStore((s) => s.lot);
  const history = useStore((s) => s.history);
  const nav = useNavigate();
  const [type, setType] = useState('living');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const panel = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState(false);
  const [restore, setRestore] = useState(false);
  const [pasted, setPasted] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const total = rollup(house.items, house.settings);
  const care = careSchedule(house.items).filter((c) => c.days > -30).slice(0, 5);
  const attention = decisions.filter((d) => d.status === 'hold' || d.status === 'open').slice(0, 5);
  const toOrder = house.items.filter((i) => i.status === 'approved');
  const lotCheck = checkLot(lot);
  const lotStops = lotCheck.issues.filter((i) => i.level === 'stop').length;
  const budget = house.settings.totalBudget;
  const empty = house.rooms.length === 0;

  function add() { const id = addRoom(type, name.trim() || undefined); setName(''); setAdding(false); nav(`/house/${id}`); }
  function openAdd() { setAdding(true); setTimeout(() => { panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); nameInput.current?.focus({ preventScroll: true }); }, 50); }
  useEffect(() => { if (adding) nameInput.current?.focus({ preventScroll: true }); }, [adding]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <PageHeader
        eyebrow="Overview"
        title={<input className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted/60" value={house.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} aria-label="House name" placeholder="Name the house" />}
        lede="Every room with real measurements, what it costs, and what needs you next. Open a room to plan it, pick finishes, light it, and build its list."
        actions={<><Button kind="ghost" onClick={() => setBackup(true)}><Download className="size-4" />Back up</Button><Button onClick={openAdd}><Plus className="size-4" />Add a room</Button></>}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Rooms" value={house.rooms.length} sub={house.rooms.length ? `${house.rooms.filter((r) => (r.phase ?? 'concept') === 'done').length} done` : 'none yet'} />
        <Stat label="On the lists" value={total.count} sub={`${house.items.filter((i) => i.status === 'ordered' || i.status === 'delivered' || i.status === 'installed').length} ordered or in`} />
        <Stat label="Everything, at the door" value={fmtMoney(total.total)} sub={`tax, delivery, ${Math.round(house.settings.contingency * 100)}% contingency in`} />
        <Stat label="Committed" value={fmtMoney(total.committed)} sub={budget ? `of ${fmtMoney(budget)} budget` : <Link to="/budget" className="text-oak">Set a budget</Link>} />
      </div>


      {empty && <div className="mt-6">        <form ref={panel} className="card p-4 md:p-5" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{empty ? 'Start with one room' : 'Add a room'}</h2>
            {!empty && <Button kind="quiet" size="sm" onClick={() => setAdding(false)}>Close</Button>}
          </div>
          <p className="mt-1 text-sm text-muted">{empty ? 'Add the one you are arguing about first. It starts with typical dimensions and a sensible set of pieces; change everything once you have measured.' : 'Pick the kind, name it, and it opens ready to measure.'}</p>
          <div className="scroll-row mt-4">{ROOM_TYPES.map((r) => <Chip key={r.id} on={type === r.id} onClick={() => setType(r.id)}>{r.name}</Chip>)}</div>
          <div className="mt-3 flex max-w-xl gap-2">
            <input ref={nameInput} className="field" placeholder={`Name it: ${ROOM_TYPES.find((r) => r.id === type)?.name ?? 'Room'}, Upstairs bath, Nora's room…`} value={name} onChange={(e) => setName(e.target.value)} enterKeyHint="go" />
            <Button type="submit"><Plus className="size-4" />Add</Button>
          </div>
          {empty && <p className="mt-3 text-xs text-muted">Not sure how to measure? <Link to="/learn/measure" className="text-oak">The lesson takes four minutes.</Link></p>}
        </form>
</div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {!empty && (
            <Section label="Rooms" hint={`${house.rooms.length} ${house.rooms.length === 1 ? 'room' : 'rooms'}`}>
              {adding && <form ref={panel} className="card p-4 md:p-5" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{empty ? 'Start with one room' : 'Add a room'}</h2>
            {!empty && <Button kind="quiet" size="sm" onClick={() => setAdding(false)}>Close</Button>}
          </div>
          <p className="mt-1 text-sm text-muted">{empty ? 'Add the one you are arguing about first. It starts with typical dimensions and a sensible set of pieces; change everything once you have measured.' : 'Pick the kind, name it, and it opens ready to measure.'}</p>
          <div className="scroll-row mt-4">{ROOM_TYPES.map((r) => <Chip key={r.id} on={type === r.id} onClick={() => setType(r.id)}>{r.name}</Chip>)}</div>
          <div className="mt-3 flex max-w-xl gap-2">
            <input ref={nameInput} className="field" placeholder={`Name it: ${ROOM_TYPES.find((r) => r.id === type)?.name ?? 'Room'}, Upstairs bath, Nora's room…`} value={name} onChange={(e) => setName(e.target.value)} enterKeyHint="go" />
            <Button type="submit"><Plus className="size-4" />Add</Button>
          </div>
          {empty && <p className="mt-3 text-xs text-muted">Not sure how to measure? <Link to="/learn/measure" className="text-oak">The lesson takes four minutes.</Link></p>}
        </form>}
              <div className="grid gap-4 sm:grid-cols-2">
                {house.rooms.map((r) => {
                  const rr = roomRollup(r, house.items, house.settings);
                  const items = house.items.filter((i) => i.roomId === r.id);
                  const inHouse = items.filter((i) => i.status === 'delivered' || i.status === 'installed').length;
                  const open = decisions.filter((d) => d.roomId === r.id && d.status !== 'decided').length;
                  const cost = rr.total + (rr.hasShellLines ? 0 : rr.shellMid);
                  return (
                    <Link key={r.id} to={`/house/${r.id}`} className="card group overflow-hidden transition-shadow hover:shadow-md">
                      <div className="flex h-24">
                        <div className="flex-1" style={{ background: paint(r.surfaces.wall).hex }} />
                        <div className="w-1/3" style={{ background: opt(FLOORS, r.surfaces.floor).hex }} />
                        <div className="w-2.5" style={{ background: paint(r.surfaces.trimColor || 'chalk').hex }} />
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="display text-xl">{r.name}</h3>
                          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">{PHASE_LABEL[r.phase ?? 'concept']}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{ROOM_TYPES.find((t) => t.id === r.type)?.name} · {ftIn(r.length)} × {ftIn(r.width)} · {ftIn(r.height)} ceiling</p>
                        <p className="mt-2 text-sm text-muted">{paint(r.surfaces.wall).name}, {opt(FLOORS, r.surfaces.floor).name.toLowerCase()}. {r.placed.length} pieces on the plan.</p>
                        <div className="mt-3 flex items-baseline justify-between text-sm">
                          <span className="text-muted">{items.length} items · {inHouse} in{open ? ` · ${open} to decide` : ''}</span>
                          <span className="font-medium tabular-nums">{fmtMoney(cost)}</span>
                        </div>
                        {r.budget ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised"><div className={`h-full ${rr.total > r.budget ? 'bg-stop' : 'bg-fg'}`} style={{ width: `${Math.min(100, (rr.total / r.budget) * 100)}%` }} /></div> : null}
                      </div>
                    </Link>
                  );
                })}
                {!adding && (
                  <button type="button" onClick={openAdd} className="card flex min-h-40 flex-col items-center justify-center gap-2 border-dashed text-muted hover:bg-raised hover:text-fg">
                    <Plus className="size-5" /><span className="text-sm">Add a room</span>
                  </button>
                )}
              </div>
            </Section>
          )}

          <Section label="Explore" hint="when you want ideas, not lists" className="mt-8">
            <div className="grid gap-3 sm:grid-cols-2">
              {EXPLORE.map((e) => (
                <Link key={e.to} to={e.to} className="card flex items-start gap-3 p-4 transition-shadow hover:shadow-md">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised"><e.icon className="size-4" /></span>
                  <span className="min-w-0"><span className="block text-sm font-medium">{e.label}</span><span className="block text-xs text-muted">{e.hint}</span></span>
                </Link>
              ))}
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-5">
          <Section label="Needs you" hint={attention.length + toOrder.length + lotStops === 0 ? 'nothing right now' : undefined}>
            <div className="card divide-y divide-line">
              {attention.map((d) => {
                const split = splitOf(d, seats) === 'split';
                return (
                  <Link key={d.id} to="/decisions" className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-raised">
                    <span className="min-w-0"><span className="block truncate font-medium">{d.title}</span><span className="block text-xs text-muted">{house.rooms.find((r) => r.id === d.roomId)?.name} · {d.owner}{d.due ? ` · due ${d.due}` : ''}</span></span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${d.status === 'hold' ? 'bg-stop/10 text-stop' : split ? 'bg-hmm/10 text-hmm' : 'bg-raised text-muted'}`}>{d.status === 'hold' ? 'On hold' : split ? 'Split' : 'Open'}</span>
                  </Link>
                );
              })}
              {toOrder.length > 0 && (
                <Link to="/orders" className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-raised">
                  <span><span className="block font-medium">{toOrder.length} approved, not yet ordered</span><span className="block text-xs text-muted">Orders shows which to place first.</span></span>
                  <ArrowRight className="size-4 shrink-0 text-muted" />
                </Link>
              )}
              {lotStops > 0 && (
                <Link to="/lot" className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-raised">
                  <span><span className="block font-medium">{lotStops} on the lot to fix</span><span className="block text-xs text-muted">Something sits in a setback or over the line.</span></span>
                  <TreePine className="size-4 shrink-0 text-muted" />
                </Link>
              )}
              {care.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{c.text}</span><span className="block text-xs text-muted">{c.item.name} · {c.when.toLocaleDateString()}</span></span>
                  <span className={`shrink-0 text-xs ${c.days < 0 ? 'text-stop' : c.days < 30 ? 'text-hmm' : 'text-muted'}`}>{c.days < 0 ? 'Overdue' : c.days < 30 ? 'Soon' : `${Math.round(c.days / 30)} mo`}</span>
                </div>
              ))}
              {attention.length + toOrder.length + lotStops + care.length === 0 && <p className="px-4 py-4 text-sm text-muted">Open decisions, approved items waiting to be ordered, lot warnings and care dates show up here.</p>}
            </div>
          </Section>

          <Section label="Your data">
            <div className="card p-4 text-sm">
              <p className="text-muted">Everything lives in this browser. Back it up before you switch phones, and share the file with whoever is paying.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button kind="ghost" size="sm" onClick={() => setBackup(true)}><Download className="size-3.5" />Back up</Button>
                <Button kind="ghost" size="sm" onClick={() => setRestore(!restore)}><Upload className="size-3.5" />Restore</Button>
              </div>
              {restore && (
                <div className="mt-3 flex flex-col gap-2">
                  <textarea className="field min-h-24 font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='Paste a backup, or choose the file.' />
                  <div className="flex flex-wrap gap-2">
                    <Button kind="ghost" size="sm" onClick={() => file.current?.click()}>Choose a file</Button>
                    <Confirm label="Restore and replace" confirmLabel="Yes, replace everything" onConfirm={() => { try { importHouse(JSON.parse(pasted)); setRestore(false); setPasted(''); setErr(null); } catch { setErr('That did not read as an Alder backup.'); } }} />
                  </div>
                  {err && <p className="text-sm text-stop">{err}</p>}
                  <input ref={file} type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setPasted(await f.text()); e.target.value = ''; }} />
                </div>
              )}
            </div>
          </Section>
        </aside>
      </div>

      <ExportSheet open={backup} onClose={() => setBackup(false)} title="House backup, JSON" filename={`${house.settings.name.replace(/\s+/g, '-').toLowerCase()}-alder.json`} content={houseJson(house, { decisions, seats, history, lot })} type="application/json" />
    </div>
  );
}
