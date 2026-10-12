import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Download, Upload } from 'lucide-react';
import { useStore } from '../lib/store';
import { ROOM_TYPES } from '../data/rooms';
import { paint } from '../data/palette';
import { FLOORS, opt } from '../data/materials';
import { rollup, roomRollup } from '../lib/budget';
import { houseJson } from '../lib/export';
import { ftIn, fmtMoney } from '../lib/takeoff';
import { Button, Chip, Kicker, Empty, Stat, Confirm, ExportSheet } from '../components/ui';
import { STATUS_LABEL, PHASE_LABEL } from '../lib/types';
import { careSchedule } from '../lib/decide';
import { splitOf } from '../lib/decide';

export default function House() {
  const house = useStore((s) => s.house);
  const addRoom = useStore((s) => s.addRoom);
  const updateSettings = useStore((s) => s.updateSettings);
  const importHouse = useStore((s) => s.importHouse);
  const nav = useNavigate();
  const [type, setType] = useState('living');
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState(false);
  const [restore, setRestore] = useState(false);
  const [pasted, setPasted] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const total = rollup(house.items, house.settings);
  const decisions = useStore((s) => s.decisions);
  const seats = useStore((s) => s.seats);
  const lot = useStore((s) => s.lot);
  const history = useStore((s) => s.history);
  const care = careSchedule(house.items).filter((c) => c.days > -30).slice(0, 6);
  const openDec = decisions.filter((d) => d.status === 'open');
  const holds = decisions.filter((d) => d.status === 'hold');
  const budget = house.settings.totalBudget;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>My House</Kicker>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <input className="bg-transparent display text-4xl italic outline-none" value={house.settings.name} onChange={(e) => updateSettings({ name: e.target.value })} aria-label="House name" />
      </div>
      <p className="mt-2 max-w-xl text-muted">Your real rooms, with real measurements. Each one gets a plan, a shell, a list of everything it needs, and a budget that adds up.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rooms" value={house.rooms.length} />
        <Stat label="Items on lists" value={total.count} sub={`${house.items.filter((i) => i.status === 'ordered' || i.status === 'delivered' || i.status === 'installed').length} ordered or in`} />
        <Stat label="Everything, at the door" value={fmtMoney(total.total)} sub={`incl. tax, delivery, ${Math.round(house.settings.contingency * 100)}% contingency`} />
        <Stat label="Committed" value={fmtMoney(total.committed)} sub={budget ? `of ${fmtMoney(budget)} budget` : <button type="button" className="text-oak" onClick={() => nav('/budget')}>Set a budget</button>} />
      </div>
      {(openDec.length > 0 || holds.length > 0) && (
        <section className="card mt-4 p-4">
          <div className="flex items-baseline justify-between"><h2 className="kicker">Needs a decision</h2><Link to="/decisions" className="text-sm text-oak">All decisions</Link></div>
          <ul className="mt-2 divide-y divide-line">{[...holds, ...openDec].slice(0, 6).map((d) => <li key={d.id}><Link to={`/decisions?room=${d.roomId}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"><span><span className="block font-medium">{d.title}</span><span className="text-xs text-muted">{house.rooms.find((r) => r.id === d.roomId)?.name} · {d.owner}{d.due ? ` · due ${d.due}` : ''}</span></span><span className={`rounded-full px-2 py-0.5 text-xs ${d.status === 'hold' ? 'bg-stop/20 text-stop' : splitOf(d, seats) === 'split' ? 'bg-hmm/20 text-hmm' : 'bg-raised text-muted'}`}>{d.status === 'hold' ? 'Hold' : splitOf(d, seats) === 'split' ? 'Split' : 'Open'}</span></Link></li>)}</ul>
        </section>
      )}

      <section className="card mt-6 p-4">
        <h2 className="kicker">Add a room</h2>
        <div className="scroll-row mt-3">{ROOM_TYPES.map((r) => <Chip key={r.id} on={type === r.id} onClick={() => setType(r.id)}>{r.name}</Chip>)}</div>
        <div className="mt-3 flex max-w-lg gap-2">
          <input className="field" placeholder={`Name it: ${ROOM_TYPES.find((r) => r.id === type)?.name ?? 'Room'}, Upstairs bath, Nora's room…`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { nav(`/house/${addRoom(type, name.trim() || undefined)}`); } }} />
          <Button onClick={() => nav(`/house/${addRoom(type, name.trim() || undefined)}`)}><Plus className="size-4" />Add</Button>
        </div>
        <p className="mt-2 text-xs text-muted">It starts with typical dimensions and a sensible set of pieces. Change everything.</p>
      </section>

      {house.rooms.length === 0 ? (
        <div className="mt-6"><Empty title="No rooms yet" body="Add the one you are arguing about first. Measure it tonight; the lesson on measuring takes four minutes." action={<Link to="/learn/measure" className="text-sm text-oak">How to measure a room</Link>} /></div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {house.rooms.map((r) => {
            const rr = roomRollup(r, house.items, house.settings);
            const items = house.items.filter((i) => i.roomId === r.id);
            const inHouse = items.filter((i) => i.status === 'delivered' || i.status === 'installed').length;
            return (
              <Link key={r.id} to={`/house/${r.id}`} className="card overflow-hidden">
                <div className="flex h-28">
                  <div className="flex-1" style={{ background: paint(r.surfaces.wall).hex }} />
                  <div className="w-1/3" style={{ background: opt(FLOORS, r.surfaces.floor).hex }} />
                  <div className="w-3" style={{ background: paint(r.surfaces.trimColor || 'chalk').hex }} />
                </div>
                <div className="p-4">
                  <p className="kicker">{ROOM_TYPES.find((t) => t.id === r.type)?.name} · {ftIn(r.length)} × {ftIn(r.width)} · {ftIn(r.height)} ceiling · {PHASE_LABEL[r.phase ?? 'concept']}</p>
                  <h2 className="mt-1 display text-2xl">{r.name}</h2>
                  <p className="mt-1 text-sm text-muted">{paint(r.surfaces.wall).name}, {opt(FLOORS, r.surfaces.floor).name.toLowerCase()}. {r.placed.length} pieces on the plan.</p>
                  <div className="mt-3 flex items-baseline justify-between text-sm">
                    <span className="text-muted">{items.length} items · {inHouse} in the house</span>
                    <span className="text-oak">{fmtMoney(rr.total + (rr.hasShellLines ? 0 : rr.shellMid))}</span>
                  </div>
                  {r.budget ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised"><div className={`h-full ${rr.total > r.budget ? 'bg-stop' : 'bg-oak'}`} style={{ width: `${Math.min(100, (rr.total / r.budget) * 100)}%` }} /></div> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {care.length > 0 && (
        <section className="card mt-6 p-4">
          <h2 className="kicker">Care and warranties coming up</h2>
          <ul className="mt-2 divide-y divide-line text-sm">{care.map((c, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span><span className="block font-medium">{c.text}</span><span className="text-xs text-muted">{c.item.name} · {house.rooms.find((r) => r.id === c.item.roomId)?.name} · {c.when.toLocaleDateString()}</span></span><span className={`text-xs ${c.days < 0 ? 'text-stop' : c.days < 30 ? 'text-hmm' : 'text-muted'}`}>{c.days < 0 ? 'Overdue' : c.days < 30 ? 'Soon' : `${Math.round(c.days / 30)} mo`}</span></li>)}</ul>
          <p className="mt-2 text-xs text-muted">Set an install date, a warranty, and a care interval on any item in a room's list.</p>
        </section>
      )}
      <section className="mt-8 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button kind="ghost" onClick={() => setBackup(true)}><Download className="size-4" />Back up the house</Button>
          <Button kind="ghost" onClick={() => setRestore(!restore)}><Upload className="size-4" />Restore a backup</Button>
        </div>
        <p className="text-xs text-muted">Everything lives in this browser. Back it up before you switch phones, and share the file with whoever is paying.</p>
        <ExportSheet open={backup} onClose={() => setBackup(false)} title="House backup, JSON" filename={`${house.settings.name.replace(/\s+/g, '-').toLowerCase()}-alder.json`} content={houseJson(house, { decisions, seats, history, lot })} type="application/json" />
        {restore && (
          <div className="card flex flex-col gap-2 p-3">
            <p className="text-sm text-muted">Paste a backup here, or choose the file. Restoring replaces every room and list.</p>
            <textarea className="field min-h-24 font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"version":2, ...}' />
            <div className="flex flex-wrap gap-2">
              <Button kind="ghost" onClick={() => file.current?.click()}>Choose a file</Button>
              <Confirm label="Restore and replace" confirmLabel="Yes, replace everything" onConfirm={() => { try { importHouse(JSON.parse(pasted)); setRestore(false); setPasted(''); setErr(null); } catch { setErr('That did not read as an Alder backup.'); } }} />
            </div>
            {err && <p className="text-sm text-stop">{err}</p>}
            <input ref={file} type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setPasted(await f.text()); e.target.value = ''; }} />
          </div>
        )}
      </section>
      {house.items.length > 0 && (
        <p className="mt-4 text-xs text-muted">Pipeline: {Object.entries(total.byStatus).filter(([, v]) => v > 0).map(([k, v]) => `${STATUS_LABEL[k as keyof typeof STATUS_LABEL]} ${fmtMoney(v)}`).join(' · ')}</p>
      )}
    </div>
  );
}
