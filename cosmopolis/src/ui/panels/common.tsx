/**
 * OWNER: ui-panels.
 * Shared helpers for the deep-dive panels: live re-render tick, safe game accessors, camera fly-to, game-date
 * formatting, and small SVG data-viz components (LineChart with touch scrubbing, Sparkline, Ring, StackBar,
 * Avatar). Everything here is allocation-light and never throws into the render tree.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { MONTHS, START_YEAR } from '../../game/Clock';
import { closePanel, setSelection, uiSound } from '../core/env';
import { fmtCompact } from '../core/format';
import { ui } from '../store';

// ───────────────────────────────────────────── live data

/** Re-render the calling component every `ms` while it is mounted (paused while the tab is hidden). */
export function useLive(ms = 1000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setN((x) => (x + 1) % 1_000_000);
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

/** Run `fn`, returning `fallback` if it throws or yields nullish. */
export function safe<T>(fn: () => T | null | undefined, fallback: T): T {
  try {
    const v = fn();
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export const sim = () => safe(() => game?.sim ?? null, null);
export const planet = () => safe(() => game?.planet ?? null, null);
export const isSandbox = () => ui.mode.value === 'sandbox';

/** Close the open panel and glide the camera to a tile (optionally selecting the building there). */
export function flyToTile(tile: number | undefined | null, o: { select?: boolean; distance?: number; keepPanel?: boolean } = {}): void {
  if (tile === undefined || tile === null || tile < 0) return;
  const p = planet();
  if (!p || tile >= p.count) return;
  if (!o.keepPanel) closePanel();
  uiSound('whoosh', 0.5);
  try {
    if (ui.view.value !== 'planet') game.showPlanet();
    void game.camera.flyTo(tile, { distance: o.distance ?? 22, tilt: 0.9 });
  } catch (e) {
    console.warn('[panels] flyTo failed', e);
  }
  if (o.select) {
    const b = p.building[tile];
    setSelection(b >= 0 ? { kind: 'building', id: b } : { kind: 'tile', tile });
  }
}

// ───────────────────────────────────────────── game dates

/** "Mar 14, 2352" from a game day. */
export function fmtDate(day: number): string {
  const d = Math.max(0, Math.floor(day));
  const m = Math.floor(d / 30) % 12;
  const y = START_YEAR + Math.floor(d / 360);
  return `${MONTHS[m]} ${(d % 30) + 1}, ${y}`;
}

/** "Mar 2352" (month granularity, for chart axes). */
export function fmtMonth(day: number): string {
  const d = Math.max(0, Math.floor(day));
  return `${MONTHS[Math.floor(d / 30) % 12]} ${START_YEAR + Math.floor(d / 360)}`;
}

/** Relative game time: "today", "yesterday", "5 days ago", "3 months ago", "2 years ago". */
export function relDay(day: number, now = ui.day.value): string {
  const d = Math.max(0, Math.floor(now - day));
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 360) {
    const m = Math.floor(d / 30);
    return m === 1 ? 'a month ago' : `${m} months ago`;
  }
  const y = Math.floor(d / 360);
  return y === 1 ? 'a year ago' : `${y} years ago`;
}

/** Compact relative time for feeds: "now", "3d", "2mo", "1y". */
export function relShort(day: number, now = ui.day.value): string {
  const d = Math.max(0, Math.floor(now - day));
  if (d === 0) return 'now';
  if (d < 30) return `${d}d`;
  if (d < 360) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 360)}y`;
}

/** Age of something founded on `day`: "3 years, 2 months" / "14 days". */
export function fmtAge(fromDay: number, now = ui.day.value): string {
  const d = Math.max(0, Math.floor(now - fromDay));
  const y = Math.floor(d / 360);
  const m = Math.floor((d % 360) / 30);
  if (y > 0) return `${y} year${y > 1 ? 's' : ''}${m ? `, ${m} month${m > 1 ? 's' : ''}` : ''}`;
  if (m > 0) return `${m} month${m > 1 ? 's' : ''}`;
  return `${d} day${d === 1 ? '' : 's'}`;
}

// ───────────────────────────────────────────── colour helpers

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function css(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

/** Pretty emoji avatar on a gradient disc seeded by `seed` (a handle or name). */
export function Avatar({ emoji, seed, size = 40 }: { emoji?: string; seed: string; size?: number }) {
  const h = hashStr(seed) % 360;
  const st: JSX.CSSProperties = {
    width: size + 'px',
    height: size + 'px',
    fontSize: Math.round(size * 0.52) + 'px',
    background: `linear-gradient(140deg, hsl(${h} 72% 58%), hsl(${(h + 48) % 360} 70% 42%))`,
  };
  return (
    <span class="up-avatar" style={st} aria-hidden="true">
      {emoji || seed.replace(/^@/, '').slice(0, 1).toUpperCase()}
    </span>
  );
}

// ───────────────────────────────────────────── charts

export interface ChartSeries {
  values: number[];
  /** CSS colour */
  color: string;
  label?: string;
  /** fill the area under the line (first series only by default) */
  area?: boolean;
}

export interface LineChartProps {
  series: ChartSeries[];
  /** x values (game days) for the scrub tooltip */
  days?: number[];
  height?: number;
  format?: (v: number) => string;
  /** force the y range to include 0 */
  zero?: boolean;
  /** fixed y range */
  min?: number;
  max?: number;
  class?: string;
  ariaLabel?: string;
}

const VW = 300;

/** Responsive SVG line chart: non-scaling strokes, soft area fill, zero line, touch / mouse scrubbing. */
export function LineChart(p: LineChartProps) {
  const h = p.height ?? 120;
  const fmt = p.format ?? ((v: number) => fmtCompact(v));
  const ref = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const gid = useMemo(() => 'upg' + Math.floor(Math.random() * 1e9).toString(36), []);
  const n = p.series.reduce((m, s) => Math.max(m, s.values.length), 0);
  let lo = Infinity, hi = -Infinity;
  for (const s of p.series) for (const v of s.values) if (Number.isFinite(v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  if (!Number.isFinite(lo)) (lo = 0), (hi = 1);
  if (p.zero) (lo = Math.min(lo, 0)), (hi = Math.max(hi, 0));
  if (p.min !== undefined) lo = p.min;
  if (p.max !== undefined) hi = p.max;
  if (hi - lo < 1e-6) {
    const pad = Math.max(1, Math.abs(hi) * 0.1);
    hi += pad;
    if (p.min === undefined) lo -= p.zero && lo >= 0 ? 0 : pad;
  }
  const span = hi - lo;
  const top = 8, bot = 6;
  const yOf = (v: number) => top + (1 - (v - lo) / span) * (h - top - bot);
  const xOf = (i: number) => (n <= 1 ? VW / 2 : (i / (n - 1)) * VW);
  const paths = p.series.map((s) => {
    let d = '';
    s.values.forEach((v, i) => {
      d += (i ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(Number.isFinite(v) ? v : lo).toFixed(1);
    });
    return d;
  });
  const first = p.series[0];
  const area = first && first.area !== false && first.values.length > 1 ? paths[0] + `L${xOf(first.values.length - 1).toFixed(1)} ${h}L0 ${h}Z` : '';
  const zeroY = lo < 0 && hi > 0 ? yOf(0) : null;
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || n < 2) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    setScrub(Math.round(t * (n - 1)));
  };
  const si = scrub !== null ? Math.min(n - 1, scrub) : null;
  const left = si !== null ? (n <= 1 ? 50 : (si / (n - 1)) * 100) : 0;
  return (
    <div
      ref={ref}
      class={'up-chart pe ' + (p.class ?? '')}
      style={{ height: h + 'px' }}
      role="img"
      aria-label={p.ariaLabel}
      onPointerDown={(e) => {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        onMove(e);
      }}
      onPointerMove={(e) => (scrub !== null || e.pointerType === 'mouse' ? onMove(e) : undefined)}
      onPointerUp={(e) => e.pointerType !== 'mouse' && setScrub(null)}
      onPointerCancel={() => setScrub(null)}
      onPointerLeave={() => setScrub(null)}
    >
      <svg viewBox={`0 0 ${VW} ${h}`} preserveAspectRatio="none" width="100%" height={h} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={first?.color ?? '#5ef0ff'} stop-opacity="0.34" />
            <stop offset="1" stop-color={first?.color ?? '#5ef0ff'} stop-opacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={VW} y1={top + f * (h - top - bot)} y2={top + f * (h - top - bot)} class="up-chart-grid" vector-effect="non-scaling-stroke" />
        ))}
        {zeroY !== null && <line x1="0" x2={VW} y1={zeroY} y2={zeroY} class="up-chart-zero" vector-effect="non-scaling-stroke" />}
        {area && <path d={area} fill={`url(#${gid})`} />}
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={p.series[i].color} stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        ))}
      </svg>
      <span class="up-chart-max num">{fmt(hi)}</span>
      <span class="up-chart-min num">{fmt(lo)}</span>
      {p.series.map((s, i) => {
        const L = s.values.length;
        if (!L || si !== null) return null;
        const v = s.values[L - 1];
        return <span key={i} class="up-chart-dot" style={{ left: (n <= 1 ? 50 : ((L - 1) / (n - 1)) * 100) + '%', top: yOf(v) + 'px', background: s.color }} />;
      })}
      {si !== null && (
        <>
          <span class="up-chart-cursor" style={{ left: left + '%' }} />
          {p.series.map((s, i) => (si < s.values.length ? <span key={i} class="up-chart-dot" style={{ left: left + '%', top: yOf(s.values[si]) + 'px', background: s.color }} /> : null))}
          <span class={'up-chart-tip num' + (left > 60 ? ' is-left' : '')} style={{ left: left + '%' }}>
            {p.days && p.days[si] !== undefined && <span class="up-chart-tip-date">{fmtMonth(p.days[si])}</span>}
            {p.series.map((s, i) =>
              si < s.values.length ? (
                <span key={i} class="up-chart-tip-row">
                  {p.series.length > 1 && <i style={{ background: s.color }} />}
                  {s.label && p.series.length > 1 ? s.label + ' ' : ''}
                  <b>{fmt(s.values[si])}</b>
                </span>
              ) : null,
            )}
          </span>
        </>
      )}
    </div>
  );
}

/** Tiny trend line (no axes). */
export function Sparkline({ values, color = 'var(--accent)', width = 84, height = 26, zero }: { values: number[]; color?: string; width?: number; height?: number; zero?: boolean }) {
  if (values.length < 2) return <span class="up-spark is-empty" style={{ width: width + 'px', height: height + 'px' }} />;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (zero) (lo = Math.min(lo, 0)), (hi = Math.max(hi, 0));
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(2 + (1 - (v - lo) / span) * 26).toFixed(1)}`).join(' ');
  const zy = lo < 0 && hi > 0 ? 2 + (1 - (0 - lo) / span) * 26 : null;
  return (
    <svg class="up-spark" viewBox="0 0 100 30" preserveAspectRatio="none" width={width} height={height} aria-hidden="true">
      {zy !== null && <line x1="0" x2="100" y1={zy} y2={zy} class="up-chart-zero" vector-effect="non-scaling-stroke" />}
      <polyline points={pts} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
  );
}

/** Circular progress ring with content in the middle. */
export function Ring({ value, size = 64, stroke = 6, color = 'var(--accent)', children, track = 'rgba(255,255,255,0.08)' }: { value: number; size?: number; stroke?: number; color?: string; children?: ComponentChildren; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span class="up-ring" style={{ width: size + 'px', height: size + 'px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} stroke-width={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={`${(c * v).toFixed(2)} ${c.toFixed(2)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          class="up-ring-arc"
        />
      </svg>
      <span class="up-ring-body">{children}</span>
    </span>
  );
}

export interface StackPart {
  value: number;
  color: string;
  label: string;
}

/** Horizontal stacked bar with a legend underneath. */
export function StackBar({ parts, format = fmtCompact, height = 12 }: { parts: StackPart[]; format?: (v: number) => string; height?: number }) {
  const total = parts.reduce((s, x) => s + Math.max(0, x.value), 0);
  return (
    <div class="up-stack">
      <div class="up-stack-bar" style={{ height: height + 'px' }}>
        {total > 0 ? (
          parts.map((x) => (x.value > 0 ? <span key={x.label} style={{ flexGrow: x.value, background: x.color }} title={`${x.label}: ${format(x.value)}`} /> : null))
        ) : (
          <span class="is-empty" />
        )}
      </div>
      <div class="up-stack-legend">
        {parts.map((x) => (
          <span key={x.label} class="up-stack-key">
            <i style={{ background: x.color }} />
            <span class="up-stack-label">{x.label}</span>
            <b class="num">{format(x.value)}</b>
            {total > 0 && <span class="up-stack-pct num">{Math.round((Math.max(0, x.value) / total) * 100)}%</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Supply vs demand meter (utilities): fill = demand / supply, red when over. */
export function SupplyMeter({ icon, label, supply, demand, unit, free }: { icon: ComponentChildren; label: string; supply: number; demand: number; unit: string; free?: boolean }) {
  const ratio = supply > 0 ? demand / supply : demand > 0 ? 2 : 0;
  const tone = free ? 'good' : ratio > 1 ? 'bad' : ratio > 0.9 ? 'warn' : 'good';
  return (
    <div class={'up-supply tone-' + tone}>
      <span class="up-supply-icon">{icon}</span>
      <div class="grow">
        <div class="up-supply-head">
          <span>{label}</span>
          <span class="num up-supply-val">{free ? 'Free' : `${fmtCompact(demand)} / ${fmtCompact(supply)} ${unit}`}</span>
        </div>
        <div class="up-supply-track">
          <span style={{ transform: `scaleX(${free ? 1 : Math.min(1, ratio)})` }} />
        </div>
      </div>
    </div>
  );
}
