import type { CSSProperties, ReactNode } from 'react';
import { TEMPLATE_META } from '@/templates/meta';
import { NotesLayer } from '@/editor/Notes';
import { SpreadContext, type SpreadCtx } from './SpreadContext';
import styles from './Spread.module.css';

interface SpreadProps {
  ctx: SpreadCtx;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Visually hidden label for the spread landmark. */
  label?: string;
}

/**
 * One spread of the book. Sets the chapter accent and template so pages,
 * placeholders and numerals can colour themselves.
 */
export function Spread({ ctx, children, className, style, label }: SpreadProps) {
  const { ref } = ctx;
  return (
    <SpreadContext.Provider value={ctx}>
      <section
        className={[styles.spread, `accent-${ref.chapter.accent}`, className].filter(Boolean).join(' ')}
        data-bleed={ref.bleed ? 'true' : 'false'}
        data-phone-single={TEMPLATE_META[ref.spread.template]?.phoneSingle ? 'true' : 'false'}
        data-template={ref.spread.template}
        data-spread-id={ref.spread.id}
        data-spread-index={ref.index}
        aria-label={label ?? `${ref.chapter.title}, spread ${ref.index + 1}`}
        style={style}
      >
        {children}
      </section>
    </SpreadContext.Provider>
  );
}

interface PageProps {
  side: 'left' | 'right';
  children: ReactNode;
  className?: string;
  /** Hide the running head and folio (front matter, decision pages with their own head). */
  quiet?: boolean;
  /** Stretch grid rows to fill the page. */
  fill?: boolean;
  style?: CSSProperties;
}

export function Page({ side, children, className, quiet, fill, style }: PageProps) {
  return (
    <div
      className={[styles.page, 'paper', className].filter(Boolean).join(' ')}
      data-side={side}
      data-fill={fill ? 'true' : 'false'}
      style={style}
    >
      {!quiet && <RunningHead side={side} />}
      {children}
      {!quiet && <Folio side={side} />}
      <NotesLayer side={side} />
    </div>
  );
}

function RunningHead({ side }: { side: 'left' | 'right' }) {
  return (
    <SpreadContext.Consumer>
      {(ctx) => {
        if (!ctx) return null;
        const { ref, book } = ctx;
        const text = side === 'left' ? book.title : ref.chapter.hidden ? TEMPLATE_META[ref.spread.template].name : ref.chapter.title;
        return (
          <div className={[styles.runningHead, 't-label'].join(' ')} aria-hidden="true">
            <span>{text}</span>
          </div>
        );
      }}
    </SpreadContext.Consumer>
  );
}

function Folio({ side }: { side: 'left' | 'right' }) {
  return (
    <SpreadContext.Consumer>
      {(ctx) => {
        if (!ctx) return null;
        const n = ctx.ref.folio[side];
        if (n == null) return null;
        return (
          <div className={styles.folio} aria-hidden="true">
            {n}
          </div>
        );
      }}
    </SpreadContext.Consumer>
  );
}

export const spreadStyles = styles;

/**
 * An area that spans both pages inside the margins (comparison sliders, mood
 * boards). On the phone the spread collapses to one page and this becomes
 * the page's content, with its own running head and folio.
 */
export function Span({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <SpreadContext.Consumer>
      {(ctx) => (
        <div className={[styles.span, className].filter(Boolean).join(' ')} style={style}>
          {ctx && (
            <div className={[styles.phoneHead, 't-label'].join(' ')} aria-hidden="true">
              <span>{ctx.book.title}</span>
              <span>{ctx.ref.chapter.title}</span>
            </div>
          )}
          {children}
          {ctx && ctx.ref.folio.right != null && (
            <div className={styles.phoneFolio} aria-hidden="true">
              {ctx.ref.folio.left != null ? `${ctx.ref.folio.left}–${ctx.ref.folio.right}` : ctx.ref.folio.right}
            </div>
          )}
        </div>
      )}
    </SpreadContext.Consumer>
  );
}
