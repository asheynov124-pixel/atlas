import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getBook, mutate, replaceBook, useBook } from '../store/book';
import { usePrefs } from '../store/prefs';
import { repository } from '../storage/dexie';
import { migrate } from '../model/migrate';
import { DEFAULT_THEME } from '../model/seed';
import { uid } from '../model/templates';
import { AUTHORS, type EditionSummary, type ThemeColors } from '../model/types';

export function Sheet({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div className="side-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={root}>
        <header className="side-sheet__head">
          <p className="sc">{kicker}</p>
          <h2>{title}</h2>
          <button type="button" className="side-sheet__close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="side-sheet__body">{children}</div>
      </div>
    </>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Editions: named snapshots of the whole book that can be restored. */
export function EditionsPanel({ onClose }: { onClose: () => void }) {
  const who = usePrefs((s) => s.who);
  const [list, setList] = useState<EditionSummary[] | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const refresh = () => repository().listEditions().then(setList);
  useEffect(() => {
    void refresh();
  }, []);

  const save = async () => {
    const label = name.trim() || `Edition of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    await repository().saveEdition({ id: uid('ed'), name: label, author: who, createdAt: new Date().toISOString(), book: getBook() });
    setName('');
    setMessage(`Saved “${label}”.`);
    void refresh();
  };

  const restore = async (id: string) => {
    const e = await repository().getEdition(id);
    if (!e) return;
    replaceBook(migrate(e.book), { undoable: true });
    setMessage(`Restored “${e.name}”. Undo brings back what was here before.`);
  };

  return (
    <Sheet title="Editions" kicker="Snapshots of the book" onClose={onClose}>
      <form
        className="form-row"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span className="sc">Name this edition</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Before the kitchen tile" />
        </label>
        <button type="submit" className="btn btn--primary">
          Save an edition
        </button>
      </form>
      {message ? (
        <p className="sheet-note" role="status">
          {message}
        </p>
      ) : null}
      <ol className="editions">
        {list === null ? <li className="editions__empty">Opening…</li> : null}
        {list?.length === 0 ? <li className="editions__empty">No editions yet. Save one before a big change.</li> : null}
        {list?.map((e) => (
          <li key={e.id} className="editions__row">
            <span className="editions__name">{e.name}</span>
            <span className="editions__meta">
              {when(e.createdAt)}
              {e.author ? ` · ${AUTHORS[e.author].name}` : ''}
            </span>
            <span className="editions__actions">
              <button type="button" className="btn" onClick={() => void restore(e.id)}>
                Restore
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={async () => {
                  await repository().deleteEdition(e.id);
                  void refresh();
                }}
                aria-label={`Delete edition ${e.name}`}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

const NAMES: Record<keyof ThemeColors, string> = {
  paper: 'Paper',
  ink: 'Ink',
  muted: 'Muted ink',
  sage: 'Sage',
  olive: 'Olive',
  oak: 'Oak',
  clay: 'Clay',
  hairline: 'Hairline',
};

/** A colour well that commits once, when the picker closes, not on every drag. */
function ColorWell({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = value;
    const onChange = () => el.value.toLowerCase() !== value.toLowerCase() && onCommit(el.value.toUpperCase());
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [value, onCommit]);
  return (
    <label className="well">
      <input ref={ref} type="color" defaultValue={value} aria-label={label} />
      <span className="well__name">{label}</span>
      <span className="well__hex sc">{value.toUpperCase()}</span>
    </label>
  );
}

/** The book's colours are data: change them here, for day and for night. */
export function ThemePanel({ onClose }: { onClose: () => void }) {
  const theme = useBook().theme;
  const setColor = (mode: 'day' | 'night', key: keyof ThemeColors, v: string) =>
    mutate((b) => {
      b.theme[mode][key] = v;
    });
  return (
    <Sheet title="Theme" kicker="The colours of the book" onClose={onClose}>
      {(['day', 'night'] as const).map((mode) => (
        <section key={mode} className="theme-set">
          <h3 className="sc">{mode === 'day' ? 'By day' : 'At night'}</h3>
          <div className="wells">
            {(Object.keys(NAMES) as (keyof ThemeColors)[]).map((k) => (
              <ColorWell key={k} value={theme[mode][k]} label={NAMES[k]} onCommit={(v) => setColor(mode, k, v)} />
            ))}
          </div>
        </section>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          mutate((b) => {
            b.theme = structuredClone(DEFAULT_THEME);
          })
        }
      >
        Back to the house colours
      </button>
    </Sheet>
  );
}
