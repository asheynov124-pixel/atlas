import type { AssetMeta, Book, Edition, EditionSummary } from '../model/types';

/**
 * Everything the app knows about persistence. The UI talks only to this interface, so a
 * sync backend can replace IndexedDB later without touching a component.
 */
export interface BookRepository {
  loadBook(): Promise<Book | null>;
  saveBook(book: Book): Promise<void>;

  listEditions(): Promise<EditionSummary[]>;
  getEdition(id: string): Promise<Edition | undefined>;
  saveEdition(edition: Edition): Promise<void>;
  deleteEdition(id: string): Promise<void>;

  putAsset(meta: AssetMeta, original: Blob): Promise<void>;
  putVariant(assetId: string, width: number, blob: Blob): Promise<void>;
  updateAssetMeta(meta: AssetMeta): Promise<void>;
  getAssetMeta(id: string): Promise<AssetMeta | undefined>;
  listAssetMeta(): Promise<AssetMeta[]>;
  /** width 0 is the original file. */
  getBlob(id: string, width: number): Promise<Blob | undefined>;
  deleteAsset(id: string): Promise<void>;

  /** Remove everything (used before importing a book from a zip). */
  clear(): Promise<void>;
}
