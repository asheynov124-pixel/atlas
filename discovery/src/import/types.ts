/**
 * Personal Import: types shared by the parser, the store, and the UI.
 *
 * An import turns URLs the user pastes or uploads into native clips. Nothing
 * here runs in the background: every network request is a page scan the user
 * started, and it obeys the site's CORS policy.
 */

export type MediaType = 'image' | 'video' | 'page';

/** Where in a page (or input) a candidate was found. Drives scoring and the preview badge. */
export type CandidateOrigin =
  | 'direct' // the user pasted or uploaded this exact URL
  | 'meta' // og:/twitter: meta tags
  | 'video' // <video src>/<source>
  | 'img' // <img src>
  | 'srcset' // best candidate from a srcset
  | 'lazy' // data-src / data-lazy-src / data-original …
  | 'link' // <a href> to a media file, or wrapping a gallery thumbnail
  | 'jsonld' // ImageObject / VideoObject
  | 'json' // inline JSON gallery data
  | 'style' // background-image in a content container
  | 'nav'; // next/prev or a linked gallery page

export type CandidateFlag =
  | 'duplicate' // repeated within this batch
  | 'in-library' // already imported earlier
  | 'small' // known to be under the minimum size
  | 'low-confidence' // weak signals (icon-ish name, chrome area, inline JSON only)
  | 'unscanned' // a page URL nobody has scanned yet
  | 'next-page' // pagination link found while scanning
  | 'linked-page' // a gallery sub-page found while scanning
  | 'scan-failed'; // a page scan failed (CORS, HTTP error, timeout)

export interface Candidate {
  /** Normalised URL, also the dedupe key. */
  key: string;
  url: string;
  mediaType: MediaType;
  title: string;
  originalUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  /** User tags carried in from an uploaded file (e.g. a re-imported export). */
  tags: string[];
  origin: CandidateOrigin;
  score: number;
  include: boolean;
  flags: CandidateFlag[];
  /** Members of one gallery set share a group id. */
  groupId?: string;
  role?: 'next' | 'prev' | 'subpage';
  /** Present when a page scan failed. */
  error?: ScanError;
}

export interface ScanError {
  kind: 'cors' | 'http' | 'timeout' | 'empty' | 'not-html' | 'too-large';
  message: string;
}

/** What the pipeline drops outright (never shown as rows), so the summary can say so. */
export interface DropCounts {
  /** Icons, logos, spacers, tracking pixels, tiny SVGs, inline data URIs. */
  junk: number;
  /** Known ad / tracker hosts. */
  ads: number;
  /** Refused by the safety gate (minor-implying or non-consent terms). */
  refused: number;
  /** Strings that weren't usable http(s) URLs. */
  invalid: number;
}

export interface ImportSummary {
  total: number;
  included: number;
  images: number;
  videos: number;
  pages: number;
  duplicates: number;
  inLibrary: number;
  failed: number;
  dropped: DropCounts;
}

/** A committed imported clip. The batch is the source of truth; VideoSummaries derive from it. */
export interface ImportItem {
  id: string;
  batchId: string;
  url: string;
  mediaType: MediaType;
  title: string;
  /** Free-text personal tags, as the user typed them. */
  tags: string[];
  /** Taxonomy tag ids matched from `tags` (so filters and learning understand them). */
  tagIds: string[];
  originalUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  host: string;
  /** Items found on the same page cluster together in embedding space. */
  groupKey: string;
  notes: string;
  addedAt: number;
}

export interface ImportBatch {
  id: string;
  name: string;
  createdAt: number;
  /** Tags applied to every item in the batch at import time. */
  tags: string[];
  boardId?: string;
  itemIds: string[];
  source: 'paste' | 'file' | 'mixed';
  stats: { found: number; imported: number; duplicates: number; failed: number; dropped: number };
}

export interface ImportsData {
  batches: ImportBatch[];
  items: Record<string, ImportItem>;
}

export const emptyImports = (): ImportsData => ({ batches: [], items: {} });
