import { useMemo } from 'react';
import { contentsEntries, flattenSpreads } from '@/book/pagination';
import { isSlotKind } from '@/book/slots';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import styles from './Contents.module.css';

export function ContentsTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { book } = ctx;
  const title = isSlotKind(ctx.ref.spread.slots.title, 'text') ? ctx.ref.spread.slots.title.html : 'Contents';
  const entries = useMemo(() => contentsEntries(book, flattenSpreads(book)), [book]);
  const split = Math.ceil(entries.length / 2);
  const left = entries.slice(0, split);
  const right = entries.slice(split);

  const List = ({ items, continued }: { items: typeof entries; continued?: boolean }) => (
    <ol className={styles.list} data-continued={continued ? 'true' : 'false'}>
      {items.map(({ chapter, spreadId, page }) => (
        <li key={chapter.id} className={`accent-${chapter.accent}`}>
          <a className={styles.row} href={`#/s/${encodeURIComponent(spreadId)}`} data-testid="contents-entry">
            <span className={styles.num} data-word={chapter.number == null ? 'true' : 'false'}>
              {chapter.number ?? chapter.kicker}
            </span>
            <span>
              <span className={styles.name}>{chapter.title}</span>
              {chapter.number != null && chapter.kicker && <span className={[styles.kicker, 't-label'].join(' ')}>{chapter.kicker}</span>}
            </span>
            <span className={styles.page}>{page ?? ''}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <Spread ctx={ctx} label="Contents">
      <Page side="left">
        <RichText as="h2" html={title} slotKey="title" className={[styles.title, 't-display'].join(' ')} />
        <List items={left} />
      </Page>
      <Page side="right">
        <List items={right} continued />
        <p className={[styles.note, 't-caption'].join(' ')}>Tap a chapter to turn to it. Page numbers count from this page.</p>
      </Page>
    </Spread>
  );
}
