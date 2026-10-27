/**
 * Layers the user's imports over any DataSource, so imported clips take part
 * in search, For You, similar-item paths, and the "Imported" path without the
 * underlying source (mock or live) knowing they exist.
 */
import {
  DataError,
  type DataSource,
  type Filters,
  type PageRequest,
  type ScoredVideo,
  type SearchQuery,
  type SearchResults,
  type SimilarSeed,
  type VideoSummary,
} from '../data/types';
import { checkQuery } from '../data/safety';
import { matchesFilters, normalizeFilters } from '../engine/filters';
import { cosine, facetSimilarity, maskedSimilarity } from '../lib/vec';
import { hashString } from '../lib/prng';
import { normalizeText, tokenize } from '../lib/text';
import { importDetail, importSummary, isImportId } from './model';
import { activeImports, importById } from './registry';
import type { ImportItem } from './types';

const LOCAL = 'L:';
const BASE = 'B:';
const noPerformer = () => undefined;

function results(items: ScoredVideo[], extra: Partial<SearchResults> = {}): SearchResults {
  return { items, total: items.length, tookMs: 0, performers: [], studios: [], tags: [], ...extra };
}

function pageLocal(cands: ScoredVideo[], page: PageRequest | undefined): SearchResults {
  const exclude = new Set(page?.excludeIds ?? []);
  const list = exclude.size ? cands.filter((c) => !exclude.has(c.video.id)) : cands;
  const offset = page?.cursor?.startsWith(LOCAL) ? Number(page.cursor.slice(LOCAL.length)) || 0 : 0;
  const limit = page?.limit ?? 30;
  const slice = list.slice(offset, offset + limit);
  return results(slice, { total: list.length, nextCursor: offset + limit < list.length ? `${LOCAL}${offset + limit}` : undefined });
}

/**
 * Slot `extra` into `base` by score without reordering `base`: the source's own
 * order (series episodes, an explicit sort) always survives.
 */
export function mergeByScore(base: ScoredVideo[], extra: ScoredVideo[]): ScoredVideo[] {
  if (!extra.length) return base;
  const out = base.slice();
  for (const x of [...extra].sort((a, b) => b.score - a.score)) {
    const at = out.findIndex((b) => b.score < x.score && !extra.includes(b));
    if (at < 0) out.push(x);
    else out.splice(at, 0, x);
  }
  return out;
}

function textScore(item: ImportItem, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = ` ${normalizeText([item.title, ...item.tags, item.host, item.notes].join(' '))} `;
  const hits = tokens.filter((t) => hay.includes(` ${t}`)).length;
  return hits / tokens.length;
}

export class WithImports implements DataSource {
  readonly name: string;
  constructor(readonly base: DataSource) {
    this.name = `${base.name}+imports`;
  }

  private local(filters?: Partial<Filters>): VideoSummary[] {
    const f = normalizeFilters(filters);
    if (f.source === 'catalog') return [];
    return activeImports()
      .map(importSummary)
      .filter((v) => matchesFilters(v, f, noPerformer));
  }

  taxonomy() {
    return this.base.taxonomy();
  }

  async search(query: SearchQuery, filters?: Partial<Filters>, page?: PageRequest): Promise<SearchResults> {
    const f = normalizeFilters(filters);
    if (query.text && !checkQuery(query.text).ok) return this.base.search(query, filters, page); // the source owns the refusal message
    if (query.imports) {
      const want = query.imports.batchIds?.length ? new Set(query.imports.batchIds) : null;
      const items = activeImports().filter((i) => !want || want.has(i.batchId));
      const order = new Map(items.map((i, n) => [i.id, n]));
      const tokens = query.text ? tokenize(query.text) : [];
      const list = this.local({ ...f, source: 'all' })
        .filter((v) => order.has(v.id))
        .map((v) => ({ v, t: tokens.length ? textScore(importById(v.id)!, tokens) : 1 }))
        .filter((x) => x.t > 0)
        .map(({ v, t }): ScoredVideo => ({ video: v, score: 0.5 + 0.5 * t - (order.get(v.id)! / Math.max(1, items.length)) * 0.2, reasons: [{ label: 'You imported this', weight: 0.5 }] }));
      return pageLocal(list, page);
    }
    const local = this.localMatches(query, f);
    if (f.source === 'imports') return pageLocal(local, page);
    const basePage = page?.cursor?.startsWith(BASE) ? { ...page, cursor: page.cursor.slice(BASE.length) } : page;
    const remote = await this.base.search(query, filters, basePage);
    const first = !page?.cursor;
    const exclude = new Set(page?.excludeIds ?? []);
    const extra = first ? local.filter((x) => !exclude.has(x.video.id)).slice(0, 12) : [];
    // Relevance slots imports in by score; an explicit sort keeps the source's order and appends.
    const mixed = !query.sort || query.sort === 'relevance' ? mergeByScore(remote.items, extra) : [...remote.items, ...extra];
    return { ...remote, items: mixed, total: remote.total + (first ? local.length : 0), nextCursor: remote.nextCursor ? `${BASE}${remote.nextCursor}` : undefined };
  }

  /** Imports that answer a catalogue-style query: words in title/tags/site, or shared taxonomy tags. */
  private localMatches(query: SearchQuery, f: Filters): ScoredVideo[] {
    if (query.performerIds?.length || query.seriesId) return [];
    if (query.studioIds?.length && !query.studioIds.some((s) => s.startsWith('site:'))) return [];
    const tokens = query.text ? tokenize(query.text) : [];
    const tagIds = query.tagIds ?? [];
    const out: ScoredVideo[] = [];
    for (const v of this.local(f)) {
      const item = importById(v.id);
      if (!item) continue;
      if (query.studioIds?.length && !query.studioIds.includes(v.studioId)) continue;
      if (query.excludeTagIds?.some((t) => v.tags.includes(t))) continue;
      const t = textScore(item, tokens);
      const tagHits = tagIds.filter((x) => v.tags.includes(x)).length;
      if (!t && !tagHits && !(query.studioIds?.length)) continue;
      const score = 0.35 + 0.45 * t + (tagIds.length ? 0.4 * (tagHits / tagIds.length) : 0);
      out.push({ video: v, score, reasons: [{ label: tagHits ? 'Your import matches these tags' : 'Your import matches your words', weight: score }] });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  async getVideo(id: string) {
    if (isImportId(id)) {
      const item = importById(id);
      if (!item) throw new DataError('That import was deleted', false);
      return importDetail(item);
    }
    return this.base.getVideo(id);
  }

  async getVideos(ids: string[]) {
    const local = ids.filter(isImportId);
    const rest = ids.filter((id) => !isImportId(id));
    const remote = rest.length ? await this.base.getVideos(rest) : [];
    const byId = new Map<string, VideoSummary>(remote.map((v) => [v.id, v]));
    for (const id of local) {
      const item = importById(id);
      if (item) byId.set(id, importSummary(item));
    }
    return ids.map((id) => byId.get(id)).filter((v): v is VideoSummary => !!v);
  }

  async getSimilar(seed: SimilarSeed, page?: PageRequest): Promise<SearchResults> {
    const exclude = new Set(page?.excludeIds ?? []);
    const first = !page?.cursor;
    const cursor = page?.cursor;
    const basePage = cursor?.startsWith(BASE) ? { ...page, cursor: cursor.slice(BASE.length) } : cursor?.startsWith(LOCAL) ? { ...page, cursor: undefined } : page;
    if (seed.kind === 'video' && isImportId(seed.id)) {
      const item = importById(seed.id);
      if (!item) throw new DataError('That import was deleted', false);
      const self = importSummary(item);
      // Siblings first: same page/gallery, then same site, then other imports by look.
      const local = this.local()
        .filter((v) => v.id !== self.id && !exclude.has(v.id))
        .map((v): ScoredVideo => {
          const other = importById(v.id)!;
          const sim = (cosine(self.embedding, v.embedding) + 1) / 2;
          const bonus = other.groupKey === item.groupKey ? 0.4 : other.host === item.host ? 0.15 : 0;
          return { video: v, score: Math.min(1, sim * 0.7 + bonus), reasons: [{ label: bonus >= 0.4 ? 'From the same set' : bonus ? 'From the same site' : 'Close to it', weight: sim }] };
        })
        .sort((a, b) => b.score - a.score);
      if (!self.tags.length) return pageLocal(local, page?.cursor?.startsWith(LOCAL) ? page : { ...page, cursor: undefined });
      // Tagged imports also reach into the catalogue through their tags.
      if (!first) {
        const r = await this.base.getSimilar({ kind: 'tags', tagIds: self.tags }, basePage);
        return { ...r, nextCursor: r.nextCursor ? `${BASE}${r.nextCursor}` : undefined };
      }
      const r = await this.base.getSimilar({ kind: 'tags', tagIds: self.tags }, basePage);
      const items = [...local.slice(0, Math.max(8, Math.round((page?.limit ?? 30) * 0.6))), ...r.items.map((x) => ({ ...x, score: x.score * 0.6 }))]; // siblings first, by design
      return { ...r, items, nextCursor: r.nextCursor ? `${BASE}${r.nextCursor}` : undefined };
    }
    const r = await this.base.getSimilar(seed, basePage);
    const wrapped = { ...r, nextCursor: r.nextCursor ? `${BASE}${r.nextCursor}` : undefined };
    if (!first) return wrapped;
    const local = this.local();
    if (!local.length) return wrapped;
    let scored: ScoredVideo[];
    if (seed.kind === 'tags') {
      const want = new Set(seed.tagIds);
      scored = local
        .map((v) => ({ v, hits: v.tags.filter((t) => want.has(t)).length }))
        .filter((x) => x.hits > 0)
        .map(({ v, hits }) => ({ video: v, score: hits / Math.max(1, want.size), reasons: [{ label: 'Tag overlap', weight: hits }] }));
    } else {
      const vector = seed.kind === 'embedding' ? seed.vector : r.items[0]?.video.embedding;
      if (!vector) return wrapped;
      scored = local.map((v) => {
        const sim = seed.kind === 'embedding' && seed.mask ? maskedSimilarity(v.embedding, vector, seed.mask) : (facetSimilarity(v.embedding, vector, seed.facets) + 1) / 2;
        return { video: v, score: sim, reasons: [{ label: 'Visual similarity', weight: sim }] };
      });
    }
    // Imports join catalogue results on merit, but never crowd them out.
    const room = Math.max(2, Math.round((page?.limit ?? 30) / 6));
    const top = scored.filter((x) => !exclude.has(x.video.id)).sort((a, b) => b.score - a.score).slice(0, room);
    return { ...wrapped, items: mergeByScore(wrapped.items, top) };
  }

  async explore(page?: PageRequest & { sort?: SearchQuery['sort'] }): Promise<SearchResults> {
    const r = await this.base.explore(page);
    const local = this.local();
    if (!local.length) return r;
    const exclude = new Set(page?.excludeIds ?? []);
    // A few imports ride along on every page, rotating so all of them come round.
    const limit = page?.limit ?? 30;
    const n = Math.min(local.length, Math.max(2, Math.ceil(limit / 6)));
    const pageNo = Math.floor((Number(page?.cursor ?? 0) || 0) / limit);
    const start = (pageNo * n) % local.length;
    const day = Math.floor(Date.now() / 86400000);
    const picks: ScoredVideo[] = [];
    for (let i = 0; i < n; i++) {
      const v = local[(start + i) % local.length];
      if (exclude.has(v.id)) continue;
      const ageDays = (Date.now() - Date.parse(v.releaseDate)) / 86400000;
      const score = 0.35 + 0.25 * Math.max(0, 1 - ageDays / 30) + 0.2 * ((hashString(`${v.id}:${day}`) % 1000) / 1000);
      picks.push({ video: v, score, reasons: [{ label: 'From your imports', weight: score }] });
    }
    const sorted = !page?.sort || page.sort === 'relevance';
    return { ...r, items: sorted ? mergeByScore(r.items, picks) : [...r.items, ...picks] };
  }

  resolveUrl(url: string) {
    return this.base.resolveUrl(url);
  }
}
