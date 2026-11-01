import type { Asset, Book, EditionMeta } from '@/book/types';

/**
 * The storage seam. The UI and the store talk to this interface only, so a
 * sync backend can replace Dexie without touching components.
 */
export interface BookStorage {
  loadBook(): Promise<Book | null>;
  saveBook(book: Book): Promise<void>;

  listEditions(): Promise<EditionMeta[]>;
  saveEdition(name: string, book: Book): Promise<EditionMeta>;
  loadEdition(id: string): Promise<Book | null>;
  deleteEdition(id: string): Promise<void>;

  /** Store the original blob and any pre-rendered variants for an asset. */
  putAssetBlob(assetId: string, blob: Blob, variant?: number): Promise<void>;
  getAssetBlob(assetId: string, variant?: number): Promise<Blob | null>;
  deleteAsset(assetId: string): Promise<void>;
  /** Variant widths stored for an asset (0 = original). */
  listAssetVariants(assetId: string): Promise<number[]>;

  clearAll(): Promise<void>;
}

export type { Asset };
