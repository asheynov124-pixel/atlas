import { useEffect, useMemo, useRef, useState } from 'react';
import { flattenSpreads } from '@/book/pagination';
import { chapterLabel } from '@/book/words';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { useIsDesktop } from './useMedia';
import { EditBar } from '@/editor/EditBar';
import { navigate } from './router';
import styles from './Chrome.module.css';

function Icon({ name }: { name: 'moon' | 'sun' | 'contents' | 'edit' | 'more' | 'read' }) {
  switch (name) {
    case 'moon':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>;
    case 'sun':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'contents':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" /></svg>;
    case 'edit':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 6.5l3 3" /></svg>;
    case 'read':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>;
    case 'more':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
}

/** The reading chrome. Always on at the top on a desk; on a phone it appears after a tap. */
export function Chrome() {
  const book = useBookStore((s) => s.book);
  const spreadIndex = useUiStore((s) => s.spreadIndex);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const author = useUiStore((s) => s.author);
  const openAuthorPrompt = useUiStore((s) => s.openAuthorPrompt);
  const chromeVisible = useUiStore((s) => s.chromeVisible);
  const isDesktop = useIsDesktop();
  const spreads = useMemo(() => flattenSpreads(book), [book]);
  const ref = spreads[spreadIndex] ?? spreads[0];
  const visible = isDesktop || chromeVisible || mode === 'edit';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const on = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', on);
    return () => window.removeEventListener('pointerdown', on);
  }, [menuOpen]);

  const folio =
    ref.folio.left != null || ref.folio.right != null
      ? `${ref.folio.left ?? ''}${ref.folio.left != null && ref.folio.right != null ? '–' : ''}${ref.folio.right ?? ''}`
      : '';

  const contentsIndex = spreads.findIndex((s) => s.spread.template === 'contents');

  const nightButton = (
    <button className={styles.button} onClick={() => setTheme(theme === 'night' ? 'day' : 'night')} aria-pressed={theme === 'night'} aria-label={theme === 'night' ? 'Switch to day' : 'Switch to night'}>
      <Icon name={theme === 'night' ? 'sun' : 'moon'} />
      <span>{theme === 'night' ? 'Day' : 'Night'}</span>
    </button>
  );
  const contentsButton = (
    <button className={styles.button} onClick={() => contentsIndex >= 0 && navigate({ kind: 'spread', id: spreads[contentsIndex].spread.id, index: null })} aria-label="Go to contents">
      <Icon name="contents" />
      <span>Contents</span>
    </button>
  );
  const toggleMode = () => {
    if (mode === 'edit') setMode('read');
    else if (!author) openAuthorPrompt('edit');
    else setMode('edit');
  };
  const editButton = (
    <button className={styles.button} onClick={toggleMode} aria-pressed={mode === 'edit'} data-testid="mode-toggle">
      <Icon name={mode === 'edit' ? 'read' : 'edit'} />
      <span>{mode === 'edit' ? 'Done' : 'Edit'}</span>
    </button>
  );
  const menu = (
    <div className={styles.menu} ref={menuRef}>
      <button className={styles.button} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="More">
        <Icon name="more" />
      </button>
      {menuOpen && (
        <div className={styles.menuList} role="menu">
          <button className={styles.button} role="menuitem" onClick={() => { setMenuOpen(false); useUiStore.getState().setPanel('transfer'); }} data-testid="menu-transfer">Share / export</button>
          <a className={styles.button} role="menuitem" href="#/print" onClick={() => setMenuOpen(false)}>Print the book</a>
          <a className={styles.button} role="menuitem" href="#/specimen" onClick={() => setMenuOpen(false)}>Type specimen</a>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className={[styles.bar, styles.top].join(' ')} data-visible={visible ? 'true' : 'false'}>
        <div className={styles.where} aria-live="polite">
          <b>{book.title}</b>
          {!ref.chapter.hidden && <span>{chapterLabel(ref.chapter.number, ref.chapter.kicker)}</span>}
          {!ref.chapter.hidden && <span>{ref.chapter.title}</span>}
          {folio && <span>{folio}</span>}
        </div>
        {isDesktop && (
          <div className={styles.group}>
            {mode === 'edit' ? <EditBar /> : contentsButton}
            {mode !== 'edit' && nightButton}
            {editButton}
            {mode !== 'edit' && menu}
          </div>
        )}
      </div>
      {!isDesktop && (
        <div className={[styles.bar, styles.bottom].join(' ')} data-visible={visible ? 'true' : 'false'} data-edit={mode === 'edit' ? 'true' : 'false'}>
          <div className={styles.group}>
            {mode === 'edit' ? <EditBar /> : contentsButton}
            {mode !== 'edit' && nightButton}
            {editButton}
            {mode !== 'edit' && menu}
          </div>
        </div>
      )}
    </>
  );
}
