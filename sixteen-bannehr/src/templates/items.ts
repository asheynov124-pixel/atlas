import { useBook } from '../store/book';
import { formatMoney } from '../model/still-to-decide';
import type { CleanFields, Item, ItemsSlot, Spread } from '../model/types';

export function useItems(spread: Spread, key = 'items'): Item[] {
  const book = useBook();
  const slot = spread.slots[key] as ItemsSlot | undefined;
  if (!slot || slot.kind !== 'items') return [];
  return slot.itemIds.map((id) => book.items[id]).filter(Boolean);
}

export function priceLabel(item: Item): string {
  if (item.price === null) return '';
  const p = formatMoney(item.price, item.currency || 'USD');
  return item.unit ? `${p} ${item.unit}` : p;
}

/** Parse "$1,299.50" or "1299.5" into a number; blank becomes null. */
export function parsePrice(text: string): number | null {
  const n = parseFloat(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function safeHref(url: string): string | undefined {
  const u = url.trim();
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return `https://${u}`;
  return undefined;
}

export const CLEAN_ROWS: {
  key: Exclude<keyof CleanFields, 'notes'>;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: 'core',
    label: 'Core',
    options: [
      { value: 'solid', label: 'Solid wood' },
      { value: 'composite', label: 'Composite' },
      { value: 'na', label: 'Not wood' },
    ],
  },
  {
    key: 'formaldehyde',
    label: 'Formaldehyde',
    options: [
      { value: 'carb2', label: 'CARB2' },
      { value: 'tsca6', label: 'TSCA Title VI' },
      { value: 'carb2-tsca6', label: 'CARB2 + TSCA VI' },
      { value: 'none', label: 'No standard stated' },
      { value: 'na', label: 'Not composite' },
    ],
  },
  {
    key: 'voc',
    label: 'Finish VOC',
    options: [
      { value: 'zero', label: 'Zero VOC' },
      { value: 'low', label: 'Low VOC' },
      { value: 'standard', label: 'Standard' },
      { value: 'na', label: 'No finish' },
    ],
  },
  {
    key: 'pvc',
    label: 'PVC',
    options: [
      { value: 'no', label: 'PVC-free' },
      { value: 'yes', label: 'Contains PVC' },
      { value: 'na', label: 'Not applicable' },
    ],
  },
  {
    key: 'leadFree',
    label: 'Lead-free',
    options: [
      { value: 'yes', label: 'Lead-free' },
      { value: 'no', label: 'Not lead-free' },
      { value: 'na', label: 'Not for water' },
    ],
  },
];

export function cleanValueLabel(key: Exclude<keyof CleanFields, 'notes'>, value: string): string {
  const row = CLEAN_ROWS.find((r) => r.key === key);
  return row?.options.find((o) => o.value === value)?.label ?? '';
}

export function cleanChecked(c: CleanFields): number {
  return CLEAN_ROWS.filter((r) => c[r.key] !== '').length;
}
