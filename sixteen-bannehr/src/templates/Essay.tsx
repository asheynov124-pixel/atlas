import { Editable, Page, Picture, Span } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText, useLayout } from '../store/book';
import { chapterLabel } from '../model/pages';
import { isBlank } from '../model/sanitize';
import { wordCount } from '../model/typeset';
import { ImageTools } from '../edit/ImageTools';
import { SlotCaption } from './SlotCaption';
import type { ImageSlot, TextSlot } from '../model/types';

/** Past this many words an essay flows in two true columns across the spread. */
export const LONG_ESSAY = 170;

export function Essay() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const { figures } = useLayout();
  const { spread, chapter, chapterNumber } = placed;
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';
  const commit = (k: string) => (h: string) => setSlotText(spread.id, k, h);
  const image = spread.slots.image as ImageSlot;
  const long = wordCount(html('body')) > LONG_ESSAY;

  const head = (
    <header className="essay__head">
      <Editable
        as="p"
        single
        className="essay__label sc"
        html={html('kicker')}
        fallback={chapterLabel(chapter, chapterNumber)}
        onCommit={commit('kicker')}
        placeholder={chapterLabel(chapter, chapterNumber) || 'Label'}
      />
      <Editable
        as="h2"
        single
        className="essay__title"
        html={html('title')}
        fallback={chapter.title}
        onCommit={commit('title')}
        placeholder={chapter.title || 'Title'}
      />
      {chapter.kicker && !long ? <p className="essay__kicker">{chapter.kicker}</p> : null}
    </header>
  );

  const body = (
    <Editable
      as="div"
      className={['essay__body', 'dropcap', !long && 'essay__body--lead'].filter(Boolean).join(' ')}
      html={html('body')}
      onCommit={commit('body')}
      placeholder="Write the essay. Select text for bold, italic, a link or a pull quote."
    />
  );

  const pull =
    !isBlank(html('pull')) || editing ? (
      <Editable
        as="blockquote"
        className="pull"
        html={html('pull')}
        onCommit={commit('pull')}
        placeholder="A line worth repeating (optional pull quote)"
      />
    ) : null;

  const showFigure = !!image.assetId || editing;
  const figure = showFigure ? (
    <figure className="essay__figure">
      <div className="essay__figure-img">
        <Picture assetId={image.assetId} focal={image.focal} label={image.label || 'A small image for the margin'} alt={image.alt} decorative={image.decorative} slip="none">
          {editing ? <ImageTools spreadId={spread.id} slotKey="image" /> : null}
        </Picture>
      </div>
      <SlotCaption spreadId={spread.id} slotKey="image" fig={figures.get(`${spread.id}:image`)} />
    </figure>
  ) : null;

  if (layout === 'phone') {
    return (
      <>
        <Page side="verso">
          {head}
          {body}
        </Page>
        <Page side="recto" empty={!pull && !figure}>
          <div className="essay__phone-coda">
            {pull}
            {figure}
          </div>
        </Page>
      </>
    );
  }

  if (long) {
    return (
      <>
        <Span className="essay-flow">
          <div className="essay-flow__cols">
            {head}
            {body}
            {pull}
            {figure}
          </div>
        </Span>
        <Page side="verso" bare />
        <Page side="recto" bare />
      </>
    );
  }

  return (
    <>
      <Page side="verso">
        <div className="essay__verso">
          {head}
          {pull ? <div className="essay__pull-wrap">{pull}</div> : null}
        </div>
      </Page>
      <Page side="recto">
        <div className="essay__recto">
          {body}
          {figure}
        </div>
      </Page>
    </>
  );
}
