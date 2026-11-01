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
