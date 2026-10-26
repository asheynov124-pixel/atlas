import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Editable, Page, Picture, Span } from './kit';
import { useSpread, useEditing } from '../reader/context';
import { setSlotText, useLayout } from '../store/book';
import { ImageTools } from '../edit/ImageTools';
import { SlotCaption } from './SlotCaption';
import type { ImageSlot, TextSlot } from '../model/types';

/** One image across the spread, bleeding on three sides; the caption sits in the foot margin. */
export function FullBleed() {
  const { placed, layout, active } = useSpread();
  const editing = useEditing();
  const { figures } = useLayout();
  const { spread } = placed;
  const image = spread.slots.image as ImageSlot;
  const fig = figures.get(`${spread.id}:image`);

  const picture = (
    <Picture assetId={image.assetId} focal={image.focal} label={image.label} alt={image.alt} decorative={image.decorative} eager={active}>
      {editing ? <ImageTools spreadId={spread.id} slotKey="image" /> : null}
    </Picture>
  );

  if (layout === 'phone') {
    return (
      <Span className="bleed bleed--phone">
        <div className="bleed__plate">{picture}</div>
        <div className="bleed__foot">
          <SlotCaption spreadId={spread.id} slotKey="image" fig={fig} />
        </div>
      </Span>
    );
  }

  return (
    <>
      <Span className="bleed">
        <div className="bleed__plate">{picture}</div>
      </Span>
      <Page side="verso" bare head={false} folio={false} />
      <Page side="recto" bare head={false} folio={false}>
        <div className="bleed__foot">
          <SlotCaption spreadId={spread.id} slotKey="image" fig={fig} />
        </div>
      </Page>
    </>
  );
}

/**
 * Before and after, one over the other, with a slider between them. On a phone a tap
 * toggles between the two instead.
 */
export function BeforeAfter() {
  const { placed, layout, active } = useSpread();
  const editing = useEditing();
  const { figures } = useLayout();
  const { spread } = placed;
  const before = spread.slots.image as ImageSlot;
  const after = spread.slots.image2 as ImageSlot;
  const title = (spread.slots.title as TextSlot | undefined)?.html ?? '';
  const [pos, setPos] = useState(50);
  const [showAfter, setShowAfter] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (e: PointerEvent) => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - step));
    else if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + step));
    else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const pic = (slot: ImageSlot, key: string) => (
    <Picture assetId={slot.assetId} focal={slot.focal} label={slot.label} alt={slot.alt} decorative={slot.decorative} eager={active} slip={key === 'image' ? 'tl' : 'tr'}>
      {editing ? <ImageTools spreadId={spread.id} slotKey={key} /> : null}
    </Picture>
  );

  const caption = (
    <div className="ba__captions">
      <Editable
        as="h2"
        single
        className="ba__title"
        html={title}
        onCommit={(h) => setSlotText(spread.id, 'title', h)}
        placeholder="What changed"
      />
      <SlotCaption spreadId={spread.id} slotKey="image" fig={figures.get(`${spread.id}:image`)} />
      <SlotCaption spreadId={spread.id} slotKey="image2" fig={figures.get(`${spread.id}:image2`)} />
    </div>
  );

  if (layout === 'phone') {
    return (
      <Span className="ba ba--phone">
        <div className="ba__plate">
          <button
            type="button"
            className="ba__toggle"
            onClick={() => setShowAfter((v) => !v)}
            aria-pressed={showAfter}
            aria-label={showAfter ? 'Showing after. Tap to show before.' : 'Showing before. Tap to show after.'}
          />
          <div className="ba__layer">{pic(before, 'image')}</div>
          <div className="ba__layer ba__layer--after" style={{ opacity: showAfter ? 1 : 0 }}>
            {pic(after, 'image2')}
          </div>
          <span className="ba__chip sc" aria-hidden="true">
            {showAfter ? 'After' : 'Before'} · tap
          </span>
        </div>
        <div className="bleed__foot">{caption}</div>
      </Span>
    );
  }

  return (
    <>
      <Span className="ba">
        <div
          className="ba__plate"
          ref={area}
          style={{ '--pos': `${pos}%` } as CSSProperties}
          onPointerDown={(e) => {
            if (editing && (e.target as HTMLElement).closest('.image-tools')) return;
            if (!(e.target as HTMLElement).closest('.ba__handle') && editing) return;
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="ba__layer">{pic(before, 'image')}</div>
          <div className="ba__layer ba__layer--after ba__layer--clip">{pic(after, 'image2')}</div>
          <span className="ba__label ba__label--before sc" aria-hidden="true">
            Before
          </span>
          <span className="ba__label ba__label--after sc" aria-hidden="true">
            After
          </span>
          <div
            className="ba__handle"
            role="slider"
            tabIndex={0}
            aria-label="Compare before and after"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={`${Math.round(100 - pos)}% after`}
            onKeyDown={onKey}
          >
            <span className="ba__knob" aria-hidden="true">
              ‹ ›
            </span>
          </div>
        </div>
      </Span>
      <Page side="verso" bare head={false} folio={false}>
        <div className="bleed__foot bleed__foot--verso">{caption}</div>
      </Page>
      <Page side="recto" bare head={false} folio={false} />
    </>
  );
}
