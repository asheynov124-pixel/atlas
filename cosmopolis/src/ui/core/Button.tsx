/**
 * OWNER: ui-core.
 * Button & IconButton — the two pressable primitives. Springy press feedback, optional UI sound, glow when active.
 */
import type { ComponentChildren, JSX } from 'preact';
import type { SfxName } from '../../core/types';
import { Icon } from '../icons';
import { uiSound } from './env';

export type ButtonVariant = 'primary' | 'secondary' | 'glass' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  children?: ComponentChildren;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** leading icon name */
  icon?: string;
  /** trailing icon name */
  iconRight?: string;
  /** full width */
  block?: boolean;
  disabled?: boolean;
  /** shows a spinner and disables */
  loading?: boolean;
  /** pressed / selected look */
  active?: boolean;
  onClick?: (e: MouseEvent) => void;
  /** UI sound on press (default 'click'; false = silent) */
  sound?: SfxName | false;
  title?: string;
  ariaLabel?: string;
  class?: string;
  type?: 'button' | 'submit';
  style?: JSX.CSSProperties;
}

export function Button(p: ButtonProps) {
  const size = p.size ?? 'md';
  const variant = p.variant ?? 'secondary';
  const cls = [
    'cz-btn',
    'cz-btn-' + variant,
    'cz-btn-' + size,
    p.block && 'cz-block',
    p.active && 'is-active',
    p.loading && 'is-loading',
    p.class,
  ]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;
  return (
    <button
      type={p.type ?? 'button'}
      class={cls}
      disabled={p.disabled || p.loading}
      title={p.title}
      aria-label={p.ariaLabel}
      aria-pressed={p.active === undefined ? undefined : p.active}
      style={p.style}
      onClick={(e) => {
        if (p.disabled || p.loading) return;
        uiSound(p.sound === undefined ? 'click' : p.sound);
        p.onClick?.(e);
      }}
    >
      {p.loading ? <span class="cz-spinner" aria-hidden="true" /> : p.icon && <Icon name={p.icon} size={iconSize} />}
      {p.children !== undefined && p.children !== null && <span class="cz-btn-label">{p.children}</span>}
      {p.iconRight && <Icon name={p.iconRight} size={iconSize} class="cz-btn-trail" />}
    </button>
  );
}

export interface IconButtonProps {
  icon: string;
  /** accessible label (also the tooltip) */
  label: string;
  size?: ButtonSize;
  variant?: 'glass' | 'ghost' | 'primary' | 'danger' | 'solid';
  active?: boolean;
  disabled?: boolean;
  badge?: number | string | null;
  onClick?: (e: MouseEvent) => void;
  sound?: SfxName | false;
  class?: string;
  /** show the label under the icon */
  showLabel?: boolean;
  /** keyboard shortcut hint for the tooltip */
  kbd?: string;
  /** render custom content instead of the icon */
  children?: ComponentChildren;
}

/** Round icon button: sm 36 px · md 44 px · lg 52 px (all ≥ 44 px hit area thanks to padding). */
export function IconButton(p: IconButtonProps) {
  const size = p.size ?? 'md';
  const cls = ['cz-ibtn', 'cz-ibtn-' + (p.variant ?? 'glass'), 'cz-ibtn-' + size, p.active && 'is-active', p.showLabel && 'with-label', p.class]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'lg' ? 24 : size === 'sm' ? 18 : 21;
  const badge = p.badge;
  return (
    <button
      type="button"
      class={cls}
      aria-label={p.label}
      title={p.kbd ? `${p.label} (${p.kbd})` : p.label}
      aria-pressed={p.active === undefined ? undefined : p.active}
      disabled={p.disabled}
      onClick={(e) => {
        if (p.disabled) return;
        uiSound(p.sound === undefined ? 'click' : p.sound);
        p.onClick?.(e);
      }}
    >
      <span class="cz-ibtn-face">{p.children ?? <Icon name={p.icon} size={iconSize} />}</span>
      {p.showLabel && <span class="cz-ibtn-label">{p.label}</span>}
      {badge !== undefined && badge !== null && badge !== 0 && badge !== '' && (
        <span class="cz-badge cz-badge-float num">{typeof badge === 'number' && badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );
}
