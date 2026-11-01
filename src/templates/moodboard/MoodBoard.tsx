import { isSlotKind, stripHtml } from '@/book/slots';
import type { BoardEl } from '@/book/types';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Page, Span, Spread } from '@/reader/Spread';
import type { SpreadCtx } from '@/reader/SpreadContext';
import styles from './MoodBoard.module.css';

export function MoodBoardTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const board = isSlotKind(slots.board, 'board') ? slots.board : null;
  const els = [...(board?.elements ?? [])].sort((a, b) => a.z - b.z);

  return (
    <Spread ctx={ctx} label={`Mood board: ${stripHtml(title)}`}>
      <Page side="left">
        <div style={{ gridColumn: '1 / -1' }} />
      </Page>
      <Page side="right">
        <div style={{ gridColumn: '1 / -1' }} />
      </Page>
      <Span>
        <p className={[styles.title, 't-label'].join(' ')}>
          <span>Mood board</span>
          <RichText as="span" html={title} slotKey="title" placeholder="Title" />
        </p>
        <div className={styles.board} data-testid="moodboard">
          {els.map((el) => (
            <BoardElement key={el.id} el={el} />
          ))}
        </div>
      </Span>
    </Spread>
  );
}

export function BoardElement({ el }: { el: BoardEl }) {
  const style = {
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    transform: `rotate(${el.rotation}deg)`,
    zIndex: el.z,
  };
  switch (el.type) {
    case 'image':
      return (
        <div className={[styles.el, styles.image].join(' ')} style={style}>
          <Plate
            slot={{ kind: 'image', assetId: el.assetId ?? null, focal: { x: 0.5, y: 0.5 }, caption: '', alt: el.placeholder ?? '', credit: '', placeholder: el.placeholder ?? 'Image' }}
            size="small"
            sizes="(min-width: 820px) 35vw, 60vw"
          />
        </div>
      );
    case 'swatch':
      return (
        <div className={[styles.el, styles.swatch].join(' ')} style={{ ...style, background: el.color }}>
          <span className={[styles.swatchHex, 't-label'].join(' ')}>{(el.color ?? '').replace('#', '').toUpperCase()}</span>
        </div>
      );
    case 'text':
      return (
        <p className={[styles.el, styles.text].join(' ')} style={style}>
          {el.text}
        </p>
      );
    case 'note':
      return (
        <div className={[styles.el, styles.note].join(' ')} style={style} data-author={el.author}>
          {el.text}
          {el.author && <span className={styles.noteAuthor}>{el.author === 'sonny' ? 'Sonny' : 'Adi'}</span>}
        </div>
      );
  }
}
