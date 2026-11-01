import { useEffect, useMemo, useState } from 'react';
import { flattenSpreads } from '@/book/pagination';
import { addNote } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { useIsDesktop } from '@/app/useMedia';
import chrome from '@/app/Chrome.module.css';

function Icon({ name }: { name: 'undo' | 'redo' | 'note' | 'chapters' | 'theme' | 'editions' | 'person' }) {
  switch (name) {
    case 'undo':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>;
    case 'redo':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>;
    case 'note':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" /></svg>;
    case 'chapters':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 10h14M5 15h9M5 20h6" /></svg>;
    case 'theme':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></svg>;
    case 'editions':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l4 4v12H6z" /><path d="M9 4v5h6" /></svg>;
    case 'person':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  }
}

/** Edit-mode tools: undo/redo, add a note, chapters, theme, editions, who is editing, save state. */
export function EditBar() {
  const book = useBookStore((s) => s.book);
  const spreadIndex = useUiStore((s) => s.spreadIndex);
  const author = useUiStore((s) => s.author);
  const setPanel = useUiStore((s) => s.setPanel);
  const saveState = useUiStore((s) => s.saveState);
  const showResolved = useUiStore((s) => s.showResolved);
  const setShowResolved = useUiStore((s) => s.setShowResolved);
  const isDesktop = useIsDesktop();
  const spreads = useMemo(() => flattenSpreads(book), [book]);
  const cur = spreads[spreadIndex];
  const [, tick] = useState(0);

  // re-render when history changes so the undo/redo buttons reflect it
  useEffect(() => useBookStore.temporal.subscribe(() => tick((n) => n + 1)), []);
  const temporal = useBookStore.temporal.getState();
  const canUndo = temporal.pastStates.length > 0;
  const canRedo = temporal.futureStates.length > 0;
  const resolvedCount = cur?.spread.notes.filter((n) => n.resolved).length ?? 0;

  const onAddNote = () => {
    if (!cur || !author) return;
    const bleed = cur.bleed;
    const side = bleed ? 'left' : 'right';
    addNote(cur.spread.id, author, side, bleed ? 50 : 50, bleed ? 45 : 45);
  };

  return (
    <div className={chrome.group} role="toolbar" aria-label="Editing tools" data-testid="editbar">
      <button type="button" className={chrome.button} onClick={() => useBookStore.temporal.getState().undo()} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)" data-testid="undo">
        <Icon name="undo" />
        {isDesktop && <span>Undo</span>}
      </button>
      <button type="button" className={chrome.button} onClick={() => useBookStore.temporal.getState().redo()} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)" data-testid="redo">
        <Icon name="redo" />
        {isDesktop && <span>Redo</span>}
      </button>
      <button type="button" className={chrome.button} onClick={onAddNote} aria-label="Add a note" title="Add a sticky note to this page" data-testid="add-note">
        <Icon name="note" />
        {isDesktop && <span>Note</span>}
      </button>
      {resolvedCount > 0 && (
        <button type="button" className={chrome.button} onClick={() => setShowResolved(!showResolved)} aria-pressed={showResolved} title="Show resolved notes">
          <span>{showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved</span>
        </button>
      )}
      <button type="button" className={chrome.button} onClick={() => setPanel('chapters')} aria-label="Chapters" data-testid="open-chapters">
        <Icon name="chapters" />
        {isDesktop && <span>Chapters</span>}
      </button>
      <button type="button" className={chrome.button} onClick={() => setPanel('theme')} aria-label="Theme" data-testid="open-theme">
        <Icon name="theme" />
        {isDesktop && <span>Theme</span>}
      </button>
      <button type="button" className={chrome.button} onClick={() => setPanel('editions')} aria-label="Editions" data-testid="open-editions">
        <Icon name="editions" />
        {isDesktop && <span>Editions</span>}
      </button>
      <button type="button" className={chrome.button} onClick={() => setPanel('author')} aria-label={`Editing as ${author ?? 'nobody'}. Change who is editing`} data-testid="author-chip">
        <Icon name="person" />
        <span>{author === 'sonny' ? 'Sonny' : author === 'adi' ? 'Adi' : 'Who?'}</span>
      </button>
      {isDesktop && (
        <span className={chrome.button} aria-live="polite" style={{ cursor: 'default' }} data-testid="save-state">
          {saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : 'Saving…'}
        </span>
      )}
    </div>
  );
}
