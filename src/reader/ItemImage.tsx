import type { Item, ImageSlot } from '@/book/types';
import { Plate } from './Plate';

/** Render an item's picture through the same Plate as every other image. */
export function itemSlot(item: Item): ImageSlot {
  return {
    kind: 'image',
    assetId: item.assetId,
    focal: { x: 0.5, y: 0.5 },
    caption: '',
    alt: item.name,
    credit: '',
    placeholder: item.placeholder || item.name,
  };
}

export function ItemImage({ item, size = 'small', sizes, className }: { item: Item; size?: 'full' | 'small' | 'tiny'; sizes?: string; className?: string }) {
  return <Plate slot={itemSlot(item)} size={size} sizes={sizes ?? '(min-width: 820px) 20vw, 45vw'} className={className} />;
}
