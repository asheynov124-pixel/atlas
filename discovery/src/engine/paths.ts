/**
 * Smart Paths: parallel, effectively infinite feeds. Each path kind maps to a
 * candidate query against the DataSource, then the client re-ranks with the
 * active taste profile. Queues are buffered and extended on demand.
 */
import type { DataSource, FacetWeights, Filters, ScoredVideo, VideoSummary, Vec } from '../data/types';
import { kmeans, suggestK } from '../ai/cluster';
import { mean } from '../lib/vec';
import { uid } from '../lib/id';
import type { PerformerLookup } from './filters';
import { mergeFilters } from './filters';
import type { TasteModel } from './learning';
import { rank, type Names, type RankOptions, type Ranked } from './ranking';
import type { Blocks, Path, PathKind, PathSeed } from './types';

export interface PathKindInfo {
  icon: string;
  title: string;
  blurb: string;
}

export const PATH_KINDS: Record<PathKind, PathKindInfo> = {
  forYou: { icon: '✦', title: 'For You', blurb: 'AI blend of everything your profile has learned' },
  related: { icon: '⟡', title: 'Related', blurb: 'Same people, tags, and look as one clip' },
  performer: { icon: '◉', title: 'Same performer', blurb: 'Everything with one performer' },
  visual: { icon: '◎', title: 'Visually similar', blurb: 'Faces, bodies, poses, or composition that look alike' },
  acts: { icon: '❖', title: 'Matching acts', blurb: 'Same acts and themes' },
  tags: { icon: '#', title: 'Tag overlap', blurb: 'High overlap with a set of tags' },
  studio: { icon: '▣', title: 'Same studio', blurb: 'One studio’s catalogue' },
  contrast: { icon: '◐', title: 'Contrast', blurb: 'Deliberately different — explore outside your taste' },
  series: { icon: '☰', title: 'Series', blurb: 'Episodes in order' },
  aspect: { icon: '⌖', title: 'Aspect', blurb: 'Built from something you circled' },
  cluster: { icon: '✧', title: 'AI cluster', blurb: 'A pocket of your taste the AI spotted' },
  search: { icon: '⌕', title: 'Search', blurb: 'Results as a feed' },
  collection: { icon: '▤', title: 'Collection', blurb: 'A board, collection, or history slice' },
};

export const FACET_LABEL: Record<string, string> = {
  face: 'Face',
  body: 'Body',
  pose: 'Pose',
  composition: 'Composition',
  all: 'Overall look',
};

export interface PathNames extends Names {
  series: (id: string) => string;
  video: (id: string) => string;
}

function facetLabel(f: FacetWeights): string {
  const entries = Object.entries(f).filter(([, w]) => (w ?? 0) > 0);
  if (entries.length !== 1) return FACET_LABEL.all;
  return FACET_LABEL[entries[0][0]];
}

export function pathLabel(seed: PathSeed, n: PathNames): string {
  switch (seed.kind) {
    case 'forYou':
      return 'For You';
    case 'related':
      return `Related · ${n.video(seed.videoId)}`;
    case 'performer':
      return n.performer(seed.performerId);
    case 'visual':
      return `${facetLabel(seed.facets)} like ${n.video(seed.videoId)}`;
    case 'acts':
      return seed.tagIds.map(n.tag).join(' + ') || 'Matching acts';
    case 'tags':
      return `#${seed.tagIds.map(n.tag).join(' #')}`;
    case 'studio':
      return n.studio(seed.studioId);
    case 'contrast':
      return 'Contrast';
    case 'series':
      return n.series(seed.seriesId);
    case 'aspect':
    case 'cluster':
    case 'search':
    case 'collection':
      return seed.label;
  }
}

export function createPath(seed: PathSeed, label: string, opts: { startWith?: string[]; filters?: Partial<Filters>; parentId?: string; pinned?: boolean } = {}): Path {
  const now = Date.now();
  const queue = seed.kind === 'collection' ? seed.videoIds.slice() : opts.startWith?.slice() ?? [];
  return {
    id: seed.kind === 'forYou' ? 'for-you' : uid('path-'),
    seed,
    label,
    createdAt: now,
    updatedAt: now,
    queue,
    index: 0,
    cursor: undefined,
    exhausted: seed.kind === 'collection',
    filters: opts.filters,
    pinned: opts.pinned,
    parentId: opts.parentId,
  };
}

export interface PathContext {
  ds: DataSource;
  model: TasteModel;
  /** Profile-wide filters; the path's own override is merged in here. */
  globalFilters: Partial<Filters>;
  blocks: Blocks;
  performer: PerformerLookup;
  names: Names;
  /** Recently viewed ids (all paths) for a mild repeat penalty. */
  recent: Set<string>;
  rng?: () => number;
}

const PAGE = 40;

/**
 * Up to three interest centroids from the profile's embedding store: k-means
 * clusters when there's enough signal, otherwise the single like-centroid.
 */
export function tasteInterests(model: TasteModel, video?: (id: string) => VideoSummary | undefined): Vec[] {
  if (video && model.positives.length >= 6) {
    const pos = model.positives.map((p) => ({ p, v: video(p.videoId) })).filter((x) => !!x.v);
    if (pos.length >= 6) {
      return kmeans(pos.map((x) => x.v!.embedding), suggestK(pos.length), pos.map((x) => x.p.weight))
        .filter((c) => c.members.length >= 2)
        .slice(0, 3)
        .map((c) => mean(c.members.map((i) => pos[i].v!.embedding)));
    }
  }
  return model.likeCentroid ? [model.likeCentroid] : [];
}

interface Page {
  items: ScoredVideo[];
  nextCursor?: string;
}

async function fetchPage(
  seed: PathSeed,
  cursor: string | undefined,
  ctx: PathContext,
  filters: Filters,
  queue: string[],
  video?: (id: string) => VideoSummary | undefined,
): Promise<Page> {
  const { ds } = ctx;
  const page = { cursor, limit: PAGE };
  switch (seed.kind) {
    case 'forYou': {
      // Multi-interest blend: a trending/explore stream plus one similarity
      // stream per taste cluster, so two different interests don't average
      // into a muddy middle. Similarity streams page via excludeIds, not cursors.
      const items: ScoredVideo[] = [];
      const r = await ds.explore({ cursor, limit: 24 });
      items.push(...r.items);
      const interests = tasteInterests(ctx.model, video);
      const exclude = queue.slice(-400);
      const perInterest = Math.max(6, Math.round(18 / Math.max(1, interests.length)));
      const sims = await Promise.all(
        interests.map((vector) => ds.getSimilar({ kind: 'embedding', vector }, { limit: perInterest, excludeIds: exclude })),
      );
      for (const sim of sims) {
        // Similar-to-taste candidates arrive with high source scores; scale into the explore range.
        items.push(...sim.items.map((it) => ({ ...it, score: it.score * 0.9, reasons: [{ label: 'Close to a pocket of your taste', weight: it.score }] })));
      }
      return { items, nextCursor: r.nextCursor };
    }
    case 'related':
      return ds.getSimilar({ kind: 'video', id: seed.videoId }, page);
    case 'performer':
      return ds.search({ performerIds: [seed.performerId] }, filters, page);
    case 'visual':
      return ds.getSimilar({ kind: 'video', id: seed.videoId, facets: seed.facets }, page);
    case 'acts':
    case 'tags':
      return ds.getSimilar({ kind: 'tags', tagIds: seed.tagIds }, page);
    case 'studio':
      return ds.search({ studioIds: [seed.studioId] }, filters, page);
    case 'contrast':
      return ds.explore({ cursor, limit: 60 });
    case 'series':
      return ds.search({ seriesId: seed.seriesId }, filters, { cursor, limit: 100 });
    case 'aspect':
      return ds.getSimilar({ kind: 'embedding', vector: seed.vector, facets: seed.facets }, page);
    case 'cluster':
      return ds.getSimilar({ kind: 'embedding', vector: seed.vector, facets: seed.facets }, page);
    case 'search':
      return ds.search(seed.query, mergeFilters(filters, seed.filters), page);
    case 'collection':
      return { items: [] };
  }
}

function rankOptions(seed: PathSeed, ctx: PathContext, filters: Filters, exclude: Set<string>, video?: (id: string) => VideoSummary | undefined): RankOptions {
  const base: RankOptions = {
    model: ctx.model,
    filters,
    blocks: ctx.blocks,
    performer: ctx.performer,
    names: ctx.names,
    pathWeight: 0.8,
    profileWeight: 0.5,
    exclude,
    dropDisliked: true,
    exploration: filters.exploration,
    rng: ctx.rng,
  };
  switch (seed.kind) {
    case 'forYou':
      return { ...base, pathWeight: 0.35, profileWeight: 1, recent: ctx.recent };
    case 'related': {
      const src = video?.(seed.videoId);
      return {
        ...base,
        extra: src
          ? (v) => {
              const shared = v.performerIds.filter((p) => src.performerIds.includes(p)).length;
              const tags = v.tags.filter((t) => src.tags.includes(t)).length / Math.max(1, src.tags.length);
              const score = 0.35 * shared + 0.4 * tags;
              return { score, reasons: shared ? [{ label: 'Shares a performer', weight: 0.35 * shared }] : [] };
            }
          : undefined,
      };
    }
    case 'performer':
      return { ...base, pathWeight: 0.5, profileWeight: 0.6 };
    case 'visual':
    case 'aspect':
      return {
        ...base,
        pathWeight: 1,
        profileWeight: 0.35,
        extra:
          seed.kind === 'aspect' && seed.tagIds.length
            ? (v) => {
                const hits = seed.tagIds.filter((t) => v.tags.includes(t));
                return { score: 0.3 * hits.length, reasons: hits.length ? [{ label: `Matches what you described`, weight: 0.3 * hits.length }] : [] };
              }
            : undefined,
      };
    case 'acts':
    case 'tags':
      return { ...base, pathWeight: 0.9, profileWeight: 0.5 };
    case 'studio':
      return { ...base, pathWeight: 0.5, profileWeight: 0.6 };
    case 'contrast':
      return { ...base, pathWeight: 0.2, profileWeight: 1, contrast: true, exploration: Math.max(0.5, filters.exploration) };
    case 'series':
    case 'collection':
      return { ...base, preserveOrder: true, dropDisliked: false, exploration: 0 };
    case 'cluster':
      return { ...base, pathWeight: 0.9, profileWeight: 0.5 };
    case 'search':
      return { ...base, pathWeight: 1, profileWeight: 0.35 };
  }
}

export interface Extension {
  append: string[];
  ranked: Ranked[];
  cursor?: string;
  exhausted: boolean;
}

/** Fetch and rank enough new candidates to keep the feed ahead of the user. */
export async function extendPath(path: Path, ctx: PathContext, want = 12, video?: (id: string) => VideoSummary | undefined): Promise<Extension> {
  if (path.exhausted || path.seed.kind === 'collection') return { append: [], ranked: [], cursor: path.cursor, exhausted: true };
  const seed = path.seed;
  let filters = mergeFilters(ctx.globalFilters, path.filters);
  if (seed.kind === 'aspect' && seed.excludeTagIds.length) {
    filters = { ...filters, tags: { ...filters.tags, none: [...new Set([...filters.tags.none, ...seed.excludeTagIds])] } };
  }
  const exclude = new Set(path.queue);
  const opts = rankOptions(seed, ctx, filters, exclude, video);
  const ranked: Ranked[] = [];
  let cursor = path.cursor;
  let exhausted = false;
  for (let attempt = 0; attempt < 5 && ranked.length < want; attempt++) {
    const page = await fetchPage(seed, cursor, ctx, filters, [...exclude], video);
    const batch = rank(page.items, opts);
    for (const r of batch) {
      exclude.add(r.video.id);
      ranked.push(r);
    }
    cursor = page.nextCursor;
    if (!cursor) {
      exhausted = true;
      break;
    }
  }
  return { append: ranked.map((r) => r.video.id), ranked, cursor, exhausted };
}
