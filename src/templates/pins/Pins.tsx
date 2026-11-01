import { useState } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import { figureOf, type SpreadCtx } from '@/reader/SpreadContext';
import shared from '../shared.module.css';
import styles from './Pins.module.css';

export function PinsTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const pins = isSlotKind(slots.pins, 'pins') ? slots.pins : null;
  const fig = figureOf(ctx, 'pins');
  const [active, setActive] = useState<string | null>(null);
  const list = pins?.pins ?? [];

  return (
    <Spread ctx={ctx} label={`Plan: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Plan</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} slotKey="title" placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{list.length} {list.length === 1 ? 'pin' : 'pins'}</p>
        </header>
        {pins && (
          <figure className={styles.figure} data-testid="pins-figure">
            <Plate slot={pins.image} slotKey="pins.image" fig={fig} sizes="(min-width: 820px) 45vw, 90vw" />
            {list.map((p, i) => (
              <button
                key={p.id}
                className={styles.pin}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                onClick={() => setActive(active === p.id ? null : p.id)}
                aria-expanded={active === p.id}
                aria-label={`Pin ${i + 1}: ${p.title}`}
              >
                {i + 1}
              </button>
            ))}
          </figure>
        )}
        {pins && (pins.image.caption || fig) && (
          <figcaption className={[styles.caption, 't-caption'].join(' ')}>
            {fig && <span className="fig">Fig. {fig}</span>}
            <span>{pins.image.caption || 'The plan'}</span>
          </figcaption>
        )}
      </Page>
      <Page side="right">
        <header className={shared.head}>
          <p className="t-label">Key</p>
          <p className={[shared.headMeta, 't-label'].join(' ')}>Tap a number</p>
        </header>
        <ol className={styles.list}>
          {list.map((p, i) => (
            <li
              key={p.id}
              className={styles.item}
              data-active={active === p.id ? 'true' : 'false'}
              onClick={() => setActive(active === p.id ? null : p.id)}
            >
              <span className={styles.itemNum}>{i + 1}</span>
              <span className={styles.itemTitle}>{p.title}</span>
              {(p.body || p.url || p.itemId) && (
                <span className={styles.itemBody}>
                  {p.body}
                  {p.url && (
                    <>
                      {' '}
                      <a href={p.url} target="_blank" rel="noreferrer">Link</a>
                    </>
                  )}
                  {p.itemId && ctx.book.items[p.itemId] && <> · {ctx.book.items[p.itemId].name}</>}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Page>
    </Spread>
  );
}
