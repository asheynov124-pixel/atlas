import type { Item } from '../model/types';
import { priceLabel } from '../templates/items';

// Phase 1 placeholders: in-place editing of the list arrives in Phase 3.
export const ShoppingTools = {
  Name: ({ item }: { item: Item }) => <span className="shop__name">{item.name}</span>,
  Status: ({ item }: { item: Item }) => <span className="shop__status">{item.status}</span>,
  Price: ({ item }: { item: Item }) => <>{priceLabel(item) || '—'}</>,
  Add: (_props: { spreadId: string }) => null,
};
