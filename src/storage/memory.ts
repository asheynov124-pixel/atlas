import type { Book, EditionMeta } from '@/book/types';
import { newId } from '@/book/ids';
import type { BookStorage } from './types';

/** In-memory storage: used by tests and as a fallback when IndexedDB is unavailable. */
export class MemoryStorage implements BookStorage {
  private book: Book | null = null;
  private editions = new Map<string, { meta: EditionMeta; book: Book }>();
  private blobs = new Map<string, Blob>();

  async loadBook() {
    return this.book ? structuredClone(this.book) : null;
  }
  async saveBook(book: Book) {
    this.book = structuredClone(book);
  }
  async listEditions() {
    return [...this.editions.values()].map((e) => e.meta).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async saveEdition(name: string, book: Book) {
    const meta: EditionMeta = {
      id: newId('ed'),
      name,
      createdAt: new Date().toISOString(),
      spreadCount: book.chapters.reduce((n, c) => n + c.spreads.length, 0),
    };
    this.editions.set(meta.id, { meta, book: structuredClone(book) });
    return meta;
  }
  async loadEdition(id: string) {
    const e = this.editions.get(id);
    return e ? structuredClone(e.book) : null;
  }
  async deleteEdition(id: string) {
    this.editions.delete(id);
  }
  async putAssetBlob(assetId: string, blob: Blob, variant = 0) {
    this.blobs.set(`${assetId}@${variant}`, blob);
  }
  async getAssetBlob(assetId: string, variant = 0) {
    return this.blobs.get(`${assetId}@${variant}`) ?? null;
  }
  async deleteAsset(assetId: string) {
    for (const k of [...this.blobs.keys()]) if (k.startsWith(`${assetId}@`)) this.blobs.delete(k);
  }
  async listAssetVariants(assetId: string) {
    return [...this.blobs.keys()]
      .filter((k) => k.startsWith(`${assetId}@`))
      .map((k) => Number(k.split('@')[1]));
  }
  async clearAll() {
    this.book = null;
    this.editions.clear();
    this.blobs.clear();
  }
}
