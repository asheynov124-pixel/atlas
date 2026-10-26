import manifest from './bundled-photos.json';
import type { AssetMeta } from '../model/types';

// Photos placed by `npm run import-photos`: WebP variants in public/photos/<chapter>/
// and this manifest. They ship with the site, so they reach every device without an export.

export interface BundledPhoto {
  /** "bundled:<chapter>/<name>" */
  id: string;
  chapter: string;
  name: string;
  width: number;
  height: number;
  variants: number[];
}

interface Manifest {
  version: 1;
  generatedAt: string | null;
  photos: Record<string, BundledPhoto[]>;
}

const m = manifest as Manifest;

export const BUNDLED_PREFIX = 'bundled:';

export function isBundled(id: string): boolean {
  return id.startsWith(BUNDLED_PREFIX);
}

export function bundledPhotos(chapterSlug: string): BundledPhoto[] {
  return m.photos[chapterSlug] ?? [];
}

const index = new Map<string, BundledPhoto>();
for (const list of Object.values(m.photos)) for (const p of list) index.set(p.id, p);

function url(p: BundledPhoto, w: number): string {
  return `${import.meta.env.BASE_URL}photos/${encodeURIComponent(p.chapter)}/${encodeURIComponent(p.name)}-${w}.webp`;
}

export function bundledMeta(id: string): AssetMeta | undefined {
  const p = index.get(id);
  if (!p) return undefined;
  return {
    id: p.id,
    source: 'bundled',
    width: p.width,
    height: p.height,
    mime: 'image/webp',
    name: p.name,
    variants: p.variants,
    createdAt: m.generatedAt ?? '',
    urls: Object.fromEntries(p.variants.map((w) => [w, url(p, w)])),
  };
}
