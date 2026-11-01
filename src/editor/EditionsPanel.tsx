import { useEffect, useState } from 'react';
import type { EditionMeta } from '@/book/types';
import { fmtDate } from '@/book/words';
import { migrateBook } from '@/book/migrate';
import { replaceBook } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { useUiStore } from '@/state/uiStore';
import { getStorage } from '@/storage';
import { Sheet, sheetStyles } from './Sheet';
import styles from './Panels.module.css';

/** Named snapshots of the whole book, restorable (and undoable). */
export function EditionsPanel() {
  const setPanel = useUiStore((s) => s.setPanel);
  const [list, setList] = useState<EditionMeta[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => setList(await getStorage().listEditions());
  useEffect(() => {
    void refresh();
  }, []);

  const save = async () => {
    const n = name.trim() || `Edition of ${fmtDate(new Date().toISOString().slice(0, 10))}`;
    setBusy(true);
    await getStorage().saveEdition(n, useBookStore.getState().book);
    setName('');
    setBusy(false);
    await refresh();
  };
  const restore = async (id: string) => {
    const book = await getStorage().loadEdition(id);
    if (book) replaceBook(migrateBook(book));
    setPanel(null);
  };
  const remove = async (id: string) => {
    await getStorage().deleteEdition(id);
    await refresh();
  };

  return (
    <Sheet title="Editions" onClose={() => setPanel(null)} testId="editions-panel">
      <p className={sheetStyles.hint}>An edition is the whole book as it is right now, kept under a name. Restoring one is an edit, so it can be undone.</p>
      <form
        className={sheetStyles.row}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input className={sheetStyles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this edition" aria-label="Edition name" data-testid="edition-name" />
        <button type="submit" className={sheetStyles.button} data-primary="true" disabled={busy} data-testid="save-edition">Save</button>
      </form>
      <div>
        {list.length === 0 && <p className={sheetStyles.hint}>No editions yet.</p>}
        {list.map((e) => (
          <div key={e.id} className={styles.edition} data-edition={e.id}>
            <span>
              <span className={styles.editionName}>{e.name}</span>
              <span className={styles.editionMeta}>{fmtDate(e.createdAt.slice(0, 10))} · {e.spreadCount} spreads</span>
            </span>
            <button type="button" className={sheetStyles.button} onClick={() => void restore(e.id)} data-testid="restore-edition">Restore</button>
            <button type="button" className={sheetStyles.button} data-quiet="true" onClick={() => void remove(e.id)} aria-label={`Delete ${e.name}`}>Delete</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
