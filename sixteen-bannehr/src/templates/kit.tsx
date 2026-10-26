import {
  createElement,
  lazy,
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { useSpread, useEditing } from '../reader/context';
import { useBook } from '../store/book';
import { useAsset, useDeveloping } from '../store/assets';
import { isBlank, sanitizeHtml } from '../model/sanitize';
import type { Focal, PageSide } from '../model/types';
import { NotesLayer } from '../edit/NotesLayer';

// ── Pages ──────────────────────────────────────────────────────────────────────

interface PageProps {
  side: PageSide;
  children?: ReactNode;
  /** Running head text, or false to suppress. Defaults: book title / chapter title. */
  head?: string | false;
  folio?: boolean;
  /** Transparent page over a full-bleed image. */
  bare?: boolean;
  onImage?: boolean;
  /** A page that exists only to complete the spread (hidden on phones). */
  empty?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Lay the content out inside the margins (default) or edge to edge. */
  body?: boolean;
}

export function Page({ side, children, head, folio = true, bare, onImage, empty, className, style, body = true }: PageProps) {
  const { placed, layout } = useSpread();
  const book = useBook();
  const number = side === 'verso' ? placed.verso : placed.recto;
  const front = placed.chapter.kind === 'front';
  const defaultHead = front ? false : side === 'verso' ? book.title : placed.chapter.title;
  const runningHead = head === undefined ? defaultHead : head;
  const showFolio = folio && !front && number !== null;
  const cls = [
    'page',
    `page--${side}`,
    bare && 'page--bare',
    onImage && 'page--on-image',
    empty && 'page--empty',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const label = number !== null ? `Page ${number}` : side === 'recto' ? 'Cover' : 'Endpaper';
  return (
    <section className={cls} style={style} aria-label={empty ? undefined : label} aria-hidden={empty || undefined} data-side={side}>
      {body ? <div className="page__body">{children}</div> : children}
      {runningHead && (layout === 'spread' || side === 'verso' || !onImage) ? (
        <p className="rh" aria-hidden="true">
          {runningHead}
        </p>
      ) : null}
      {showFolio ? (
        <p className="folio" aria-hidden="true">
          {number}
        </p>
      ) : null}
      {!empty ? <NotesLayer side={side} /> : null}
    </section>
  );
}

/** The layer under both pages, for anything that crosses the gutter. */
export function Span({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['spread__span', className].filter(Boolean).join(' ')}>{children}</div>;
}

// ── Text ───────────────────────────────────────────────────────────────────────

/** Paragraph HTML as inline HTML, for titles set inside an <h1>. */
export function inline(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/g, '<br>')
    .replace(/<\/?p>/g, '')
    .replace(/<\/?blockquote>/g, '');
}

type Tag = 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span' | 'figcaption' | 'blockquote';

export interface EditableProps {
  html: string;
  onCommit?: (html: string) => void;
  as?: Tag;
  className?: string;
  /** One line: titles, captions, labels. Enter commits. */
  single?: boolean;
  /** Shown in Edit mode while the field is empty. */
  placeholder?: string;
  /** Shown in Read mode while the field is empty (otherwise nothing renders). */
  fallback?: string;
  style?: CSSProperties;
  id?: string;
}

const EditableField = lazy(() => import('../edit/EditableField'));

/**
 * Text that reads as type and, in Edit mode, edits in place. Reading never loads the
 * editor; the first click on a field in Edit mode does.
 */
export function Editable(props: EditableProps) {
  const editing = useEditing();
  const { html, as = 'div', className, single, fallback, style, id } = props;
  if (editing && props.onCommit) {
    return (
      <Suspense fallback={<StaticText as={as} html={html} single={single} className={className} style={style} id={id} />}>
        <EditableField {...props} />
      </Suspense>
    );
  }
  if (isBlank(html)) {
    if (!fallback) return null;
    return createElement(as, { className, style, id }, fallback);
  }
  return <StaticText as={as} html={html} single={single} className={className} style={style} id={id} />;
}

// Every piece of book HTML passes through the sanitizer before it reaches the DOM, whatever
// its source (seed, editor, an imported zip). Results are cached by string.
const clean = new Map<string, string>();
function safe(html: string): string {
  let out = clean.get(html);
  if (out === undefined) {
    out = sanitizeHtml(html);
    if (clean.size > 2000) clean.clear();
    clean.set(html, out);
  }
  return out;
}

export function StaticText({
  as,
  html,
  single,
  className,
  style,
  id,
}: {
  as: Tag;
  html: string;
  single?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  return createElement(as, {
    className,
    style,
    id,
    dangerouslySetInnerHTML: { __html: single ? inline(safe(html)) : safe(html) },
  });
}

// ── Images ─────────────────────────────────────────────────────────────────────

export function useBox<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (b && Math.abs(b.w - r.width) < 1 && Math.abs(b.h - r.height) < 1 ? b : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export interface PictureProps {
  assetId: string | null;
  focal?: Focal;
  label: string;
  alt: string;
  decorative?: boolean;
  tone?: string;
  /** cover fills the slot (cropping around the focal point); contain shows it whole. */
  fit?: 'cover' | 'contain';
  kenBurns?: boolean;
  slip?: 'tl' | 'tr' | 'bl' | 'br' | 'none';
  eager?: boolean;
  className?: string;
  /** Rendered over the image (edit tools). */
  children?: ReactNode;
}

/**
 * An image that never lies about its resolution. It fills its slot when it can; when
 * filling would upscale it by more than 10 %, it is shown framed, as a tipped-in plate.
 */
export function Picture({
  assetId,
  focal = { x: 50, y: 50 },
  label,
  alt,
  decorative,
  tone,
  fit = 'cover',
  kenBurns,
  slip = 'tl',
  eager,
  className,
  children,
}: PictureProps) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBox(ref);
  const asset = useAsset(assetId);
  const developing = useDeveloping(assetId);
  const editing = useEditing();
  const { placed } = useSpread();
  const chapterTone = tone ?? placed.chapter.tone;

  let framed = false;
  let scale = 1;
  if (asset && box && box.w > 0 && box.h > 0) {
    scale = fit === 'cover' ? Math.max(box.w / asset.width, box.h / asset.height) : Math.min(box.w / asset.width, box.h / asset.height);
    framed = scale > 1.1;
  }
  const sizes = box ? `${Math.ceil(framed ? Math.min(box.w, asset?.width ?? box.w) : box.w)}px` : '100vw';

  return (
    <div
      ref={ref}
      className={['pic', framed && 'pic--framed', kenBurns && 'pic--kb', className].filter(Boolean).join(' ')}
      style={{ '--tone': chapterTone, '--fx': `${focal.x}%`, '--fy': `${focal.y}%` } as CSSProperties}
    >
      {asset ? (
        <img
          className="pic__img"
          src={asset.src}
          srcSet={asset.srcset || undefined}
          sizes={sizes}
          alt={decorative ? '' : alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          width={asset.width}
          height={asset.height}
          style={{
            objectFit: framed ? 'contain' : fit,
            objectPosition: `${focal.x}% ${focal.y}%`,
            ...(framed ? { maxWidth: asset.width, maxHeight: asset.height } : null),
          }}
        />
      ) : (
        <Placeholder label={label} tone={chapterTone} slip={slip} loading={asset === undefined && !!assetId} />
      )}
      {developing ? <span className="pic__developing sc">Developing…</span> : null}
      {framed && editing ? (
        <span className="pic__note">
          Shown framed: this image is {asset?.width} px wide, and filling the space would enlarge it {Math.round(scale * 100)}%.
        </span>
      ) : null}
      {children}
    </div>
  );
}

export function Placeholder({
  label,
  tone,
  slip = 'tl',
  loading,
}: {
  label: string;
  tone: string;
  slip?: PictureProps['slip'];
  loading?: boolean;
}) {
  return (
    <div
      className={['ph', loading && 'ph--loading'].filter(Boolean).join(' ')}
      style={{ '--tone': tone } as CSSProperties}
      role="img"
      aria-label={label ? `Placeholder for a photograph: ${label}` : 'Placeholder for a photograph'}
    >
      {label && slip !== 'none' ? (
        <span className={`ph__slip ph__slip--${slip}`} aria-hidden="true">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** "Fig. 3.4" and a caption, set as a book sets them. */
export function Caption({
  fig,
  children,
  className,
}: {
  fig?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['caption', className].filter(Boolean).join(' ')}>
      {fig ? <span className="caption__fig sc">Fig. {fig}</span> : null}
      {children}
    </div>
  );
}

/** Opening and closing quotes that hang outside the measure. */
export function Hung({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="hang" aria-hidden="true">
        “
      </span>
      {children}
      <span aria-hidden="true">”</span>
    </>
  );
}
