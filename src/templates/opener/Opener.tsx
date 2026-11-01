import { isSlotKind } from '@/book/slots';
import { chapterLabel, quoted } from '@/book/words';
import { Plate } from '@/reader/Plate';
import { Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import { NotesLayer } from '@/editor/Notes';
import styles from './Opener.module.css';

export function OpenerTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { spread, chapter } = ctx.ref;
  const hero = isSlotKind(spread.slots.hero, 'image') ? spread.slots.hero : null;
  const numbered = chapter.number != null;

  return (
    <Spread ctx={ctx} label={`${chapterLabel(chapter.number, chapter.kicker)}: ${chapter.title}`}>
      <div className={styles.root}>
        {hero && <Plate slot={hero} slotKey="hero" className={styles.hero} priority drift plain sizes="100vw" />}
        <div className={styles.scrim} />
        <div className={[styles.numeral, 't-display'].join(' ')} data-word={numbered ? 'false' : 'true'} aria-hidden="true">
          {numbered ? chapter.number : chapter.kicker}
        </div>
        <div className={styles.block}>
          <p className={[styles.kicker, 't-label'].join(' ')}>
            {numbered ? `${chapterLabel(chapter.number, chapter.kicker)} · ${chapter.kicker}` : chapter.kicker}
          </p>
          <h2 className={[styles.title, 't-display'].join(' ')}>{chapter.title}</h2>
          <div className={styles.rule} />
          {chapter.epigraph && <p className={styles.epigraph}>{quoted(chapter.epigraph)}</p>}
        </div>
        <NotesLayer side="bleed" />
      </div>
    </Spread>
  );
}
