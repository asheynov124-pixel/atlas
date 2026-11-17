import JSZip from 'jszip';
import type { AssetMeta, Book, Edition } from '../model/types';
import { migrate } from '../model/migrate';
import type { BookRepository } from './repository';

// The book as one .zip: book.json, editions.json, and every photo the book or an edition
// uses (original plus web variants), so the other phone opens an identical book at once.

const FORMAT = 'sixteen-bannehr/1';

interface ZipManifest {
  format: string;
  exportedAt: string;
  title: string;
  assets: AssetMeta[];
}

function assetIdsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => assetIdsIn(v, into));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'assetId' && typeof v === 'string' && v) into.add(v);
      else assetIdsIn(v, into);
    }
  }
  return into;
}

function ext(mime: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif', 'image/avif': 'avif' }[mime] ?? 'bin';
}

export async function exportZip(repo: BookRepository, book: Book, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const zip = new JSZip();
  const summaries = await repo.listEditions();
  const editions: Edition[] = [];
  for (const s of summaries) {
    const e = await repo.getEdition(s.id);
    if (e) editions.push(e);
  }
  const ids = assetIdsIn([book, editions.map((e) => e.book)]);
  const metas: AssetMeta[] = [];
  let done = 0;
  for (const id of ids) {
    const meta = await repo.getAssetMeta(id);
    if (!meta) continue; // bundled photos ship with the site, not in the zip
    metas.push(meta);
    const folder = zip.folder(`assets/${id}`)!;
    const original = await repo.getBlob(id, 0);
    // Bytes rather than Blobs: JSZip reads them the same in every browser and in tests.
    if (original) folder.file(`original.${ext(meta.mime)}`, await original.arrayBuffer(), { binary: true, compression: 'STORE' });
    for (const w of meta.variants) {
      const v = await repo.getBlob(id, w);
      if (v) folder.file(`w${w}.${ext(v.type)}`, await v.arrayBuffer(), { binary: true, compression: 'STORE' });
    }
    onProgress?.(++done, ids.size);
  }
  const manifest: ZipManifest = { format: FORMAT, exportedAt: new Date().toISOString(), title: book.title, assets: metas };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('book.json', JSON.stringify(book, null, 2));
  zip.file('editions.json', JSON.stringify(editions));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}

export interface ImportResult {
  book: Book;
  assets: number;
  editions: number;
}

/** Read a zip and replace everything in the repository with it. Throws on a bad file. */
export async function importZip(repo: BookRepository, file: Blob): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestFile = zip.file('manifest.json');
  const bookFile = zip.file('book.json');
  if (!manifestFile || !bookFile) throw new Error('This .zip is not a Sixteen Bannehr book.');
  const manifest = JSON.parse(await manifestFile.async('string')) as ZipManifest;
  if (!String(manifest.format).startsWith('sixteen-bannehr/')) throw new Error('This .zip is not a Sixteen Bannehr book.');
  const book = migrate(JSON.parse(await bookFile.async('string')));
  const editionsRaw = zip.file('editions.json');
  const editions = editionsRaw ? (JSON.parse(await editionsRaw.async('string')) as Edition[]) : [];

  // Read everything before touching the repository, so a broken zip changes nothing.
  const assets: { meta: AssetMeta; original: Blob; variants: { w: number; blob: Blob }[] }[] = [];
  for (const meta of manifest.assets ?? []) {
    const folder = `assets/${meta.id}/`;
    const files = zip.file(new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const originalEntry = files.find((f) => /\/original\./.test(f.name));
    if (!originalEntry) continue;
    const original = new Blob([await originalEntry.async('arraybuffer')], { type: meta.mime });
    const variants: { w: number; blob: Blob }[] = [];
    for (const f of files) {
      const m = f.name.match(/\/w(\d+)\.(\w+)$/);
      if (!m) continue;
      const type = m[2] === 'jpg' ? 'image/jpeg' : `image/${m[2]}`;
      variants.push({ w: Number(m[1]), blob: new Blob([await f.async('arraybuffer')], { type }) });
    }
    assets.push({ meta: { ...meta, variants: variants.map((v) => v.w).sort((a, b) => a - b) }, original, variants });
  }

  await repo.clear();
  for (const a of assets) {
    await repo.putAsset(a.meta, a.original);
    for (const v of a.variants) await repo.putVariant(a.meta.id, v.w, v.blob);
  }
  for (const e of editions) {
    try {
      await repo.saveEdition({ ...e, book: migrate(e.book) });
    } catch {
      /* skip an unreadable edition rather than lose the import */
    }
  }
  await repo.saveBook(book);
  return { book, assets: assets.length, editions: editions.length };
}

export function zipName(book: Book): string {
  const day = new Date().toISOString().slice(0, 10);
  const slug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';
  return `${slug}-${day}.zip`;
}
