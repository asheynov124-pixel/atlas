import { useCallback, useRef, useState } from 'react';
import { isSlotKind, stripHtml } from '@/book/slots';
import { useIsDesktop } from '@/app/useMedia';
import { Plate } from '@/reader/Plate';
import { RichText } from '@/reader/RichText';
import { Page, Span, Spread } from '@/reader/Spread';
import { figureOf, type SpreadCtx } from '@/reader/SpreadContext';
import styles from './BeforeAfter.module.css';

export function BeforeAfterTemplate({ ctx }: { ctx: SpreadCtx }) {
  const { slots } = ctx.ref.spread;
  const pair = isSlotKind(slots.pair, 'pair') ? slots.pair : null;
  const caption = isSlotKind(slots.caption, 'text') ? slots.caption.html : '';
  const figBefore = figureOf(ctx, 'pair:before');
  const figAfter = figureOf(ctx, 'pair:after');
  const isDesktop = useIsDesktop();
  const [pos, setPos] = useState(50);
  const [showAfter, setShowAfter] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const onPointer = useCallback((e: React.PointerEvent) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    setPos(Math.min(100, Math.max(0, x)));
  }, []);

  const clip = isDesktop ? pos : showAfter ? 0 : 100;

  return (
    <Spread ctx={ctx} label={`Before and after: ${stripHtml(caption)}`}>
      <Page side="left">
        <div style={{ gridColumn: '1 / -1' }} />
      </Page>
      <Page side="right">
        <div style={{ gridColumn: '1 / -1' }} />
      </Page>
      <Span>
        <div className={styles.column}>
        {pair && (
          <div
            ref={boxRef}
            className={styles.box}
            onPointerDown={isDesktop ? (e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); onPointer(e); } : undefined}
            onPointerMove={isDesktop ? (e) => { if (e.buttons & 1) onPointer(e); } : undefined}
          >
            <div className={styles.layer}>
              <Plate slot={pair.after} fig={figAfter} sizes="(min-width: 820px) 90vw, 100vw" plain />
            </div>
            <div className={[styles.layer, styles.before].join(' ')} style={{ clipPath: `inset(0 ${100 - clip}% 0 0)` }}>
              <Plate slot={pair.before} fig={figBefore} sizes="(min-width: 820px) 90vw, 100vw" plain />
            </div>
            <span className={[styles.tag, styles.tagBefore, 't-label'].join(' ')} style={{ opacity: clip > 12 ? 1 : 0, transition: 'opacity 200ms' }}>Before</span>
            <span className={[styles.tag, styles.tagAfter, 't-label'].join(' ')} style={{ opacity: clip < 88 ? 1 : 0, transition: 'opacity 200ms' }}>After</span>
            {isDesktop ? (
              <>
                <div className={styles.handle} style={{ left: `${pos}%` }} aria-hidden="true">
                  <div className={styles.knob}>
                    <svg viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>
                  </div>
                </div>
                <input
                  className={styles.range}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(pos)}
                  onChange={(e) => setPos(Number(e.target.value))}
                  aria-label="Compare before and after"
                  style={{ pointerEvents: 'none' }}
                />
              </>
            ) : (
              <>
                <button className={styles.toggle} onClick={() => setShowAfter((v) => !v)} aria-pressed={showAfter} aria-label={showAfter ? 'Showing after. Tap for before.' : 'Showing before. Tap for after.'} />
                <span className={[styles.hint, 't-label'].join(' ')}>Tap to see {showAfter ? 'before' : 'after'}</span>
              </>
            )}
          </div>
        )}
        <figcaption className={[styles.caption, 't-caption'].join(' ')}>
          {figBefore && figAfter && <span className="fig">Figs. {figBefore}–{figAfter.split('.')[1]}</span>}
          <RichText as="span" html={caption} editable={ctx.editable} placeholder="Caption" />
        </figcaption>
        </div>
      </Span>
    </Spread>
  );
}
