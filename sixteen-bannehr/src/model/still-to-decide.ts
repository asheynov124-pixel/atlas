import { layoutBook, type Placed } from './pages';
import { plainText } from './typeset';
import type { Book, Item } from './types';

export interface OpenDecision {
  placed: Placed;
  title: string;
  optionCount: number;
}

export interface OpenPurchase {
  placed: Placed;
  item: Item;
}

export interface StillToDecide {
  decisions: OpenDecision[];
  purchases: OpenPurchase[];
  /** Sum of priced, unordered items. */
  outstanding: number;
  unpriced: number;
}

/**
 * Gather what is still open across the book: decisions still at "Thinking", and
 * shopping-list items not yet ordered. Ordered and Installed decisions are past deciding,
 * so they are left out even though their status is not literally "Decided".
 */
export function collectStillToDecide(book: Book): StillToDecide {
  const { placed } = layoutBook(book);
  const decisions: OpenDecision[] = [];
  const purchases: OpenPurchase[] = [];
  const seen = new Set<string>();

  for (const p of placed) {
    const { spread } = p;
    if (spread.template === 'decision') {
      const meta = spread.slots.meta;
      const status = meta?.kind === 'meta' ? meta.values.status || 'thinking' : 'thinking';
      if (status === 'thinking') {
        const title = spread.slots.title?.kind === 'text' ? plainText(spread.slots.title.html) : '';
        const items = spread.slots.items;
        decisions.push({
          placed: p,
          title: title || 'Untitled decision',
          optionCount: items?.kind === 'items' ? items.itemIds.length : 0,
        });
      }
    }
    if (spread.template === 'shopping') {
      const slot = spread.slots.items;
      if (slot?.kind !== 'items') continue;
      for (const id of slot.itemIds) {
        const item = book.items[id];
        if (!item || seen.has(id)) continue;
        if (item.status === 'thinking' || item.status === 'to-buy') {
          seen.add(id);
          purchases.push({ placed: p, item });
        }
      }
    }
  }

  let outstanding = 0;
  let unpriced = 0;
  for (const { item } of purchases) {
    if (item.price === null) unpriced++;
    else outstanding += item.price;
  }
  return { decisions, purchases, outstanding, unpriced };
}

export function formatMoney(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}
