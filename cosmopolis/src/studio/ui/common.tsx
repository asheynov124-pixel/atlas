/**
 * OWNER: studio.
 * Shared bits for the Architect Studio UI: part glyphs, value formatting (metres / floors / degrees), the parameter
 * control (slider, stepper or segmented choice derived from a part's ParamDef), the colour picker (palette + HSL
 * sliders) and the material picker. Built on the ui/core kit and tokens.
 */
import { useMemo } from 'preact/hooks';
import { Segmented, Slider, Stepper } from '../../ui/core';
import { uiSound } from '../../ui/core';
import { FLOOR_HEIGHT } from '../../world/planet';
import { hexCss, hexToHsl, hslToHex, luma } from '../color';
import { MATERIALS, PALETTE, type MatName, type PartSpec } from '../model';
import { bound, type ParamDef, type PartDef } from '../parts';

/** 1 world unit ≈ 20 m. */
export const METRES = 20;

export function fmtMetres(v: number): string {
  const m = v * METRES;
  if (m < 10) return m.toFixed(1) + ' m';
  return Math.round(m).toLocaleString() + ' m';
}

export function fmtFloors(h: number): string {
  const f = Math.max(1, Math.round(h / FLOOR_HEIGHT));
  return `${f} floor${f === 1 ? '' : 's'}`;
}

export function fmtParam(p: ParamDef, v: number): string {
  switch (p.unit) {
    case 'm':
      return fmtMetres(v);
    case 'deg':
      return `${Math.round(v)}°`;
    case 'pct':
      return `${Math.round(v * 100)}%`;
    case 'sides':
      return p.choices?.find((c) => c.value === v)?.label ?? String(v);
    default:
      return String(Math.round(v));
  }
}

/** Static SVG glyph markup from the part library (constant strings in parts.ts — never user content). */
export function Glyph({ svg, size = 22, class: cls }: { svg: string; size?: number; class?: string }) {
  return (
    <svg
      class={'st-glyph ' + (cls ?? '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** A part's glyph on a tile tinted with the part's colour. */
export function PartBadge({ def, part, size = 40 }: { def: PartDef; part?: PartSpec; size?: number }) {
  const c = part ? part.c : 0x5ef0ff;
  const bg = part ? hexCss(c) : undefined;
  const dark = part ? luma(c) > 0.62 : false;
  return (
    <span class={'st-badge' + (dark ? ' is-light' : '')} style={{ width: size + 'px', height: size + 'px', '--st-c': bg } as Record<string, string>}>
      <Glyph svg={def.glyph} size={Math.round(size * 0.58)} />
    </span>
  );
}

// ───────────────────────────────────────────── parameter control

export function ParamControl({ def, part, fpR, onChange }: { def: ParamDef; part: PartSpec; fpR: number; onChange: (v: number, commit: boolean) => void }) {
  const min = bound(def.min, fpR);
  const max = Math.max(min + 1e-3, bound(def.max, fpR));
  const value = part[def.key];
  if (def.choices && def.choices.length <= 7) {
    const opts = def.choices.map((c) => ({ value: c.value, label: c.label }));
    const cur = opts.some((o) => o.value === value) ? value : opts.reduce((a, b) => (Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a)).value;
    return (
      <div class="st-param">
        <div class="st-param-head">
          <span class="st-param-label">{def.label}</span>
        </div>
        <Segmented size="sm" block options={opts} value={cur} onChange={(v) => onChange(v, true)} ariaLabel={def.label} />
      </div>
    );
  }
  if (def.unit === 'int' && max - min <= 14) {
    return (
      <div class="st-param st-param-row">
        <span class="st-param-label">{def.label}</span>
        <Stepper value={Math.round(value)} min={min} max={max} step={1} onChange={(v) => onChange(v, true)} label={def.label} />
      </div>
    );
  }
  // slider (quadratic response for size-like params)
  const toT = (v: number) => {
    const t = (Math.min(max, Math.max(min, v)) - min) / (max - min);
    return def.curve ? Math.sqrt(t) : t;
  };
  const fromT = (t: number) => {
    const u = def.curve ? t * t : t;
    let v = min + u * (max - min);
    if (def.step > 0) v = Math.round(v / def.step) * def.step;
    return +Math.min(max, Math.max(min, v)).toFixed(4);
  };
  const extra = def.key === 'h' && def.label === 'Height' && def.unit === 'm' ? ` · ${fmtFloors(value)}` : '';
  return (
    <div class="st-param">
      <Slider
        value={toT(value)}
        min={0}
        max={1}
        step={0}
        label={def.label}
        format={() => fmtParam(def, value) + extra}
        onChange={(t) => onChange(fromT(t), false)}
        onCommit={(t) => onChange(fromT(t), true)}
      />
    </div>
  );
}

// ───────────────────────────────────────────── colour

export function ColorPicker({ value, onChange, label }: { value: number; onChange: (c: number, commit: boolean) => void; label: string }) {
  const hsl = useMemo(() => hexToHsl(value), [value]);
  const vars = { '--st-h': String(Math.round(hsl.h)), '--st-s': `${Math.round(hsl.s * 100)}%`, '--st-l': `${Math.round(hsl.l * 100)}%` } as Record<string, string>;
  return (
    <div class="st-color" style={vars}>
      <div class="st-color-head">
        <span class="st-param-label">{label}</span>
        <span class="st-color-hex num" style={{ background: hexCss(value), color: luma(value) > 0.6 ? '#111' : '#fff' }}>
          {hexCss(value).toUpperCase()}
        </span>
      </div>
      <div class="st-swatches" role="radiogroup" aria-label={label}>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            aria-label={hexCss(c)}
            class={'st-swatch' + (c === value ? ' is-active' : '')}
            style={{ background: hexCss(c) }}
            onClick={() => {
              uiSound('tap');
              onChange(c, true);
            }}
          />
        ))}
      </div>
      <div class="st-hsl">
        <div class="st-hsl-row st-hue">
          <Slider value={hsl.h} min={0} max={359} step={1} label="Hue" format={(v) => `${Math.round(v)}°`} onChange={(v) => onChange(hslToHex(v, Math.max(0.05, hsl.s), hsl.l), false)} onCommit={(v) => onChange(hslToHex(v, Math.max(0.05, hsl.s), hsl.l), true)} />
        </div>
        <div class="st-hsl-row st-sat">
          <Slider value={hsl.s} min={0} max={1} step={0.01} label="Saturation" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange(hslToHex(hsl.h, v, hsl.l), false)} onCommit={(v) => onChange(hslToHex(hsl.h, v, hsl.l), true)} />
        </div>
        <div class="st-hsl-row st-lit">
          <Slider value={hsl.l} min={0.03} max={0.97} step={0.01} label="Lightness" format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange(hslToHex(hsl.h, hsl.s, v), false)} onCommit={(v) => onChange(hslToHex(hsl.h, hsl.s, v), true)} />
        </div>
      </div>
    </div>
  );
}

/** Compact swatch row only (accent colours). */
export function SwatchRow({ value, onChange, label }: { value: number; onChange: (c: number) => void; label: string }) {
  return (
    <div class="st-color">
      <div class="st-color-head">
        <span class="st-param-label">{label}</span>
        <label class="st-color-hex num st-color-custom" style={{ background: hexCss(value), color: luma(value) > 0.6 ? '#111' : '#fff' }}>
          {hexCss(value).toUpperCase()}
          <input
            type="color"
            class="sr-only"
            value={hexCss(value)}
            onInput={(e) => onChange(parseInt((e.currentTarget as HTMLInputElement).value.slice(1), 16))}
            aria-label={`${label}: custom colour`}
          />
        </label>
      </div>
      <div class="st-swatches" role="radiogroup" aria-label={label}>
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            aria-label={hexCss(c)}
            class={'st-swatch' + (c === value ? ' is-active' : '')}
            style={{ background: hexCss(c) }}
            onClick={() => {
              uiSound('tap');
              onChange(c);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────── material

export function MaterialPicker({ value, onChange }: { value: MatName; onChange: (m: MatName) => void }) {
  return (
    <div class="st-mats" role="radiogroup" aria-label="Material">
      {MATERIALS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={m.id === value}
          class={'st-mat' + (m.id === value ? ' is-active' : '')}
          title={m.hint}
          onClick={() => {
            uiSound('tap');
            onChange(m.id);
          }}
        >
          <span class="st-mat-swatch" style={{ background: m.preview }} />
          <span class="st-mat-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
