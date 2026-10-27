import { Editable, Page, Picture, Span } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setChapterField } from '../store/book';
import { chapterLabel } from '../model/pages';
import { asHtml, asText } from './text';
import { ImageTools } from '../edit/ImageTools';
import type { ImageSlot } from '../model/types';

/** A full-bleed image across both pages; the number, the title and one line. */
export function Opener() {
  const { placed, layout, active } = useSpread();
  const editing = useEditing();
  const { chapter, chapterNumber, spread } = placed;
  const image = spread.slots.image as ImageSlot;
  const label = chapterNumber ? chapter.kicker : [chapterLabel(chapter, null), chapter.kicker].filter(Boolean).join(' · ');

  const mark = (
    <div className="opener__mark">
      {chapterNumber ? (
        <span className="opener__numeral" aria-hidden="true">
          {chapterNumber}
        </span>
      ) : null}
      <Editable
        as="h2"
        single
        className="opener__title"
        html={asHtml(chapter.title)}
        onCommit={(h) => setChapterField(chapter.id, 'title', asText(h))}
        placeholder="Chapter title"
      />
      {label ? (
        <p className="opener__label sc">
          {chapterNumber ? <span className="visually-hidden">{chapterLabel(chapter, chapterNumber)}. </span> : null}
          {label}
        </p>
      ) : null}
    </div>
  );

  const epigraph = (
    <Editable
      as="p"
      single
      className="opener__epigraph"
      html={asHtml(chapter.epigraph)}
      onCommit={(h) => setChapterField(chapter.id, 'epigraph', asText(h))}
      placeholder="One line for the epigraph"
    />
  );

  const picture = (
    <Picture
      assetId={image.assetId}
      focal={image.focal}
      label={image.label}
      alt={image.alt}
      decorative={image.decorative}
      kenBurns={active && !editing}
      eager={active}
      slip="tl"
    >
      {editing ? <ImageTools spreadId={spread.id} slotKey="image" /> : null}
    </Picture>
  );

  if (layout === 'phone') {
    return (
      <Span className="opener">
        {picture}
        <div className="opener__scrim" aria-hidden="true" />
        <div className="opener__phone">
          {mark}
          {epigraph}
        </div>
      </Span>
    );
  }

  return (
    <>
      <Span className="opener">
        {picture}
        <div className="opener__scrim" aria-hidden="true" />
      </Span>
      <Page side="verso" bare onImage head={false} folio={false}>
        {mark}
      </Page>
      <Page side="recto" bare onImage head={false} folio={false}>
        <div className="opener__epi-wrap">{epigraph}</div>
      </Page>
    </>
  );
}
