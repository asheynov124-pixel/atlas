import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATALOG, CATEGORIES, catalogItem, midPrice, type CatalogItem } from '../data/catalog';
import { ROOM_TYPES, roomName } from '../data/rooms';
import { useStore } from '../lib/store';
import { Button, Chip, Kicker, Sheet, Img, Money } from '../components/ui';
import { ShopLinks } from '../components/ShopLinks';
import { fmtRange } from '../lib/takeoff';
import { CATEGORY_LABEL } from '../lib/budget';

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState<string>('All');
  const [room, setRoom] = useState<string>('all');
  const [hunt, setHunt] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'name' | 'low' | 'high'>('name');
  const openId = params.get('piece');
  const open = openId ? catalogItem(openId) : undefined;

  const list = useMemo(() => {
    let l = CATALOG.filter((c) => (cat === 'All' || c.category === cat) && (room === 'all' || c.rooms.includes(room)) && (hunt === 'all' || c.hunt === hunt || c.hunt === 'either'));
    if (q.trim()) { const t = q.toLowerCase(); l = l.filter((c) => `${c.name} ${c.blurb} ${c.tags.join(' ')} ${c.materials.join(' ')}`.toLowerCase().includes(t)); }
    if (sort === 'low') l = [...l].sort((a, b) => a.price[0] - b.price[0]);
    if (sort === 'high') l = [...l].sort((a, b) => b.price[1] - a.price[1]);
    return l;
  }, [cat, room, hunt, q, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Catalog</Kicker>
      <h1 className="mt-2 display text-4xl italic">The pieces</h1>
      <p className="mt-2 max-w-xl text-muted">{CATALOG.length} things worth knowing about, with what they cost, why they work, and where to hunt. Add any of them to a real room.</p>
      <div className="mt-5 flex flex-col gap-3">
        <input className="field max-w-md" placeholder="Search: brass, rug, limestone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll-row">{CATEGORIES.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
        <div className="scroll-row">
          <Chip on={room === 'all'} onClick={() => setRoom('all')}>Any room</Chip>
          {ROOM_TYPES.map((r) => <Chip key={r.id} on={room === r.id} onClick={() => setRoom(r.id)}>{r.name}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Hunt</span>
          {[['all', 'Either'], ['used', 'Used is fine'], ['new', 'Buy new']].map(([k, v]) => <Chip key={k} on={hunt === k} onClick={() => setHunt(k)}>{v}</Chip>)}
          <span className="ml-3 text-muted">Sort</span>
          {[['name', 'A–Z'], ['low', 'Price ↑'], ['high', 'Price ↓']].map(([k, v]) => <Chip key={k} on={sort === k} onClick={() => setSort(k as typeof sort)}>{v}</Chip>)}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {list.map((c) => (
          <button type="button" key={c.id} onClick={() => setParams({ piece: c.id })} className="text-left">
            <Img src={c.image} className="aspect-square rounded-[1.25rem]" kind={c.rooms[0]} />
            <p className="mt-2 text-xs text-muted">{c.category}{c.hunt === 'used' && ' · hunt used'}</p>
            <p className="font-medium leading-tight">{c.name}</p>
            <p className="mt-1 text-sm text-oak">{fmtRange(c.price)} <span className="text-muted">/ {c.unit}</span></p>
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="mt-8 text-sm text-muted">Nothing matches. Loosen a filter.</p>}
      {open && <PieceSheet item={open} onClose={() => setParams({})} />}
    </div>
  );
}

export function PieceSheet({ item: c, onClose }: { item: CatalogItem; onClose: () => void }) {
  const nav = useNavigate();
  const rooms = useStore((s) => s.house.rooms);
  const addItem = useStore((s) => s.addItem);
  const saveItem = useStore((s) => s.saveItem);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(midPrice(c));
  const [done, setDone] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function add() {
    if (!roomId) return;
    addItem({ roomId, name: c.name, category: c.budgetCategory, qty, unit: c.unit, price, estimate: c.price, status: 'shortlist', catalogId: c.id, lead: c.lead, dims: c.dims, notes: c.why });
    setDone(roomId);
  }

  return (
    <Sheet open onClose={onClose} title={c.category}>
      <div className="md:mx-4"><Img src={c.image} className="aspect-[4/3] md:rounded-[1.25rem]" kind={c.rooms[0]} /></div>
      <div className="px-4 pt-5">
        <h2 className="display text-4xl italic">{c.name}</h2>
        <p className="mt-2 text-muted">{c.blurb}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <Cell k="Typical price" v={`${fmtRange(c.price)} / ${c.unit}`} />
          <Cell k="Materials" v={c.materials.join(', ')} />
          <Cell k="Lead time" v={c.lead ? `${c.lead} weeks` : 'In stock, usually'} />
          <Cell k="Buy" v={c.hunt === 'used' ? 'Worth hunting used' : c.hunt === 'new' ? 'New, with a return path' : 'New or used'} />
          {c.dims && <Cell k="Typical size" v={`${c.dims[0]}″ W × ${c.dims[1]}″ D × ${c.dims[2]}″ H`} />}
          <Cell k="Rooms" v={c.rooms.map(roomName).join(', ')} />
          <Cell k="Budget line" v={CATEGORY_LABEL[c.budgetCategory]} />
        </div>
        <section className="mt-5"><h3 className="kicker">Why it works</h3><p className="mt-1">{c.why}</p></section>

        <section className="card mt-6 p-4">
          <h3 className="kicker">Add to a real room</h3>
          {rooms.length === 0 ? (
            <p className="mt-2 text-sm text-muted">You have no rooms yet. <Link to="/house" className="text-oak">Add one in My House</Link> and this piece can go on its list and its budget.</p>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_6rem_8rem_auto]">
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <input type="number" className="field" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} aria-label="Quantity" />
              <input type="number" className="field" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} aria-label="Unit price" />
              <Button onClick={add}>{done === roomId ? 'Added' : 'Add to list'}</Button>
            </div>
          )}
          {done && <p className="mt-2 text-sm text-muted">On the shortlist for {rooms.find((r) => r.id === done)?.name}. <button type="button" className="text-oak" onClick={() => nav(`/house/${done}`)}>Open the room</button>.</p>}
        </section>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button kind="ghost" onClick={() => { saveItem({ kind: 'piece', title: c.name, subtitle: c.category, body: c.why, image: c.image, catalogId: c.id }); setSaved(true); }}>{saved ? 'Saved' : 'Save to a board'}</Button>
        </div>
        <h3 className="mt-8 display text-2xl">Hunt it</h3>
        <p className="mt-1 text-sm text-muted">Search: <em>{c.query}</em></p>
        <div className="mt-3"><ShopLinks query={c.query} markets={c.markets} /></div>
      </div>
    </Sheet>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-surface px-3 py-2"><p className="text-xs text-muted">{k}</p><p className="mt-0.5">{v}</p></div>;
}
