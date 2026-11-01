import { useEffect, useState } from 'react';
import type { Asset } from '@/book/types';
import { getStorage } from './index';

export interface ResolvedImage {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

const objectUrls = new Map<string, string>();
const pending = new Map<string, Promise<ResolvedImage | null>>();

function keyFor(asset: Asset) {
  return `${asset.id}:${asset.source}`;
}

/** Resolve an asset to src/srcset. Static assets are synchronous; blobs are read once and cached as object URLs. */
export async function resolveAsset(asset: Asset): Promise<ResolvedImage | null> {
  if (asset.source === 'static') {
    const variants = [...(asset.variants ?? [])].sort((a, b) => a.w - b.w);
    const largest = variants[variants.length - 1];
    const src = largest?.url ?? asset.original ?? '';
    if (!src) return null;
    return {
      src,
      srcset: variants.map((v) => `${v.url} ${v.w}w`).join(', '),
      width: asset.width,
      height: asset.height,
    };
  }
  const key = keyFor(asset);
  const cached = objectUrls.get(key);
  if (cached) return { src: cached, srcset: srcsetFromCache(asset), width: asset.width, height: asset.height };
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const storage = getStorage();
      const variants = await storage.listAssetVariants(asset.id);
      const parts: string[] = [];
      let src = '';
      for (const w of variants.sort((a, b) => a - b)) {
        const blob = await storage.getAssetBlob(asset.id, w);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        objectUrls.set(`${key}@${w}`, url);
        const width = w === 0 ? asset.width : w;
        parts.push(`${url} ${width}w`);
        src = url;
      }
      if (!src) return null;
      objectUrls.set(key, src);
      return { src, srcset: parts.join(', '), width: asset.width, height: asset.height };
    })();
    pending.set(key, p);
  }
  return p;
}

function srcsetFromCache(asset: Asset) {
  const key = keyFor(asset);
  const parts: string[] = [];
  for (const [k, url] of objectUrls) {
    if (k.startsWith(`${key}@`)) {
      const w = Number(k.split('@')[1]);
      parts.push(`${url} ${w === 0 ? asset.width : w}w`);
    }
  }
  return parts.join(', ');
}

/** Forget cached URLs for an asset (after delete/replace). */
export function forgetAsset(assetId: string) {
  for (const [k, url] of [...objectUrls]) {
    if (k.startsWith(`${assetId}:`)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(k);
    }
  }
  for (const k of [...pending.keys()]) if (k.startsWith(`${assetId}:`)) pending.delete(k);
}

export function useResolvedAsset(asset: Asset | null | undefined): ResolvedImage | null {
  const [img, setImg] = useState<ResolvedImage | null>(() => {
    if (!asset) return null;
    if (asset.source === 'static') {
      const variants = [...(asset.variants ?? [])].sort((a, b) => a.w - b.w);
      const largest = variants[variants.length - 1];
      const src = largest?.url ?? asset.original ?? '';
      return src ? { src, srcset: variants.map((v) => `${v.url} ${v.w}w`).join(', '), width: asset.width, height: asset.height } : null;
    }
    const cached = objectUrls.get(keyFor(asset));
    return cached ? { src: cached, srcset: srcsetFromCache(asset), width: asset.width, height: asset.height } : null;
  });

  useEffect(() => {
    let alive = true;
    if (!asset) {
      setImg(null);
      return;
    }
    resolveAsset(asset).then((r) => {
      if (alive) setImg(r);
    });
    return () => {
      alive = false;
    };
  }, [asset?.id, asset?.source, asset?.width, asset?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  return img;
}
