import JSZip from 'jszip';
import type { Asset, Book } from '@/book/types';
import { migrateBook } from '@/book/migrate';
import type { BookStorage } from './types';

export const ZIP_FORMAT = 1;

interface Manifest {
  format: number;
  app: string;
  exportedAt: string;
  title: string;
  assets: Array<{ id: string; variants: number[] }>;
}

const extFor = (mime: string) => {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  return 'jpg';
};

/**
 * The whole book as one .zip: book.json, a manifest, and every photo that
 * lives in this browser (original plus the WebP variants). Photos that came
 * from `import-photos` are part of the deployed site and travel by URL.
 */
export async function exportBookZip(book: Book, storage: BookStorage, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const zip = new JSZip();
  const assets = Object.values(book.assets).filter((a) => a.source === 'idb');
  const manifest: Manifest = { format: ZIP_FORMAT, app: 'sixteen-bannehr', exportedAt: new Date().toISOString(), title: book.title, assets: [] };
  let done = 0;
  for (const asset of assets) {
    const variants = await storage.listAssetVariants(asset.id);
    const kept: number[] = [];
    for (const v of variants) {
      const blob = await storage.getAssetBlob(asset.id, v);
      if (!blob) continue;
      const ext = v === 0 ? extFor(asset.mime) : extFor(blob.type || 'image/webp');
      zip.file(`assets/${asset.id}@${v}.${ext}`, blob);
      kept.push(v);
    }
    manifest.assets.push({ id: asset.id, variants: kept });
    done += 1;
    onProgress?.(done, assets.length);
  }
  zip.file('book.json', JSON.stringify(book, null, 2));
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('README.txt', `${book.title}\n\nExported ${manifest.exportedAt} from Sixteen Bannehr.\nOpen the book, choose Import from the menu, and pick this file.\n`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/** Read a .zip made by exportBookZip: stores its photos and returns the book, migrated to the current schema. */
export async function importBookZip(file: Blob, storage: BookStorage, onProgress?: (done: number, total: number) => void): Promise<Book> {
  const zip = await JSZip.loadAsync(file);
  const bookFile = zip.file('book.json');
  if (!bookFile) throw new Error('That file is not a Sixteen Bannehr export (no book.json inside).');
  const raw = JSON.parse(await bookFile.async('string')) as unknown;
  const book = migrateBook(raw);
  const manifestFile = zip.file('manifest.json');
  const manifest = manifestFile ? (JSON.parse(await manifestFile.async('string')) as Manifest) : null;
  if (manifest && manifest.format > ZIP_FORMAT) throw new Error('This export comes from a newer version of the book. Update the app and try again.');
  const files = Object.keys(zip.files).filter((n) => n.startsWith('assets/') && !zip.files[n].dir);
  let done = 0;
  for (const name of files) {
    const m = /^assets\/([^@/]+)@(\d+)\.(\w+)$/.exec(name);
    if (!m) continue;
    const [, id, variant, ext] = m;
    const type = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
    const data = await zip.files[name].async('blob');
    const blob = data.type ? data : new Blob([data], { type });
    await storage.putAssetBlob(id, blob, Number(variant));
    done += 1;
    onProgress?.(done, files.length);
  }
  // drop references to photos that did not travel (another browser's blobs)
  const stored = new Set<string>();
  for (const name of files) {
    const m = /^assets\/([^@/]+)@/.exec(name);
    if (m) stored.add(m[1]);
  }
  for (const asset of Object.values(book.assets) as Asset[]) {
    if (asset.source === 'idb' && !stored.has(asset.id)) {
      const have = await storage.listAssetVariants(asset.id);
      if (have.length === 0) delete book.assets[asset.id];
    }
  }
  return book;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function exportFilename(book: Book) {
  const date = new Date().toISOString().slice(0, 10);
  return `${book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'book'}-${date}.zip`;
}
