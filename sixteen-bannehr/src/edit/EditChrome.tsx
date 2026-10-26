import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useBookStore, undo, redo } from '../store/book';
import { useEditTool, useMode, usePrefs } from '../store/prefs';
import { useSaveStatus } from '../store/persistence';
import { ContactSheet } from './ContactSheet';
import { EditionsPanel, ThemePanel } from './Panels';
import { AUTHORS, type Author } from '../model/types';
import type { Placed } from '../model/pages';
import type { LayoutMode } from '../reader/context';

const SharePanel = lazy(() => import('./SharePanel'));

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function SaveStatus() {
  const { state, error } = useSaveStatus();
  const text = state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'Saved';
  return (
    <span className={`edit-bar__status is-${state}`} role="status" title={error ?? undefined}>
      {text}
    </span>
  );
}

function WhoDialog({ onPick }: { onPick: (a: Author) => void }) {
  return (
    <div className="who" role="dialog" aria-modal="true" aria-labelledby="who-title">
      <div className="who__card">
        <p className="sc who__kicker">Before you edit</p>
        <h2 id="who-title" className="who__title">Who is holding the pen?</h2>
        <p className="who__text">Notes and favourites are signed. This device will remember.</p>
        <div className="who__choices">
          {(Object.keys(AUTHORS) as Author[]).map((a) => (
            <button key={a} type="button" className="who__choice" data-author={a} onClick={() => onPick(a)} autoFocus={a === 'sonny'}>
              {AUTHORS[a].name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Everything Edit mode adds around the book: the top bar, the contact sheet, the panels. */
export default function EditChrome({ current, layout, onTurn }: { current: Placed; layout: LayoutMode; onTurn: (d: 1 | -1) => void }) {
  const who = usePrefs((s) => s.who);
  const setWho = usePrefs((s) => s.setWho);
  const showResolved = usePrefs((s) => s.showResolved);
  const toggleResolved = usePrefs((s) => s.toggleResolved);
  const setEditing = useMode((s) => s.setEditing);
  const tool = useEditTool((s) => s.tool);
  const setTool = useEditTool((s) => s.set);
  const canUndo = useStore(useBookStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useBookStore.temporal, (s) => s.futureStates.length > 0);
  const [panel, setPanel] = useState<null | 'editions' | 'theme' | 'share'>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tool !== 'none') {
        setTool('none');
        return;
      }
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, setTool]);

  const phone = layout === 'phone';
  const open = (p: typeof panel) => {
    setMenu(false);
    setPanel(p);
  };

  return (
    <>
      <header className="edit-bar" aria-label="Editing">
        <div className="edit-bar__group">
          <button
            type="button"
            className="edit-bar__who"
            data-author={who ?? undefined}
            onClick={() => setWho(who === 'sonny' ? 'adi' : 'sonny')}
            title="Switch who is editing on this device"
          >
            {phone ? '' : 'Editing as '}
            <strong>{who ? AUTHORS[who].name : '—'}</strong>
          </button>
        </div>
        <div className="edit-bar__group edit-bar__center">
          <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo">
            ↶{phone ? '' : ' Undo'}
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo">
            {phone ? '' : 'Redo '}↷
          </button>
          {phone ? null : <SaveStatus />}
        </div>
        <div className="edit-bar__group edit-bar__end">
          <button type="button" aria-pressed={tool === 'note'} onClick={() => setTool(tool === 'note' ? 'none' : 'note')}>
            {tool === 'note' ? 'Tap a page…' : '+ Note'}
          </button>
          {phone ? (
            <button type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              More
            </button>
          ) : (
            <>
              <button type="button" onClick={() => open('editions')}>
                Editions
              </button>
              <button type="button" onClick={() => open('theme')}>
                Theme
              </button>
              <button type="button" onClick={() => open('share')}>
                Share
              </button>
              <button type="button" aria-pressed={showResolved} onClick={toggleResolved}>
                Resolved notes
              </button>
            </>
          )}
          <button type="button" className="edit-bar__done" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
        {menu ? (
          <div className="edit-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => open('editions')}>
              Editions
            </button>
            <button type="button" role="menuitem" onClick={() => open('theme')}>
              Theme
            </button>
            <button type="button" role="menuitem" onClick={() => open('share')}>
              Share the book
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={showResolved} onClick={toggleResolved}>
              Show resolved notes
            </button>
            <SaveStatus />
          </div>
        ) : null}
      </header>

      <ContactSheet current={current} layout={layout} onTurn={onTurn} />

      {panel === 'editions' ? <EditionsPanel onClose={() => setPanel(null)} /> : null}
      {panel === 'theme' ? <ThemePanel onClose={() => setPanel(null)} /> : null}
      {panel === 'share' ? (
        <Suspense fallback={null}>
          <SharePanel onClose={() => setPanel(null)} />
        </Suspense>
      ) : null}
      {!who ? <WhoDialog onPick={setWho} /> : null}
    </>
  );
}
