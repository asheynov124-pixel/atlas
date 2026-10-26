import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import Moveable from 'react-moveable';
import { BoardElement } from '../templates/MoodBoard';
import { addBoardEl, deleteBoardEl, restackBoardEl, setImage, updateBoardEl } from '../store/actions';
import { ingestFile, UnsupportedImageError } from '../store/assets';
import { usePrefs } from '../store/prefs';
import { AUTHORS, type BoardEl } from '../model/types';

const GRID = 2; // percent of the board: the invisible grid things snap to

/**
 * The mood board in Edit mode: drag, resize and rotate anything; it snaps to an
 * invisible grid, and holding Alt (Option) lets it go free. Each gesture is one undo step.
 */
export default function BoardEditor({ spreadId, elements }: { spreadId: string; elements: BoardEl[] }) {
  const canvas = useRef<HTMLDivElement>(null);
  const moveable = useRef<Moveable>(null);
  const file = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [free, setFree] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  // A press on an unselected element selects it and starts dragging it at once.
  const pendingDrag = useRef<PointerEvent | null>(null);
  const who = usePrefs((s) => s.who) ?? 'adi';
  const sel = elements.find((e) => e.id === selected) ?? null;

  // Alt / Option frees the element from the grid while held.
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Alt' && setFree(true);
    const up = (e: KeyboardEvent) => e.key === 'Alt' && setFree(false);
    const onKey = (e: KeyboardEvent) => {
      if (!selected || editingText) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteBoardEl(spreadId, selected);
        setSelected(null);
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', () => setFree(false));
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('keydown', onKey);
    };
  }, [selected, editingText, spreadId]);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    moveable.current?.updateRect();
  });

  useLayoutEffect(() => {
    const e = pendingDrag.current;
    pendingDrag.current = null;
    // Moveable binds its target on mount; hand it the press on the next frame.
    if (e) requestAnimationFrame(() => moveable.current?.dragStart(e));
  }, [selected]);

  const target = selected ? canvas.current?.querySelector<HTMLElement>(`[data-el="${selected}"]`) ?? null : null;

  const commitGeometry = (el: HTMLElement) => {
    const c = canvas.current;
    if (!c || !selected) return;
    const rot = parseFloat(el.style.getPropertyValue('--rot')) || 0;
    const pct = (n: number, of: number) => Math.round((n / of) * 1000) / 10;
    updateBoardEl(spreadId, selected, {
      x: pct(el.offsetLeft, c.clientWidth),
      y: pct(el.offsetTop, c.clientHeight),
      w: pct(el.offsetWidth, c.clientWidth),
      h: pct(el.offsetHeight, c.clientHeight),
      rotate: Math.round(rot * 10) / 10,
    });
  };

  const add = (type: BoardEl['type']) => {
    const base = { x: 38, y: 30, rotate: 0 };
    const id =
      type === 'image'
        ? addBoardEl(spreadId, { ...base, type, w: 24, h: 34, assetId: null, label: 'A photo to come' })
        : type === 'swatch'
          ? addBoardEl(spreadId, { ...base, type, w: 10, h: 18, hex: '#8A9A7B', label: 'Sage' })
          : type === 'text'
            ? addBoardEl(spreadId, { ...base, type, w: 30, h: 14, text: 'A line worth keeping.' })
            : addBoardEl(spreadId, { ...base, type, w: 20, h: 18, text: '', author: who, rotate: 1.5 });
    setSelected(id);
    if (type === 'text' || type === 'note') setEditingText(id);
  };

  const putPhoto = async (files: File[], elId: string) => {
    const f = files.find((x) => x.type.startsWith('image/') || /\.(heic|heif)$/i.test(x.name));
    if (!f) return;
    setError(null);
    try {
      const meta = await ingestFile(f);
      setImage({ kind: 'board', spreadId, elId }, { assetId: meta.id, focal: { x: 50, y: 50 } });
    } catch (e) {
      setError(e instanceof UnsupportedImageError ? e.message : 'That photo could not be added.');
    }
  };

  return (
    <div className="board__canvas board__canvas--edit" ref={canvas} onPointerDown={(e) => e.target === canvas.current && (setSelected(null), setEditingText(null))}>
      {elements.map((el) => {
        const isText = el.type === 'text' || el.type === 'note';
        if (editingText === el.id && isText) {
          return <TextEl key={el.id} el={el} onDone={(text) => {
            setEditingText(null);
            if (el.type === 'note' && !text) deleteBoardEl(spreadId, el.id);
            else if (text !== el.text) updateBoardEl(spreadId, el.id, { text });
          }} />;
        }
        return (
          <div
            key={el.id}
            className={['bel-hit', selected === el.id && 'is-selected'].filter(Boolean).join(' ')}
            onPointerDown={(e) => {
              if (selected !== el.id) {
                pendingDrag.current = e.nativeEvent;
                setSelected(el.id);
              }
            }}
            onDoubleClick={() => isText && setEditingText(el.id)}
            onFocus={() => setSelected(el.id)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 5 : e.altKey ? 0.5 : GRID / 2;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              const m = moves[e.key];
              if (m) {
                e.preventDefault();
                e.stopPropagation();
                updateBoardEl(spreadId, el.id, { x: Math.round((el.x + m[0]) * 10) / 10, y: Math.round((el.y + m[1]) * 10) / 10 });
              } else if (e.key === 'Enter' && isText) {
                e.preventDefault();
                setEditingText(el.id);
              }
            }}
            onDragOver={(e: DragEvent) => {
              if (el.type === 'image' && e.dataTransfer.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e: DragEvent) => {
              if (el.type !== 'image') return;
              e.preventDefault();
              void putPhoto(Array.from(e.dataTransfer.files), el.id);
            }}
          >
            <BoardElement el={el} focusable />
          </div>
        );
      })}

      {target && !editingText ? (
        <Moveable
          ref={moveable}
          target={target}
          draggable
          resizable
          rotatable
          keepRatio={false}
          origin={false}
          throttleRotate={free ? 0 : 1}
          snappable={!free}
          snapGridWidth={(size.w * GRID) / 100}
          snapGridHeight={(size.h * GRID) / 100}
          isDisplayGridGuidelines={false}
          snapThreshold={6}
          renderDirections={['nw', 'ne', 'sw', 'se']}
          onDrag={(e) => {
            e.target.style.left = `${e.left}px`;
            e.target.style.top = `${e.top}px`;
          }}
          onDragEnd={(e) => e.isDrag && commitGeometry(e.target as HTMLElement)}
          onResize={(e) => {
            e.target.style.width = `${e.width}px`;
            e.target.style.height = `${e.height}px`;
            e.target.style.left = `${e.drag.left}px`;
            e.target.style.top = `${e.drag.top}px`;
          }}
          onResizeEnd={(e) => e.isDrag && commitGeometry(e.target as HTMLElement)}
          onRotate={(e) => {
            (e.target as HTMLElement).style.setProperty('--rot', `${e.rotation}deg`);
          }}
          onRotateEnd={(e) => e.isDrag && commitGeometry(e.target as HTMLElement)}
        />
      ) : null}

      <div className="board-tools" role="toolbar" aria-label="Mood board" onPointerDown={(e) => e.stopPropagation()}>
        <span className="board-tools__group">
          <span className="sc board-tools__label">Add</span>
          <button type="button" onClick={() => add('image')}>Photo</button>
          <button type="button" onClick={() => add('swatch')}>Swatch</button>
          <button type="button" onClick={() => add('text')}>Words</button>
          <button type="button" onClick={() => add('note')}>Note</button>
        </span>
        {sel ? (
          <span className="board-tools__group">
            {sel.type === 'image' ? (
              <>
                <button type="button" onClick={() => file.current?.click()}>
                  {sel.assetId ? 'Replace photo' : 'Choose photo'}
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/*,.heic,.heif"
                  hidden
                  onChange={(e) => {
                    void putPhoto(Array.from(e.target.files ?? []), sel.id);
                    e.target.value = '';
                  }}
                />
              </>
            ) : null}
            {sel.type === 'swatch' ? (
              <>
                <input
                  type="color"
                  className="board-tools__well"
                  aria-label="Swatch colour"
                  defaultValue={sel.hex}
                  key={sel.id + sel.hex}
                  onBlur={(e) => e.target.value.toUpperCase() !== sel.hex?.toUpperCase() && updateBoardEl(spreadId, sel.id, { hex: e.target.value.toUpperCase() })}
                />
                <input
                  className="board-tools__name"
                  aria-label="Swatch name"
                  defaultValue={sel.label}
                  key={`${sel.id}-name-${sel.label}`}
                  onBlur={(e) => e.target.value !== sel.label && updateBoardEl(spreadId, sel.id, { label: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </>
            ) : null}
            {sel.type === 'text' || sel.type === 'note' ? (
              <button type="button" onClick={() => setEditingText(sel.id)}>
                Edit words
              </button>
            ) : null}
            <button type="button" onClick={() => restackBoardEl(spreadId, sel.id, 1)} aria-label="Bring forward">
              Forward
            </button>
            <button type="button" onClick={() => restackBoardEl(spreadId, sel.id, -1)} aria-label="Send back">
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                deleteBoardEl(spreadId, sel.id);
                setSelected(null);
              }}
            >
              Delete
            </button>
          </span>
        ) : (
          <span className="board-tools__hint">Drag to move; corners resize; the top handle turns. Hold Option to place freely.</span>
        )}
        {error ? (
          <span className="board-tools__error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TextEl({ el, onDone }: { el: BoardEl; onDone: (text: string) => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    p.focus();
    const range = document.createRange();
    range.selectNodeContents(p);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  }, []);
  const style = {
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: 999,
    '--rot': `${el.rotate}deg`,
  } as CSSProperties;
  return (
    <div className={`bel bel--${el.type} bel--editing`} style={style} data-author={el.author}>
      <p
        ref={ref}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-label={el.type === 'note' ? 'Note' : 'Words on the board'}
        onBlur={(e) => onDone((e.currentTarget.innerText ?? '').trim())}
        onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget as HTMLElement).blur()}
      >
        {el.text}
      </p>
      {el.type === 'note' && el.author ? <span className="bel__by">— {AUTHORS[el.author].initial}.</span> : null}
    </div>
  );
}
