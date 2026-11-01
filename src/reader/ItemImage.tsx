import type { Item, ImageSlot } from '@/book/types';
import { patchItem, placeItemAsset } from '@/state/actions';
import { EditableImage, type ImageTarget } from '@/editor/EditableImage';
import { Plate } from './Plate';
import { useSpread } from './SpreadContext';

/** Render an item's picture through the same Plate as every other image. */
export function itemSlot(item: Item): ImageSlot {
  return {
    kind: 'image',
    assetId: item.assetId,
    focal: item.focal ?? { x: 0.5, y: 0.5 },
    caption: '',
    alt: item.name,
    credit: '',
    placeholder: item.placeholder || item.name,
  };
}

export function itemTarget(item: Item): ImageTarget {
  return {
    key: `item:${item.id}`,
    place: (assets) => placeItemAsset(item.id, assets[0]),
    patch: (patch) => patchItem(item.id, { focal: patch.focal ?? item.focal }),
    clear: () => patchItem(item.id, { assetId: null }),
  };
}

export function ItemImage({ item, size = 'small', sizes, className, editable }: { item: Item; size?: 'full' | 'small' | 'tiny'; sizes?: string; className?: string; editable?: boolean }) {
  const ctx = useSpread();
  const slot = itemSlot(item);
  const s = sizes ?? '(min-width: 820px) 20vw, 45vw';
  if (editable ?? ctx.editable) return <EditableImage target={itemTarget(item)} slot={slot} size={size} sizes={s} className={className} />;
  return <Plate slot={slot} size={size} sizes={s} className={className} />;
}
