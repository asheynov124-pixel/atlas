import { Editable, Page, Picture } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setBookField, useBook } from '../store/book';
import { asHtml, asText } from './text';
import { ImageTools } from '../edit/ImageTools';
import type { ImageSlot } from '../model/types';

/** The closed book: olive cloth, a tipped-in plate, the title stamped in paper. */
export function Cover() {
  const { placed, layout } = useSpread();
  const book = useBook();
  const editing = useEditing();
  const image = placed.spread.slots.image as ImageSlot;
  return (
    <>
      {layout === 'spread' ? <Page side="verso" empty bare body={false} /> : null}
      <Page side="recto" className="cover" head={false} folio={false} body={false}>
        <div className="cover__hinge" aria-hidden="true" />
        <div className="cover__inner">
          <Editable
            as="p"
            single
            className="cover__title"
            html={asHtml(book.title)}
            onCommit={(h) => setBookField('title', asText(h))}
            placeholder="Title"
          />
          <div className="cover__plate">
            <Picture
              assetId={image.assetId}
              focal={image.focal}
              label={image.label}
              alt={image.alt}
              decorative={image.decorative}
              eager
              slip="bl"
            >
              {editing ? <ImageTools spreadId={placed.spread.id} slotKey="image" /> : null}
            </Picture>
          </div>
          <Editable
            as="p"
            single
            className="cover__subtitle"
            html={asHtml(book.subtitle)}
            onCommit={(h) => setBookField('subtitle', asText(h))}
            placeholder="Subtitle"
          />
          <Editable
            as="p"
            single
            className="cover__address"
            html={asHtml(book.address)}
            onCommit={(h) => setBookField('address', asText(h))}
            placeholder="Address"
          />
        </div>
      </Page>
    </>
  );
}
