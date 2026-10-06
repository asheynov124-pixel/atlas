/**
 * OWNER: ui-core.
 * Input controls: Tabs, Segmented, Slider, Toggle, ColorSwatches, TextInput, Stepper.
 * All are touch-first (≥ 44 px targets), keyboard accessible and fully controlled (value + onChange).
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { SfxName } from '../../core/types';
import { Icon, IconOrEmoji } from '../icons';
import { uiSound } from './env';
import { hexCss } from './format';

// ───────────────────────────────────────────── Tabs
export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  /** icon name or emoji */
  icon?: string;
  badge?: number | string | null;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  /** 'pills' (default, scrollable chips) or 'underline' */
  variant?: 'pills' | 'underline';
  /** icon only (labels become tooltips) */
  iconOnly?: boolean;
  class?: string;
  ariaLabel?: string;
}

export function Tabs<T extends string = string>(p: TabsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.is-active');
    const box = ref.current;
    if (!el || !box) return;
    const l = el.offsetLeft, r = l + el.offsetWidth;
    if (l < box.scrollLeft + 12) box.scrollTo({ left: Math.max(0, l - 24), behavior: 'smooth' });
    else if (r > box.scrollLeft + box.clientWidth - 12) box.scrollTo({ left: r - box.clientWidth + 24, behavior: 'smooth' });
  }, [p.value]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = p.tabs.findIndex((t) => t.id === p.value);
    const n = p.tabs.length;
    for (let k = 1; k < n; k++) {
      const j = (i + (e.key === 'ArrowRight' ? k : -k) + n) % n;
      if (!p.tabs[j].disabled) {
        p.onChange(p.tabs[j].id);
        e.preventDefault();
        break;
      }
    }
  };
  return (
    <div ref={ref} class={`cz-tabs cz-tabs-${p.variant ?? 'pills'} scroll-x ${p.class ?? ''}`} role="tablist" aria-label={p.ariaLabel} onKeyDown={onKey}>
      {p.tabs.map((t) => {
        const active = t.id === p.value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            class={'cz-tab' + (active ? ' is-active' : '') + (p.iconOnly ? ' icon-only' : '')}
            title={t.label}
            onClick={() => {
              if (active) return;
              uiSound('tap');
              p.onChange(t.id);
            }}
          >
            {t.icon && <IconOrEmoji value={t.icon} size={18} />}
            {!p.iconOnly && <span class="cz-tab-label">{t.label}</span>}
            {t.badge !== undefined && t.badge !== null && t.badge !== 0 && <span class="cz-badge num">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────── Segmented
export interface SegmentOption<T extends string | number = string> {
  value: T;
  label?: string;
  icon?: string;
  title?: string;
}

export interface SegmentedProps<T extends string | number = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  class?: string;
  ariaLabel?: string;
  sound?: SfxName | false;
}

/** iOS-style segmented control with a sliding thumb. */
export function Segmented<T extends string | number = string>(p: SegmentedProps<T>) {
  const idx = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  const n = Math.max(1, p.options.length);
  const thumb: JSX.CSSProperties = { width: `calc((100% - 6px) / ${n})`, transform: `translateX(${idx * 100}%)` };
  return (
    <div class={`cz-seg cz-seg-${p.size ?? 'md'}${p.block ? ' cz-block' : ''} ${p.class ?? ''}`} role="radiogroup" aria-label={p.ariaLabel}>
      <span class="cz-seg-thumb" style={thumb} aria-hidden="true" />
      {p.options.map((o) => {
        const on = o.value === p.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.title ?? o.label}
            title={o.title ?? o.label}
            class={'cz-seg-opt' + (on ? ' is-active' : '')}
            onClick={() => {
              if (on) return;
              uiSound(p.sound === undefined ? 'toggle' : p.sound);
              p.onChange(o.value);
            }}
          >
            {o.icon && <IconOrEmoji value={o.icon} size={p.size === 'sm' ? 15 : 17} />}
            {o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────── Slider
export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** live while dragging */
  onChange: (v: number) => void;
  /** once on release */
  onCommit?: (v: number) => void;
  label?: string;
  /** value text formatter (shown right of the label) */
  format?: (v: number) => string;
  disabled?: boolean;
  /** tick marks at these values */
  ticks?: number[];
  icon?: string;
  class?: string;
  /** colour of the filled part (CSS) */
  color?: string;
}

/** Custom slider: the whole track is touchable (unlike iOS' native range input). */
export function Slider(p: SliderProps) {
  const min = p.min ?? 0, max = p.max ?? 1, step = p.step ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const last = useRef(p.value);
  const t = max > min ? (Math.min(max, Math.max(min, p.value)) - min) / (max - min) : 0;
  const quant = (v: number) => {
    let x = Math.min(max, Math.max(min, v));
    if (step > 0) x = Math.round((x - min) / step) * step + min;
    return +x.toFixed(6);
  };
  const fromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return quant(min + ((clientX - r.left) / Math.max(1, r.width)) * (max - min));
  };
  const set = (v: number) => {
    if (v === last.current) return;
    last.current = v;
    p.onChange(v);
  };
  const onDown = (e: PointerEvent) => {
    if (p.disabled) return;
    dragging.current = true;
    last.current = p.value;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    set(fromX(e.clientX));
  };
  const onMove = (e: PointerEvent) => {
    if (dragging.current) set(fromX(e.clientX));
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    uiSound('tap', 0.4);
    p.onCommit?.(last.current);
  };
  const onKey = (e: KeyboardEvent) => {
    const s = step || (max - min) / 20;
    let v = p.value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += s;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= s;
    else if (e.key === 'Home') v = min;
    else if (e.key === 'End') v = max;
    else return;
    e.preventDefault();
    const q = quant(v);
    p.onChange(q);
    p.onCommit?.(q);
  };
  const fill: JSX.CSSProperties = { transform: `scaleX(${t})` };
  if (p.color) fill.background = p.color;
  return (
    <div class={'cz-slider' + (p.disabled ? ' is-disabled' : '') + ' ' + (p.class ?? '')}>
      {(p.label || p.format) && (
        <div class="cz-slider-head">
          {p.icon && <Icon name={p.icon} size={16} />}
          {p.label && <span class="cz-slider-label">{p.label}</span>}
          <span class="cz-slider-value num">{p.format ? p.format(p.value) : ''}</span>
        </div>
      )}
      <div
        ref={ref}
        class="cz-slider-track pe"
        role="slider"
        tabIndex={p.disabled ? -1 : 0}
        aria-label={p.label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={p.value}
        aria-valuetext={p.format ? p.format(p.value) : undefined}
        aria-disabled={p.disabled}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div class="cz-slider-rail">
          <div class="cz-slider-fill" style={fill} />
          {p.ticks?.map((v) => (
            <span key={v} class="cz-slider-tick" style={{ left: `${((v - min) / (max - min)) * 100}%` }} />
          ))}
        </div>
        <div class="cz-slider-thumb" style={{ left: `${t * 100}%` }} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── Toggle
export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ComponentChildren;
  description?: ComponentChildren;
  icon?: string;
  disabled?: boolean;
  class?: string;
}

/** iOS-style switch; with a label it renders as a full-width settings row. */
export function Toggle(p: ToggleProps) {
  const sw = (
    <span class={'cz-switch' + (p.checked ? ' is-on' : '')} aria-hidden="true">
      <span class="cz-switch-knob" />
    </span>
  );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={p.checked}
      disabled={p.disabled}
      class={'cz-toggle' + (p.label ? ' with-label' : '') + ' ' + (p.class ?? '')}
      onClick={() => {
        uiSound('toggle');
        p.onChange(!p.checked);
      }}
    >
      {p.icon && <Icon name={p.icon} size={18} class="cz-toggle-icon" />}
      {p.label && (
        <span class="cz-toggle-text grow">
          <span class="cz-toggle-label">{p.label}</span>
          {p.description && <span class="cz-toggle-desc">{p.description}</span>}
        </span>
      )}
      {sw}
    </button>
  );
}

// ───────────────────────────────────────────── Colour swatches
export interface ColorSwatchesProps {
  /** 0xRRGGBB numbers or CSS colours */
  colors: (number | string)[];
  value: number | string | null;
  onChange: (c: number | string) => void;
  /** offer a native colour picker as the last swatch */
  allowCustom?: boolean;
  /** swatch diameter px (default 34) */
  size?: number;
  /** include a "none / reset" swatch */
  allowNone?: boolean;
  class?: string;
}

const toCss = (c: number | string) => (typeof c === 'number' ? hexCss(c) : c);

export function ColorSwatches(p: ColorSwatchesProps) {
  const size = p.size ?? 34;
  const st: JSX.CSSProperties = { width: size + 'px', height: size + 'px' };
  const isCustom = p.value !== null && !p.colors.includes(p.value as never);
  return (
    <div class={'cz-swatches ' + (p.class ?? '')} role="radiogroup">
      {p.allowNone && (
        <button type="button" role="radio" aria-checked={p.value === null} aria-label="No colour" class={'cz-swatch is-none' + (p.value === null ? ' is-active' : '')} style={st} onClick={() => p.onChange(-1)}>
          <Icon name="close" size={14} />
        </button>
      )}
      {p.colors.map((c) => {
        const on = c === p.value;
        return (
          <button
            key={String(c)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c}
            class={'cz-swatch' + (on ? ' is-active' : '')}
            style={{ ...st, background: toCss(c) }}
            onClick={() => {
              uiSound('tap');
              p.onChange(c);
            }}
          >
            {on && <Icon name="check" size={14} stroke={2.5} />}
          </button>
        );
      })}
      {p.allowCustom && (
        <label class={'cz-swatch is-custom' + (isCustom ? ' is-active' : '')} style={{ ...st, background: isCustom && p.value !== null ? toCss(p.value) : undefined }} aria-label="Custom colour">
          <Icon name="plus" size={14} />
          <input
            type="color"
            class="sr-only"
            value={typeof p.value === 'number' && p.value >= 0 ? '#' + p.value.toString(16).padStart(6, '0') : '#5ef0ff'}
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              p.onChange(typeof p.colors[0] === 'number' || p.colors.length === 0 ? parseInt(v.slice(1), 16) : v);
            }}
          />
        </label>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── Text input
export interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  label?: string;
  placeholder?: string;
  icon?: string;
  maxLength?: number;
  /** trailing element (e.g. a dice IconButton) */
  trailing?: ComponentChildren;
  autoFocus?: boolean;
  class?: string;
  type?: 'text' | 'search' | 'number';
  inputMode?: 'text' | 'numeric' | 'search';
}

export function TextInput(p: TextInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, []);
  return (
    <label class={'cz-field ' + (p.class ?? '')}>
      {p.label && <span class="cz-field-label">{p.label}</span>}
      <span class="cz-input-wrap">
        {p.icon && <Icon name={p.icon} size={17} class="cz-input-icon" />}
        <input
          ref={ref}
          class="cz-input"
          type={p.type ?? 'text'}
          inputMode={p.inputMode}
          value={p.value}
          placeholder={p.placeholder}
          maxLength={p.maxLength}
          autoComplete="off"
          autoCorrect="off"
          spellcheck={false}
          onInput={(e) => p.onChange((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              p.onSubmit?.((e.currentTarget as HTMLInputElement).value);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
        />
        {p.trailing}
      </span>
    </label>
  );
}

// ───────────────────────────────────────────── Stepper
export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label?: string;
}

export function Stepper(p: StepperProps) {
  const step = p.step ?? 1;
  const clamp = (v: number) => Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
  return (
    <div class="cz-stepper" role="group" aria-label={p.label}>
      <button type="button" class="cz-stepper-btn" aria-label="Decrease" disabled={p.min !== undefined && p.value <= p.min} onClick={() => (uiSound('tap'), p.onChange(clamp(p.value - step)))}>
        <Icon name="minus" size={16} />
      </button>
      <span class="cz-stepper-value num">{p.format ? p.format(p.value) : p.value}</span>
      <button type="button" class="cz-stepper-btn" aria-label="Increase" disabled={p.max !== undefined && p.value >= p.max} onClick={() => (uiSound('tap'), p.onChange(clamp(p.value + step)))}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
