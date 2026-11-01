import { useMemo } from 'react';
import { stripHtml } from '@/book/slots';
import type { Book, Chapter, DecisionSlot, ShoppingRow, Spread as SpreadT } from '@/book/types';
import { chapterLabel, money, STATUS_LABEL } from '@/book/words';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import shared from '../shared.module.css';
import styles from './StillToDecide.module.css';

export interface OpenDecision {
  chapter: Chapter;
  spread: SpreadT;
  title: string;
  slot: DecisionSlot;
}

export interface OpenRow {
  chapter: Chapter;
  spread: SpreadT;
  row: ShoppingRow;
}

/** Everything still open, gathered from every Decision and Shopping spread. */
export function collectOpen(book: Book) {
  const decisions: OpenDecision[] = [];
  const rows: OpenRow[] = [];
  for (const chapter of book.chapters) {
    for (const spread of chapter.spreads) {
      for (const [key, slot] of Object.entries(spread.slots)) {
        if (slot.kind === 'decision' && slot.status === 'thinking') {
          const t = spread.slots.title;
          decisions.push({ chapter, spread, slot, title: t?.kind === 'text' ? stripHtml(t.html) : key });
        }
        if (slot.kind === 'shopping') {
          for (const row of slot.rows) if (row.status === 'needed') rows.push({ chapter, spread, row });
        }
      }
    }
  }
  return { decisions, rows };
}

export function StillToDecideTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { decisions, rows } = useMemo(() => collectOpen(ctx.book), [ctx.book]);
  const priced = rows.filter((r) => r.row.price != null);
  const total = priced.reduce((n, r) => n + (r.row.price ?? 0), 0);
  const grouped = rows.reduce<Map<string, OpenRow[]>>((m, r) => {
    const list = m.get(r.chapter.id) ?? [];
    list.push(r);
    m.set(r.chapter.id, list);
    return m;
  }, new Map());

  return (
    <Spread ctx={ctx} label="Still to decide">
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Epilogue</p>
            <h2 className={[shared.headTitle, 't-display'].join(' ')}>Still to Decide</h2>
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{decisions.length} open</p>
        </header>
        {decisions.length === 0 ? (
          <p className={styles.done}>Every decision in the book has been made. Imagine that.</p>
        ) : (
          <ul className={styles.list}>
            {decisions.map((d) => (
              <li key={d.spread.id}>
                <a className={styles.row} href={`#/s/${encodeURIComponent(d.spread.id)}`}>
                  <span className={styles.name}>{d.title || 'Untitled decision'}</span>
                  <span className={[styles.right, 't-label'].join(' ')}>{STATUS_LABEL[d.slot.status]} · {d.slot.optionIds.length} options</span>
                  <span className={[styles.where, 't-label'].join(' ')}>{chapterLabel(d.chapter.number, d.chapter.kicker)} · {d.chapter.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">Still to buy</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{rows.length} {rows.length === 1 ? 'item' : 'items'}</p>
        </header>
        {rows.length === 0 ? (
          <p className={styles.done}>Nothing left to order.</p>
        ) : (
          [...grouped.entries()].map(([chapterId, list]) => (
            <div key={chapterId} style={{ gridColumn: '1 / -1', display: 'contents' }}>
              <p className={[styles.group, 't-label'].join(' ')}>{list[0].chapter.title}</p>
              <ul className={styles.list}>
                {list.map(({ row, spread }) => (
                  <li key={row.id}>
                    <a className={styles.row} href={`#/s/${encodeURIComponent(spread.id)}`}>
                      <span className={styles.name}>{row.name}</span>
                      <span className={styles.right}>{row.price != null ? money(row.price) : '—'}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <div className={styles.total}>
          <span className="t-label">{priced.length ? 'Priced so far' : 'No prices yet'}</span>
          <span className={[styles.totalNum, 't-display'].join(' ')}>{priced.length ? money(total) : '—'}</span>
        </div>
      </Page>
    </Spread>
  );
}
