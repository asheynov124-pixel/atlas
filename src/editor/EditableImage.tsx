import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Asset, Focal, ImageSlot } from '@/book/types';
import { clampFocal } from '@/book/slots';
import { getImageSlot, imageSlotPaths, patchImageSlot, placeAssets, setImageAsset, swapImageSlots } from '@/state/actions';
import { useBookStore } from '@/state/bookStore';
import { useSpread } from '@/reader/SpreadContext';
import { PlateInner, type PlateProps } from '@/reader/Plate';
import { ingestFiles } from './assets';
import { useEditSession } from './session';
import styles from './EditableImage.module.css';

const SLOT_MIME = 'application/x-sb-slot';

/** Where a dropped photo goes. Image slots, items, board images and material swatches all fit. */
export interface ImageTarget {
  key: string;
  place: (assets: Asset[]) => void;
  patch: (patch: Partial<Omit<ImageSlot, 'kind'>>) => void;
  clear: () => void;
  /** Only image slots can be swapped by dragging one onto another. */
  swap?: { spreadId: string; path: string };
  /** Alt / credit / caption fields apply to slots only. */
  details?: boolean;
}

/** The target for a named image slot of the current spread (fills following empty slots with extra files). */
export function slotTarget(spreadId: string, slotKey: string): ImageTarget {
  return {
    key: slotKey,
    details: true,
    swap: { spreadId, path: slotKey },
    place: (assets) => {
      const book = useBookStore.getState().book;
      const spread = book.chapters.flatMap((c) => c.spreads).find((s) => s.id === spreadId);
      const paths = spread ? imageSlotPaths(spread) : [slotKey];
      const targets = [slotKey, ...paths.filter((p) => p !== slotKey && spread && !getImageSlot(spread, p)?.assetId)];
      placeAssets(
        spreadId,
        assets.map((asset, i) => ({ path: targets[i], asset })).filter((p) => !!p.path),
      );
    },
    patch: (patch) => patchImageSlot(spreadId, slotKey, patch),
    clear: () => setImageAsset(spreadId, slotKey, null),
  };
}

type Props = PlateProps & ({ slotKey: string; target?: undefined } | { target: ImageTarget; slotKey?: undefined }) & {
  /** Empty state as a small corner button instead of a full-size drop area (plans with pins). */
  compact?: boolean;
};

/**
 * Edit-mode wrapper for a Plate: drop or choose photos, set the focal point
 * with a crosshair, add alt text and a credit, remove, and drag the grip onto
 * another plate to swap the two.
 */
export function EditableImage({ slotKey, target: givenTarget, slot, compact, ...plateProps }: Props) {
  const { ref } = useSpread();
  const spreadId = ref.spread.id;
  const target = givenTarget ?? slotTarget(spreadId, slotKey!);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [focalMode, setFocalMode] = useState(false);
  const [details, setDetails] = useState(false);
  const [focal, setFocal] = useState<Focal>(slot.focal);
  const [error, setError] = useState<string | null>(null);
  const { change, end } = useEditSession();
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  useEffect(() => setFocal(slot.focal), [slot.focal.x, slot.focal.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = !slot.assetId;

  async function receiveFiles(files: FileList | File[]) {
    setError(null);
    setBusy('Adding…');
    try {
      const assets = await ingestFiles(files);
      if (assets.length === 0) return;
      target.place(assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that photo.');
    } finally {
      setBusy(null);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const data = e.dataTransfer.getData(SLOT_MIME);
    if (data) {
      try {
        const from = JSON.parse(data) as { spreadId: string; path: string };
        if (target.swap && (from.spreadId !== target.swap.spreadId || from.path !== target.swap.path)) swapImageSlots(from, target.swap);
      } catch {
        /* ignore */
      }
      return;
    }
    if (e.dataTransfer.files?.length) void receiveFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes(SLOT_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(SLOT_MIME) ? 'move' : 'copy';
      setOver(true);
    }
  };

  const commitFocal = (f: Focal) => {
    const c = clampFocal(f);
    setFocal(c);
    change(() => target.patch({ focal: c }));
  };

  const focalFromEvent = (e: React.PointerEvent<HTMLDivElement>): Focal => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  return (
    <div
      className={styles.wrap}
      data-empty={empty ? 'true' : 'false'}
      data-over={over ? 'true' : 'false'}
      data-touch={touch ? 'true' : 'false'}
      data-size={plateProps.size ?? 'full'}
      data-slot-path={target.key}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      data-no-swipe
    >
      <PlateInner slot={slot} {...plateProps} focal={focal} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void receiveFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className={styles.overlay}>
        {empty && !busy && compact && (
          <div className={styles.tools} role="toolbar" aria-label="Photo tools" style={{ opacity: 1 }}>
            <button type="button" className={styles.tool} onClick={() => inputRef.current?.click()} aria-label={`Add a photo: ${slot.placeholder}`} title="Add a photo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </button>
          </div>
        )}
        {empty && !busy && !compact && (
          <button type="button" className={styles.hit} onClick={() => inputRef.current?.click()} aria-label={`Add a photo: ${slot.placeholder}`}>
            <span className={[styles.hint, 't-label'].join(' ')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <span>{touch ? 'Tap to choose a photo' : 'Drop a photo, or click to choose'}</span>
            </span>
          </button>
        )}
        {!empty && !focalMode && (
          <div className={styles.tools} role="toolbar" aria-label="Photo tools">
            {target.swap && (
              <button type="button" className={[styles.tool, styles.grip].join(' ')} draggable onDragStart={(e) => { e.dataTransfer.setData(SLOT_MIME, JSON.stringify(target.swap)); e.dataTransfer.effectAllowed = 'move'; }} aria-label="Drag onto another photo to swap" title="Drag onto another photo to swap">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M7 12h10M7 17h10" /></svg>
              </button>
            )}
            <button type="button" className={styles.tool} onClick={() => inputRef.current?.click()} aria-label="Replace photo" title="Replace">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </button>
            <button type="button" className={styles.tool} onClick={() => { setFocalMode(true); setDetails(false); }} aria-label="Set focal point" title="Focal point">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
            </button>
            {target.details && (
              <button type="button" className={styles.tool} onClick={() => setDetails((v) => !v)} aria-pressed={details} aria-label="Alt text, credit and caption" title="Details">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
              </button>
            )}
            <button type="button" className={styles.tool} onClick={() => target.clear()} aria-label="Remove photo" title="Remove">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
        {focalMode && (
          <>
            <div
              className={styles.focal}
              role="slider"
              tabIndex={0}
              aria-label="Focal point. Drag, or use the arrow keys."
              aria-valuetext={`${Math.round(focal.x * 100)}% across, ${Math.round(focal.y * 100)}% down`}
              aria-valuenow={Math.round(focal.x * 100)}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); commitFocal(focalFromEvent(e)); }}
              onPointerMove={(e) => { if (e.buttons & 1) commitFocal(focalFromEvent(e)); }}
              onPointerUp={() => end()}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.02;
                const map: Record<string, Focal> = { ArrowLeft: { x: focal.x - step, y: focal.y }, ArrowRight: { x: focal.x + step, y: focal.y }, ArrowUp: { x: focal.x, y: focal.y - step }, ArrowDown: { x: focal.x, y: focal.y + step } };
                if (map[e.key]) { e.preventDefault(); commitFocal(map[e.key]); }
                if (e.key === 'Enter' || e.key === 'Escape') { end(); setFocalMode(false); }
              }}
            >
              <div className={styles.focalV} style={{ left: `${focal.x * 100}%` }} />
              <div className={styles.focalH} style={{ top: `${focal.y * 100}%` }} />
              <div className={styles.focalDot} style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
            </div>
            <div className={styles.focalBar}>
              <span className="t-label">Drag to set the focal point</span>
              <button type="button" className={styles.done} onClick={() => { end(); setFocalMode(false); }}>Done</button>
            </div>
          </>
        )}
        {details && !empty && (
          <div className={styles.details} data-no-tap>
            <div className={styles.detailsRow}>
              <span className="t-label">Plate details</span>
              <button type="button" className={styles.tool} onClick={() => setDetails(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <label className={styles.field}>
              <span className="t-label">Alt text</span>
              <input value={slot.alt} placeholder="What is in the picture" onChange={(e) => change(() => target.patch({ alt: e.target.value }))} onBlur={end} disabled={!!slot.decorative} />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={!!slot.decorative} onChange={(e) => target.patch({ decorative: e.target.checked })} />
              <span className="t-label">Decorative (no alt needed)</span>
            </label>
            <label className={styles.field}>
              <span className="t-label">Credit</span>
              <input value={slot.credit} placeholder="Photo: Adi" onChange={(e) => change(() => target.patch({ credit: e.target.value }))} onBlur={end} />
            </label>
            <label className={styles.field}>
              <span className="t-label">Caption</span>
              <input value={slot.caption} placeholder="A caption, set like a book" onChange={(e) => change(() => target.patch({ caption: e.target.value }))} onBlur={end} />
            </label>
            <p className={[styles.small, 't-label'].join(' ')}>Placeholder label: {slot.placeholder}</p>
          </div>
        )}
        {(busy || error) && (
          <div className={styles.busy} onClick={() => setError(null)}>
            <span className={[styles.hint, 't-label'].join(' ')} style={{ background: 'var(--ink)' }}>{error ?? busy}</span>
          </div>
        )}
      </div>
    </div>
  );
}
