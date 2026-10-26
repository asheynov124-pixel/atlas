import { useEffect, useState, type CSSProperties } from 'react';
import { Editable, Page, Picture } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText, useBook, useLayout } from '../store/book';
import { useAsset } from '../store/assets';
import { Caption } from './kit';
import { safeHref, hostOf } from './items';
import { PinEditor, usePinActions } from '../features/PinEditor';
import type { Pin, PinsSlot, TextSlot } from '../model/types';

/** A floor plan or render with numbered pins; each pin opens its note. */
export function Plan() {
  const { placed, layout } = useSpread();
  const editing = useEditing();
  const { figures } = useLayout();
  const book = useBook();
  const { spread } = placed;
  const slot = spread.slots.plan as PinsSlot;
  const html = (k: string) => (spread.slots[k] as TextSlot | undefined)?.html ?? '';
  const asset = useAsset(slot.assetId);
  const [open, setOpen] = useState<string | null>(null);
  const actions = usePinActions(spread.id);
  const ar = asset ? asset.width / asset.height : 4 / 5;

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const legend = (
    <ol className="plan__legend">
      {slot.pins.map((pin, i) => (
        <li key={pin.id} className={open === pin.id ? 'is-open' : undefined}>
          <button type="button" className="plan__legend-btn" onClick={() => setOpen(open === pin.id ? null : pin.id)} aria-expanded={open === pin.id}>
            <span className="pin-dot" aria-hidden="true">
              {i + 1}
            </span>
            <span className="plan__legend-text">
              <strong>{pin.title || 'Untitled'}</strong> {pin.text}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );

  const card = (pin: Pin, i: number) => {
    const item = pin.itemId ? book.items[pin.itemId] : null;
    const href = safeHref(pin.url);
    return (
      <div
        className={['pin-card', pin.x > 55 && 'pin-card--left', pin.y > 60 && 'pin-card--up'].filter(Boolean).join(' ')}
        role="dialog"
        aria-label={`Pin ${i + 1}: ${pin.title}`}
      >
        {editing ? (
          <PinEditor spreadId={spread.id} pin={pin} onClose={() => setOpen(null)} />
        ) : (
          <>
            <p className="pin-card__no sc">No. {i + 1}</p>
            <h3 className="pin-card__title">{pin.title}</h3>
            {pin.text ? <p className="pin-card__text">{pin.text}</p> : null}
            {item ? <p className="pin-card__item sc">{item.name}</p> : null}
            {href ? (
              <a className="pin-card__link" href={href} target="_blank" rel="noopener noreferrer">
                {hostOf(href)} ↗
              </a>
            ) : null}
          </>
        )}
      </div>
    );
  };

  const plate = (
    <div className="plan__area">
      <div
        className={['plan__plate', editing && 'plan__plate--editing'].filter(Boolean).join(' ')}
        style={{ '--ar': ar } as CSSProperties}
        onClick={(e) => {
          if (!editing || (e.target as HTMLElement).closest('.pin, .pin-card, .image-tools button, .image-tools form, .focal')) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const id = actions.add(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
          setOpen(id);
        }}
      >
        <Picture assetId={slot.assetId} label={slot.label} alt={slot.alt} slip="tl">
          {editing ? <PinEditor.ImageTools spreadId={spread.id} /> : null}
        </Picture>
        {slot.pins.map((pin, i) => (
          <div key={pin.id} className="pin-wrap" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
            <button
              type="button"
              className={['pin', open === pin.id && 'is-open'].filter(Boolean).join(' ')}
              aria-label={`Pin ${i + 1}: ${pin.title}`}
              aria-expanded={open === pin.id}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(open === pin.id ? null : pin.id);
              }}
              onPointerDown={editing ? (e) => actions.startDrag(e, pin.id) : undefined}
              onKeyDown={
                editing
                  ? (e) => {
                      const step = e.shiftKey ? 5 : 1;
                      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                      const m = moves[e.key];
                      if (!m) return;
                      e.preventDefault();
                      e.stopPropagation();
                      actions.move(pin.id, pin.x + m[0], pin.y + m[1]);
                    }
                  : undefined
              }
            >
              {i + 1}
            </button>
            {open === pin.id ? card(pin, i) : null}
          </div>
        ))}
      </div>
      <Caption fig={figures.get(`${spread.id}:plan`)} className="plan__caption">
        {editing ? <span className="plan__hint">Click the plan to add a pin; drag a pin to move it.</span> : null}
      </Caption>
    </div>
  );

  const header = (
    <header className="plan__head">
      <p className="sc plan__kicker">Plan</p>
      <Editable as="h2" single className="plan__title" html={html('title')} onCommit={(h) => setSlotText(spread.id, 'title', h)} placeholder="Title" />
      <Editable as="div" className="plan__body" html={html('body')} onCommit={(h) => setSlotText(spread.id, 'body', h)} placeholder="A line about the plan (optional)" />
    </header>
  );

  if (layout === 'phone') {
    return (
      <>
        <Page side="verso">
          {header}
          {plate}
          {legend}
        </Page>
      </>
    );
  }

  return (
    <>
      <Page side="verso">
        <div className="plan__verso">
          {header}
          {legend}
        </div>
      </Page>
      <Page side="recto">{plate}</Page>
    </>
  );
}
