import { useRef, useState } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import type { Pin } from '@/book/types';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Page, Spread } from '@/reader/Spread';
import { figureOf, type SpreadCtx } from '@/reader/SpreadContext';
import { addPin, patchPin, removePin } from '@/state/actions';
import { InlineText } from '@/editor/EditableText';
import controls from '@/editor/controls.module.css';
import shared from '../shared.module.css';
import styles from './Pins.module.css';

export function PinsTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const spreadId = ctx.ref.spread.id;
  const title = isSlotKind(slots.title, 'text') ? slots.title.html : '';
  const pins = isSlotKind(slots.pins, 'pins') ? slots.pins : null;
  const fig = figureOf(ctx, 'pins');
  const [active, setActive] = useState<string | null>(null);
  const list = pins?.pins ?? [];
  const edit = ctx.editable;
  const figRef = useRef<HTMLElement>(null);
  const drag = useRef<{ id: string; pointer: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = figRef.current!.getBoundingClientRect();
    return { x: Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)), y: Math.min(0.98, Math.max(0.02, (e.clientY - r.top) / r.height)) };
  };

  const onFigureClick = (e: React.MouseEvent) => {
    if (!edit || !pins) return;
    if ((e.target as HTMLElement).closest('button, [data-slot-path] [role="toolbar"], input')) return;
    if (drag.current?.moved) return;
    const { x, y } = rel(e);
    const id = addPin(spreadId, 'pins', x, y);
    if (id) setActive(id);
  };

  const onPinPointerDown = (p: Pin) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!edit) return;
    e.stopPropagation();
    drag.current = { id: p.id, pointer: e.pointerId, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPinPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId || !(e.buttons & 1)) return;
    d.moved = true;
    setLive({ id: d.id, ...rel(e) });
  };
  const onPinPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (d.moved) {
      const { x, y } = rel(e);
      patchPin(spreadId, 'pins', d.id, { x, y });
      setLive(null);
      setTimeout(() => (drag.current = null), 0);
    } else {
      drag.current = null;
      setActive(active === d.id ? null : d.id);
    }
  };

  return (
    <Spread ctx={ctx} label={`Plan: ${stripHtml(title)}`}>
      <Page side="left">
        <header className={shared.head}>
          <div>
            <p className={[shared.headKicker, 't-label'].join(' ')}>Plan</p>
            <RichText as="h2" html={title} className={[shared.headTitle, 't-display'].join(' ')} slotKey="title" placeholder="Title" />
          </div>
          <p className={[shared.headMeta, 't-label'].join(' ')}>{edit ? 'Tap the plan to add a pin' : `${list.length} ${list.length === 1 ? 'pin' : 'pins'}`}</p>
        </header>
        {pins && (
          <figure className={styles.figure} data-testid="pins-figure" ref={figRef} onClick={onFigureClick} data-no-swipe={edit ? 'true' : undefined} style={edit ? { cursor: 'crosshair' } : undefined}>
            <Plate slot={pins.image} slotKey="pins.image" compact fig={fig} sizes="(min-width: 820px) 45vw, 90vw" />
            {list.map((p, i) => {
              const pos = live?.id === p.id ? live : p;
              return (
                <button
                  key={p.id}
                  className={styles.pin}
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, cursor: edit ? 'grab' : 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!edit) setActive(active === p.id ? null : p.id);
                  }}
                  onPointerDown={onPinPointerDown(p)}
                  onPointerMove={onPinPointerMove}
                  onPointerUp={onPinPointerUp}
                  aria-expanded={active === p.id}
                  aria-label={`Pin ${i + 1}: ${p.title || 'untitled'}${edit ? '. Drag to move.' : ''}`}
                  data-pin-id={p.id}
                >
                  {i + 1}
                </button>
              );
            })}
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
          <p className={[shared.headMeta, 't-label'].join(' ')}>{edit ? `${list.length} ${list.length === 1 ? 'pin' : 'pins'}` : 'Tap a number'}</p>
        </header>
        <ol className={styles.list}>
          {list.map((p, i) => (
            <li
              key={p.id}
              className={styles.item}
              data-active={active === p.id ? 'true' : 'false'}
              data-pin-row={p.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[contenteditable], input, select, button')) return;
                setActive(active === p.id ? null : p.id);
              }}
            >
              <span className={styles.itemNum}>{i + 1}</span>
              {edit ? (
                <InlineText spreadId={spreadId} slotKey={`pin:${p.id}:title`} html={p.title} className={styles.itemTitle} placeholder="What is here" onCommit={(html) => patchPin(spreadId, 'pins', p.id, { title: stripHtml(html) })} />
              ) : (
                <span className={styles.itemTitle}>{p.title}</span>
              )}
              {edit ? (
                <span className={styles.itemBody} data-no-swipe>
                  <InlineText spreadId={spreadId} slotKey={`pin:${p.id}:body`} html={p.body} placeholder="A note about it" multiline onCommit={(html) => patchPin(spreadId, 'pins', p.id, { body: stripHtml(html) })} />
                  {active === p.id && (
                  <span style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className={[controls.input, controls.small].join(' ')} type="url" value={p.url ?? ''} placeholder="Link (optional)" aria-label="Link" onChange={(e) => patchPin(spreadId, 'pins', p.id, { url: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                    <select className={[controls.select, controls.small].join(' ')} value={p.itemId ?? ''} aria-label="Product" onChange={(e) => patchPin(spreadId, 'pins', p.id, { itemId: e.target.value || null })}>
                      <option value="">No product</option>
                      {Object.values(ctx.book.items).filter((it) => !it.archived).map((it) => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <button type="button" className={controls.iconButton} onClick={() => removePin(spreadId, 'pins', p.id)} aria-label={`Remove pin ${i + 1}`} title="Remove pin">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </span>
                  )}
                </span>
              ) : (
                (p.body || p.url || p.itemId) && (
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
                )
              )}
            </li>
          ))}
          {list.length === 0 && <li className="t-caption" style={{ padding: '1cqw 0' }}>{edit ? 'No pins yet. Tap the plan to add one.' : 'No pins yet.'}</li>}
        </ol>
      </Page>
    </Spread>
  );
}
