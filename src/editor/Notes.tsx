import { useEffect, useRef, useState } from 'react';
import type { Note } from '@/book/types';
import { deleteNote, updateNote } from '@/state/actions';
import { useUiStore } from '@/state/uiStore';
import { useSpread } from '@/reader/SpreadContext';
import { useEditSession } from './session';
import styles from './Notes.module.css';

const tilt = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((h % 7) - 3) * 0.7;
};

/**
 * Marginalia: handwritten sticky notes, coloured by author. Rendered inside a
 * page (side = left/right) or across a bleed spread. Draggable and editable
 * in Edit mode; resolved notes hide unless "show resolved" is on.
 */
export function NotesLayer({ side }: { side: 'left' | 'right' | 'bleed' }) {
  const { ref, editable } = useSpread();
  const showResolved = useUiStore((s) => s.showResolved);
  const notes = ref.spread.notes.filter((n) => (side === 'bleed' || n.side === side) && (showResolved || !n.resolved));
  if (notes.length === 0) return null;
  return (
    <div className={styles.layer} data-notes-layer={side}>
      {notes.map((n) => (
        <StickyNote key={n.id} note={n} spreadId={ref.spread.id} editable={editable} />
      ))}
    </div>
  );
}

function StickyNote({ note, spreadId, editable }: { note: Note; spreadId: string; editable: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null);
  const { change, end } = useEditSession();
  const textRef = useRef<HTMLDivElement>(null);

  // text lives in the DOM while editing so typing never resets the caret
  useEffect(() => {
    const el = textRef.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== note.text) el.textContent = note.text;
  }, [note.text, editable]);

  const x = pos?.x ?? note.x;
  const y = pos?.y ?? note.y;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const t = e.target as HTMLElement;
    if (t.closest('button') || t === textRef.current || textRef.current?.contains(t)) return;
    const parent = e.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, ox: note.x, oy: note.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      d.moved = true;
      setPos({
        x: Math.min(98, Math.max(2, d.ox + ((ev.clientX - d.startX) / parent.width) * 100)),
        y: Math.min(98, Math.max(2, d.oy + ((ev.clientY - d.startY) / parent.height) * 100)),
      });
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      if (!d || ev.pointerId !== d.id) return;
      drag.current = null;
      setPos((p) => {
        if (p && d.moved) updateNote(spreadId, note.id, { x: p.x, y: p.y });
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={styles.note}
      style={{ left: `${x}%`, top: `${y}%`, ['--tilt' as string]: `${tilt(note.id)}deg` } as React.CSSProperties}
      data-author={note.author}
      data-resolved={note.resolved ? 'true' : 'false'}
      data-editable={editable ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      data-note-id={note.id}
      data-no-swipe
      data-no-tap
      onPointerDown={onPointerDown}
      role="note"
      aria-label={`Note by ${note.author === 'sonny' ? 'Sonny' : 'Adi'}${note.resolved ? ', resolved' : ''}`}
    >
      {editable ? (
        <div
          ref={textRef}
          className={styles.text}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          data-placeholder="Write a note…"
          onInput={(e) => change(() => updateNote(spreadId, note.id, { text: (e.currentTarget as HTMLDivElement).innerText }))}
          onBlur={end}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') (e.currentTarget as HTMLDivElement).blur();
          }}
          role="textbox"
          aria-label="Note text"
        />
      ) : (
        <div className={styles.text}>{note.text}</div>
      )}
      <div className={styles.byline}>
        <span>{note.author === 'sonny' ? 'Sonny' : 'Adi'}</span>
        {editable && (
          <span className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => updateNote(spreadId, note.id, { resolved: !note.resolved })} aria-label={note.resolved ? 'Reopen note' : 'Resolve note'} title={note.resolved ? 'Reopen' : 'Resolve'}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L19 7" /></svg>
            </button>
            <button type="button" className={styles.action} onClick={() => deleteNote(spreadId, note.id)} aria-label="Delete note" title="Delete">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
