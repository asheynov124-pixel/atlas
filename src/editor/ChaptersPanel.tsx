import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { Chapter, ThemeColorKey } from '@/book/types';
import { addChapter, deleteChapter, moveChapter, setChapterField } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { navigate } from '@/app/router';
import { useEditSession } from './session';
import { Sheet, sheetStyles } from './Sheet';
import styles from './Panels.module.css';

const ACCENTS: ThemeColorKey[] = ['sage', 'olive', 'oak', 'clay', 'ink', 'muted'];

/** Add, rename, recolour, reorder and delete chapters. Contents follows. */
export function ChaptersPanel() {
  const chapters = useBookStore((s) => s.book.chapters);
  const setPanel = useUiStore((s) => s.setPanel);
  const visible = chapters.filter((c) => !c.hidden);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const toVisible = visible.findIndex((c) => c.id === over.id);
    const target = chapters.findIndex((c) => c.id === visible[toVisible].id);
    moveChapter(String(active.id), target);
  };

  return (
    <Sheet title="Chapters" onClose={() => setPanel(null)} testId="chapters-panel">
      <p className={sheetStyles.hint}>Drag to reorder. Numbers and the Contents page keep themselves right.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className={styles.list}>
            {visible.map((c) => (
              <ChapterRow key={c.id} chapter={c} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className={sheetStyles.row}>
        <button
          type="button"
          className={sheetStyles.button}
          onClick={() => {
            const id = addChapter(null);
            const ch = useBookStore.getState().book.chapters.find((c) => c.id === id);
            if (ch?.spreads[0]) navigate({ kind: 'spread', id: ch.spreads[0].id, index: null });
          }}
          data-testid="add-chapter"
        >
          + Add a chapter
        </button>
      </div>
    </Sheet>
  );
}

function ChapterRow({ chapter }: { chapter: Chapter }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
  const [confirm, setConfirm] = useState(false);
  const { change, end } = useEditSession();
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={styles.chapter} data-dragging={isDragging ? 'true' : 'false'} data-chapter-row={chapter.id} {...attributes}>
      <button ref={setActivatorNodeRef} type="button" className={styles.grip} aria-label={`Reorder ${chapter.title}`} {...listeners}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" strokeWidth="2.5" strokeLinecap="round" /></svg>
      </button>
      <span className={styles.num}>{chapter.number ?? '·'}</span>
      <div className={styles.fields}>
        <input
          className={styles.titleInput}
          value={chapter.title}
          aria-label="Chapter title"
          onChange={(e) => change(() => setChapterField(chapter.id, { title: e.target.value }))}
          onBlur={end}
          data-testid="chapter-title"
        />
        <input className={styles.smallInput} value={chapter.kicker} placeholder="Kicker (e.g. The kitchen)" aria-label="Kicker" onChange={(e) => change(() => setChapterField(chapter.id, { kicker: e.target.value }))} onBlur={end} />
        <input className={styles.smallInput} value={chapter.epigraph} placeholder="Epigraph" aria-label="Epigraph" onChange={(e) => change(() => setChapterField(chapter.id, { epigraph: e.target.value }))} onBlur={end} />
      </div>
      <div className={styles.side}>
        <div className={styles.accents} role="group" aria-label="Chapter colour">
          {ACCENTS.map((a) => (
            <button key={a} type="button" className={styles.accent} style={{ background: `var(--${a === 'ink' ? 'ink' : a})` }} aria-pressed={chapter.accent === a} aria-label={a} onClick={() => setChapterField(chapter.id, { accent: a })} />
          ))}
        </div>
        {confirm ? (
          <span className={sheetStyles.row}>
            <button type="button" className={[sheetStyles.button, styles.danger].join(' ')} onClick={() => deleteChapter(chapter.id)} data-testid="confirm-delete-chapter">Delete {chapter.spreads.length} spreads</button>
            <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => setConfirm(true)}>Delete…</button>
        )}
      </div>
    </div>
  );
}
