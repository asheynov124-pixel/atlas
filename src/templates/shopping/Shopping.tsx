import { isSlotKind, stripHtml } from '@/book/slots';
import type { ShoppingRow, ShoppingStatus } from '@/book/types';
import { money, STATUS_LABEL } from '@/book/words';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import { addShoppingRow, patchShoppingRow, removeShoppingRow } from '@/state/actions';
import { InlineText } from '@/editor/EditableText';
import controls from '@/editor/controls.module.css';
import shared from '../shared.module.css';
import styles from './Shopping.module.css';

const STATUSES: ShoppingStatus[] = ['needed', 'ordered', 'received', 'installed'];

export function shoppingTotals(rows: ShoppingRow[]) {
  const priced = rows.filter((r) => r.price != null);
  const total = priced.reduce((n, r) => n + (r.price ?? 0), 0);
  const ordered = rows.filter((r) => r.status !== 'needed');
  const orderedTotal = ordered.reduce((n, r) => n + (r.price ?? 0), 0);
  return { total, priced: priced.length, unpriced: rows.length - priced.length, ordered: ordered.length, orderedTotal, needed: rows.length - ordered.length };
}

export function ShoppingTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const spreadId = ctx.ref.spread.id;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const rows = isSlotKind(slots.shopping, 'shopping') ? slots.shopping.rows : [];
  const t = shoppingTotals(rows);
  const edit = ctx.editable;

  return (
    <Spread ctx={ctx} label={`Shopping list: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Shopping list</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} slotKey="title" placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{rows.length} {rows.length === 1 ? 'item' : 'items'}</p>
        </header>
        {rows.length === 0 && !edit ? (
          <p className={styles.empty}>Nothing on the list yet.</p>
        ) : (
          <table className={styles.table} data-no-swipe={edit ? 'true' : undefined}>
            <thead>
              <tr>
                <th className="t-label">Item</th>
                <th className="t-label">Status</th>
                <th className={['t-label', styles.retailerCol].join(' ')}>Retailer</th>
                <th className="t-label">Price</th>
                {edit && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-row-id={r.id}>
                  <td>
                    {edit ? (
                      <>
                        <InlineText spreadId={spreadId} slotKey={`row:${r.id}:name`} html={r.name} placeholder="Item" onCommit={(html) => patchShoppingRow(spreadId, 'shopping', r.id, { name: stripHtml(html) })} />
                        <InlineText spreadId={spreadId} slotKey={`row:${r.id}:note`} html={r.note} className={styles.note} placeholder="A note" onCommit={(html) => patchShoppingRow(spreadId, 'shopping', r.id, { note: stripHtml(html) })} />
                      </>
                    ) : (
                      <>
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}
                        {r.note && <span className={styles.note}>{r.note}</span>}
                      </>
                    )}
                  </td>
                  <td className={styles.statusCell}>
                    {edit ? (
                      <select className={[controls.select, controls.small].join(' ')} value={r.status} onChange={(e) => patchShoppingRow(spreadId, 'shopping', r.id, { status: e.target.value as ShoppingStatus })} aria-label="Status" data-testid="row-status">
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={[styles.status, 't-label'].join(' ')} data-status={r.status}>{STATUS_LABEL[r.status]}</span>
                    )}
                  </td>
                  <td className={[styles.retailer, styles.retailerCol].join(' ')}>
                    {edit ? (
                      <InlineText spreadId={spreadId} slotKey={`row:${r.id}:retailer`} html={r.retailer} placeholder="Retailer" onCommit={(html) => patchShoppingRow(spreadId, 'shopping', r.id, { retailer: stripHtml(html) })} />
                    ) : (
                      r.retailer
                    )}
                  </td>
                  <td className={styles.num}>
                    {edit ? (
                      <input className={controls.number} type="number" inputMode="decimal" min={0} step="0.01" value={r.price ?? ''} placeholder="—" aria-label="Price" onChange={(e) => patchShoppingRow(spreadId, 'shopping', r.id, { price: e.target.value === '' ? null : Number(e.target.value) })} data-testid="row-price" />
                    ) : r.price != null ? (
                      money(r.price)
                    ) : (
                      '—'
                    )}
                  </td>
                  {edit && (
                    <td className={styles.num}>
                      <button
                        type="button"
                        className={controls.iconButton}
                        onClick={() => {
                          const url = window.prompt('Link for this item', r.url || 'https://');
                          if (url !== null) patchShoppingRow(spreadId, 'shopping', r.id, { url: url === 'https://' ? '' : url });
                        }}
                        aria-label="Set link"
                        title={r.url || 'Set link'}
                        data-on={r.url ? 'true' : 'false'}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
                      </button>
                      <button type="button" className={controls.iconButton} onClick={() => removeShoppingRow(spreadId, 'shopping', r.id)} aria-label={`Remove ${r.name}`} title="Remove">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {edit && (
          <p style={{ gridColumn: '1 / -1', marginTop: '1cqw' }}>
            <button type="button" className={controls.ghost} onClick={() => addShoppingRow(spreadId, 'shopping', '')} data-testid="row-add">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add an item
            </button>
          </p>
        )}
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">Running total</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{ctx.ref.chapter.title}</p>
        </header>
        <div className={styles.counts}>
          <div className={styles.count}><b>{t.needed}</b><span className="t-label">Still to buy</span></div>
          <div className={styles.count}><b>{t.ordered}</b><span className="t-label">Ordered or in</span></div>
          <div className={styles.count}><b>{t.unpriced}</b><span className="t-label">Unpriced</span></div>
        </div>
        <div className={styles.total}>
          <p className={[styles.totalNum, 't-display'].join(' ')} data-testid="shopping-total">{t.priced ? money(t.total) : '—'}</p>
          <p className={[styles.totalMeta, 't-label'].join(' ')}>
            <span>{t.priced ? `${t.priced} priced ${t.priced === 1 ? 'item' : 'items'}` : 'No prices yet'}</span>
            {t.priced > 0 && <span>{money(t.orderedTotal)} committed</span>}
          </p>
        </div>
      </Page>
    </Spread>
  );
}
