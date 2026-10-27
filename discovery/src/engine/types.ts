/** Domain model for learning, paths, and organisation. All of it is local-first. */
import type { FacetWeights, Filters, SearchQuery, Vec } from '../data/types';

export type SignalKind =
  | 'like'
  | 'dislike'
  | 'save'
  | 'capture'
  | 'more'
  | 'less'
  | 'watch'
  | 'rewatch'
  | 'skip';

export const EXPLICIT_SIGNALS: readonly SignalKind[] = ['like', 'dislike', 'save', 'capture', 'more', 'less'];

export interface Signal {
  id: string;
  kind: SignalKind;
  videoId: string;
  at: number;
  /** Signed strength before time decay. */
  value: number;
  pathId?: string;
  pathKind?: PathKind;
  /** Watch fraction / loop count for implicit signals. */
  fraction?: number;
  loops?: number;
}

/** Manual corrections from the "inspect & edit" screen. They replace learned weights. */
export interface Overrides {
  tags: Record<string, number>;
  performers: Record<string, number>;
  studios: Record<string, number>;
}

/** Hard "never show". Separate from dislike, which only lowers ranking. */
export interface Blocks {
  videos: string[];
  performers: string[];
  studios: string[];
  tags: string[];
}

export type PathKind =
  | 'forYou'
  | 'related'
  | 'performer'
  | 'visual'
  | 'acts'
  | 'tags'
  | 'studio'
  | 'contrast'
  | 'series'
  | 'aspect'
  | 'cluster'
  | 'search'
  | 'collection'
  | 'imported';

export type PathSeed =
  | { kind: 'forYou' }
  | { kind: 'related'; videoId: string }
  | { kind: 'performer'; performerId: string }
  | { kind: 'visual'; videoId: string; facets: FacetWeights }
  | { kind: 'acts'; videoId: string; tagIds: string[] }
  | { kind: 'tags'; tagIds: string[]; videoId?: string }
  | { kind: 'studio'; studioId: string }
  | { kind: 'contrast'; videoId?: string }
  | { kind: 'series'; seriesId: string }
  | { kind: 'aspect'; videoId: string; vector: Vec; facets: FacetWeights; tagIds: string[]; excludeTagIds: string[]; label: string }
  | { kind: 'cluster'; vector: Vec; facets: FacetWeights; tagIds: string[]; label: string }
  | { kind: 'search'; query: SearchQuery; filters?: Partial<Filters>; label: string }
  | { kind: 'collection'; videoIds: string[]; source: 'board' | 'saved' | 'smart' | 'history'; refId?: string; label: string }
  /** Your imports, ranked by taste — or one batch in import order. */
  | { kind: 'imported'; batchId?: string; label: string };

export interface Path {
  id: string;
  seed: PathSeed;
  label: string;
  createdAt: number;
  updatedAt: number;
  /** Buffered video ids; the feed shows queue[index]. */
  queue: string[];
  index: number;
  /** Opaque source cursor for the next page. */
  cursor?: string;
  exhausted: boolean;
  /** Per-path filter override (merged over the profile's global filters). */
  filters?: Partial<Filters>;
  pinned?: boolean;
  /** Path this one branched from, if any. */
  parentId?: string;
  /** Once this id is loaded into the queue, jump to it (e.g. "watch the series" from episode 3). */
  startAt?: string;
}

export interface SaveRecord {
  videoId: string;
  savedAt: number;
  /** Where it was saved from — auto-metadata. */
  pathId?: string;
  pathLabel?: string;
  /** Playback position at save time, seconds into the clip. */
  position?: number;
  note: string;
  customTags: string[];
}

export interface Board {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  videoIds: string[];
  /** Created by accepting an AI suggestion. */
  fromSuggestion?: boolean;
}

export type HistoryAction = 'like' | 'dislike' | 'save' | 'capture' | 'skip' | 'watch';

export interface HistoryEntry {
  id: string;
  videoId: string;
  at: number;
  sessionId: string;
  pathId: string;
  pathLabel: string;
  pathKind: PathKind;
  /** Position within the path's queue when viewed (for jump). */
  pathIndex: number;
  watched: number;
  actions: HistoryAction[];
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: Partial<Filters>;
  builtIn?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  color: string;
  createdAt: number;
}
