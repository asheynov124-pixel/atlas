import { isSlotKind, stripHtml } from '@/book/slots';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import styles from './Endpapers.module.css';

export function EndpapersTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const dedication = isSlotKind(slots.dedication, 'text') ? slots.dedication.html : '';
  return (
    <Spread ctx={ctx} label={`Dedication: ${stripHtml(dedication)}`}>
      <Page side="left" quiet className={[styles.page, styles.blank, 'endpaper'].join(' ')}>
        <div style={{ gridColumn: '1 / -1' }} />
      </Page>
      <Page side="right" quiet className={[styles.page, 'endpaper'].join(' ')}>
        <RichText as="p" html={dedication} slotKey="dedication" className={styles.dedication} placeholder="For…" multiline />
        <p className={[styles.ornament, 't-label'].join(' ')}>{ctx.book.address}</p>
      </Page>
    </Spread>
  );
}
