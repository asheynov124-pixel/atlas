import { newId } from '@/book/ids';
import type { Asset } from '@/book/types';
import { getStorage } from '@/storage';

const VARIANTS = [800, 1600, 2800];

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    throw new Error('That image type is not supported here. On an iPhone, choose it from Photos and it will arrive as a JPEG.');
  }
}

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
}

async function makeVariant(bitmap: ImageBitmap, width: number): Promise<Blob | null> {
  const scale = width / bitmap.width;
  const height = Math.round(bitmap.height * scale);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  let blob = await toBlob(canvas, 'image/webp', 0.84);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.86);
  return blob;
}

/**
 * Store a dropped or chosen file's blobs: the original untouched, plus
 * 800/1600/2800 px WebP variants for srcset. Returns the asset record; the
 * caller places it in the book (see placeAssets) so it is one undo step.
 */
export async function ingestFile(file: File): Promise<Asset> {
  const bitmap = await decode(file);
  const id = newId('as');
  const storage = getStorage();
  await storage.putAssetBlob(id, file, 0);
  for (const w of VARIANTS) {
    if (w >= bitmap.width) continue;
    const blob = await makeVariant(bitmap, w);
    if (blob) await storage.putAssetBlob(id, blob, w);
  }
  const asset: Asset = {
    id,
    source: 'idb',
    width: bitmap.width,
    height: bitmap.height,
    mime: file.type || 'image/jpeg',
    createdAt: new Date().toISOString(),
    name: file.name,
  };
  bitmap.close();
  return asset;
}

export async function ingestFiles(files: FileList | File[]): Promise<Asset[]> {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(f.name));
  const out: Asset[] = [];
  for (const f of list) out.push(await ingestFile(f));
  return out;
}
