import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ROOM_TYPES, roomName } from '../data/rooms';
import { look, STUDIES, type Look } from '../data/studies';
import { paint } from '../data/palette';
import { catalogItem, midPrice } from '../data/catalog';
import { lesson } from '../data/lessons';
import { useStore } from '../lib/store';
import { Button, Chip, Kicker, Pill, Sheet, Img, Money } from '../components/ui';
import { ShopLinks } from '../components/ShopLinks';
import { fmtRange } from '../lib/takeoff';

const ROOMS = ['all', ...STUDIES.map((s) => s.room)];

export default function Studies() {
  const [params, setParams] = useSearchParams();
  const roomParam = params.get('room') ?? 'all';
  const room = ROOMS.includes(roomParam) ? roomParam : 'all';
  const [count, setCount] = useState(8);
  const [open, setOpen] = useState<Look | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const looks = useMemo(() => {
    const out: Look[] = [];
    for (let i = 0; out.length < count && i < 4000; i++) { const l = look(i); if (room === 'all' || l.room === room) out.push(l); }
    return out;
  }, [count, room]);

  useEffect(() => { setCount(8); }, [room]);
  useEffect(() => {
    const el = sentinel.current; if (!el || count >= 72) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setCount((c) => Math.min(c + 6, 72)); }, { rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  }, [count, room]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Discover</Kicker>
      <h1 className="mt-2 display text-4xl italic">Studies</h1>
      <p className="mt-2 max-w-xl text-muted">Rooms to read slowly. Color, frame, texture, the hard numbers, and the thing you add last. The ones marked Live move.</p>
      <div className="scroll-row mt-5">
        {ROOMS.map((r) => <Chip key={r} on={room === r} onClick={() => setParams(r === 'all' ? {} : { room: r })}>{r === 'all' ? 'All rooms' : roomName(r)}</Chip>)}
      </div>
      <div className="mt-6 columns-1 gap-x-8 md:columns-2 xl:columns-3">
        {looks.map((l) => (
          <article key={l.id} className="mb-8 break-inside-avoid">
            <button type="button" onClick={() => setOpen(l)} className="block w-full text-left">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-raised">
                <Img src={l.image} className="h-full w-full" palette={l.palette.map((x) => paint(x).hex)} kind={l.room} />
                {l.live && <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1 text-xs text-oak">Live</span>}
              </div>
              <p className="mt-3 kicker">{l.kicker}</p>
              <h2 className="mt-1 display text-2xl">{l.title}</h2>
              <p className="mt-1 text-sm text-muted">{l.dek}</p>
              <div className="mt-3 flex gap-2">{l.palette.map((p) => <span key={p} className="size-6 rounded-full border border-line" style={{ backgroundColor: paint(p).hex }} title={paint(p).name} />)}</div>
            </button>
          </article>
        ))}
      </div>
      <div ref={sentinel} className="py-6 text-center">
        {count >= 72 ? <div className="flex flex-col items-center gap-3"><p className="text-sm text-muted">You can keep wandering. The notes change even when the room repeats.</p><Button kind="ghost" onClick={() => setCount((c) => c + 12)}>Keep wandering</Button></div> : <p className="text-sm text-muted">More studies</p>}
      </div>
      {open && <StudySheet look={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function StudySheet({ look: l, onClose }: { look: Look; onClose: () => void }) {
  const nav = useNavigate();
  const patchStudio = useStore((s) => s.patchStudio);
  const saveItem = useStore((s) => s.saveItem);
  const addRoom = useStore((s) => s.addRoom);
  const updateSurfaces = useStore((s) => s.updateSurfaces);
  const [saved, setSaved] = useState(false);
  const les = lesson(l.lessonId);
  const items = l.catalogIds.map((id) => catalogItem(id)).filter((x) => x != null);
  const shop = items.reduce((a, c) => [a[0] + c.price[0], a[1] + c.price[1]] as [number, number], [0, 0] as [number, number]);
  const type = ROOM_TYPES.find((r) => r.id === l.room)?.id ?? 'living';

  function makeReal() {
    const id = addRoom(type, l.title);
    updateSurfaces(id, { wall: l.studio.wall, finish: l.studio.finish, floor: l.studio.floor, trim: l.studio.frame, metal: l.studio.metal, cloth: l.studio.cloth, ceiling: l.studio.ceiling });
    nav(`/house/${id}`);
  }

  return (
    <Sheet open onClose={onClose} title={roomName(l.room)}>
      <div className="relative aspect-[3/4] bg-raised md:mx-4 md:aspect-[16/10] md:overflow-hidden md:rounded-[1.25rem]">
        <Img src={l.live ? undefined : l.image} className="absolute inset-0" palette={l.palette.map((x) => paint(x).hex)} kind={l.room} />
        {l.live && <video src={l.live} poster={l.image} className="relative h-full w-full object-cover" autoPlay muted loop playsInline onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        {l.live && <span className="absolute bottom-3 left-3 rounded-full bg-ink px-3 py-1 text-xs text-oak">Live photo</span>}
      </div>
      <div className="px-4 pt-5">
        <h2 className="display text-4xl italic">{l.title}</h2>
        <p className="mt-2 text-muted">{l.dek}</p>
        <div className="mt-4 flex flex-wrap gap-2">{l.palette.map((p) => { const c = paint(p); return <Pill key={p} hex={c.hex}>{c.name}<span className="text-xs text-muted">· LRV {c.lrv}</span></Pill>; })}</div>
        <Block title="Framing" body={l.framing} />
        <Block title="Texture" body={l.texture} />
        <Block title="What to add" body={l.addition} />
        <section className="mt-5">
          <h3 className="kicker">The numbers</h3>
          <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">{l.numbers.map((n) => <li key={n} className="rounded-xl bg-surface px-3 py-2">{n}</li>)}</ul>
        </section>
        {les && <Link to={`/learn/${les.id}`} className="mt-4 block text-sm text-oak">Study this: {les.title}</Link>}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => { patchStudio(l.studio); nav('/studio'); }}>Open in the studio</Button>
          <Button kind="ghost" onClick={makeReal}>Make it a real room</Button>
          <Button kind="quiet" onClick={() => { saveItem({ kind: 'look', title: l.title, subtitle: roomName(l.room), body: `${l.framing} ${l.texture} ${l.addition}`, image: l.image, studio: l.studio, palette: l.palette }); setSaved(true); }}>{saved ? 'Saved' : 'Save'}</Button>
        </div>
        <div className="mt-8 flex items-baseline justify-between">
          <h3 className="display text-2xl">Pieces in this study</h3>
          <span className="text-sm text-muted">{fmtRange(shop)} for the set</span>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {items.map((c) => (
            <Link key={c.id} to={`/catalog?piece=${c.id}`} className="flex gap-3 rounded-[1.25rem] bg-surface p-2">
              <Img src={c.image} className="size-20 rounded-xl" palette={l.palette.map((x) => paint(x).hex)} kind={c.rooms[0]} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.name}</span>
                <span className="mt-1 block text-sm text-muted">{fmtRange(c.price)} · {c.unit}</span>
                <span className="mt-1 block text-xs text-muted">{c.hunt === 'used' ? 'Worth hunting used' : c.hunt === 'new' ? 'Buy new, with a return path' : 'New or used'}</span>
              </span>
              <Money n={midPrice(c)} className="self-center text-sm text-oak" />
            </Link>
          ))}
        </div>
        {items[0] && <div className="mt-6"><h3 className="display text-2xl">Shop the look</h3><div className="mt-3"><ShopLinks query={items[0].query} markets={items[0].markets} /></div></div>}
      </div>
    </Sheet>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return <section className="mt-5"><h3 className="kicker">{title}</h3><p className="mt-1 text-fg">{body}</p></section>;
}
