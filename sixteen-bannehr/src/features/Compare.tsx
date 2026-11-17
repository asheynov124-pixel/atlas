import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useBook } from '../store/book';
import { useMode } from '../store/prefs';
import { Picture } from '../templates/kit';
import { priceLabel, safeHref, hostOf, CLEAN_ROWS, cleanValueLabel, cleanChecked } from '../templates/items';
import { SpreadProvider } from '../reader/context';
import { useLayout } from '../store/book';
import { AUTHORS, type Author } from '../model/types';

export const MAX_COMPARE = 3;

export const useCompare = create<{ ids: string[]; open: boolean; toggle: (id: string) => void; clear: () => void; setOpen: (v: boolean) => void }>()(
  (set) => ({
    ids: [],
    open: false,
    toggle: (id) =>
      set((s) => {
        if (s.ids.includes(id)) {
          const ids = s.ids.filter((x) => x !== id);
          return { ids, open: ids.length >= 2 && s.open };
        }
        if (s.ids.length >= MAX_COMPARE) return s;
        const ids = [...s.ids, id];
        return { ids, open: ids.length >= 2 ? true : s.open };
      }),
    clear: () => set({ ids: [], open: false }),
    setOpen: (open) => set({ open }),
  }),
);

/** Up to three options side by side, in a drawer that rises from the foot of the page. */
export function CompareDrawer() {
  const { ids, open, toggle, clear, setOpen } = useCompare();
  const book = useBook();
  const { placed } = useLayout();
  const editing = useMode((s) => s.editing);
  const root = useRef<HTMLElement>(null);
  const items = ids.map((id) => book.items[id]).filter(Boolean);

  useEffect(() => {
    if (!open) return;
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!items.length) return null;

  // Pictures need a spread context for their tone; borrow the first spread that lists the item.
  const host = placed.find((p) => Object.values(p.spread.slots).some((s) => s.kind === 'items' && s.itemIds.includes(items[0].id))) ?? placed[0];

  if (!open) {
    return (
      <div className={['compare-tray', editing && 'compare-tray--edit'].filter(Boolean).join(' ')} role="status">
        <span className="compare-tray__text">
          {items.length === 1 ? `“${items[0].name}” chosen to compare. Pick one or two more.` : `${items.length} chosen to compare.`}
        </span>
        {items.length >= 2 ? (
          <button type="button" onClick={() => setOpen(true)}>
            Compare
          </button>
        ) : null}
        <button type="button" onClick={clear}>
          Clear
        </button>
      </div>
    );
  }

  return (
    <SpreadProvider value={{ placed: host, layout: 'spread', active: false, decorative: false }}>
      <aside className="compare" aria-label="Comparing options" tabIndex={-1} ref={root}>
        <header className="compare__head">
          <p className="sc">Side by side</p>
          <h2>Comparing {items.length}</h2>
          <span className="compare__actions">
            <button type="button" onClick={clear}>
              Clear
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </span>
        </header>
        <div className="compare__cols" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, ['--n' as string]: items.length }}>
          {items.map((it) => {
            const href = safeHref(it.url);
            const lovers = (Object.keys(AUTHORS) as Author[]).filter((a) => it.favorites[a]);
            return (
              <article key={it.id} className="compare__col">
                <div className="compare__img">
                  <Picture assetId={it.assetId} focal={it.focal} label={it.label} alt={it.name} slip="bl" />
                </div>
                <h3 className="compare__name">{it.name}</h3>
                <dl className="compare__facts">
                  <div>
                    <dt className="sc">Maker</dt>
                    <dd>{it.brand || '—'}</dd>
                  </div>
                  <div>
                    <dt className="sc">Price</dt>
                    <dd>{priceLabel(it) || '—'}</dd>
                  </div>
                  <div>
                    <dt className="sc">Loved by</dt>
                    <dd className="compare__loved">
                      {lovers.length
                        ? lovers.map((a) => (
                            <span key={a} data-author={a}>
                              {AUTHORS[a].name} ♥
                            </span>
                          ))
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="sc">Tags</dt>
                    <dd>{it.tags.length ? it.tags.join(', ') : '—'}</dd>
                  </div>
                  <div>
                    <dt className="sc">Clean</dt>
                    <dd>
                      {cleanChecked(it.clean)
                        ? CLEAN_ROWS.map((r) => cleanValueLabel(r.key, it.clean[r.key])).filter(Boolean).join(' · ')
                        : 'Not yet checked'}
                    </dd>
                  </div>
                  {href ? (
                    <div>
                      <dt className="sc">Link</dt>
                      <dd>
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {hostOf(href)} ↗
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <button type="button" className="compare__remove" onClick={() => toggle(it.id)}>
                  Remove from comparison
                </button>
              </article>
            );
          })}
        </div>
      </aside>
    </SpreadProvider>
  );
}
