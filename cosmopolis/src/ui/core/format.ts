/**
 * OWNER: ui-core.
 * Number / time formatting shared by every UI module (tabular-friendly, compact, locale-light).
 */

const SUFFIX = ['', 'k', 'M', 'B', 'T', 'Q'];

/** 1234 → "1.2k", 12_345_678 → "12.3M" (keeps 3 significant digits ≥ 1000). */
export function fmtCompact(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '∞';
  const neg = n < 0;
  let v = Math.abs(n);
  if (v < 1000) return (neg ? '−' : '') + (v < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v).toString());
  let i = 0;
  while (v >= 1000 && i < SUFFIX.length - 1) {
    v /= 1000;
    i++;
  }
  const s = v >= 100 ? Math.round(v).toString() : v.toPrecision(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
  return (neg ? '−' : '') + s + SUFFIX[i];
}

/** Grouped integer: 1234567 → "1,234,567". */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−' : '') + s;
}

/** Money with the credit sign. compact=true → "₡1.2M". */
export function fmtMoney(n: number, compact = false): string {
  if (n >= 9e8) return '₡∞';
  const neg = n < 0;
  const body = compact ? fmtCompact(Math.abs(n)) : fmtInt(Math.abs(n));
  return (neg ? '−' : '') + '₡' + body;
}

/** Signed value: +1.2k / −340. */
export function fmtSigned(n: number, compact = true): string {
  const body = compact ? fmtCompact(Math.abs(n)) : fmtInt(Math.abs(n));
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + body;
}

/** 0..1 → "42%" ; values > 1 are treated as already-percent. */
export function fmtPercent(v: number, digits = 0): string {
  const p = v <= 1 && v >= -1 ? v * 100 : v;
  return p.toFixed(digits) + '%';
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", or a date. */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) {
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  return new Date(ms).toLocaleDateString();
}

/** Play time "2 h 14 min". */
export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "Year 3, day 12" from game days (30-day months, 12 months). */
export function fmtGameDays(days: number): string {
  const y = Math.floor(days / 360);
  const d = Math.floor(days % 360);
  return y > 0 ? `Year ${y + 1}, day ${d + 1}` : `Day ${d + 1}`;
}

/** Hex number → CSS colour. */
export function hexCss(c: number, alpha = 1): string {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
