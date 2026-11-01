import Dexie, { type EntityTable } from 'dexie';
import type { Book, EditionMeta } from '@/book/types';
import { newId } from '@/book/ids';
import type { BookStorage } from './types';

interface BookRow {
  id: string;
  book: Book;
  updatedAt: string;
}

interface EditionRow extends EditionMeta {
  book: Book;
}

interface BlobRow {
  key: string;
  assetId: string;
  variant: number;
  blob: Blob;
}

const CURRENT = 'current';

class BookDb extends Dexie {
  books!: EntityTable<BookRow, 'id'>;
  editions!: EntityTable<EditionRow, 'id'>;
  blobs!: EntityTable<BlobRow, 'key'>;

  constructor(name = 'sixteen-bannehr') {
    super(name);
    this.version(1).stores({
      books: 'id',
      editions: 'id, createdAt',
      blobs: 'key, assetId',
    });
  }
}

/** IndexedDB storage via Dexie. Assets are stored as Blobs keyed by `${assetId}@${variantWidth}`. */
export class DexieStorage implements BookStorage {
  private db: BookDb;

  constructor(name?: string) {
    this.db = new BookDb(name);
  }

  async loadBook() {
    const row = await this.db.books.get(CURRENT);
    return row?.book ?? null;
  }

  async saveBook(book: Book) {
    await this.db.books.put({ id: CURRENT, book, updatedAt: book.updatedAt });
  }

  async listEditions() {
    const rows = await this.db.editions.orderBy('createdAt').reverse().toArray();
    return rows.map(({ id, name, createdAt, spreadCount }) => ({ id, name, createdAt, spreadCount }));
  }

  async saveEdition(name: string, book: Book) {
    const meta: EditionMeta = {
      id: newId('ed'),
      name,
      createdAt: new Date().toISOString(),
      spreadCount: book.chapters.reduce((n, c) => n + c.spreads.length, 0),
    };
    await this.db.editions.put({ ...meta, book });
    return meta;
  }

  async loadEdition(id: string) {
    const row = await this.db.editions.get(id);
    return row?.book ?? null;
  }

  async deleteEdition(id: string) {
    await this.db.editions.delete(id);
  }

  async putAssetBlob(assetId: string, blob: Blob, variant = 0) {
    await this.db.blobs.put({ key: `${assetId}@${variant}`, assetId, variant, blob });
  }

  async getAssetBlob(assetId: string, variant = 0) {
    const row = await this.db.blobs.get(`${assetId}@${variant}`);
    return row?.blob ?? null;
  }

  async deleteAsset(assetId: string) {
    await this.db.blobs.where('assetId').equals(assetId).delete();
  }

  async listAssetVariants(assetId: string) {
    const rows = await this.db.blobs.where('assetId').equals(assetId).toArray();
    return rows.map((r) => r.variant);
  }

  async clearAll() {
    await Promise.all([this.db.books.clear(), this.db.editions.clear(), this.db.blobs.clear()]);
  }
}

export const hasIndexedDb = () => typeof indexedDB !== 'undefined';
