import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROOM_TYPES, roomName, STUDIO_TEMPLATES } from '../data/rooms';
import { PAINTS, paint } from '../data/palette';
import { FLOORS, FRAMES, METALS, CLOTHS, MOOD_PALETTES, opt } from '../data/materials';
import { CATALOG, catalogItem, IMG } from '../data/catalog';
import { useStore } from '../lib/store';
import { parseIdea } from '../lib/parse';
import { Button, Chip, Kicker, Pill, Img } from '../components/ui';
import { AddOwn } from '../components/AddOwn';
import { ShopLinks } from '../components/ShopLinks';
import { fmtRange } from '../lib/takeoff';
import type { StudioState } from '../lib/types';

const MOODS = ['Sunwashed', 'Gathered', 'Cinematic', 'Quiet', 'Jewel', 'Mineral', 'Library', 'Cottage', 'Coastal'];
const LIGHTS = ['North day', 'South day', 'Late afternoon', 'Evening lamps'];
const BUDGETS = ['Edit', 'Considered', 'Heirloom'];
const ANCHORS = ['a soaking tub', 'an island', 'fluted oak', 'limewash', 'unlacquered brass', 'a wide art frame', 'open shelves', 'French doors', 'a large rug', 'a picture light', 'a window seat', 'a reading chair', 'a checkerboard floor', 'a green cabinet'];
const TITLES = ['A room with one dark thing', 'Leave a surface empty', 'The edges before the objects', 'Warm enough for evening', 'Texture, then stop', 'A frame you can feel', 'Light from two heights', 'The floor decides the paint', 'One pattern, and it is underfoot', 'A ceiling you notice'];
const TEXTURES = ['limewash, oak, and a linen that shows its slub', 'honed stone, a flat paint, and one wool rug', 'fluted oak against a quiet plaster', 'venetian plaster on a single wall, everything else matte', 'terracotta or clay used once, next to a large field of bone', 'walnut, leather, and a lighter plaster ceiling so the room has a lid', 'v-groove to the chair rail, plaster above, a jute rug', 'a checkerboard floor and nothing else patterned'];
const STUDIO_OF: Record<string, string> = { living: 'living', kitchen: 'kitchen', bath: 'bath', bedroom: 'bedroom', dining: 'dining', lounge: 'lounge', entry: 'entry', powder: 'bath', office: 'living', deck: 'entry', guest: 'bedroom', mudroom: 'entry', nursery: 'bedroom', hall: 'entry' };
const PICTURE: Record<string, string> = { living: 'living', kitchen: 'kitchen', bath: 'bath', bedroom: 'bedroom', dining: 'dining', lounge: 'lounge', entry: 'entry', powder: 'powder', office: 'office', deck: 'deck', guest: 'bedroom', mudroom: 'entry', nursery: 'bedroom', hall: 'entry' };

type Picks = { room: string; mood: string; light: string; budget: string; anchors: string[] };
const DEFAULT: Picks = { room: 'surprise', mood: 'surprise', light: 'surprise', budget: 'surprise', anchors: [] };

function rng(seed: number) { let t = seed >>> 0; return () => { t |= 0; t = (t + 1831565813) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

function compose(seed: number, picks: Picks, notes: string[], colors: { id: string; name: string; hex: string }[], extras: string[]) {
  const r = rng(seed * 997 + picks.anchors.length * 13);
  const room = picks.room === 'surprise' ? pick(r, ROOM_TYPES.map((x) => x.id)) : picks.room;
  const mood = picks.mood === 'surprise' ? pick(r, MOODS) : picks.mood;
  const light = picks.light === 'surprise' ? pick(r, LIGHTS) : picks.light;
  const budget = picks.budget === 'surprise' ? pick(r, BUDGETS) : picks.budget;
  const pal = MOOD_PALETTES.filter((m) => m.moods.includes(mood));
  const base = pal.length ? pick(r, pal) : MOOD_PALETTES[0];
  const parsed = parseIdea([...notes, ...extras, ...picks.anchors].join(' · '));
  const roles = ['Walls', 'Cloth', 'Accent', 'Note'];
  const own = colors.slice(0, 4).map((c, i) => ({ ...c, role: roles[i] ?? 'Note' }));
  const have = new Set(colors.map((c) => c.hex.toLowerCase()));
  const rest = base.ids.filter((id) => !have.has(paint(id).hex.toLowerCase())).map((id, i) => ({ id, name: paint(id).name, hex: paint(id).hex, role: colors.length && base.roles[i] === 'Walls' ? 'Ground' : base.roles[i] ?? 'Note' }));
  const palette = [...own, ...rest].slice(0, 6);
  const floorPool = mood === 'Cinematic' || mood === 'Library' ? FLOORS.filter((f) => f.id === 'walnut' || f.id === 'oak') : mood === 'Mineral' || room === 'bath' || room === 'entry' ? FLOORS.filter((f) => f.id === 'limestone' || f.id === 'mineral' || f.id === 'checker') : mood === 'Coastal' ? FLOORS.filter((f) => f.id === 'oak' || f.id === 'wool-carpet') : FLOORS.filter((f) => f.id !== 'walnut' && f.id !== 'wool-carpet');
  let floor = pick(r, floorPool.length ? floorPool : FLOORS);
  let frame = mood === 'Jewel' || mood === 'Cinematic' ? opt(FRAMES, 'gallery') : mood === 'Cottage' || mood === 'Coastal' ? opt(FRAMES, 'craftsman') : pick(r, FRAMES.filter((f) => f.id !== 'none'));
  let metal = mood === 'Mineral' ? opt(METALS, 'nickel') : mood === 'Cinematic' ? opt(METALS, 'blackened') : mood === 'Coastal' ? opt(METALS, 'bronze') : opt(METALS, 'brass');
  if (parsed.floor) floor = opt(FLOORS, parsed.floor);
  if (parsed.frame) frame = opt(FRAMES, parsed.frame);
  if (parsed.metal) metal = opt(METALS, parsed.metal);
  let texture = pick(r, TEXTURES);
  if (parsed.finish === 'venetian') texture = TEXTURES[3]; else if (parsed.finish === 'limewash') texture = TEXTURES[0]; else if (parsed.finish === 'vgroove') texture = TEXTURES[6];
  const must = [...picks.anchors, ...extras];
  const addition = must.length ? `You asked for ${must.join(', ')}. Give each one a job, and leave an empty surface beside it.` : pick(r, ['Add one lamp you can reach from the seat, then stop.', 'Add a branch in a vessel the color of the stone or the clay.', 'Add the rug before the objects. It frames everything else.', 'Add a single picture with a frame in the same language as the casing.']);
  const spend = budget === 'Edit' ? 'Spend on the floor or the sofa, not both, and hunt the table and the frame.' : budget === 'Heirloom' ? 'Spend on solid wood, the stone, and the faucet you touch every day.' : 'Spend on the thing you touch, the sofa, the faucet, or the lamp, and let the rest be plain.';
  const main = palette[0];
  const mp = PAINTS.find((x) => x.id === main.id);
  const lightNote = light === 'North day' ? 'North light is cool and steady, so the wall needs a yellow-pink undertone or the room goes gray by afternoon.' : light === 'South day' ? 'South light is already warm. You can go a step more mineral without the room turning yellow.' : light === 'Late afternoon' ? 'Late light rakes texture. Limewash and flutes earn their cost in this hour.' : 'Evening lamps at 2700K will make a cool gray look tired. Stay warm, and put a shade at seated height.';
  const colorNote = mp ? `${main.name} carries a ${mp.undertone} undertone at LRV ${mp.lrv}. ${mp.note}` : `${main.name} is yours. Put it on the largest surface, and let the other colors happen once.`;
  const rn = roomName(room), ml = mood.toLowerCase();
  const opener = pick(r, [
    `${rn} in a ${ml} mood starts with ${main.name} on the walls.`,
    `Start the ${rn.toLowerCase()} with the walls: ${main.name}, everywhere, including the inside of the door.`,
    `A ${ml} ${rn.toLowerCase()}. The first decision is ${main.name} on every wall, and the rest follows from it.`,
    `Paint first. ${main.name} on the walls makes this ${rn.toLowerCase()} ${ml} before a single thing is bought.`,
  ]);
  const floorLine = pick(r, [`Floor in ${floor.name.toLowerCase()}. ${floor.note}`, `Underfoot, ${floor.name.toLowerCase()}. ${floor.note}`, `The floor is ${floor.name.toLowerCase()}, and it decides the paint more than the paint decides it. ${floor.note}`]);
  const frameLine = pick(r, [`Framing: ${frame.name}. ${frame.note}`, `At the doors and windows, ${frame.name.toLowerCase()}. ${frame.note}`, `${frame.name} casing. ${frame.note}`]);
  const metalLine = pick(r, [`Metal: ${metal.name}. ${metal.note}`, `One metal in each view: ${metal.name.toLowerCase()}. ${metal.note}`, `${metal.name} for everything you touch. ${metal.note}`]);
  const textureLine = pick(r, [`Texture is ${texture}.`, `For texture, ${texture}. Nothing patterned until those three are in.`, `Three textures, one pattern at most: ${texture}.`]);
  const budgetLine = pick(r, [`On ${/^[aeiou]/i.test(budget) ? 'an' : 'a'} ${budget.toLowerCase()} budget, ${spend}`, `Money: ${spend}`, `${spend} That is the ${budget.toLowerCase()} version of this room.`]);
  const middle = [floorLine, frameLine, metalLine, textureLine];
  if (r() > 0.5) { const t = middle[1]; middle[1] = middle[2]; middle[2] = t; }
  const essay = [notes.join(' '), opener, lightNote, colorNote, ...middle, addition, budgetLine].filter(Boolean).join(' ');
  const pool = CATALOG.filter((c) => c.rooms.includes(room));
  const src = pool.length ? pool : CATALOG;
  const ids: string[] = []; const seen = new Set<number>();
  while (ids.length < 4 && seen.size < 30) { const i = Math.floor(r() * src.length); if (!seen.has(i)) { seen.add(i); ids.push(src[i].id); } }
  const sk = STUDIO_OF[room] ?? 'living';
  const tpl = STUDIO_TEMPLATES[sk];
  const cloth = colors[1]?.id ?? (mood === 'Cinematic' ? 'cognac' : mood === 'Library' ? 'moss-wool' : mood === 'Coastal' ? 'stripe' : CLOTHS[0].id);
  const studio: StudioState = { ...tpl, room: sk, wall: colors[0]?.id ?? main.id, floor: floor.id, frame: frame.id, metal: metal.id, cloth, warmth: parsed.warmth ?? (light === 'Evening lamps' ? 86 : light === 'North day' ? 42 : light === 'Late afternoon' ? 70 : 55), hour: parsed.hour ?? (light === 'Evening lamps' ? 21 : light === 'North day' ? 11 : light === 'Late afternoon' ? 17 : 13), finish: parsed.finish ?? (texture.includes('venetian') ? 'venetian' : texture.includes('limewash') || mood === 'Cottage' ? 'limewash' : texture.includes('v-groove') ? 'vgroove' : 'smooth'), pieces: [...new Set([...tpl.pieces, ...(parsed.pieces ?? [])])] };
  const first = notes[0]?.trim();
  const title = first && first.length <= 48 ? `${first} · ${roomName(room)}` : `${pick(r, TITLES)} · ${roomName(room)}`;
  const est = ids.map((id) => catalogItem(id)!).reduce((a, c) => [a[0] + c.price[0], a[1] + c.price[1]] as [number, number], [0, 0] as [number, number]);
  return { id: `idea-${seed}-${room}-${mood}`, title, room, mood, light, budget, palette, floor, frame, metal, texture, addition, essay, spend, image: IMG(PICTURE[room] ?? 'living'), catalogIds: ids, studio, est };
}

export default function Ideas() {
  const [seed, setSeed] = useState(4);
  const [picks, setPicks] = useState<Picks>(DEFAULT);
  const customs = useStore((s) => s.customs);
  const saveItem = useStore((s) => s.saveItem);
  const patchStudio = useStore((s) => s.patchStudio);
  const nav = useNavigate();
  const idea = useMemo(() => compose(seed, picks, customs.filter((c) => c.kind === 'idea').map((c) => c.text), customs.filter((c) => c.kind === 'color' && c.hex).map((c) => ({ id: c.id, name: c.text, hex: c.hex! })), customs.filter((c) => c.kind === 'option').map((c) => c.text)), [seed, picks, customs]);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [idea.id]);
  const items = idea.catalogIds.map((id) => catalogItem(id)).filter((x) => x != null);
  const toggle = (a: string) => setPicks((p) => ({ ...p, anchors: p.anchors.includes(a) ? p.anchors.filter((x) => x !== a) : [...p.anchors, a] }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Ideas</Kicker>
      <h1 className="mt-2 display text-4xl">Compose a room</h1>
      <p className="mt-2 text-muted">Pin what you know, or type an idea, a color, or something the room has to include. Another roll keeps what you added.</p>
      <div className="mt-6 flex flex-col gap-4">
        <Row label="Room"><Chip on={picks.room === 'surprise'} onClick={() => setPicks({ ...picks, room: 'surprise' })}>Surprise</Chip>{ROOM_TYPES.map((r) => <Chip key={r.id} on={picks.room === r.id} onClick={() => setPicks({ ...picks, room: r.id })}>{r.name}</Chip>)}</Row>
        <Row label="Mood"><Chip on={picks.mood === 'surprise'} onClick={() => setPicks({ ...picks, mood: 'surprise' })}>Surprise</Chip>{MOODS.map((m) => <Chip key={m} on={picks.mood === m} onClick={() => setPicks({ ...picks, mood: m })}>{m}</Chip>)}</Row>
        <Row label="Light"><Chip on={picks.light === 'surprise'} onClick={() => setPicks({ ...picks, light: 'surprise' })}>Surprise</Chip>{LIGHTS.map((m) => <Chip key={m} on={picks.light === m} onClick={() => setPicks({ ...picks, light: m })}>{m}</Chip>)}</Row>
        <Row label="Budget"><Chip on={picks.budget === 'surprise'} onClick={() => setPicks({ ...picks, budget: 'surprise' })}>Surprise</Chip>{BUDGETS.map((m) => <Chip key={m} on={picks.budget === m} onClick={() => setPicks({ ...picks, budget: m })}>{m}</Chip>)}</Row>
        <Row label="Must include">{ANCHORS.map((a) => <Chip key={a} on={picks.anchors.includes(a)} onClick={() => toggle(a)}>{a}</Chip>)}</Row>
        <div><p className="mb-2 kicker">Add your own</p><AddOwn /></div>
      </div>
      <div className="mt-4"><Button onClick={() => setSeed((s) => s + 1)}>Another idea</Button></div>

      <article className="card mt-8 overflow-hidden">
        <Img src={idea.image} className="aspect-[3/4] w-full md:aspect-[16/9]" palette={idea.palette.map((x) => x.hex)} kind={idea.room} />
        <div className="p-4 md:p-6">
          <p className="kicker">{roomName(idea.room)} · {idea.mood} · {idea.light}</p>
          <h2 className="mt-2 display text-3xl">{idea.title}</h2>
          <div className="mt-4 flex flex-wrap gap-2">{idea.palette.map((p) => <Pill key={p.id} hex={p.hex}>{p.role}: {p.name}</Pill>)}</div>
          <p className="mt-4 leading-relaxed">{idea.essay}</p>
          <div className="mt-4 grid gap-2 text-sm">
            <p><span className="text-oak">Floor. </span>{idea.floor.name}. {idea.floor.note}</p>
            <p><span className="text-oak">Framing. </span>{idea.frame.name}. {idea.frame.note}</p>
            <p><span className="text-oak">Texture. </span>{idea.texture}</p>
            <p><span className="text-oak">Add. </span>{idea.addition}</p>
            <p><span className="text-oak">Spend. </span>{idea.spend} The pieces below run {fmtRange(idea.est)}.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => { patchStudio(idea.studio); nav('/studio'); }}>Open in the studio</Button>
            <Button kind="quiet" onClick={() => { saveItem({ kind: 'idea', title: idea.title, subtitle: `${roomName(idea.room)} · ${idea.mood}`, body: idea.essay, image: idea.image, studio: idea.studio, palette: idea.palette.map((p) => p.id).filter((id) => PAINTS.some((x) => x.id === id)) }); setSaved(true); }}>{saved ? 'Saved' : 'Save'}</Button>
          </div>
        </div>
      </article>
      <h3 className="mt-8 display text-2xl">Hunt these</h3>
      <div className="mt-3 flex flex-col gap-4">
        {items.map((c) => (
          <div key={c.id} className="card p-3">
            <div className="flex items-baseline justify-between gap-3"><p className="font-medium">{c.name}</p><span className="text-sm text-oak">{fmtRange(c.price)}</span></div>
            <p className="mt-1 text-sm text-muted">{c.why}</p>
            <div className="mt-3"><ShopLinks query={c.query} markets={c.markets} compact /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-2 kicker">{label}</p><div className="scroll-row">{children}</div></div>;
}
