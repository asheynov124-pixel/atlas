import type { CSSProperties } from 'react';
import styles from './Spread.module.css';

interface PlaceholderProps {
  label: string;
  fig?: string;
  size?: 'full' | 'small' | 'tiny';
  className?: string;
  style?: CSSProperties;
  /** Override the accent for this panel (e.g. an item's own colour). */
  accent?: string;
  /** No inner hairline frame (for heroes that draw their own). */
  plain?: boolean;
}

/**
 * A designed empty plate: a duotone panel in the chapter colour with a small
 * caps label naming the photo that belongs there. Never a stock photo.
 */
export function Placeholder({ label, fig, size = 'full', className, style, accent, plain }: PlaceholderProps) {
  const s: CSSProperties = accent ? ({ ...style, ['--accent' as string]: accent } as CSSProperties) : (style ?? {});
  return (
    <div
      className={[styles.placeholder, className].filter(Boolean).join(' ')}
      data-size={size}
      data-plain={plain ? 'true' : 'false'}
      style={s}
      role="img"
      aria-label={`Placeholder for ${label.toLowerCase()}`}
    >
      <div className={styles.placeholderFrame} />
      <div className={styles.placeholderLabel}>
        {fig && <span className="fig">Fig. {fig}</span>}
        <span>{label}</span>
      </div>
    </div>
  );
}
