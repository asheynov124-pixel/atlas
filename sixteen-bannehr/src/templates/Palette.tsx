import type { CSSProperties } from 'react';
import { Editable, Page, Picture } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText } from '../store/book';
import { useItems, priceLabel, safeHref, hostOf, CLEAN_ROWS, cleanValueLabel, cleanChecked } from './items';
import { CleanEditor, SwatchTools, MaterialTools } from '../features/PaletteTools';
import type { Item, Swatch, SwatchesSlot, TextSlot } from '../model/types';

/** The Clean materials panel. Blank means not yet checked; nothing is ever assumed. */
export function CleanPanel({ item }: { item: Item }) {
  const editing = useEditing();
  if (editing) return <CleanEditor item={item} />;
  const checked = cleanChecked(item.clean);
  if (!checked && !item.clean.notes) {
    return (
      <p className="clean clean--empty">
        <span className="clean__mark" aria-hidden="true" />
        <span className="sc">Clean materials</span> <span className="clean__none">Not yet checked</span>
      </p>
    );
  }
  return (
    <div className="clean">
      <p className="sc clean__head">
        Clean materials <span className="clean__count">{checked} of {CLEAN_ROWS.length} checked</span>
      </p>
      <dl className="clean__rows">
        {CLEAN_ROWS.map((r) => (
          <div key={r.key} className="clean__row">
            <dt>{r.label}</dt>
            <dd className={item.clean[r.key] ? undefined : 'is-blank'}>{cleanValueLabel(r.key, item.clean[r.key]) || '—'}</dd>
          </div>
        ))}
      </dl>
      {item.clean.notes ? <p className="clean__notes">{item.clean.notes}</p> : null}
    </div>
  );
}

export function MaterialCard({ item }: { item: Item }) {
  const editing = useEditing();
  const href = safeHref(item.url);
  const meta = [item.finish, item.brand].filter(Boolean).join(' · ');
  const price = priceLabel(item);
  return (
    <article className="mat" data-item={item.id}>
      <div className="mat__img">
        <Picture assetId={item.assetId} focal={item.focal} label={item.label} alt={item.name} slip="none">
          {editing ? <MaterialTools.Image item={item} /> : null}
        </Picture>
      </div>
      <div className="mat__text">
        {editing ? (
          <MaterialTools item={item} />
        ) : (
          <>
            <h4 className="mat__name">{item.name}</h4>
            {meta ? <p className="mat__meta">{meta}</p> : null}
            {price || href ? (
              <p className="mat__price">
                {price}
                {price && href ? ' · ' : null}
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {item.retailer || hostOf(href)} ↗
                  </a>
                ) : null}
              </p>
            ) : null}
          </>
        )}
      </div>
      <CleanPanel item={item} />
    </article>
  );
}

export function SwatchChip({ swatch, spreadId }: { swatch: Swatch; spreadId: string }) {
  const editing = useEditing();
  return (
    <li className="swatch" style={{ '--chip': swatch.hex } as CSSProperties}>
      {editing ? null : <span className="swatch__chip" aria-hidden="true" />}
      {editing ? (
        <SwatchTools spreadId={spreadId} swatch={swatch} />
      ) : (
        <>
          <span className="swatch__name">{swatch.name}</span>
          <span className="swatch__hex sc">{swatch.hex.toUpperCase()}</span>
        </>
      )}
    </li>
  );
}

export function Palette() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const { spread } = placed;
  const items = useItems(spread);
  const swatches = (spread.slots.swatches as SwatchesSlot | undefined)?.swatches ?? [];
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';

  const header = (
    <header className="palette__head">
      <p className="sc palette__kicker">Palette &amp; materials</p>
      <Editable as="h3" single className="palette__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="Title" />
      <Editable as="div" className="palette__intro" html={html('body')} onCommit={(h) => setSlotText(spread.id, 'body', h)} placeholder="A line about the palette (optional)" />
    </header>
  );

  const swatchList =
    swatches.length || editing ? (
      <ul className={['swatches', swatches.length > 4 && 'swatches--many'].filter(Boolean).join(' ')} aria-label="Colours">
        {swatches.map((s) => (
          <SwatchChip key={s.id} swatch={s} spreadId={spread.id} />
        ))}
        {editing ? <SwatchTools.Add spreadId={spread.id} /> : null}
      </ul>
    ) : null;

  // Without swatches the verso carries a feature: one card full width (odd counts) or two.
  const versoCount = swatches.length || editing || items.length < 2 ? 0 : items.length % 2 ? 1 : 2;
  const cards = (list: Item[], feature = false) => (
    <div className={['mats', list.length > 4 && 'mats--dense', feature && list.length === 1 && 'mats--feature'].filter(Boolean).join(' ')}>
      {list.map((it) => (
        <MaterialCard key={it.id} item={it} />
      ))}
    </div>
  );

  if (layout === 'phone') {
    return (
      <>
        <Page side="verso">
          {header}
          {swatchList}
        </Page>
        <Page side="recto" empty={!items.length && !editing}>
          {cards(items)}
          {editing ? <MaterialTools.Add spreadId={spread.id} /> : null}
        </Page>
      </>
    );
  }

  return (
    <>
      <Page side="verso">
        <div className="palette__verso">
          {header}
          {swatchList}
          {versoCount ? cards(items.slice(0, versoCount), true) : null}
        </div>
      </Page>
      <Page side="recto">
        <div className="palette__recto">
          {cards(items.slice(versoCount))}
          {editing ? <MaterialTools.Add spreadId={spread.id} /> : null}
        </div>
      </Page>
    </>
  );
}
