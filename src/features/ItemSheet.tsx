import type { Item } from '@/book/types';
import { patchItem, patchItemClean } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { Sheet, sheetStyles } from '@/editor/Sheet';
import controls from '@/editor/controls.module.css';
import { useEditSession } from '@/editor/session';
import { CleanFieldsEditor } from './CleanFieldsEditor';

/** Every field of an option: name, brand, price, link, tags, notes, and its Clean panel. */
export function ItemSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const item = useBookStore((s) => s.book.items[itemId]);
  const { change, end } = useEditSession();
  if (!item) return null;
  const set = (patch: Partial<Item>) => change(() => patchItem(item.id, patch));
  return (
    <Sheet title={item.name || 'Option'} onClose={onClose} testId="item-sheet">
      <div className={controls.fieldGrid}>
        <label className={controls.field}>
          <span className="t-label">Name</span>
          <input className={controls.input} value={item.name} onChange={(e) => set({ name: e.target.value })} onBlur={end} data-testid="item-name" />
        </label>
        <div className={controls.fieldRow}>
          <label className={controls.field}>
            <span className="t-label">Brand</span>
            <input className={controls.input} value={item.brand} onChange={(e) => set({ brand: e.target.value })} onBlur={end} />
          </label>
          <label className={controls.field}>
            <span className="t-label">Price (USD)</span>
            <input className={controls.number} type="number" inputMode="decimal" min={0} step="0.01" value={item.price ?? ''} onChange={(e) => set({ price: e.target.value === '' ? null : Number(e.target.value) })} onBlur={end} />
          </label>
        </div>
        <label className={controls.field}>
          <span className="t-label">Link</span>
          <input className={controls.input} type="url" value={item.url} placeholder="https://" onChange={(e) => set({ url: e.target.value })} onBlur={end} />
        </label>
        <label className={controls.field}>
          <span className="t-label">Tags, separated by commas</span>
          <input className={controls.input} value={item.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} onBlur={end} />
        </label>
        <label className={controls.field}>
          <span className="t-label">Placeholder label (until there is a photo)</span>
          <input className={controls.input} value={item.placeholder} onChange={(e) => set({ placeholder: e.target.value })} onBlur={end} />
        </label>
        <label className={controls.field}>
          <span className="t-label">Notes</span>
          <textarea className={controls.input} rows={3} value={item.notes} onChange={(e) => set({ notes: e.target.value })} onBlur={end} />
        </label>
        <CleanFieldsEditor value={item.clean} onChange={(patch) => change(() => patchItemClean(item.id, patch))} />
        <p className={sheetStyles.hint}>Hearts: {item.favorites.adi ? 'Adi' : ''}{item.favorites.adi && item.favorites.sonny ? ' and ' : ''}{item.favorites.sonny ? 'Sonny' : ''}{!item.favorites.adi && !item.favorites.sonny ? 'none yet' : ''}.</p>
      </div>
    </Sheet>
  );
}
