import { lazy, Suspense, type CSSProperties } from 'react';
import { Editable, Page, Picture, Span } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText } from '../store/book';
import { AUTHORS, type BoardEl, type BoardSlot, type TextSlot } from '../model/types';

const BoardEditor = lazy(() => import('../features/BoardEditor'));

const DESCRIBE: Record<BoardEl['type'], string> = { image: 'Photo', swatch: 'Swatch', text: 'Words', note: 'Note' };

export function BoardElement({ el, focusable }: { el: BoardEl; focusable?: boolean }) {
  const style = {
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: el.z,
    '--rot': `${el.rotate}deg`,
  } as CSSProperties;
  const focus = focusable
    ? { tabIndex: 0, role: 'button', 'aria-label': `${DESCRIBE[el.type]}: ${el.label || el.text || ''}. Arrow keys move it.` }
    : {};
  switch (el.type) {
    case 'image':
      return (
        <div className="bel bel--image" style={style} data-el={el.id} {...focus}>
          <div className="bel__print">
            <Picture assetId={el.assetId ?? null} focal={el.focal} label={el.label ?? ''} alt={el.label ?? ''} slip="bl" />
          </div>
        </div>
      );
    case 'swatch':
      return (
        <div className="bel bel--swatch" style={{ ...style, '--chip': el.hex } as CSSProperties} data-el={el.id} {...focus}>
          <span className="bel__chip" aria-hidden="true" />
          <span className="bel__chip-name sc">{el.label}</span>
        </div>
      );
    case 'text':
      return (
        <div className="bel bel--text" style={style} data-el={el.id} {...focus}>
          <p>{el.text}</p>
        </div>
      );
    case 'note':
      return (
        <div className="bel bel--note" style={style} data-el={el.id} data-author={el.author ?? 'adi'} {...focus}>
          <p>{el.text}</p>
          {el.author ? <span className="bel__by">— {AUTHORS[el.author].initial}.</span> : null}
        </div>
      );
  }
}

/** A free canvas laid across the spread: prints, paint chips, a line of type, notes. */
export function MoodBoard() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const { spread } = placed;
  const board = spread.slots.board as BoardSlot;
  const title = (spread.slots.title as TextSlot | undefined)?.html ?? '';
  const sorted = [...board.elements].sort((a, b) => a.z - b.z);

  const canvas = editing ? (
    <Suspense fallback={<div className="board__canvas">{sorted.map((el) => <BoardElement key={el.id} el={el} />)}</div>}>
      <BoardEditor spreadId={spread.id} elements={sorted} />
    </Suspense>
  ) : (
    <div className="board__canvas" role="group" aria-label="Mood board">
      {sorted.map((el) => (
        <BoardElement key={el.id} el={el} />
      ))}
    </div>
  );

  const head = (
    <div className="board__head">
      <span className="sc board__kicker">Mood board</span>
      <Editable as="h2" single className="board__title" html={title} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="Title" />
    </div>
  );

  if (layout === 'phone') {
    return (
      <Page side="verso" className="board-page">
        {head}
        <div className="board__pan" tabIndex={0} aria-label="Mood board; scroll sideways">
          <div className="board board--phone">{canvas}</div>
        </div>
        <p className="board__hint sc" aria-hidden="true">
          Swipe sideways ⟷
        </p>
      </Page>
    );
  }

  return (
    <>
      <Span className="board-span">
        <div className="board">{canvas}</div>
      </Span>
      <Page side="verso" bare>
        {head}
      </Page>
      <Page side="recto" bare />
    </>
  );
}
