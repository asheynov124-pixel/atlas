import { Editable, Page } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setBookField, setChapterField, setSlotText, useBook, useLayout } from '../store/book';
import { hrefFor } from '../store/nav';
import { chapterLabel } from '../model/pages';
import { asHtml, asText } from './text';
import { ChapterTools } from '../edit/ChapterTools';
import type { TextSlot } from '../model/types';

/** Sage endpapers on the left; the dedication on the right. */
export function Dedication() {
  const book = useBook();
  return (
    <>
      <Page side="verso" className="endpaper" head={false} folio={false} body={false}>
        <div className="endpaper__mark" aria-hidden="true">
          <span>16</span>
        </div>
      </Page>
      <Page side="recto" head={false} folio={false}>
        <div className="dedication">
          <span className="dedication__rule" aria-hidden="true" />
          <Editable
            as="div"
            className="dedication__text"
            html={book.dedication}
            onCommit={(h) => setBookField('dedication', h)}
            placeholder="For Sonny…"
          />
        </div>
      </Page>
    </>
  );
}

/** Contents, built from the chapters. Every line is a link; in Edit mode, a workbench. */
export function Contents() {
  const book = useBook();
  const editing = useEditing();
  const { chapterStart, chapterNumbers, placed } = useLayout();
  const chapters = book.chapters.filter((c) => c.kind !== 'front');
  const firstSpread = (id: string) => placed.find((p) => p.chapter.id === id)?.spread.id;
  const split = Math.ceil(chapters.length / 2) - (chapters.length > 6 ? 1 : 0);
  const columns = [chapters.slice(0, split), chapters.slice(split)];

  const entry = (c: (typeof chapters)[number]) => {
    const n = chapterNumbers.get(c.id) ?? null;
    const target = firstSpread(c.id);
    const label = n ? String(n) : c.kind === 'prologue' ? 'P' : c.kind === 'epilogue' ? 'E' : '';
    const title = editing ? (
      <Editable
        as="span"
        single
        className="toc__title"
        html={asHtml(c.title)}
        onCommit={(h) => setChapterField(c.id, 'title', asText(h))}
        placeholder="Chapter title"
      />
    ) : (
      <span className="toc__title">{c.title}</span>
    );
    return (
      <li key={c.id} className="toc__entry" data-chapter={c.id}>
        <span className="toc__num" aria-hidden="true">
          {label}
        </span>
        <span className="toc__main">
          {editing || !target ? title : <a href={hrefFor(target)}>{title}</a>}
          <span className="toc__kicker">
            {c.kind === 'chapter' ? c.kicker : [chapterLabel(c, n), c.kicker].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="toc__page">{chapterStart.get(c.id)}</span>
        {editing ? <ChapterTools chapterId={c.id} /> : null}
      </li>
    );
  };

  return (
    <>
      <Page side="verso" head={false}>
        <div className="toc">
          <h2 className="toc__heading">Contents</h2>
          <ol className="toc__list" aria-label="Chapters, first part">
            {columns[0].map(entry)}
          </ol>
        </div>
      </Page>
      <Page side="recto" head={false}>
        <div className="toc toc--recto">
          <ol className="toc__list" aria-label="Chapters, second part">
            {columns[1].map(entry)}
          </ol>
          {editing ? <ChapterTools add /> : null}
        </div>
      </Page>
    </>
  );
}

/** A quiet spread with only a title, left for later ("The First Dinner"). */
export function TitlePage() {
  const { placed, layout } = useSpread();
  const { spread } = placed;
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';
  return (
    <>
      <Page side="verso" empty={layout === 'phone'} />
      <Page side="recto">
        <div className="title-page">
          <Editable
            as="h3"
            single
            className="title-page__title"
            html={html('title')}
            onCommit={(h) => setSlotText(spread.id, 'title', h)}
            placeholder="A title"
          />
          <Editable
            as="div"
            className="title-page__body"
            html={html('body')}
            onCommit={(h) => setSlotText(spread.id, 'body', h)}
            placeholder="Left for later."
          />
        </div>
      </Page>
    </>
  );
}
