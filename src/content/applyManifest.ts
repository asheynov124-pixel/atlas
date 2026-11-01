import type { Asset, Book, ImageSlot } from '@/book/types';
import manifest from './photos.manifest.json';

export interface ManifestPhoto {
  id: string;
  name: string;
  width: number;
  height: number;
  mime: string;
  original: string;
  variants: { w: number; url: string }[];
}

export interface PhotoManifest {
  generatedAt: string | null;
  chapters: Record<string, ManifestPhoto[]>;
}

const MANIFEST = manifest as PhotoManifest;

function emptyImageSlots(book: Book, slug: string): ImageSlot[] {
  const out: ImageSlot[] = [];
  const chapter = book.chapters.find((c) => c.slug === slug);
  if (!chapter) return out;
  for (const spread of chapter.spreads) {
    for (const slot of Object.values(spread.slots)) {
      if (slot.kind === 'image' && !slot.assetId) out.push(slot);
      else if (slot.kind === 'pair') {
        if (!slot.before.assetId) out.push(slot.before);
        if (!slot.after.assetId) out.push(slot.after);
      } else if (slot.kind === 'pins' && !slot.image.assetId) out.push(slot.image);
    }
  }
  return out;
}

/**
 * Fill each chapter's empty image slots, in order, with photos from
 * `npm run import-photos`. Each photo is placed once; a photo Sonny removes
 * later stays removed (its id is recorded in book.appliedPhotos).
 */
export function applyPhotoManifest(book: Book, m: PhotoManifest = MANIFEST): Book {
  const chapters = Object.entries(m.chapters ?? {});
  if (chapters.length === 0) return book;
  const next = structuredClone(book);
  const applied = new Set(next.appliedPhotos);
  for (const [slug, photos] of chapters) {
    const fresh = photos.filter((p) => !applied.has(p.id));
    if (fresh.length === 0) continue;
    const slots = emptyImageSlots(next, slug);
    for (const photo of fresh) {
      const asset: Asset = {
        id: photo.id,
        source: 'static',
        width: photo.width,
        height: photo.height,
        mime: photo.mime,
        createdAt: m.generatedAt ?? new Date().toISOString(),
        name: photo.name,
        variants: photo.variants,
        original: photo.original,
      };
      next.assets[asset.id] = asset;
      const slot = slots.shift();
      if (slot) {
        slot.assetId = asset.id;
        if (!slot.alt) slot.alt = photo.name.replace(/[-_]+/g, ' ');
      }
      applied.add(photo.id);
    }
  }
  next.appliedPhotos = [...applied];
  return next;
}
