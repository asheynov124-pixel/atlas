import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { useSpread, useEditing } from '../reader/context';
import { useEditTool, usePrefs } from '../store/prefs';
import { deleteNote, updateNote } from '../store/actions';
import { AUTHORS, type Note, type PageSide } from '../model/types';

/** Marginalia: handwritten notes in the margins, coloured by who wrote them. */
export function NotesLayer({ side }: { side: PageSide }) {
  const { placed, decorative } = useSpread();
  const editing = useEditing();
  const showNotes = usePrefs((s) => s.showNotes);
  const showResolved = usePrefs((s) => s.showResolved);
  if ((!showNotes && !editing) || decorative) return null;
  const notes = placed.spread.notes.filter((n) => n.page === side && (!n.resolved || showResolved));
  if (!notes.length) return null;
  return (
    <div className="notes">
      {notes.map((n) =>
        editing ? <EditableNote key={n.id} note={n} spreadId={placed.spread.id} /> : <StaticNote key={n.id} note={n} />,
      )}
    </div>
  );
}

function tilt(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 36) - 18) / 10;
}

function StaticNote({ note: n }: { note: Note }) {
  return (
    <aside
      className={['note', n.resolved && 'note--resolved'].filter(Boolean).join(' ')}
      data-author={n.author}
      style={{ left: `${n.x}%`, top: `${n.y}%`, '--tilt': `${tilt(n.id)}deg` } as CSSProperties}
      aria-label={`Note from ${AUTHORS[n.author].name}`}
    >
      <p className="note__text">{n.text}</p>
      <span className="note__by">— {AUTHORS[n.author].initial}.</span>
    </aside>
  );
}

function EditableNote({ note: n, spreadId }: { note: Note; spreadId: string }) {
  const el = useRef<HTMLElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  const focusNote = useEditTool((s) => s.focusNote);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

  useEffect(() => {
    if (focusNote === n.id) {
      text.current?.focus();
      useEditTool.setState({ focusNote: null });
    }
  }, [focusNote, n.id]);

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.note__text, button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: n.x, y: n.y, moved: false, id: e.pointerId };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const page = el.current?.parentElement?.closest('.page') as HTMLElement | null;
    if (!d || !page || d.id !== e.pointerId) return;
    const r = page.getBoundingClientRect();
    d.x = Math.min(97, Math.max(3, ((e.clientX - r.left) / r.width) * 100));
    d.y = Math.min(97, Math.max(3, ((e.clientY - r.top) / r.height) * 100));
    d.moved = true;
    el.current!.style.left = `${d.x}%`;
    el.current!.style.top = `${d.y}%`;
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) updateNote(spreadId, n.id, { x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 });
  };

  const commitText = () => {
    const next = (text.current?.innerText ?? '').trim();
    if (!next && !n.text) {
      deleteNote(spreadId, n.id);
      return;
    }
    if (next !== n.text) updateNote(spreadId, n.id, { text: next });
  };

  return (
    <aside
      ref={el}
      className={['note', 'note--editing', n.resolved && 'note--resolved'].filter(Boolean).join(' ')}
      data-author={n.author}
      style={{ left: `${n.x}%`, top: `${n.y}%`, '--tilt': `${tilt(n.id)}deg` } as CSSProperties}
      aria-label={`Note from ${AUTHORS[n.author].name}. Arrow keys move it.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.stopPropagation()}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const step = e.shiftKey ? 5 : 1;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const m = moves[e.key];
        if (!m) return;
        e.preventDefault();
        e.stopPropagation();
        updateNote(spreadId, n.id, { x: Math.min(97, Math.max(3, n.x + m[0])), y: Math.min(97, Math.max(3, n.y + m[1])) });
      }}
    >
      <span className="note__grip" aria-hidden="true" title="Drag to move" />
      <p
        ref={text}
        className="note__text"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`Note text, by ${AUTHORS[n.author].name}`}
        data-placeholder="Write a note…"
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.target as HTMLElement).blur();
        }}
      >
        {n.text}
      </p>
      <span className="note__by">— {AUTHORS[n.author].initial}.</span>
      <span className="note__tools">
        <button type="button" onClick={() => updateNote(spreadId, n.id, { resolved: !n.resolved })} aria-label={n.resolved ? 'Reopen note' : 'Resolve note'}>
          {n.resolved ? 'Reopen' : '✓ Resolve'}
        </button>
        <button type="button" onClick={() => deleteNote(spreadId, n.id)} aria-label="Delete note">
          Delete
        </button>
      </span>
    </aside>
  );
}
