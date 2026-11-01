const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

export const numberWord = (n: number) => WORDS[n] ?? String(n);

/** "Chapter Three" for numbered chapters, otherwise the kicker ("Prologue"). */
export function chapterLabel(number: number | null, kicker: string): string {
  if (number != null) return `Chapter ${numberWord(number)}`;
  return kicker || '';
}

/** Wrap a plain string in real typographic quotes. */
export const quoted = (s: string) => (s ? `“${s}”` : '');

/** Format a price in USD without cents when whole. */
export function money(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}

/** "KITCHEN — THE SINK" -> "Kitchen — the sink". Used for fallback captions. */
export function sentenceCase(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "2026-10-18" -> "18 October 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export const STATUS_LABEL: Record<string, string> = {
  thinking: 'Thinking',
  decided: 'Decided',
  ordered: 'Ordered',
  installed: 'Installed',
  needed: 'Still to buy',
  received: 'Received',
  considering: 'Considering',
  shortlist: 'Shortlist',
  chosen: 'Chosen',
  rejected: 'Rejected',
};

export const CLEAN_LABEL = {
  construction: { 'solid-wood': 'Solid wood', composite: 'Composite', stone: 'Stone', metal: 'Metal', other: 'Other', unknown: 'Unknown', 'n/a': 'n/a' },
  formaldehyde: { carb2: 'CARB2', 'tsca-vi': 'TSCA Title VI', naf: 'NAF', ulef: 'ULEF', unknown: 'Unknown', 'n/a': 'n/a' },
  voc: { zero: 'Zero VOC', low: 'Low VOC', standard: 'Standard VOC', unknown: 'Unknown', 'n/a': 'n/a' },
  pvcFree: { yes: 'PVC-free', no: 'Contains PVC', unknown: 'Unknown', 'n/a': 'n/a' },
  leadFree: { yes: 'Lead-free', no: 'Not lead-free', unknown: 'Unknown', 'n/a': 'n/a' },
} as const;
