import { isSlotKind, stripHtml } from '@/book/slots';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import styles from './Cover.module.css';

export function CoverTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const hero = isSlotKind(slots.hero, 'image') ? slots.hero : null;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const subtitle = isSlotKind(slots.subtitle, 'text') ? slots.subtitle.html : '';
  const address = isSlotKind(slots.address, 'text') ? slots.address.html : '';

  return (
    <Spread ctx={ctx} label={`Cover: ${stripHtml(title)}`}>
      <div className={styles.root}>
        {hero && <Plate slot={hero} className={styles.hero} priority plain sizes="100vw" />}
        <div className={styles.scrim} />
        <div className={styles.frame} />
        <p className={[styles.mark, 't-label'].join(' ')}>A book in progress</p>
        <div className={styles.block}>
          <RichText as="h1" html={title} className={[styles.title, 't-display'].join(' ')} />
          <RichText as="p" html={subtitle} className={styles.subtitle} />
        </div>
        <RichText as="p" html={address} className={[styles.address, 't-label'].join(' ')} />
      </div>
    </Spread>
  );
}
