import { useEffect } from 'react';
import { create } from 'zustand';
import type { AssetMeta } from '../model/types';
import { uid } from '../model/templates';
import { bundledMeta, isBundled } from '../storage/bundled';
import { repository } from '../storage/dexie';

// Resolves asset ids to something an <img> can use. Blobs stay in IndexedDB; this keeps a
// cache of object URLs and builds a srcset from whichever variants exist.

export interface ResolvedAsset {
  id: string;
  width: number;
  height: number;
  srcset: string;
  /** Largest variant: the fallback src. */
  src: string;
  /** Smallest variant: thumbnails. */
  thumb: string;
  meta: AssetMeta;
}

type Entry = ResolvedAsset | null | 'loading';

interface AssetState {
  map: Record<string, Entry>;
  /** Assets being developed (variants generating) right now. */
  developing: Record<string, true>;
}

export const useAssets = create<AssetState>()(() => ({ map: {}, developing: {} }));

const objectUrls = new Map<string, string[]>();

function buildResolved(meta: AssetMeta, urls: Record<number, string>, originalUrl?: string): ResolvedAsset {
  const widths = Object.keys(urls)
    .map(Number)
    .sort((a, b) => a - b);
  const srcset = widths.map((w) => `${urls[w]} ${w}w`).join(', ');
  if (originalUrl && !widths.length) {
    return { id: meta.id, width: meta.width, height: meta.height, srcset: '', src: originalUrl, thumb: originalUrl, meta };
  }
  return {
    id: meta.id,
    width: meta.width,
    height: meta.height,
    srcset: originalUrl ? `${srcset}${srcset ? ', ' : ''}${originalUrl} ${meta.width}w` : srcset,
    src: urls[widths[widths.length - 1]] ?? originalUrl ?? '',
    thumb: urls[widths[0]] ?? originalUrl ?? '',
    meta,
  };
}

async function resolve(id: string): Promise<ResolvedAsset | null> {
  if (isBundled(id)) {
    const meta = bundledMeta(id);
    return meta?.urls ? buildResolved(meta, meta.urls) : null;
  }
  const repo = repository();
  const meta = await repo.getAssetMeta(id);
  if (!meta) return null;
  const urls: Record<number, string> = {};
  const made: string[] = [];
  for (const w of meta.variants) {
    const blob = await repo.getBlob(id, w);
    if (blob) {
      const u = URL.createObjectURL(blob);
      urls[w] = u;
      made.push(u);
    }
  }
  // The original stays in the srcset as its largest candidate (the browser only fetches
  // it when a screen needs it), unless the browser cannot display it (HEIC).
  let originalUrl: string | undefined;
  if (isDisplayable(meta.mime)) {
    const original = await repo.getBlob(id, 0);
    if (original) {
      originalUrl = URL.createObjectURL(original);
      made.push(originalUrl);
    }
  }
  objectUrls.get(id)?.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.set(id, made);
  return buildResolved(meta, urls, originalUrl);
}

function isDisplayable(mime: string) {
  return /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/.test(mime);
}

export async function loadAsset(id: string, force = false): Promise<void> {
  const current = useAssets.getState().map[id];
  if (!force && current !== undefined) return;
  useAssets.setState((s) => ({ map: { ...s.map, [id]: current && current !== 'loading' ? current : 'loading' } }));
  let r: ResolvedAsset | null = null;
  try {
    r = await resolve(id);
  } catch (e) {
    console.warn('Could not load asset', id, e);
  }
  useAssets.setState((s) => ({ map: { ...s.map, [id]: r } }));
}

/** undefined while loading, null when missing. */
export function useAsset(id: string | null | undefined): ResolvedAsset | null | undefined {
  const entry = useAssets((s) => (id ? s.map[id] : null));
  useEffect(() => {
    if (id) void loadAsset(id);
  }, [id]);
  if (!id) return null;
  if (entry === undefined || entry === 'loading') return undefined;
  return entry;
}

export function useDeveloping(id: string | null | undefined): boolean {
  return useAssets((s) => (id ? !!s.developing[id] : false));
}

// ── Ingest: a file dropped or chosen becomes an asset with web variants ─────────

export const VARIANT_WIDTHS = [800, 1600, 2800];

export class UnsupportedImageError extends Error {}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UnsupportedImageError(
      /heic|heif/i.test(file.type)
        ? 'This photo is HEIC. Open the book in Safari to add it, or use “npm run import-photos” on the Mac.'
        : 'This file could not be read as an image.',
    );
  }
}

async function encodeVariant(bitmap: ImageBitmap, width: number): Promise<Blob> {
  const height = Math.round((bitmap.height / bitmap.width) * width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  // Safari cannot encode WebP and quietly hands back a PNG; use JPEG there instead.
  let blob = await toBlob('image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.88);
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('Could not encode image');
  return blob;
}

/** Store a file as an asset. Resolves once the original is safe; variants follow. */
export async function ingestFile(file: File): Promise<AssetMeta> {
  const bitmap = await decode(file);
  const meta: AssetMeta = {
    id: uid('as'),
    source: 'blob',
    width: bitmap.width,
    height: bitmap.height,
    mime: file.type || 'image/jpeg',
    name: file.name,
    variants: [],
    createdAt: new Date().toISOString(),
  };
  const repo = repository();
  // A HEIC that Safari could decode is kept as the original, but shown through variants.
  await repo.putAsset(meta, file);
  useAssets.setState((s) => ({ developing: { ...s.developing, [meta.id]: true } }));
  void develop(meta, bitmap);
  return meta;
}

async function develop(meta: AssetMeta, bitmap: ImageBitmap) {
  const repo = repository();
  try {
    let widths = VARIANT_WIDTHS.filter((w) => w < meta.width);
    // Something the browser cannot show directly always gets at least one variant.
    if (!widths.length && !isDisplayable(meta.mime)) widths = [meta.width];
    for (const w of widths) {
      const blob = await encodeVariant(bitmap, w);
      await repo.putVariant(meta.id, w, blob);
      meta = { ...meta, variants: [...meta.variants, w] };
      await repo.updateAssetMeta(meta);
    }
  } catch (e) {
    console.warn('Variant generation failed', e);
  } finally {
    bitmap.close();
    useAssets.setState((s) => {
      const developing = { ...s.developing };
      delete developing[meta.id];
      return { developing };
    });
    await loadAsset(meta.id, true);
  }
}
