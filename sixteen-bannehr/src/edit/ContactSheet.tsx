import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBook, useLayout, findSpread, getBook } from '../store/book';
import { useNav } from '../store/nav';
import { useAsset } from '../store/assets';
import { addSpread, deleteSpread, duplicateSpread, imageRefsOf, moveSpread, moveSpreadToChapter, readImage, setTemplate } from '../store/actions';
import { TEMPLATES } from '../model/templates';
import { TemplatePicker, TemplateGlyph } from './TemplatePicker';
import type { Placed } from '../model/pages';
import type { LayoutMode } from '../reader/context';

function firstAssetId(placed: Placed): string | null {
  const book = getBook();
  for (const ref of imageRefsOf(placed.spread, book)) {
    const id = readImage(book, ref)?.assetId;
    if (id) return id;
  }
  return null;
}

function Thumb({ placed, current, onGo }: { placed: Placed; current: boolean; onGo: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: placed.spread.id,
    disabled: placed.isCover,
  });
  const asset = useAsset(firstAssetId(placed));
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);
  const name = TEMPLATES[placed.spread.template].name;
  const where = placed.isCover ? 'Cover' : `pp. ${placed.verso}–${placed.recto}`;
  return (
    <button
      type="button"
      ref={(el) => {
        setNodeRef(el);
        ref.current = el;
      }}
      className={['cs__thumb', current && 'is-current', isDragging && 'is-dragging'].filter(Boolean).join(' ')}
      style={{ transform: CSS.Translate.toString(transform), transition, '--tone': placed.chapter.tone } as CSSProperties}
      onClick={onGo}
      aria-current={current ? 'page' : undefined}
      aria-label={`${name}, ${where}${placed.isCover ? '' : '. Drag to reorder.'}`}
      {...attributes}
      {...listeners}
    >
      <span className={['cs__mini', placed.isCover && 'cs__mini--cover'].filter(Boolean).join(' ')}>
        <TemplateGlyph template={placed.spread.template} />
        {asset ? <img src={asset.thumb} alt="" draggable={false} /> : null}
      </span>
      <span className="cs__folio">{placed.isCover ? 'Cover' : placed.verso}</span>
    </button>
  );
}

/**
 * The contact sheet: every spread in order, grouped by chapter. Tap to go, drag to
 * reorder, and act on the current spread from the strip above.
 */
export function ContactSheet({ current, layout, onTurn }: { current: Placed; layout: LayoutMode; onTurn: (d: 1 | -1) => void }) {
  const book = useBook();
  const { placed, chapterNumbers } = useLayout();
  const go = useNav((s) => s.go);
  const [picker, setPicker] = useState<null | 'add' | 'change' | 'move'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setConfirmDelete(false);
    setPicker(null);
  }, [current.spread.id]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const target = findSpread(getBook(), String(over.id));
    if (!target) return;
    moveSpread(String(active.id), target.chapter.id, target.index);
  };

  const t = current.spread.template;
  const locked = t === 'cover' || t === 'contents';

  return (
    <footer className="cs" aria-label="Spreads">
      <div className="cs__actions" role="toolbar" aria-label="This spread">
        <span className="cs__here">
          <span className="sc">{TEMPLATES[t].name}</span>
          <span className="cs__here-where">
            {current.chapter.kind === 'front' ? '' : current.chapter.title} {current.isCover ? '' : `· pp. ${current.verso}–${current.recto}`}
          </span>
        </span>
        <span className="cs__buttons">
          <button type="button" onClick={() => setPicker(picker === 'add' ? null : 'add')} aria-expanded={picker === 'add'}>
            + Add spread
          </button>
          {!locked ? (
            <>
              <button type="button" onClick={() => setPicker(picker === 'change' ? null : 'change')} aria-expanded={picker === 'change'}>
                Template
              </button>
              <button type="button" onClick={() => { const id = duplicateSpread(current.spread.id); if (id) go(id, 1); }}>
                Duplicate
              </button>
              <button type="button" onClick={() => setPicker(picker === 'move' ? null : 'move')} aria-expanded={picker === 'move'}>
                Move
              </button>
              {confirmDelete ? (
                <button
                  type="button"
                  className="is-danger"
                  autoFocus
                  onBlur={() => setConfirmDelete(false)}
                  onClick={() => {
                    const next = deleteSpread(current.spread.id);
                    if (next) go(next, 0);
                  }}
                >
                  Delete this spread?
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )}
            </>
          ) : null}
        </span>
        {layout === 'spread' ? (
          <span className="cs__nav">
            <button type="button" onClick={() => onTurn(-1)} disabled={current.index === 0} aria-label="Previous pages">
              ‹
            </button>
            <button type="button" onClick={() => onTurn(1)} disabled={current.index === placed.length - 1} aria-label="Next pages">
              ›
            </button>
          </span>
        ) : null}
      </div>

      {picker === 'add' || picker === 'change' ? (
        <TemplatePicker
          title={picker === 'add' ? 'Add a spread after this one' : 'Change this spread’s template'}
          current={picker === 'change' ? t : undefined}
          onPick={(tpl) => {
            setPicker(null);
            if (picker === 'add') go(addSpread(current.spread.id, tpl), 1);
            else setTemplate(current.spread.id, tpl);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {picker === 'move' ? (
        <div className="picker" role="dialog" aria-label="Move to a chapter">
          <p className="picker__title">Move this spread to…</p>
          <ul className="picker__chapters">
            {book.chapters
              .filter((c) => c.kind !== 'front')
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={c.id === current.chapter.id}
                    onClick={() => {
                      moveSpreadToChapter(current.spread.id, c.id);
                      setPicker(null);
                    }}
                  >
                    <span className="picker__num">{chapterNumbers.get(c.id) ?? (c.kind === 'prologue' ? 'P' : 'E')}</span> {c.title}
                  </button>
                </li>
              ))}
          </ul>
          <button type="button" className="picker__close" onClick={() => setPicker(null)}>
            Close
          </button>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="cs__strip">
          {book.chapters.map((c) => {
            const items = placed.filter((p) => p.chapter.id === c.id);
            const n = chapterNumbers.get(c.id);
            const label = c.kind === 'front' ? '·' : n ? String(n) : c.kind === 'prologue' ? 'P' : 'E';
            return (
              <div key={c.id} className="cs__chapter" style={{ '--tone': c.tone } as CSSProperties}>
                <span className="cs__chapter-label" title={c.title}>
                  {label}
                </span>
                <SortableContext items={items.map((p) => p.spread.id)} strategy={horizontalListSortingStrategy}>
                  {items.map((p) => (
                    <Thumb
                      key={p.spread.id}
                      placed={p}
                      current={p.spread.id === current.spread.id}
                      onGo={() => go(p.spread.id, Math.abs(p.index - current.index) === 1 ? ((p.index - current.index) as 1 | -1) : 0)}
                    />
                  ))}
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
    </footer>
  );
}
