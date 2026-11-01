import type { CSSProperties } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import type { Item } from '@/book/types';
import { fmtDate, money, STATUS_LABEL } from '@/book/words';
import { ItemImage } from '@/reader/ItemImage';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import shared from '../shared.module.css';
import styles from './Decision.module.css';

export function DecisionTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const d = isSlotKind(slots.decision, 'decision') ? slots.decision : null;
  const options = (d?.optionIds ?? []).map((id) => ctx.book.items[id]).filter((i): i is Item => !!i);
  const chosen = d?.chosenId ? ctx.book.items[d.chosenId] : null;
  const cols = options.length <= 2 ? 2 : options.length <= 6 ? 3 : 4;

  return (
    <Spread ctx={ctx} label={`Decision: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Decision</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} editable={ctx.editable} placeholder="What is being decided" />
          </div>
        </header>
        {d && (
          <p className={[styles.status, 't-label'].join(' ')} data-status={d.status}>
            <span>Status <b>{STATUS_LABEL[d.status]}</b></span>
            {d.date && <span>Date <b>{fmtDate(d.date)}</b></span>}
            <span>Cost <b>{d.cost != null ? money(d.cost) : '—'}</b></span>
          </p>
        )}
        {chosen ? (
          <div className={styles.chosen}>
            <div className={styles.chosenImage}>
              <ItemImage item={chosen} size="full" sizes="(min-width: 820px) 40vw, 90vw" />
            </div>
            <p className={styles.chosenName}>
              <span>{chosen.name}</span>
              {chosen.price != null && <span className="t-label">{money(chosen.price, chosen.currency)}</span>}
            </p>
          </div>
        ) : (
          <div className={styles.undecided}>
            <p>{options.length ? `${options.length} options on the table. Nothing chosen yet.` : 'Nothing on the table yet.'}</p>
          </div>
        )}
        <RichText html={d?.why ? `<p>${d.why}</p>` : ''} className={[styles.why, 't-body'].join(' ')} editable={ctx.editable} placeholder="Why this one" />
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">Options considered</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{options.length}</p>
        </header>
        <ul className={styles.options} style={{ '--cols': cols } as CSSProperties}>
          {options.map((o, i) => (
            <li key={o.id} className={styles.option} data-chosen={o.id === d?.chosenId ? 'true' : 'false'}>
              <div className={styles.optionImage}>
                <ItemImage item={o} size="tiny" />
              </div>
              <p className={styles.optionName}>
                <span className="t-label">{String(i + 1).padStart(2, '0')}</span>
                <span>{o.name}</span>
                {o.id === d?.chosenId && <span className={[styles.mark, 't-label'].join(' ')}>· Chosen</span>}
              </p>
            </li>
          ))}
        </ul>
      </Page>
    </Spread>
  );
}
