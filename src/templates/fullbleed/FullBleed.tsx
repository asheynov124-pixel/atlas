import { isSlotKind, stripHtml } from '@/book/slots';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Spread } from '@/reader/Spread';
import { useFigure, type SpreadCtx } from '@/reader/SpreadContext';
import { NotesLayer } from '@/editor/Notes';
import styles from './FullBleed.module.css';

export function FullBleedTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const image = isSlotKind(slots.image, 'image') ? slots.image : null;
  const caption = isSlotKind(slots.caption, 'text') ? slots.caption.html : '';
  return (
    <Spread ctx={ctx} label={`Plate: ${stripHtml(caption) || image?.placeholder || ''}`}>
      <div className={styles.root}>
        {image && <Plate slot={image} slotKey="image" className={styles.image} priority plain sizes="100vw" />}
        <Caption html={caption} />
        <NotesLayer side="bleed" />
        {ctx.ref.folio.right != null && (
          <div className={styles.folio} aria-hidden="true">
            {ctx.ref.folio.left}–{ctx.ref.folio.right}
          </div>
        )}
      </div>
    </Spread>
  );
}

function Caption({ html }: { html: string }) {
  const fig = useFigure('image');
  return (
    <figcaption className={[styles.tab, 't-caption'].join(' ')}>
      {fig && <span className="fig">Fig. {fig}</span>}
      <RichText as="span" html={html} slotKey="caption" placeholder="Caption" />
    </figcaption>
  );
}
