/**
 * Data layer contract.
 *
 * Everything the UI, learning engine, and AI hooks know about content flows
 * through these types and the `DataSource` interface. The prototype ships a
 * mock implementation (`./mock/mockSource.ts`); a live source only has to
 * satisfy the same interface.
 */

/** A dense embedding. Plain arrays so it serialises to IndexedDB/JSON as-is. */
export type Vec = number[];

/**
 * Visual embeddings are four facets of `FACET_DIM` dims each, concatenated in
 * this order. Similarity can be computed per facet or across all of them.
 */
export type Facet = 'face' | 'body' | 'pose' | 'composition';
export const FACETS: readonly Facet[] = ['face', 'body', 'pose', 'composition'] as const;
export const FACET_DIM = 8;
export const EMBEDDING_DIM = FACET_DIM * FACETS.length;

/** Relative emphasis of each facet when comparing embeddings. */
export type FacetWeights = Partial<Record<Facet, number>>;

export type HairColor = 'black' | 'brown' | 'blonde' | 'red' | 'colored';
export type BodyType = 'petite' | 'slim' | 'athletic' | 'curvy' | 'muscular';
/** Every performer in the catalog is an adult; brackets are coarse on purpose. */
export type AgeBracket = '20s' | '30s' | '40s+';
export type Quality = 'SD' | 'HD' | '4K';
export type ProductionStyle = 'amateur' | 'pro' | 'cinematic';
export type TagCategory = 'act' | 'setting' | 'style' | 'mood' | 'production';

export interface Tag {
  id: string;
  label: string;
  category: TagCategory;
  synonyms: string[];
}

export interface Performer {
  id: string;
  name: string;
  aliases: string[];
  hair: HairColor;
  bodyType: BodyType;
  ageBracket: AgeBracket;
  tattoos: boolean;
  piercings: boolean;
  /** Face + body facet vectors; videos inherit (noisy) copies of these. */
  face: Vec;
  body: Vec;
  videoCount: number;
}

export interface Studio {
  id: string;
  name: string;
  style: ProductionStyle;
  videoCount: number;
}

export interface Series {
  id: string;
  studioId: string;
  title: string;
  /** Video ids in episode order. */
  episodes: string[];
}

export type ThumbnailSpec = { kind: 'procedural'; seed: number } | { kind: 'url'; url: string };

export interface VideoSummary {
  id: string;
  title: string;
  performerIds: string[];
  studioId: string;
  seriesId?: string;
  episode?: number;
  /** Tag ids. */
  tags: string[];
  /** Full-length runtime in seconds. */
  duration: number;
  /** Length of the vertical preview clip shown in the feed, in seconds. */
  clipDuration: number;
  quality: Quality;
  style: ProductionStyle;
  orientation: 'vertical' | 'horizontal';
  /** ISO date. */
  releaseDate: string;
  views: number;
  /** Share of positive ratings, 0..1. */
  rating: number;
  thumbnail: ThumbnailSpec;
  /** Visual embedding (`EMBEDDING_DIM` long). */
  embedding: Vec;
  /** Canonical page on the origin site. Always present so "open original" never dead-ends. */
  originalUrl: string;
  /** Set on clips the user imported (Personal Import); absent for source content. */
  source?: 'import';
  mediaType?: 'image' | 'video' | 'page';
  batchId?: string;
  /** Free-text personal tags (imports). Taxonomy matches live in `tags`. */
  userTags?: string[];
  thumbnailUrl?: string;
}

/**
 * Playback is an ordered fallback chain: try an embed, then a direct source,
 * then send the user to the original page. Imported stills use `image`.
 */
export type PlaybackOption =
  | { kind: 'image'; url: string }
  | { kind: 'embed'; url: string }
  | { kind: 'source'; url: string; mime?: string }
  | { kind: 'original'; url: string };

export interface VideoDetail extends VideoSummary {
  description: string;
  performers: Performer[];
  studio: Studio;
  series?: Series;
  playback: PlaybackOption[];
}

/** Performer-attribute filter. Empty arrays mean "any". */
export interface PerformerAttrs {
  hair: HairColor[];
  bodyType: BodyType[];
  ageBracket: AgeBracket[];
  tattoos: 'any' | 'yes' | 'no';
  piercings: 'any' | 'yes' | 'no';
}

export interface Filters {
  performers: { include: string[]; exclude: string[]; attrs: PerformerAttrs };
  tags: {
    /** Must carry every one of these. */
    all: string[];
    /** Must carry at least one of these (ignored when empty). */
    any: string[];
    /** Must carry none of these. */
    none: string[];
    /** Ranking boosts, roughly -2..+2. Soft: they reorder rather than exclude. */
    weights: Record<string, number>;
  };
  studios: { include: string[]; exclude: string[] };
  styles: ProductionStyle[];
  quality: Quality[];
  /** Minutes. */
  duration: { min?: number; max?: number };
  year: { min?: number; max?: number };
  /** 0 = only what you already like, 1 = mostly new territory. */
  exploration: number;
  preferNew: boolean;
  /** Catalogue clips, your imports, or both. */
  source: 'all' | 'catalog' | 'imports';
}

/** Text + structured query. Text is interpreted by the AI layer when present. */
export interface SearchQuery {
  text?: string;
  mode?: 'auto' | 'keyword' | 'natural';
  performerIds?: string[];
  studioIds?: string[];
  tagIds?: string[];
  excludeTagIds?: string[];
  seriesId?: string;
  /** Soft visual target produced by NL interpretation or aspect capture. */
  visual?: VisualTarget;
  sort?: 'relevance' | 'popular' | 'newest' | 'rating';
  /** Restrict to imported clips (optionally specific batches). Sources without imports return nothing. */
  imports?: { batchIds?: string[] };
}

/**
 * A visual intent: a target vector plus a per-dimension mask saying which
 * dims matter. A mask of all ones is plain similarity to `vector`.
 */
export interface VisualTarget {
  vector: Vec;
  mask: Vec;
  label: string;
}

export type SimilarSeed =
  | { kind: 'video'; id: string; facets?: FacetWeights }
  | { kind: 'embedding'; vector: Vec; facets?: FacetWeights; mask?: Vec }
  | { kind: 'tags'; tagIds: string[] };

export interface PageRequest {
  cursor?: string;
  limit?: number;
  excludeIds?: string[];
}

export interface Reason {
  label: string;
  weight: number;
}

export interface ScoredVideo {
  video: VideoSummary;
  /** Source relevance, 0..1-ish. The client re-ranks with the taste profile. */
  score: number;
  reasons: Reason[];
}

export interface SearchResults {
  items: ScoredVideo[];
  total: number;
  nextCursor?: string;
  tookMs: number;
  /** Entity matches for keyword queries. */
  performers: Performer[];
  studios: Studio[];
  tags: Tag[];
  /** Set when the query was refused or results were altered (e.g. by blocks). */
  notice?: { kind: 'safety' | 'info'; message: string };
}

export interface Taxonomy {
  tags: Tag[];
  performers: Performer[];
  studios: Studio[];
  series: Series[];
}

export interface ResolvedLink {
  video: VideoSummary;
  /** How the link was recognised, for display. */
  matchedBy: 'viewkey' | 'path-id' | 'hash';
  /** True when the source didn't know the link and mapped it to a stand-in (mock only). */
  standIn?: boolean;
}

/**
 * The internal API. Every method is async so a network-backed source can
 * drop in without touching callers.
 */
export interface DataSource {
  readonly name: string;
  taxonomy(): Promise<Taxonomy>;
  search(query: SearchQuery, filters?: Partial<Filters>, page?: PageRequest): Promise<SearchResults>;
  getVideo(id: string): Promise<VideoDetail>;
  getVideos(ids: string[]): Promise<VideoSummary[]>;
  getSimilar(seed: SimilarSeed, page?: PageRequest): Promise<SearchResults>;
  /** Broad candidate pool for "For You"-style blends. */
  explore(page?: PageRequest & { sort?: SearchQuery['sort'] }): Promise<SearchResults>;
  resolveUrl(url: string): Promise<ResolvedLink | null>;
}

export class DataError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'DataError';
    this.retryable = retryable;
  }
}
