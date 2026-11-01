import { useCallback, useEffect, useRef, useState } from 'react';
import Moveable from 'react-moveable';
import type { BoardEl } from '@/book/types';
import { addBoardEl, bumpBoardEl, patchBoardEl, placeBoardAsset, removeBoardEl } from '@/state/actions';
import { useUiStore } from '@/state/uiStore';
import { useSpread } from '@/reader/SpreadContext';
import { EditableImage } from '@/editor/EditableImage';
import { useEditSession } from '@/editor/session';
import controls from '@/editor/controls.module.css';
import board from '@/templates/moodboard/MoodBoard.module.css';
import styles from './BoardEditor.module.css';

interface Props {
  slotKey: string;
  elements: BoardEl[];
}

const GRID = 5; // percent; the drawn grid on the board

/**
 * The mood board in Edit mode: drag, resize and rotate elements with
 * react-moveable, snapping to the board's 5% grid (hold Alt/Option to move
 * freely); add photos, swatches, text and notes; order and delete.
 */
export function BoardEditor({ slotKey, elements }: Props) {
  const { ref } = useSpread();
  const spreadId = ref.spread.id;
  const author = useUiStore((s) => s.author);
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [alt, setAlt] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [tick, setTick] = useState(0);
  const { change, end } = useEditSession();
  const els = [...elements].sort((a, b) => a.z - b.z);
  const sel = elements.find((e) => e.id === selected) ?? null;

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Alt' && setAlt(true);
    const up = (e: KeyboardEvent) => e.key === 'Alt' && setAlt(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    setTarget(selected ? (boardRef.current?.querySelector<HTMLElement>(`[data-el-id="${selected}"]`) ?? null) : null);
    if (!selected) setEditingText(null);
  }, [selected, elements.length]);

  useEffect(() => {
    if (!boardRef.current) return;
    const ro = new ResizeObserver(() => setTick((n) => n + 1));
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  const pct = useCallback((px: number, axis: 'x' | 'y') => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return (px / (axis === 'x' ? r.width : r.height)) * 100;
  }, []);

  const commitBox = (el: HTMLElement) => {
    const x = pct(parseFloat(el.style.left), 'x');
    const y = pct(parseFloat(el.style.top), 'y');
    const w = pct(parseFloat(el.style.width), 'x');
    const h = pct(parseFloat(el.style.height), 'y');
    if ([x, y, w, h].some((n) => Number.isNaN(n))) return;
    patchBoardEl(spreadId, slotKey, el.dataset.elId!, {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: Math.max(3, Math.round(w * 10) / 10),
      h: Math.max(3, Math.round(h * 10) / 10),
    });
  };

  const rect = boardRef.current?.getBoundingClientRect();
  const gridW = rect ? (rect.width * GRID) / 100 : 20;
  const gridH = rect ? (rect.height * GRID) / 100 : 20;

  const add = (type: BoardEl['type']) => {
    const k = elements.length;
    const base = { x: 8 + ((k * 7) % 50), y: 8 + ((k * 9) % 50), rotation: 0 };
    const el: Omit<BoardEl, 'id' | 'z'> =
      type === 'image'
        ? { type, ...base, w: 30, h: 36, assetId: null, placeholder: `${ref.chapter.title.toUpperCase()} — PHOTO` }
        : type === 'swatch'
          ? { type, ...base, w: 12, h: 12, color: '#8A9A7B' }
          : type === 'text'
            ? { type, ...base, w: 32, h: 14, text: 'A line of text' }
            : { type, ...base, w: 24, h: 18, text: '', author: author ?? 'sonny' };
    const id = addBoardEl(spreadId, slotKey, el);
    if (id) {
      setSelected(id);
      if (type === 'text' || type === 'note') setEditingText(id);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!sel || editingText) return;
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const step = e.shiftKey ? GRID : 1;
    const moves: Record<string, Partial<BoardEl>> = {
      ArrowLeft: { x: sel.x - step },
      ArrowRight: { x: sel.x + step },
      ArrowUp: { y: sel.y - step },
      ArrowDown: { y: sel.y + step },
    };
    if (moves[e.key]) {
      e.preventDefault();
      patchBoardEl(spreadId, slotKey, sel.id, moves[e.key]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeBoardEl(spreadId, slotKey, sel.id);
      setSelected(null);
    } else if (e.key === ']') bumpBoardEl(spreadId, slotKey, sel.id, 1);
    else if (e.key === '[') bumpBoardEl(spreadId, slotKey, sel.id, -1);
    else if (e.key === 'Enter' && (sel.type === 'text' || sel.type === 'note')) setEditingText(sel.id);
    else if (e.key === 'Escape') setSelected(null);
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div className={[styles.toolbar, controls.toolbar].join(' ')} role="toolbar" aria-label="Mood board tools" data-no-swipe data-no-tap>
        <span className={[styles.hint, 't-label'].join(' ')}>{alt ? 'Free' : 'Snapping'}</span>
        <button type="button" className={controls.ghost} onClick={() => add('image')} data-testid="board-add-image">+ Photo</button>
        <button type="button" className={controls.ghost} onClick={() => add('swatch')} data-testid="board-add-swatch">+ Swatch</button>
        <button type="button" className={controls.ghost} onClick={() => add('text')} data-testid="board-add-text">+ Text</button>
        <button type="button" className={controls.ghost} onClick={() => add('note')} data-testid="board-add-note">+ Note</button>
        {sel && (
          <>
            <span className={styles.sep} />
            {sel.type === 'swatch' && (
              <input type="color" className={styles.colour} value={sel.color ?? '#8A9A7B'} onChange={(e) => change(() => patchBoardEl(spreadId, slotKey, sel.id, { color: e.target.value }))} onBlur={end} aria-label="Swatch colour" />
            )}
            {(sel.type === 'text' || sel.type === 'note') && (
              <button type="button" className={controls.ghost} onClick={() => setEditingText(editingText === sel.id ? null : sel.id)} aria-pressed={editingText === sel.id}>Text</button>
            )}
            <button type="button" className={controls.iconButton} onClick={() => bumpBoardEl(spreadId, slotKey, sel.id, 1)} aria-label="Bring forward" title="Bring forward ]">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
            <button type="button" className={controls.iconButton} onClick={() => bumpBoardEl(spreadId, slotKey, sel.id, -1)} aria-label="Send back" title="Send back [">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            </button>
            <button type="button" className={controls.iconButton} onClick={() => { removeBoardEl(spreadId, slotKey, sel.id); setSelected(null); }} aria-label="Delete element" title="Delete" data-testid="board-delete">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
            </button>
          </>
        )}
      </div>
      <div
        ref={boardRef}
        className={board.board}
        data-testid="moodboard"
        data-no-swipe
        data-no-tap
        tabIndex={0}
        role="application"
        aria-label="Mood board canvas. Arrow keys move the selected element; Delete removes it."
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (e.target === boardRef.current) setSelected(null);
        }}
      >
        {els.map((el) => (
          <EditableBoardElement
            key={el.id}
            el={el}
            selected={el.id === selected}
            editingText={editingText === el.id}
            onSelect={() => setSelected(el.id)}
            onTextDone={() => setEditingText(null)}
            spreadId={spreadId}
            slotKey={slotKey}
          />
        ))}
        {target && sel && (
          <Moveable
            key={`${sel.id}-${tick}`}
            target={target}
            draggable
            resizable
            rotatable
            keepRatio={false}
            origin={false}
            throttleDrag={0}
            snappable={!alt}
            snapGridWidth={gridW}
            snapGridHeight={gridH}
            snapRotationDegrees={alt ? [] : [0, 15, 30, 45, 60, 75, 90, -15, -30, -45, -60, -75, -90]}
            snapRotationThreshold={alt ? 0 : 4}
            renderDirections={['nw', 'ne', 'sw', 'se']}
            rotationPosition="top"
            onDrag={(e) => {
              e.target.style.left = `${e.left}px`;
              e.target.style.top = `${e.top}px`;
            }}
            onDragEnd={(e) => commitBox(e.target as HTMLElement)}
            onResize={(e) => {
              e.target.style.width = `${e.width}px`;
              e.target.style.height = `${e.height}px`;
              e.target.style.left = `${e.drag.left}px`;
              e.target.style.top = `${e.drag.top}px`;
            }}
            onResizeEnd={(e) => commitBox(e.target as HTMLElement)}
            onRotate={(e) => {
              e.target.style.transform = `rotate(${e.rotate}deg)`;
            }}
            onRotateEnd={(e) => {
              const m = /rotate\(([-\d.]+)deg\)/.exec((e.target as HTMLElement).style.transform);
              if (m) patchBoardEl(spreadId, slotKey, (e.target as HTMLElement).dataset.elId!, { rotation: Math.round(parseFloat(m[1]) * 10) / 10 });
            }}
          />
        )}
      </div>
    </div>
  );
}

interface ElProps {
  el: BoardEl;
  selected: boolean;
  editingText: boolean;
  onSelect: () => void;
  onTextDone: () => void;
  spreadId: string;
  slotKey: string;
}

function EditableBoardElement({ el, selected, editingText, onSelect, onTextDone, spreadId, slotKey }: ElProps) {
  const { change, end } = useEditSession();
  const textRef = useRef<HTMLDivElement>(null);
  const style: React.CSSProperties = {
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    transform: `rotate(${el.rotation}deg)`,
    zIndex: el.z,
  };
  useEffect(() => {
    if (editingText) {
      const t = textRef.current;
      if (t) {
        if (t.textContent !== (el.text ?? '')) t.textContent = el.text ?? '';
        t.focus();
      }
    }
  }, [editingText]); // eslint-disable-line react-hooks/exhaustive-deps

  const common = {
    'data-el-id': el.id,
    'data-selected': selected ? 'true' : 'false',
    'data-editable': 'true',
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect();
    },
    onDoubleClick: () => (el.type === 'text' || el.type === 'note') && onSelect(),
  } as const;

  const textNode = (cls: string) =>
    editingText ? (
      <div
        ref={textRef}
        className={[cls, styles.textEdit].join(' ')}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        onInput={(e) => change(() => patchBoardEl(spreadId, slotKey, el.id, { text: (e.currentTarget as HTMLDivElement).innerText }))}
        onBlur={() => {
          end();
          onTextDone();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') (e.currentTarget as HTMLDivElement).blur();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        role="textbox"
        aria-label="Element text"
      />
    ) : (
      <span className={cls}>{el.text}</span>
    );

  switch (el.type) {
    case 'image':
      return (
        <div className={[board.el, board.image, styles.el].join(' ')} style={style} {...common}>
          <EditableImage
            target={{
              key: `board:${el.id}`,
              place: (assets) => placeBoardAsset(spreadId, slotKey, el.id, assets[0]),
              patch: () => undefined,
              clear: () => patchBoardEl(spreadId, slotKey, el.id, { assetId: null }),
            }}
            slot={{ kind: 'image', assetId: el.assetId ?? null, focal: { x: 0.5, y: 0.5 }, caption: '', alt: el.placeholder ?? '', credit: '', placeholder: el.placeholder ?? 'Image' }}
            size="small"
            sizes="(min-width: 820px) 35vw, 60vw"
            compact
          />
        </div>
      );
    case 'swatch':
      return (
        <div className={[board.el, board.swatch, styles.el].join(' ')} style={{ ...style, background: el.color }} {...common}>
          <span className={[board.swatchHex, 't-label'].join(' ')}>{(el.color ?? '').replace('#', '').toUpperCase()}</span>
        </div>
      );
    case 'text':
      return (
        <div className={[board.el, board.text, styles.el].join(' ')} style={style} {...common}>
          {textNode('')}
        </div>
      );
    case 'note':
      return (
        <div className={[board.el, board.note, styles.el].join(' ')} style={style} data-author={el.author} {...common}>
          {textNode('')}
          {el.author && <span className={board.noteAuthor}>{el.author === 'sonny' ? 'Sonny' : 'Adi'}</span>}
        </div>
      );
  }
}
