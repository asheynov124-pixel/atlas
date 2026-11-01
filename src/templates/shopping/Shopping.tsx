import { isSlotKind, stripHtml } from '@/book/slots';
import type { ShoppingRow } from '@/book/types';
import { money, STATUS_LABEL } from '@/book/words';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import shared from '../shared.module.css';
import styles from './Shopping.module.css';

export function shoppingTotals(rows: ShoppingRow[]) {
  const priced = rows.filter((r) => r.price != null);
  const total = priced.reduce((n, r) => n + (r.price ?? 0), 0);
  const ordered = rows.filter((r) => r.status !== 'needed');
  const orderedTotal = ordered.reduce((n, r) => n + (r.price ?? 0), 0);
  return { total, priced: priced.length, unpriced: rows.length - priced.length, ordered: ordered.length, orderedTotal, needed: rows.length - ordered.length };
}

export function ShoppingTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const rows = isSlotKind(slots.shopping, 'shopping') ? slots.shopping.rows : [];
  const t = shoppingTotals(rows);

  return (
    <Spread ctx={ctx} label={`Shopping list: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Shopping list</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} editable={ctx.editable} placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{rows.length} {rows.length === 1 ? 'item' : 'items'}</p>
        </header>
        {rows.length === 0 ? (
          <p className={styles.empty}>Nothing on the list yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className="t-label">Item</th>
                <th className="t-label">Status</th>
                <th className={['t-label', styles.retailerCol].join(' ')}>Retailer</th>
                <th className="t-label">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-row-id={r.id}>
                  <td>
                    {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}
                    {r.note && <span className={styles.note}>{r.note}</span>}
                  </td>
                  <td className={styles.statusCell}>
                    <span className={[styles.status, 't-label'].join(' ')} data-status={r.status}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className={[styles.retailer, styles.retailerCol].join(' ')}>{r.retailer}</td>
                  <td className={styles.num}>{r.price != null ? money(r.price) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <p className={[styles.totalNum, 't-display'].join(' ')}>{t.priced ? money(t.total) : '—'}</p>
          <p className={[styles.totalMeta, 't-label'].join(' ')}>
            <span>{t.priced ? `${t.priced} priced ${t.priced === 1 ? 'item' : 'items'}` : 'No prices yet'}</span>
            {t.priced > 0 && <span>{money(t.orderedTotal)} committed</span>}
          </p>
        </div>
      </Page>
    </Spread>
  );
}
