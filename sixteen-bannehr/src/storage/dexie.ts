import Dexie, { type Table } from 'dexie';
import type { AssetMeta, Book, Edition, EditionSummary } from '../model/types';
import type { BookRepository } from './repository';

interface BookRow {
  id: string;
  book: Book;
}

interface BlobRow {
  assetId: string;
  width: number;
  blob: Blob;
}

class BookDB extends Dexie {
  books!: Table<BookRow, string>;
  editions!: Table<Edition, string>;
  assets!: Table<AssetMeta, string>;
  blobs!: Table<BlobRow, [string, number]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      books: 'id',
      editions: 'id, createdAt',
      assets: 'id, createdAt',
      blobs: '[assetId+width], assetId',
    });
  }
}

const CURRENT = 'current';

export class DexieRepository implements BookRepository {
  private db: BookDB;

  constructor(name = 'sixteen-bannehr') {
    this.db = new BookDB(name);
  }

  async loadBook() {
    return (await this.db.books.get(CURRENT))?.book ?? null;
  }

  async saveBook(book: Book) {
    await this.db.books.put({ id: CURRENT, book });
  }

  async listEditions(): Promise<EditionSummary[]> {
    const all = await this.db.editions.orderBy('createdAt').reverse().toArray();
    return all.map(({ book: _book, ...summary }) => summary);
  }

  getEdition(id: string) {
    return this.db.editions.get(id);
  }

  async saveEdition(edition: Edition) {
    await this.db.editions.put(edition);
  }

  async deleteEdition(id: string) {
    await this.db.editions.delete(id);
  }

  async putAsset(meta: AssetMeta, original: Blob) {
    await this.db.transaction('rw', this.db.assets, this.db.blobs, async () => {
      await this.db.assets.put(meta);
      await this.db.blobs.put({ assetId: meta.id, width: 0, blob: original });
    });
  }

  async putVariant(assetId: string, width: number, blob: Blob) {
    await this.db.blobs.put({ assetId, width, blob });
  }

  async updateAssetMeta(meta: AssetMeta) {
    await this.db.assets.put(meta);
  }

  getAssetMeta(id: string) {
    return this.db.assets.get(id);
  }

  listAssetMeta() {
    return this.db.assets.toArray();
  }

  async getBlob(id: string, width: number) {
    return (await this.db.blobs.get([id, width]))?.blob;
  }

  async deleteAsset(id: string) {
    await this.db.transaction('rw', this.db.assets, this.db.blobs, async () => {
      await this.db.assets.delete(id);
      await this.db.blobs.where('assetId').equals(id).delete();
    });
  }

  async clear() {
    await this.db.transaction('rw', [this.db.books, this.db.editions, this.db.assets, this.db.blobs], async () => {
      await Promise.all([this.db.books.clear(), this.db.editions.clear(), this.db.assets.clear(), this.db.blobs.clear()]);
    });
  }
}

let repo: BookRepository | null = null;

/** The app's repository. Swap the implementation here and nowhere else. */
export function repository(): BookRepository {
  repo ??= new DexieRepository();
  return repo;
}

export function setRepository(r: BookRepository) {
  repo = r;
}
