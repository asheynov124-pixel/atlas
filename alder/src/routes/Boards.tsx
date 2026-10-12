import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, FolderPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { Button, Chip, Kicker, Img, Empty } from '../components/ui';
import { paint } from '../data/palette';

export default function Boards() {
  const saves = useStore((s) => s.saves);
  const boards = useStore((s) => s.boards);
  const removeSave = useStore((s) => s.removeSave);
  const renameSave = useStore((s) => s.renameSave);
  const moveSave = useStore((s) => s.moveSave);
  const addBoard = useStore((s) => s.addBoard);
  const removeBoard = useStore((s) => s.removeBoard);
  const patchStudio = useStore((s) => s.patchStudio);
  const nav = useNavigate();
  const [board, setBoard] = useState<string>('all');
  const [name, setName] = useState('');
  const list = saves.filter((s) => board === 'all' ? true : board === 'none' ? !s.board : s.board === board);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Boards</Kicker>
      <h1 className="mt-2 display text-4xl italic">Saved</h1>
      <p className="mt-2 max-w-xl text-muted">Looks, ideas, rooms and pieces you kept. Sort them onto boards: one per room, or one per argument you are having with yourself.</p>
      <div className="scroll-row mt-5">
        <Chip on={board === 'all'} onClick={() => setBoard('all')}>Everything</Chip>
        <Chip on={board === 'none'} onClick={() => setBoard('none')}>Unsorted</Chip>
        {boards.map((b) => <Chip key={b.id} on={board === b.id} onClick={() => setBoard(b.id)}>{b.name}</Chip>)}
      </div>
      <div className="mt-3 flex max-w-md items-center gap-2">
        <input className="field" placeholder="New board: Kitchen, Upstairs, Maybe…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { setBoard(addBoard(name)); setName(''); } }} />
        <Button kind="ghost" onClick={() => { if (name.trim()) { setBoard(addBoard(name)); setName(''); } }}><FolderPlus className="size-4" />Board</Button>
        {board !== 'all' && board !== 'none' && <Button kind="quiet" onClick={() => { removeBoard(board); setBoard('all'); }}>Delete board</Button>}
      </div>
      {list.length === 0 ? (
        <div className="mt-6"><Empty title="Nothing here yet" body="Save a study, an idea, a room from the studio, or a piece from the catalog. They land here." /></div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <article key={s.id} className="card overflow-hidden">
              {s.image ? <Img src={s.image} className="aspect-[16/10]" palette={s.palette?.map((x) => paint(x).hex)} kind={s.studio?.room} /> : s.palette ? <div className="flex aspect-[16/10]">{s.palette.map((p) => <div key={p} className="flex-1" style={{ background: paint(p).hex }} />)}</div> : <div className="aspect-[16/10] bg-raised" />}
              <div className="p-4">
                <p className="kicker">{s.kind}{s.subtitle && ` · ${s.subtitle}`}</p>
                <input className="mt-1 w-full bg-transparent display text-2xl outline-none" defaultValue={s.title} onBlur={(e) => renameSave(s.id, e.target.value)} />
                {s.body && <p className="mt-1 line-clamp-3 text-sm text-muted">{s.body}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {s.studio && <Button kind="ghost" onClick={() => { patchStudio(s.studio!); nav('/studio'); }}>Open in studio</Button>}
                  {s.catalogId && <Button kind="ghost" onClick={() => nav(`/catalog?piece=${s.catalogId}`)}>See the piece</Button>}
                  <select value={s.board ?? ''} onChange={(e) => moveSave(s.id, e.target.value || undefined)} className="text-xs"><option value="">Unsorted</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                  <button type="button" aria-label="Remove" className="ml-auto grid size-9 place-items-center rounded-full text-muted hover:text-stop" onClick={() => removeSave(s.id)}><Trash2 className="size-4" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
