import { useRef, type PointerEvent } from 'react';
import { InlineText } from '../edit/InlineText';
import { ImageTools } from '../edit/ImageTools';
import { addPin, deletePin, updatePin } from '../store/actions';
import { useBook } from '../store/book';
import type { Pin } from '../model/types';

/** The card of an open pin in Edit mode: title, note, link, and a product from the book. */
export function PinEditor({ spreadId, pin, onClose }: { spreadId: string; pin: Pin; onClose: () => void }) {
  const book = useBook();
  const items = Object.values(book.items).sort((a, b) => a.name.localeCompare(b.name));
  const set = (patch: Partial<Pin>) => updatePin(spreadId, pin.id, patch);
  return (
    <div className="pin-edit" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <InlineText as="h3" className="pin-card__title" value={pin.title} onCommit={(v) => set({ title: v })} placeholder="What is here?" />
      <InlineText as="p" className="pin-card__text" value={pin.text} onCommit={(v) => set({ text: v })} placeholder="A note" multiline />
      <InlineText as="p" className="pin-card__link" value={pin.url} onCommit={(v) => set({ url: v })} placeholder="A link (optional)" raw inputMode="url" />
      <label className="pin-edit__item">
        <span className="sc">Product</span>
        <select value={pin.itemId ?? ''} onChange={(e) => set({ itemId: e.target.value || null })}>
          <option value="">None</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
      </label>
      <div className="pin-edit__actions">
        <button type="button" onClick={() => deletePin(spreadId, pin.id)}>
          Delete pin
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

PinEditor.ImageTools = function PlanImageTools({ spreadId }: { spreadId: string }) {
  return <ImageTools target={{ kind: 'plan', spreadId }} corner />;
};

/** Add a pin where the plan is clicked; drag a pin to move it (one undo step per move). */
export function usePinActions(spreadId: string) {
  const drag = useRef<{ id: string; moved: boolean; x: number; y: number; pointer: number } | null>(null);
  return {
    add: (x: number, y: number) => addPin(spreadId, x, y),
    move: (id: string, x: number, y: number) => updatePin(spreadId, id, { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) }),
    startDrag: (e: PointerEvent, id: string) => {
      const btn = e.currentTarget as HTMLElement;
      const wrap = btn.parentElement as HTMLElement;
      const plate = wrap.parentElement as HTMLElement;
      btn.setPointerCapture(e.pointerId);
      drag.current = { id, moved: false, x: 0, y: 0, pointer: e.pointerId };
      const startX = e.clientX;
      const startY = e.clientY;
      const move = (ev: globalThis.PointerEvent) => {
        const d = drag.current;
        if (!d || ev.pointerId !== d.pointer) return;
        if (!d.moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        const r = plate.getBoundingClientRect();
        d.moved = true;
        d.x = Math.min(98, Math.max(2, ((ev.clientX - r.left) / r.width) * 100));
        d.y = Math.min(98, Math.max(2, ((ev.clientY - r.top) / r.height) * 100));
        wrap.style.left = `${d.x}%`;
        wrap.style.top = `${d.y}%`;
      };
      const up = () => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointercancel', up);
        const d = drag.current;
        drag.current = null;
        if (d?.moved) {
          updatePin(spreadId, d.id, { x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 });
          // Swallow the click that follows a drag.
          btn.addEventListener('click', (c) => c.stopImmediatePropagation(), { capture: true, once: true });
        }
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    },
  };
}
