/**
 * OWNER: ui-core.
 * Display components: Chip, Badge, Card, Stat, ProgressBar, BarMeter, SectionHeader, EmptyState, Kbd, ListRow,
 * Stars, Spinner, Divider, KeyValue grid.
 */
import type { ComponentChildren, JSX } from 'preact';
import type { InspectRow } from '../../core/types';
import { Icon, IconOrEmoji } from '../icons';
import { uiSound } from './env';

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info' | 'violet' | 'money';

// ───────────────────────────────────────────── Chip
export interface ChipProps {
  children?: ComponentChildren;
  icon?: string;
  tone?: Tone;
  selected?: boolean;
  onClick?: (e: MouseEvent) => void;
  size?: 'sm' | 'md';
  title?: string;
  class?: string;
  disabled?: boolean;
}

/** Pill label; becomes a toggleable button when `onClick` is given. */
export function Chip(p: ChipProps) {
  const cls = ['cz-chip', 'tone-' + (p.tone ?? 'neutral'), 'cz-chip-' + (p.size ?? 'md'), p.selected && 'is-selected', p.onClick && 'is-button', p.class].filter(Boolean).join(' ');
  const body = (
    <>
      {p.icon && <IconOrEmoji value={p.icon} size={p.size === 'sm' ? 13 : 15} />}
      {p.children !== undefined && <span class="cz-chip-label">{p.children}</span>}
    </>
  );
  if (!p.onClick) return (
    <span class={cls} title={p.title}>
      {body}
    </span>
  );
  return (
    <button
      type="button"
      class={cls}
      title={p.title}
      aria-pressed={p.selected}
      disabled={p.disabled}
      onClick={(e) => {
        uiSound('tap');
        p.onClick!(e);
      }}
    >
      {body}
    </button>
  );
}

// ───────────────────────────────────────────── Badge
export function Badge({ children, tone = 'bad', dot, class: cls }: { children?: ComponentChildren; tone?: Tone; dot?: boolean; class?: string }) {
  return <span class={`cz-badge tone-${tone}${dot ? ' is-dot' : ''} num ${cls ?? ''}`}>{dot ? null : children}</span>;
}

// ───────────────────────────────────────────── Card
export interface CardProps {
  children?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
  selected?: boolean;
  disabled?: boolean;
  /** inner padding (default true) */
  padded?: boolean;
  /** stronger glass */
  strong?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
  title?: string;
  ariaLabel?: string;
}

export function Card(p: CardProps) {
  const cls = ['cz-card', p.padded === false ? 'no-pad' : '', p.strong && 'is-strong', p.selected && 'is-selected', p.disabled && 'is-disabled', p.onClick && 'is-button', p.class].filter(Boolean).join(' ');
  if (p.onClick)
    return (
      <button
        type="button"
        class={cls}
        style={p.style}
        title={p.title}
        aria-label={p.ariaLabel}
        aria-pressed={p.selected}
        disabled={p.disabled}
        onClick={(e) => {
          uiSound('click');
          p.onClick!(e);
        }}
      >
        {p.children}
      </button>
    );
  return (
    <div class={cls} style={p.style} title={p.title}>
      {p.children}
    </div>
  );
}

// ───────────────────────────────────────────── Stat
export interface StatProps {
  icon?: string;
  label: string;
  value: ComponentChildren;
  /** signed change; colour follows the sign (or `deltaGood` overrides) */
  delta?: number;
  deltaText?: string;
  /** true when a positive delta is good (default true) */
  positiveIsGood?: boolean;
  tone?: Tone;
  /** horizontal compact layout */
  compact?: boolean;
  onClick?: () => void;
  class?: string;
}

export function Stat(p: StatProps) {
  const good = p.delta === undefined ? null : (p.delta >= 0) === (p.positiveIsGood ?? true);
  const content = (
    <>
      {p.icon && (
        <span class={'cz-stat-icon tone-' + (p.tone ?? 'accent')}>
          <IconOrEmoji value={p.icon} size={p.compact ? 16 : 18} />
        </span>
      )}
      <span class="cz-stat-text">
        <span class="cz-stat-label">{p.label}</span>
        <span class="cz-stat-value num">
          {p.value}
          {p.delta !== undefined && p.delta !== 0 && (
            <span class={'cz-stat-delta ' + (good ? 'good' : 'bad')}>
              <Icon name={p.delta > 0 ? 'trendUp' : 'trendDown'} size={13} />
              {p.deltaText}
            </span>
          )}
        </span>
      </span>
    </>
  );
  const cls = 'cz-stat' + (p.compact ? ' is-compact' : '') + (p.onClick ? ' is-button' : '') + ' ' + (p.class ?? '');
  return p.onClick ? (
    <button type="button" class={cls} onClick={() => (uiSound('tap'), p.onClick!())}>
      {content}
    </button>
  ) : (
    <div class={cls}>{content}</div>
  );
}

// ───────────────────────────────────────────── ProgressBar
export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  tone?: Tone;
  label?: ComponentChildren;
  /** text on the right of the label (e.g. "1 240 / 1 500") */
  valueText?: ComponentChildren;
  /** px, default 6 */
  height?: number;
  /** gentle shimmer while < 1 */
  animated?: boolean;
  class?: string;
}

export function ProgressBar(p: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, p.value || 0));
  return (
    <div class={'cz-progress tone-' + (p.tone ?? 'accent') + (p.animated && v < 1 ? ' is-animated' : '') + ' ' + (p.class ?? '')}>
      {(p.label || p.valueText) && (
        <div class="cz-progress-head">
          <span class="cz-progress-label">{p.label}</span>
          <span class="cz-progress-value num">{p.valueText}</span>
        </div>
      )}
      <div class="cz-progress-track" style={{ height: (p.height ?? 6) + 'px' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
        <div class="cz-progress-fill" style={{ transform: `scaleX(${v})` }} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── BarMeter
export interface BarMeterProps {
  /** bipolar: −1..1 ; unipolar: 0..1 */
  value: number;
  bipolar?: boolean;
  /** CSS colour of the bar */
  color?: string;
  label?: string;
  vertical?: boolean;
  /** px (track length) */
  length?: number;
  /** px (thickness) */
  thickness?: number;
  class?: string;
  title?: string;
}

/** Compact level meter (RCI demand, budgets). Bipolar meters grow from the centre line. */
export function BarMeter(p: BarMeterProps) {
  const v = p.bipolar ? Math.max(-1, Math.min(1, p.value || 0)) : Math.max(0, Math.min(1, p.value || 0));
  const color = p.color ?? 'var(--accent)';
  const vertical = !!p.vertical;
  const len = p.length ?? (vertical ? 26 : 80);
  const th = p.thickness ?? (vertical ? 6 : 6);
  const fill: JSX.CSSProperties = { background: color };
  if (p.bipolar) {
    const mag = Math.abs(v) / 2;
    if (vertical) {
      fill.height = mag * 100 + '%';
      if (v >= 0) fill.bottom = '50%';
      else fill.top = '50%';
      fill.left = '0';
      fill.right = '0';
    } else {
      fill.width = mag * 100 + '%';
      if (v >= 0) fill.left = '50%';
      else fill.right = '50%';
      fill.top = '0';
      fill.bottom = '0';
    }
    if (v < 0) fill.opacity = 0.55;
  } else if (vertical) {
    fill.height = v * 100 + '%';
    fill.bottom = '0';
    fill.left = '0';
    fill.right = '0';
  } else {
    fill.width = v * 100 + '%';
    fill.left = '0';
    fill.top = '0';
    fill.bottom = '0';
  }
  const size: JSX.CSSProperties = vertical ? { width: th + 'px', height: len + 'px' } : { width: len + 'px', height: th + 'px' };
  return (
    <span class={'cz-meter' + (vertical ? ' is-vertical' : '') + (p.bipolar ? ' is-bipolar' : '') + ' ' + (p.class ?? '')} title={p.title}>
      <span class="cz-meter-track" style={size}>
        <span class="cz-meter-fill" style={fill} />
        {p.bipolar && <span class="cz-meter-mid" />}
      </span>
      {p.label && <span class="cz-meter-label">{p.label}</span>}
    </span>
  );
}

// ───────────────────────────────────────────── SectionHeader
export function SectionHeader({ title, icon, subtitle, action, class: cls }: { title: ComponentChildren; icon?: string; subtitle?: ComponentChildren; action?: ComponentChildren; class?: string }) {
  return (
    <div class={'cz-section ' + (cls ?? '')}>
      {icon && <IconOrEmoji value={icon} size={15} class="cz-section-icon" />}
      <div class="grow">
        <h3 class="cz-section-title">{title}</h3>
        {subtitle && <div class="cz-section-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

// ───────────────────────────────────────────── EmptyState
export function EmptyState({ icon = 'sparkles', title, body, action, class: cls }: { icon?: string; title: ComponentChildren; body?: ComponentChildren; action?: ComponentChildren; class?: string }) {
  return (
    <div class={'cz-empty ' + (cls ?? '')}>
      <div class="cz-empty-icon">
        <IconOrEmoji value={icon} size={30} />
      </div>
      <div class="cz-empty-title">{title}</div>
      {body && <div class="cz-empty-body">{body}</div>}
      {action && <div class="cz-empty-action">{action}</div>}
    </div>
  );
}

// ───────────────────────────────────────────── Kbd
export function Kbd({ children }: { children: ComponentChildren }) {
  return <kbd class="cz-kbd">{children}</kbd>;
}

// ───────────────────────────────────────────── ListRow
export interface ListRowProps {
  icon?: string;
  label: ComponentChildren;
  description?: ComponentChildren;
  value?: ComponentChildren;
  onClick?: () => void;
  /** show a disclosure chevron */
  chevron?: boolean;
  tone?: Tone;
  danger?: boolean;
  disabled?: boolean;
  class?: string;
  trailing?: ComponentChildren;
}

/** Settings / menu row (≥ 48 px). */
export function ListRow(p: ListRowProps) {
  const inner = (
    <>
      {p.icon && (
        <span class={'cz-row-icon tone-' + (p.danger ? 'bad' : p.tone ?? 'neutral')}>
          <IconOrEmoji value={p.icon} size={18} />
        </span>
      )}
      <span class="cz-row-text grow">
        <span class="cz-row-label">{p.label}</span>
        {p.description && <span class="cz-row-desc">{p.description}</span>}
      </span>
      {p.value !== undefined && <span class="cz-row-value num">{p.value}</span>}
      {p.trailing}
      {p.chevron && <Icon name="chevronRight" size={16} class="cz-row-chev" />}
    </>
  );
  const cls = 'cz-row' + (p.onClick ? ' is-button' : '') + (p.danger ? ' is-danger' : '') + ' ' + (p.class ?? '');
  return p.onClick ? (
    <button type="button" class={cls} disabled={p.disabled} onClick={() => (uiSound('click'), p.onClick!())}>
      {inner}
    </button>
  ) : (
    <div class={cls}>{inner}</div>
  );
}

// ───────────────────────────────────────────── Stars, Spinner, Divider
export function Stars({ value, max = 5, size = 14, class: cls }: { value: number; max?: number; size?: number; class?: string }) {
  const out = [];
  for (let i = 0; i < max; i++) out.push(<Icon key={i} name={i < value ? 'starFill' : 'star'} size={size} class={i < value ? 'is-lit' : ''} />);
  return (
    <span class={'cz-stars ' + (cls ?? '')} aria-label={`${value} of ${max}`}>
      {out}
    </span>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span class="cz-spinner" style={{ width: size + 'px', height: size + 'px' }} aria-label="Loading" />;
}

export function Divider() {
  return <div class="cz-divider" role="separator" />;
}

// ───────────────────────────────────────────── Inspect rows (sim InspectRow[] renderer)
export function InspectRows({ rows }: { rows: InspectRow[] }) {
  return (
    <div class="cz-kv">
      {rows.map((r, i) => (
        <div key={r.label + i} class={'cz-kv-row tone-' + (r.tone ?? 'neutral')}>
          <span class="cz-kv-label">{r.label}</span>
          <span class="cz-kv-value num">{r.value}</span>
          {r.bar !== undefined && (
            <span class="cz-kv-bar">
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, r.bar))})` }} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
