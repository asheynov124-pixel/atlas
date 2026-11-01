import { useMemo, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { flattenSpreads, type SpreadRef } from '@/book/pagination';
import { stripHtml } from '@/book/slots';
import type { TemplateId } from '@/book/types';
import { navigate } from '@/app/router';
import { addSpread, changeTemplate, deleteSpread, duplicateSpread, moveSpreadTo } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { ADDABLE_TEMPLATES, TEMPLATE_META } from '@/templates/meta';
import { Glyph } from './Glyph';
import { Sheet, sheetStyles } from './Sheet';
import styles from './Strip.module.css';

function spreadTitle(ref: SpreadRef): string {
  const t = ref.spread.slots.title;
  const text = t?.kind === 'text' ? stripHtml(t.html) : '';
  return text || TEMPLATE_META[ref.spread.template].name;
}

/** The thumbnail strip: every spread, drag to reorder, add, duplicate, delete, change template. */
export function Strip() {
  const book = useBookStore((s) => s.book);
  const current = useUiStore((s) => s.spreadIndex);
  const spreads = useMemo(() => flattenSpreads(book), [book]);
  const ids = useMemo(() => spreads.map((s) => s.spread.id), [spreads]);
  const [picker, setPicker] = useState<'add' | 'change' | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );
  const cur = spreads[current];

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0 || to === 0) return;
    const order = arrayMove(ids, from, to);
    const prev = order[to - 1];
    const next = order[to + 1];
    const chapterOf = (id: string) => spreads.find((s) => s.spread.id === id)!.chapter;
    const chapter = chapterOf(prev);
    const before = next && chapterOf(next).id === chapter.id ? next : null;
    moveSpreadTo(String(active.id), before, chapter.id);
  };

  const go = (id: string) => navigate({ kind: 'spread', id, index: null });

  const onAdd = (template: TemplateId) => {
    const id = addSpread(cur?.spread.id ?? null, template);
    setPicker(null);
    if (id) go(id);
  };
  const onChange = (template: TemplateId) => {
    if (cur) changeTemplate(cur.spread.id, template);
    setPicker(null);
  };
  const onDuplicate = () => {
    if (!cur) return;
    const id = duplicateSpread(cur.spread.id);
    if (id) go(id);
  };
  const onDelete = () => {
    if (!cur) return;
    const fallback = spreads[Math.max(0, current - 1)];
    deleteSpread(cur.spread.id);
    if (fallback && fallback.spread.id !== cur.spread.id) go(fallback.spread.id);
  };

  const locked = cur ? !TEMPLATE_META[cur.spread.template].addable : true;

  return (
    <nav className={styles.strip} aria-label="Spreads" data-testid="strip">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className={styles.scroller}>
            {spreads.map((ref) => (
              <Thumb key={ref.spread.id} ref_={ref} current={ref.index === current} onGo={() => go(ref.spread.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className={styles.tools} role="toolbar" aria-label="Spread tools">
        <button type="button" className={styles.tool} onClick={() => setPicker('add')} data-testid="strip-add">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>Add</span>
        </button>
        <button type="button" className={styles.tool} onClick={onDuplicate} disabled={locked} data-testid="strip-duplicate">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></svg>
          <span>Duplicate</span>
        </button>
        <button type="button" className={styles.tool} onClick={() => setPicker('change')} disabled={locked} data-testid="strip-template">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /><path d="M4 12h16M12 4v16" /></svg>
          <span>Template</span>
        </button>
        <button type="button" className={styles.tool} onClick={onDelete} disabled={locked} data-testid="strip-delete">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
          <span>Delete</span>
        </button>
      </div>
      {picker && (
        <Sheet title={picker === 'add' ? 'Add a spread' : 'Change the template'} onClose={() => setPicker(null)} wide testId="template-picker">
          <p className={sheetStyles.hint}>
            {picker === 'add' ? `The new spread goes after this one, in ${cur?.chapter.title ?? 'this chapter'}.` : 'Text and pictures carry over where the new template has a place for them.'}
          </p>
          <div className={styles.picker}>
            {ADDABLE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={[styles.pick, `accent-${cur?.chapter.accent ?? 'sage'}`].join(' ')}
                data-current={picker === 'change' && cur?.spread.template === t.id ? 'true' : 'false'}
                onClick={() => (picker === 'add' ? onAdd(t.id) : onChange(t.id))}
                data-template={t.id}
              >
                <div className={styles.pickImage}><Glyph template={t.id} /></div>
                <span className={styles.pickName}>{t.name}</span>
                <span className={styles.pickBlurb}>{t.blurb}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </nav>
  );
}

function Thumb({ ref_, current, onGo }: { ref_: SpreadRef; current: boolean; onGo: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ref_.spread.id, disabled: ref_.spread.template === 'cover' });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const first = ref_.indexInChapter === 0 && !ref_.chapter.hidden;
  return (
    <>
      {first && (
        <span className={styles.chapterMark} aria-hidden="true" title={ref_.chapter.title}>
          <span className={styles.chapterNum}>{ref_.chapter.number ?? ref_.chapter.kicker.charAt(0)}</span>
          <span className={[styles.chapterName, 't-label'].join(' ')}>{ref_.chapter.title}</span>
        </span>
      )}
      <button
        ref={setNodeRef}
        type="button"
        className={[styles.thumb, `accent-${ref_.chapter.accent}`].join(' ')}
        style={style}
        data-current={current ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        data-spread-thumb={ref_.spread.id}
        aria-label={`${spreadTitle(ref_)}, ${TEMPLATE_META[ref_.spread.template].name}${current ? ', current' : ''}`}
        aria-current={current ? 'true' : undefined}
        onClick={onGo}
        {...attributes}
        {...listeners}
      >
        <span className={styles.thumbImage}><Glyph template={ref_.spread.template} /></span>
        <span className={styles.thumbLabel}>{spreadTitle(ref_)}</span>
      </button>
    </>
  );
}
