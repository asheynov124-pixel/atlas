import { Editable, Page } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText, useBook, useLayout } from '../store/book';
import { hrefFor } from '../store/nav';
import { useItems, priceLabel, safeHref, hostOf, cleanChecked, CLEAN_ROWS, cleanValueLabel } from './items';
import { collectStillToDecide, formatMoney } from '../model/still-to-decide';
import { chapterLabel } from '../model/pages';
import { plainText } from '../model/typeset';
import { ShoppingTools } from '../features/ShoppingTools';
import { ITEM_STATUSES, type Item, type TextSlot } from '../model/types';
import { countWords } from './Gallery';

export function itemStatusLabel(s: string) {
  return ITEM_STATUSES.find((x) => x.id === s)?.label ?? s;
}

function total(items: Item[]) {
  let sum = 0;
  let unpriced = 0;
  for (const it of items) {
    if (it.price === null) unpriced++;
    else sum += it.price;
  }
  return { sum, unpriced };
}

/** What to buy, where, and what it adds up to. */
export function Shopping() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const { spread } = placed;
  const items = useItems(spread);
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';
  const { sum, unpriced } = total(items);
  const open = items.filter((i) => i.status === 'thinking' || i.status === 'to-buy').length;

  const summary = (
    <header className="shop__head">
      <p className="sc shop__kicker">Shopping list</p>
      <Editable as="h3" single className="shop__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="What we are buying" />
      <div className="shop__total">
        <span className="shop__sum">{formatMoney(sum)}</span>
        <span className="shop__total-label">
          Running total for {countWords(items.length)} {items.length === 1 ? 'item' : 'items'}
          {unpriced ? `; ${countWords(unpriced)} not yet priced` : ''}.
        </span>
        <span className="shop__open sc">{open ? `${open} still to order` : 'All ordered'}</span>
      </div>
    </header>
  );

  const table = (
    <table className="shop__table">
      <caption className="visually-hidden">Items, status, retailer and price</caption>
      <thead>
        <tr>
          <th scope="col" className="sc">
            Item
          </th>
          <th scope="col" className="sc">
            Status
          </th>
          <th scope="col" className="sc shop__num">
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const href = safeHref(it.url);
          return (
            <tr key={it.id} data-status={it.status}>
              <td>
                {editing ? (
                  <ShoppingTools.Name item={it} />
                ) : (
                  <>
                    <span className="shop__name">{it.name}</span>
                    {href || it.retailer ? (
                      <span className="shop__where">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {it.retailer || hostOf(href)} ↗
                          </a>
                        ) : (
                          it.retailer
                        )}
                      </span>
                    ) : null}
                  </>
                )}
              </td>
              <td>{editing ? <ShoppingTools.Status item={it} /> : <span className="shop__status">{itemStatusLabel(it.status)}</span>}</td>
              <td className="shop__num">{editing ? <ShoppingTools.Price item={it} /> : priceLabel(it) || '—'}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2} className="sc">
            Total
          </th>
          <td className="shop__num">{formatMoney(sum)}</td>
        </tr>
      </tfoot>
    </table>
  );

  if (layout === 'phone') {
    return (
      <Page side="verso">
        {summary}
        {table}
        {editing ? <ShoppingTools.Add spreadId={spread.id} /> : null}
      </Page>
    );
  }
  return (
    <>
      <Page side="verso">
        <div className="shop__verso">{summary}</div>
      </Page>
      <Page side="recto">
        <div className="shop__recto">
          {table}
          {editing ? <ShoppingTools.Add spreadId={spread.id} /> : null}
        </div>
      </Page>
    </>
  );
}

/** Chapter 9: every material in the book, gathered, each with its Clean panel summary. */
export function Library() {
  const { placed, layout } = useSpread();
  const book = useBook();
  const { placed: all } = useLayout();
  const { spread } = placed;
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';

  // Materials in palette spreads, in book order, once each.
  const seen = new Set<string>();
  const groups: { title: string; spreadId: string; items: Item[] }[] = [];
  for (const p of all) {
    if (p.spread.template !== 'palette') continue;
    const slot = p.spread.slots.items;
    if (slot?.kind !== 'items') continue;
    const items = slot.itemIds.map((id) => book.items[id]).filter((it): it is Item => !!it && !seen.has(it.id));
    items.forEach((it) => seen.add(it.id));
    if (items.length) groups.push({ title: p.chapter.title, spreadId: p.spread.id, items });
  }
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const half = Math.ceil(count / 2);
  const columns: (typeof groups)[] = [[], []];
  let running = 0;
  for (const g of groups) {
    columns[running < half - 1 || layout === 'phone' ? 0 : 1].push(g);
    running += g.items.length;
  }

  const group = (g: (typeof groups)[number]) => (
    <section key={g.spreadId} className="lib__group">
      <h4 className="lib__chapter">
        <a href={hrefFor(g.spreadId)}>{g.title}</a>
      </h4>
      <ul>
        {g.items.map((it) => {
          const n = cleanChecked(it.clean);
          const facts = CLEAN_ROWS.map((r) => cleanValueLabel(r.key, it.clean[r.key])).filter(Boolean);
          return (
            <li key={it.id} className="lib__row">
              <span className="lib__name">{it.name}</span>
              <span className="lib__maker">{[it.finish, it.brand].filter(Boolean).join(' · ')}</span>
              <span className={['lib__clean', !n && 'is-blank'].filter(Boolean).join(' ')}>
                {n ? facts.join(' · ') : 'Not yet checked'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const header = (
    <header className="lib__head">
      <p className="sc lib__kicker">Materials library · {count}</p>
      <Editable as="h3" single className="lib__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="Materials library" />
      <Editable as="div" className="lib__intro" html={html('body')} onCommit={(h) => setSlotText(spread.id, 'body', h)} placeholder="A line about the library" />
    </header>
  );

  if (layout === 'phone') {
    return (
      <Page side="verso">
        {header}
        {groups.map(group)}
      </Page>
    );
  }
  return (
    <>
      <Page side="verso">
        <div className="lib__page">
          {header}
          {columns[0].map(group)}
        </div>
      </Page>
      <Page side="recto">
        <div className="lib__page">{columns[1].map(group)}</div>
      </Page>
    </>
  );
}

/** The epilogue: open decisions and unordered items, gathered from the whole book. */
export function StillToDecide() {
  const { placed, layout } = useSpread();
  const book = useBook();
  const { spread } = placed;
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';
  const s = collectStillToDecide(book);

  const decisions = (
    <section className="still__section" aria-labelledby={`${spread.id}-dec`}>
      <h4 id={`${spread.id}-dec`} className="sc still__sub">
        Decisions still at Thinking · {s.decisions.length}
      </h4>
      {s.decisions.length ? (
        <ol className="still__list">
          {s.decisions.map((d) => (
            <li key={d.placed.spread.id}>
              <a href={hrefFor(d.placed.spread.id)} className="still__link">
                <span className="still__where sc">{chapterLabel(d.placed.chapter, d.placed.chapterNumber) || d.placed.chapter.title}</span>
                <span className="still__what">{d.title}</span>
                <span className="still__meta">
                  {d.placed.chapter.title}
                  {d.optionCount ? ` · ${countWords(d.optionCount)} options` : ''} · p. {d.placed.verso}
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="still__done">Nothing left to decide. Imagine that.</p>
      )}
    </section>
  );

  const purchases = (
    <section className="still__section" aria-labelledby={`${spread.id}-buy`}>
      <h4 id={`${spread.id}-buy`} className="sc still__sub">
        Not yet ordered · {s.purchases.length}
      </h4>
      {s.purchases.length ? (
        <ul className="still__buy">
          {s.purchases.map(({ item, placed: p }) => (
            <li key={item.id}>
              <a href={hrefFor(p.spread.id)}>
                <span className="still__what">{item.name}</span>
                <span className="still__meta">
                  {plainText((p.spread.slots.title as TextSlot | undefined)?.html ?? '') || p.chapter.title} · {itemStatusLabel(item.status)}
                </span>
                <span className="still__price">{priceLabel(item) || '—'}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="still__done">Everything is ordered.</p>
      )}
      <p className="still__total">
        <span className="sc">Outstanding</span> <span className="still__sum">{formatMoney(s.outstanding)}</span>
        {s.unpriced ? <span className="still__unpriced"> plus {countWords(s.unpriced)} unpriced</span> : null}
      </p>
    </section>
  );

  const header = (
    <header className="still__head">
      <p className="sc still__kicker">Epilogue</p>
      <Editable as="h3" single className="still__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="Still to Decide" />
      <Editable as="div" className="still__intro" html={html('body')} onCommit={(h) => setSlotText(spread.id, 'body', h)} placeholder="A line for the epilogue" />
    </header>
  );

  if (layout === 'phone') {
    return (
      <>
        <Page side="verso">
          {header}
          {decisions}
        </Page>
        <Page side="recto">{purchases}</Page>
      </>
    );
  }
  return (
    <>
      <Page side="verso">
        <div className="still__page">
          {header}
          {decisions}
        </div>
      </Page>
      <Page side="recto">
        <div className="still__page still__page--recto">{purchases}</div>
      </Page>
    </>
  );
}
