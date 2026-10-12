import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, X, Trash2 } from 'lucide-react';
import { useStore, uid } from '../lib/store';
import { DECISION_STATUSES, DECISION_LABEL, type Decision, type DecisionStatus, type Vote } from '../lib/types';
import { tally, splitOf, mediate, myVote } from '../lib/decide';
import { Button, Chip, Kicker, Field, Stat, Empty, Confirm, Section } from '../components/ui';
import { fmtMoney } from '../lib/takeoff';

const OWNERS = ['Homeowner', 'Architect', 'GC', 'Plumber', 'Electrician', 'Cabinetmaker', 'Tile setter', 'Borough'];
const LEANS = ['aesthetics', 'practicality', 'the budget', 'smart home', 'resale', 'the kids', 'the dog'];

export default function Decisions() {
  const decisions = useStore((s) => s.decisions);
  const seats = useStore((s) => s.seats);
  const rooms = useStore((s) => s.house.rooms);
  const history = useStore((s) => s.history);
  const seatId = useStore((s) => s.seatId);
  const setSeat = useStore((s) => s.setSeat);
  const [params, setParams] = useSearchParams();
  const roomF = params.get('room') ?? 'all';
  const [adding, setAdding] = useState(false);
  const [showSeats, setShowSeats] = useState(false);
  const list = decisions.filter((d) => roomF === 'all' || d.roomId === roomF);
  const open = list.filter((d) => d.status === 'open').sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const holds = list.filter((d) => d.status === 'hold' || d.status === 'watch');
  const done = list.filter((d) => d.status === 'decided');
  const splits = open.filter((d) => splitOf(d, seats) === 'split').length;
  const aligned = open.filter((d) => splitOf(d, seats) === 'aligned').length;
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'House';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Decisions</Kicker>
      <h1 className="mt-2 display text-4xl italic">Everyone in the room</h1>
      <p className="mt-2 max-w-xl text-muted">Every choice that is still open, who owns it, and when it is due. Give each person a seat, vote love, pass, or live with it, and let the mediator name the objection to answer first.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open" value={open.length} sub={open[0]?.due ? `next due ${open[0].due}` : 'nothing dated'} />
        <Stat label="Holds and watches" value={holds.length} sub={`${holds.filter((d) => d.status === 'hold').length} stop work`} />
        <Stat label="Still split" value={splits} sub={`${aligned} aligned`} />
        <Stat label="Decided" value={done.length} sub={`${seats.length} seat${seats.length === 1 ? '' : 's'} voting`} />
      </div>

      <section className="card mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="kicker">Voting as</h2>
          <button type="button" className="text-sm text-oak" onClick={() => setShowSeats(!showSeats)}>{showSeats ? 'Done with seats' : 'Seats'}</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{seats.map((s) => <Chip key={s.id} on={seatId === s.id} onClick={() => setSeat(s.id)}><span className="mr-1 inline-grid size-6 place-items-center rounded-full bg-ink text-xs text-oak">{s.name.slice(0, 1).toUpperCase()}</span>{s.name}<span className="ml-1 text-xs opacity-70">· {s.role}</span></Chip>)}</div>
        {showSeats && <Seats />}
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => setAdding(!adding)}><Plus className="size-4" />New decision</Button>
        <span className="mx-1 text-muted">·</span>
        <Chip on={roomF === 'all'} onClick={() => setParams({})}>All rooms</Chip>
        {rooms.map((r) => <Chip key={r.id} on={roomF === r.id} onClick={() => setParams({ room: r.id })}>{r.name}</Chip>)}
      </div>
      {adding && <NewDecision roomId={roomF !== 'all' ? roomF : rooms[0]?.id} onDone={() => setAdding(false)} />}

      {decisions.length === 0 && !adding && <div className="mt-6"><Empty title="Nothing on the table" body="Open a decision for anything two people might disagree about: the island top, the pendant, which white. Give it options, then vote." action={rooms.length === 0 ? <Link to="/house" className="text-sm text-oak">Add a room first</Link> : undefined} /></div>}

      {open.length > 0 && <><h2 className="mt-8 display text-2xl">Needs a decision</h2><div className="mt-3 grid gap-3 lg:grid-cols-2">{open.map((d) => <DecisionCard key={d.id} d={d} roomName={roomName(d.roomId)} />)}</div></>}
      {holds.length > 0 && <><h2 className="mt-8 display text-2xl">Holds and watches</h2><p className="mt-1 text-sm text-muted">A hold stops work until it clears. A watch is a lead time or a permit you are keeping an eye on.</p><div className="mt-3 grid gap-3 lg:grid-cols-2">{holds.map((d) => <DecisionCard key={d.id} d={d} roomName={roomName(d.roomId)} />)}</div></>}
      {done.length > 0 && <><h2 className="mt-8 display text-2xl">Already called</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{done.map((d) => <div key={d.id} className="card p-3"><div className="flex items-center justify-between gap-2"><span className="display text-lg">{d.title}</span><span className="rounded-full bg-oak px-2 py-0.5 text-xs text-ink">Decided</span></div><p className="mt-1 text-sm text-muted">{d.options.find((o) => o.id === d.chosen)?.label} · {roomName(d.roomId)}</p><button type="button" className="mt-2 text-xs text-oak" onClick={() => useStore.getState().updateDecision(d.id, { status: 'open', chosen: undefined })}>Reopen</button></div>)}</div></>}

      {history.length > 0 && (
        <section className="mt-8"><h2 className="display text-2xl">Recent</h2>
          <ul className="mt-3 flex flex-col gap-2">{history.slice(0, 12).map((h) => { const s = seats.find((x) => x.id === h.seatId); return <li key={h.id} className="flex gap-3 border-t border-line pt-2 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-xs">{s ? s.name.slice(0, 1).toUpperCase() : '·'}</span><span><span className="block">{h.text}</span><span className="text-xs text-muted">{new Date(h.at).toLocaleDateString()}{h.roomId ? ` · ${roomName(h.roomId)}` : ''}</span></span></li>; })}</ul>
        </section>
      )}
    </div>
  );
}

function Seats() {
  const seats = useStore((s) => s.seats);
  const addSeat = useStore((s) => s.addSeat);
  const updateSeat = useStore((s) => s.updateSeat);
  const removeSeat = useStore((s) => s.removeSeat);
  const [name, setName] = useState('');
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm text-muted">One seat per person with a say. Name what they lean toward, so the mediator can read a pass.</p>
      {seats.map((s) => (
        <div key={s.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
          <Field label="Name" value={s.name} onChange={(e) => updateSeat(s.id, { name: e.target.value })} />
          <Field label="Role" value={s.role} placeholder="Host, Partner, Mom" onChange={(e) => updateSeat(s.id, { role: e.target.value })} />
          <label className="flex flex-col gap-1 text-xs text-muted">Leans<select value={LEANS.includes(s.leans) ? s.leans : 'other'} onChange={(e) => updateSeat(s.id, { leans: e.target.value })}>{LEANS.map((l) => <option key={l} value={l}>{l}</option>)}<option value="other">something else</option></select></label>
          <button type="button" aria-label="Remove seat" disabled={seats.length <= 1} className="grid size-11 place-items-center rounded-full text-muted hover:text-stop disabled:opacity-30" onClick={() => removeSeat(s.id)}><Trash2 className="size-4" /></button>
        </div>
      ))}
      <div className="flex gap-2"><input className="field max-w-xs" placeholder="Add a seat: Sam" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { addSeat({ name: name.trim(), role: 'Partner', leans: 'practicality' }); setName(''); } }} /><Button kind="ghost" onClick={() => { if (name.trim()) { addSeat({ name: name.trim(), role: 'Partner', leans: 'practicality' }); setName(''); } }}>Add seat</Button></div>
    </div>
  );
}

function NewDecision({ roomId, onDone }: { roomId?: string; onDone: () => void }) {
  const rooms = useStore((s) => s.house.rooms);
  const addDecision = useStore((s) => s.addDecision);
  const [room, setRoom] = useState(roomId ?? rooms[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('Homeowner');
  const [due, setDue] = useState('');
  const [opts, setOpts] = useState<{ id: string; label: string; note: string }[]>([{ id: uid(), label: '', note: '' }, { id: uid(), label: '', note: '' }]);
  const [blocks, setBlocks] = useState('');
  const ok = title.trim() && room && opts.filter((o) => o.label.trim()).length >= 1;
  return (
    <div className="card mt-3 flex flex-col gap-3 p-4">
      <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <Field label="What has to be decided" value={title} placeholder="Island top" onChange={(e) => setTitle(e.target.value)} autoFocus />
        <label className="flex flex-col gap-1 text-xs text-muted">Room<select value={room} onChange={(e) => setRoom(e.target.value)}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Owner<select value={owner} onChange={(e) => setOwner(e.target.value)}>{OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
        <Field label="Due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <p className="kicker">Options</p>
      {opts.map((o, i) => (
        <div key={o.id} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <input className="field" placeholder={`Option ${i + 1}: Honed marble`} value={o.label} onChange={(e) => setOpts(opts.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} />
          <input className="field" placeholder="A note: etches, that is the charm" value={o.note} onChange={(e) => setOpts(opts.map((x) => (x.id === o.id ? { ...x, note: e.target.value } : x)))} />
          <button type="button" aria-label="Remove option" className="grid size-11 place-items-center text-muted" onClick={() => setOpts(opts.filter((x) => x.id !== o.id))}><X className="size-4" /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button kind="ghost" onClick={() => setOpts([...opts, { id: uid(), label: '', note: '' }])}>+ Option</Button>
      </div>
      <Field label="What it blocks until it closes (optional)" value={blocks} placeholder="The counter template. Nothing gets cut." onChange={(e) => setBlocks(e.target.value)} />
      <div className="flex gap-2"><Button disabled={!ok} onClick={() => { addDecision({ roomId: room, title: title.trim(), owner, due: due || undefined, blocks: blocks || undefined, options: opts.filter((o) => o.label.trim()).map((o) => ({ id: o.id, label: o.label.trim(), note: o.note.trim() || undefined })) }); onDone(); }}>Open it</Button><Button kind="quiet" onClick={onDone}>Cancel</Button></div>
    </div>
  );
}

export function DecisionCard({ d, roomName, compact }: { d: Decision; roomName: string; compact?: boolean }) {
  const seats = useStore((s) => s.seats);
  const seatId = useStore((s) => s.seatId);
  const vote = useStore((s) => s.vote);
  const decide = useStore((s) => s.decide);
  const updateDecision = useStore((s) => s.updateDecision);
  const removeDecision = useStore((s) => s.removeDecision);
  const [openNote, setOpenNote] = useState(false);
  const t = useMemo(() => tally(d, seats), [d, seats]);
  const split = splitOf(d, seats);
  const med = useMemo(() => mediate(d, seats), [d, seats]);
  const overdue = d.due && d.status === 'open' && new Date(d.due) < new Date();
  return (
    <article className={`card p-4 ${d.status === 'hold' ? 'border-l-4 border-stop' : d.status === 'watch' ? 'border-l-4 border-hmm' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display text-xl">{d.title}</h3>
          <p className="text-xs text-muted">{roomName} · {d.owner}{d.due ? ` · due ${d.due}` : ''}{overdue ? ' · overdue' : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${split === 'aligned' ? 'bg-good/20 text-good' : split === 'split' ? 'bg-hmm/20 text-hmm' : 'bg-raised text-muted'}`}>{d.status !== 'open' ? DECISION_LABEL[d.status] : split === 'aligned' ? 'Aligned' : split === 'split' ? 'Split' : 'No votes'}</span>
      </div>
      {d.blocks && <p className="mt-2 text-sm text-stop">Blocks: {d.blocks}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {t.map(({ option: o, loves, oks, passes }) => {
          const mine = myVote(d, seatId, o.id);
          return (
            <li key={o.id} className="rounded-xl bg-raised p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0"><span className="block font-medium">{o.label}{o.cost ? <span className="ml-2 text-xs text-muted">{fmtMoney(o.cost)}</span> : null}</span>{o.note && <span className="block text-xs text-muted">{o.note}</span>}</span>
                <span className="flex gap-1">{(['love', 'ok', 'pass'] as Vote[]).map((v) => <button key={v} type="button" aria-pressed={mine === v} className={`min-h-9 rounded-full px-3 text-xs ${mine === v ? (v === 'love' ? 'bg-good text-ink' : v === 'pass' ? 'bg-stop text-ink' : 'bg-oak text-ink') : 'bg-surface text-fg'}`} onClick={() => vote(d.id, o.id, mine === v ? null : v)}>{v === 'love' ? 'Love' : v === 'ok' ? 'Can live with it' : 'Pass'}</button>)}</span>
              </div>
              {(loves.length + oks.length + passes.length > 0) && <p className="mt-1 text-xs text-muted">{loves.length ? `love: ${loves.map((s) => s.name).join(', ')}` : ''}{oks.length ? `${loves.length ? ' · ' : ''}ok: ${oks.map((s) => s.name).join(', ')}` : ''}{passes.length ? `${loves.length || oks.length ? ' · ' : ''}pass: ${passes.map((s) => s.name).join(', ')}` : ''}</p>}
              {d.status !== 'decided' && <button type="button" className="mt-1 text-xs text-oak" onClick={() => decide(d.id, o.id)}>Call it for {o.label}</button>}
            </li>
          );
        })}
      </ul>
      {!compact && d.status !== 'decided' && (
        <div className="mt-3 rounded-xl border-l-4 border-oak bg-surface p-3 text-sm"><p className="kicker">Mediator</p>{med.map((m, i) => <p key={i} className="mt-1">{m}</p>)}</div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1 text-muted">Status<select value={d.status} onChange={(e) => updateDecision(d.id, { status: e.target.value as DecisionStatus })} className="min-h-9 py-1 text-xs">{DECISION_STATUSES.map((s) => <option key={s} value={s}>{DECISION_LABEL[s]}</option>)}</select></label>
        <button type="button" className="text-oak" onClick={() => setOpenNote(!openNote)}>{openNote ? 'Hide note' : 'Note'}</button>
        <Confirm label="Remove" confirmLabel="Remove decision" className="ml-auto min-h-9 px-3 text-xs" onConfirm={() => removeDecision(d.id)} />
      </div>
      {openNote && <textarea className="field mt-2 min-h-16 text-sm" placeholder="Why it is held, what the GC said, the quote number." value={d.note ?? ''} onChange={(e) => updateDecision(d.id, { note: e.target.value })} />}
    </article>
  );
}

export { Section };
