import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { getBook, findSpread, useBook } from '../store/book';
import { ingestFile, UnsupportedImageError } from '../store/assets';
import { imageRefsOf, readImage, refKey, setImage, setImages, swapImages, type ImageRef } from '../store/actions';

const SWAP_TYPE = 'application/x-bannehr-image';

interface Props {
  spreadId?: string;
  slotKey?: string;
  target?: ImageRef;
  /** Hide the toolbar (tiny slots); dropping and tapping still work. */
  compact?: boolean;
  /** Keep the image itself free for other clicks (plans take pins); tools sit in a corner. */
  corner?: boolean;
}

/** Where the extra photos of a multi-file drop go: the next empty places after this one. */
function followingEmpty(ref: ImageRef): ImageRef[] {
  const book = getBook();
  const spreadId = 'spreadId' in ref ? ref.spreadId : null;
  const chapters = book.chapters;
  let chapterIdx = 0;
  let spreadIdx = 0;
  if (spreadId) {
    const f = findSpread(book, spreadId);
    if (f) {
      chapterIdx = chapters.indexOf(f.chapter);
      spreadIdx = f.index;
    }
  } else {
    // An item: start from the spread that lists it.
    outer: for (let c = 0; c < chapters.length; c++)
      for (let s = 0; s < chapters[c].spreads.length; s++)
        if (Object.values(chapters[c].spreads[s].slots).some((sl) => sl.kind === 'items' && ref.kind === 'item' && sl.itemIds.includes(ref.itemId))) {
          chapterIdx = c;
          spreadIdx = s;
          break outer;
        }
  }
  const refs: ImageRef[] = [];
  const chapter = chapters[chapterIdx];
  for (let s = spreadIdx; s < chapter.spreads.length; s++) refs.push(...imageRefsOf(chapter.spreads[s], book));
  const start = refs.findIndex((r) => refKey(r) === refKey(ref));
  return refs.slice(start + 1).filter((r) => readImage(book, r)?.assetId === null);
}

export function ImageTools({ spreadId, slotKey, target, compact, corner }: Props) {
  const ref: ImageRef = target ?? { kind: 'slot', spreadId: spreadId!, key: slotKey! };
  const book = useBook();
  const fields = readImage(book, ref);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'focal' | 'details'>('idle');

  if (!fields) return null;
  const hasPhoto = !!fields.assetId;

  async function take(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!images.length) return;
    setBusy(true);
    setError(null);
    try {
      const targets = [ref, ...followingEmpty(ref)];
      const entries: { ref: ImageRef; assetId: string }[] = [];
      for (let i = 0; i < images.length && i < targets.length; i++) {
        const meta = await ingestFile(images[i]);
        entries.push({ ref: targets[i], assetId: meta.id });
      }
      if (entries.length) setImages(entries);
      if (images.length > targets.length) setError(`${images.length - targets.length} more photo(s) had no empty place on this chapter’s pages.`);
    } catch (e) {
      setError(e instanceof UnsupportedImageError ? e.message : 'That photo could not be added.');
    } finally {
      setBusy(false);
    }
  }

  const onDragOver = (e: DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes('Files') || types.includes(SWAP_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes(SWAP_TYPE) ? 'move' : 'copy';
      setOver(true);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const swap = e.dataTransfer.getData(SWAP_TYPE);
    if (swap) {
      try {
        swapImages(JSON.parse(swap) as ImageRef, ref);
      } catch {
        /* not ours */
      }
      return;
    }
    void take(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      ref={root}
      className={['image-tools', over && 'is-over', !hasPhoto && 'is-empty', compact && 'is-compact', corner && 'is-corner', mode !== 'idle' && `is-${mode}`].filter(Boolean).join(' ')}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          void take(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      {!hasPhoto && corner ? (
        <button type="button" className="image-tools__corner" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Developing…' : '+ Add the drawing'}
        </button>
      ) : null}

      {!hasPhoto && !corner ? (
        <button type="button" className="image-tools__empty" onClick={() => input.current?.click()} disabled={busy}>
          <span className="sc">{busy ? 'Developing…' : compact ? '+ Photo' : 'Drop a photo, or tap to choose'}</span>
        </button>
      ) : null}

      {hasPhoto && mode === 'idle' && !compact ? (
        <div className="image-tools__bar" role="toolbar" aria-label="Photo">
          <button type="button" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Developing…' : 'Replace'}
          </button>
          <button type="button" onClick={() => setMode('focal')}>
            Focal point
          </button>
          <button type="button" onClick={() => setMode('details')}>
            Alt &amp; credit
          </button>
          <button
            type="button"
            className="image-tools__swap"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(SWAP_TYPE, JSON.stringify(ref));
              e.dataTransfer.effectAllowed = 'move';
            }}
            title="Drag onto another photo to swap them"
            aria-label="Swap: drag onto another photo"
          >
            ⇄ Swap
          </button>
          <button type="button" onClick={() => setImage(ref, { assetId: null })}>
            Remove
          </button>
        </div>
      ) : null}

      {hasPhoto && compact && mode === 'idle' ? (
        <button type="button" className="image-tools__mini" onClick={() => input.current?.click()} aria-label="Replace photo">
          ↻
        </button>
      ) : null}

      {mode === 'focal' ? <FocalPoint target={ref} focal={fields.focal} host={root} onDone={() => setMode('idle')} /> : null}
      {mode === 'details' ? (
        <Details alt={fields.alt} credit={fields.credit} decorative={fields.decorative} kind={ref.kind} onDone={(patch) => {
          if (patch) setImage(ref, patch);
          setMode('idle');
        }} />
      ) : null}

      {error ? (
        <p className="image-tools__error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** Drag the crosshair to the part of the photo that must never be cropped away. */
function FocalPoint({
  target,
  focal,
  host,
  onDone,
}: {
  target: ImageRef;
  focal: { x: number; y: number };
  host: React.RefObject<HTMLDivElement | null>;
  onDone: () => void;
}) {
  const [f, setF] = useState(focal);
  const live = useRef(focal);
  const pic = () => host.current?.closest('.pic') as HTMLElement | null;

  const apply = (x: number, y: number) => {
    const next = { x: Math.round(Math.min(100, Math.max(0, x))), y: Math.round(Math.min(100, Math.max(0, y))) };
    live.current = next;
    setF(next);
    const p = pic();
    p?.style.setProperty('--fx', `${next.x}%`);
    p?.style.setProperty('--fy', `${next.y}%`);
  };

  const fromPointer = (e: PointerEvent) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return;
    apply(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  };

  const committed = useRef(false);
  const commit = () => {
    committed.current = true;
    if (live.current.x !== focal.x || live.current.y !== focal.y) setImage(target, { focal: live.current });
  };

  // Leaving without committing puts the photo back where it was.
  useEffect(() => {
    const p = pic();
    return () => {
      if (committed.current) return;
      p?.style.setProperty('--fx', `${focal.x}%`);
      p?.style.setProperty('--fy', `${focal.y}%`);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      e.stopPropagation();
      apply(live.current.x + m[0], live.current.y + m[1]);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      commit();
      onDone();
    }
  };

  return (
    <div
      className="focal"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => e.buttons && fromPointer(e)}
      onPointerUp={commit}
    >
      <div
        className="focal__cross"
        style={{ left: `${f.x}%`, top: `${f.y}%` }}
        role="slider"
        tabIndex={0}
        autoFocus
        aria-label="Focal point. Arrow keys move it; Enter when done."
        aria-valuetext={`${f.x}% across, ${f.y}% down`}
        onKeyDown={onKey}
      />
      <p className="focal__hint sc">Drag to the part that must always show</p>
      <button
        type="button"
        className="focal__done"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          commit();
          onDone();
        }}
      >
        Set focus
      </button>
    </div>
  );
}

function Details({
  alt,
  credit,
  decorative,
  kind,
  onDone,
}: {
  alt: string;
  credit: string;
  decorative: boolean;
  kind: ImageRef['kind'];
  onDone: (patch: { alt?: string; credit?: string; decorative?: boolean } | null) => void;
}) {
  const [a, setA] = useState(alt);
  const [c, setC] = useState(credit);
  const [d, setD] = useState(decorative);
  const slot = kind === 'slot';
  return (
    <form
      className="img-details"
      onSubmit={(e) => {
        e.preventDefault();
        onDone({ alt: a.trim(), credit: c.trim(), decorative: d });
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone(null)}
    >
      <label>
        <span className="sc">Describe the photo (alt text)</span>
        <textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} disabled={d} placeholder="What someone who cannot see it should know" autoFocus />
      </label>
      {slot ? (
        <>
          <label className="img-details__check">
            <input type="checkbox" checked={d} onChange={(e) => setD(e.target.checked)} /> Decorative: screen readers skip it
          </label>
          <label>
            <span className="sc">Credit</span>
            <input value={c} onChange={(e) => setC(e.target.value)} placeholder="Render: studio name, photo: who took it" />
          </label>
        </>
      ) : null}
      <div className="img-details__actions">
        <button type="button" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="submit" className="is-primary">
          Save
        </button>
      </div>
    </form>
  );
}
