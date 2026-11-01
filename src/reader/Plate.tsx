import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Focal, ImageSlot } from '@/book/types';
import { useResolvedAsset } from '@/storage/assetUrls';
import { EditableImage } from '@/editor/EditableImage';
import { useSpread } from './SpreadContext';
import { Placeholder } from './Placeholder';
import styles from './Spread.module.css';

export interface PlateProps {
  slot: ImageSlot;
  /** Figure number, e.g. "3.4" */
  fig?: string;
  /** Responsive sizes attribute. */
  sizes?: string;
  /** Load eagerly (covers, openers). */
  priority?: boolean;
  fit?: 'cover' | 'contain';
  size?: 'full' | 'small' | 'tiny';
  className?: string;
  style?: CSSProperties;
  /** Ken Burns drift for openers. */
  drift?: boolean;
  accent?: string;
  /** Placeholder without its inner frame. */
  plain?: boolean;
  /** Live focal override while dragging the crosshair. */
  focal?: Focal;
}

/**
 * Renders an image slot. Real images get srcset and a focal-point object
 * position. An image too small for the box is never upscaled to fill: it is
 * shown framed on paper, with a quiet note in Edit mode. Empty slots render a
 * designed placeholder. With a slotKey in Edit mode it becomes editable.
 */
export function Plate({ slotKey, compact, ...props }: PlateProps & { slotKey?: string; compact?: boolean }) {
  const { editable } = useSpread();
  if (editable && slotKey) return <EditableImage slotKey={slotKey} compact={compact} {...props} />;
  return <PlateInner {...props} />;
}

export function PlateInner({ slot, fig, sizes = '100vw', priority, fit = 'cover', size = 'full', className, style, drift, accent, plain, focal }: PlateProps) {
  const { book, editable, print } = useSpread();
  const asset = slot.assetId ? book.assets[slot.assetId] : null;
  const resolved = useResolvedAsset(asset);
  const boxRef = useRef<HTMLDivElement>(null);
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !asset || fit !== 'cover') {
      setTooSmall(false);
      return;
    }
    const check = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const need = el.clientWidth * dpr;
      const needH = el.clientHeight * dpr;
      // Allow a little stretch: 85% of the needed pixels still looks sharp.
      setTooSmall(asset.width < need * 0.85 && asset.height < needH * 0.85);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [asset, fit]);

  if (!asset || !resolved) {
    return <Placeholder label={slot.placeholder || 'Image'} fig={fig} size={size} className={className} style={style} accent={accent} plain={plain} />;
  }

  const framed = tooSmall;
  const f = focal ?? slot.focal;
  const objectPosition = `${Math.round(f.x * 100)}% ${Math.round(f.y * 100)}%`;
  const alt = slot.decorative ? '' : slot.alt || slot.caption || slot.placeholder;

  return (
    <div
      ref={boxRef}
      className={[styles.plate, drift && !print ? 'ken-burns' : '', className].filter(Boolean).join(' ')}
      data-fit={fit}
      data-framed={framed ? 'true' : 'false'}
      style={style}
    >
      <img
        src={resolved.src}
        srcSet={resolved.srcset || undefined}
        sizes={sizes}
        width={resolved.width}
        height={resolved.height}
        alt={alt}
        aria-hidden={slot.decorative ? true : undefined}
        loading={priority || print ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : undefined}
        style={{ objectPosition }}
        draggable={false}
      />
      {framed && editable && <div className={styles.plateNote}>Shown framed: the photo is smaller than this slot</div>}
    </div>
  );
}
