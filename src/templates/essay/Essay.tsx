import { isSlotKind, stripHtml } from '@/book/slots';
import { sentenceCase } from '@/book/words';
import { chapterLabel } from '@/book/words';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import { useFigure, type SpreadCtx } from '@/reader/SpreadContext';
import styles from './Essay.module.css';

export function EssayTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { spread, chapter } = ctx.ref;
  const title = isSlotKind(spread.slots.title, 'text') ? spread.slots.title.html : '';
  const body = isSlotKind(spread.slots.body, 'text') ? spread.slots.body.html : '';
  const quote = isSlotKind(spread.slots.quote, 'text') ? spread.slots.quote.html : '';
  const aside = isSlotKind(spread.slots.aside, 'image') ? spread.slots.aside : null;
  const label = chapterLabel(chapter.number, chapter.kicker);

  return (
    <Spread ctx={ctx} label={`Essay: ${stripHtml(title) || chapter.title}`}>
      <Page side="left">
        <header className={styles.head}>
          <p className={[styles.kicker, 't-label'].join(' ')}>{label}</p>
          <RichText as="h2" html={title} slotKey="title" className={[styles.title, 't-display'].join(' ')} placeholder="Title" />
          <hr className={['hairline', styles.rule].join(' ')} />
        </header>
        <RichText html={body} slotKey="body" kind="rich" className={[styles.body, 't-body', 't-dropcap'].join(' ')} placeholder="Write the essay…" />
      </Page>
      <Page side="right" className={styles.right}>
        <RichText as="blockquote" html={quote} slotKey="quote" className={styles.quote} placeholder="A pull quote" multiline />
        {aside && <Aside slot={aside} />}
      </Page>
    </Spread>
  );
}

function Aside({ slot }: { slot: NonNullable<ReturnType<typeof pickImage>> }) {
  const fig = useFigure('aside');
  return (
    <figure className={styles.aside}>
      <div className={styles.asidePlate}>
        <Plate slot={slot} slotKey="aside" fig={fig} size="small" sizes="(min-width: 820px) 28vw, 70vw" />
      </div>
      {(slot.caption || fig) && (
        <figcaption className={['t-caption', styles.caption].join(' ')}>
          {fig && <span className="fig">Fig. {fig}</span>}
          <span>{slot.caption || sentenceCase(slot.placeholder)}</span>
        </figcaption>
      )}
    </figure>
  );
}

function pickImage(s: unknown) {
  return isSlotKind(s as never, 'image') ? (s as import('@/book/types').ImageSlot) : null;
}
