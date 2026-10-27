/**
 * MockDataSource — the full `DataSource` contract over the generated catalog.
 *
 * Latency, transient errors, and embed failures are configurable so loading,
 * error, and fallback states can be exercised without a network.
 */
import {
  DataError,
  type DataSource,
  type Filters,
  type PageRequest,
  type ResolvedLink,
  type ScoredVideo,
  type SearchQuery,
  type SearchResults,
  type SimilarSeed,
  type Taxonomy,
  type VideoDetail,
  type VideoSummary,
  type Reason,
  type PlaybackOption,
} from '../types';
import { generateCatalog, describe, type Catalog, DEFAULT_SEED } from './catalog';
import { checkQuery } from '../safety';
import { parseLink } from '../links';
import { filterBoost, matchesFilters, normalizeFilters } from '../../engine/filters';
import { facetSimilarity, maskedSimilarity } from '../../lib/vec';
import { fuzzyEq, normalizeText, tokenize } from '../../lib/text';
import { hashString } from '../../lib/prng';

export interface MockConfig {
  /** Base latency per call, ms. */
  latencyMs: number;
  /** Random extra latency up to this many ms. */
  jitterMs: number;
  /** Probability (0..1) that a call fails with a retryable error. */
  errorRate: number;
  /** Percentage (0..100) of videos whose embed playback fails, forcing the source fallback. */
  embedFailPct: number;
}

export const DEFAULT_MOCK_CONFIG: MockConfig = { latencyMs: 90, jitterMs: 120, errorRate: 0, embedFailPct: 12 };

const DEFAULT_LIMIT = 30;

interface Candidate {
  video: VideoSummary;
  score: number;
  reasons: Reason[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function popularity(v: VideoSummary): number {
  return Math.log10(v.views + 10) / 7.7 * (0.6 + 0.4 * v.rating);
}

export class MockDataSource implements DataSource {
  readonly name = 'mock';
  readonly catalog: Catalog;
  private config: MockConfig;
  private linkOverrides = new Map<string, string>();
  private idf: Map<string, number>;

  constructor(seed = DEFAULT_SEED, config: Partial<MockConfig> = {}) {
    this.catalog = generateCatalog(seed);
    this.config = { ...DEFAULT_MOCK_CONFIG, ...config };
    const df = new Map<string, number>();
    for (const v of this.catalog.videos) for (const t of v.tags) df.set(t, (df.get(t) ?? 0) + 1);
    const n = this.catalog.videos.length;
    this.idf = new Map([...df].map(([t, c]) => [t, Math.log(1 + n / c)]));
  }

  configure(config: Partial<MockConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): MockConfig {
    return { ...this.config };
  }

  /** Synchronous access for tests and same-process helpers. Not part of the contract. */
  peek(id: string): VideoSummary | undefined {
    return this.catalog.videoById.get(id);
  }

  private async simulate(label: string) {
    const { latencyMs, jitterMs, errorRate } = this.config;
    const ms = latencyMs + Math.random() * jitterMs;
    if (ms > 0) await sleep(ms);
    if (errorRate > 0 && Math.random() < errorRate) throw new DataError(`Simulated network error during ${label}`);
  }

  private withOverride(v: VideoSummary): VideoSummary {
    const url = this.linkOverrides.get(v.id);
    return url ? { ...v, originalUrl: url } : v;
  }

  private page(cands: Candidate[], page: PageRequest | undefined, started: number, extra: Partial<SearchResults> = {}): SearchResults {
    const exclude = new Set(page?.excludeIds ?? []);
    const filtered = exclude.size ? cands.filter((c) => !exclude.has(c.video.id)) : cands;
    const offset = Number(page?.cursor ?? 0) || 0;
    const limit = page?.limit ?? DEFAULT_LIMIT;
    const slice = filtered.slice(offset, offset + limit);
    const next = offset + limit < filtered.length ? String(offset + limit) : undefined;
    return {
      items: slice.map((c): ScoredVideo => ({ video: this.withOverride(c.video), score: c.score, reasons: c.reasons })),
      total: filtered.length,
      nextCursor: next,
      tookMs: Math.round(performance.now() - started),
      performers: [],
      studios: [],
      tags: [],
      ...extra,
    };
  }

  private applyFilters(videos: VideoSummary[], filters?: Partial<Filters>): { list: VideoSummary[]; f: ReturnType<typeof normalizeFilters> } {
    const f = normalizeFilters(filters);
    const lookup = (id: string) => this.catalog.performerById.get(id);
    return { list: videos.filter((v) => matchesFilters(v, f, lookup)), f };
  }

  async taxonomy(): Promise<Taxonomy> {
    await this.simulate('taxonomy');
    const { tags, performers, studios, series } = this.catalog;
    return { tags, performers, studios, series };
  }

  async search(query: SearchQuery, filters?: Partial<Filters>, page?: PageRequest): Promise<SearchResults> {
    const started = performance.now();
    await this.simulate('search');
    const empty = { performers: [], studios: [], tags: [] };
    if (query.text) {
      const verdict = checkQuery(query.text);
      if (!verdict.ok) return { items: [], total: 0, tookMs: 0, ...empty, notice: { kind: 'safety', message: verdict.message } };
    }

    const { list, f } = this.applyFilters(this.catalog.videos, filters);
    const tokens = query.text ? tokenize(query.text) : [];
    const natural = query.mode === 'natural';
    const structured = !!(query.tagIds?.length || query.performerIds?.length || query.studioIds?.length || query.visual || query.seriesId);
    const textEntities = tokens.length ? this.matchEntities(tokens) : { ...empty };
    const cands: Candidate[] = [];

    for (const v of list) {
      if (query.seriesId && v.seriesId !== query.seriesId) continue;
      if (query.performerIds?.length && !v.performerIds.some((id) => query.performerIds!.includes(id))) continue;
      if (query.studioIds?.length && !query.studioIds.includes(v.studioId)) continue;
      if (query.excludeTagIds?.some((t) => v.tags.includes(t))) continue;

      let score = 0;
      const reasons: Reason[] = [];

      if (tokens.length) {
        const { score: ks, matched, reasons: kr } = this.keywordScore(v, tokens);
        // Keyword mode is AND over tokens; natural mode treats leftover words as soft.
        if (!natural && matched < tokens.length) continue;
        if (natural && matched === 0 && !structured) continue;
        score += ks;
        reasons.push(...kr);
      }

      if (query.performerIds?.length) {
        const n = v.performerIds.filter((id) => query.performerIds!.includes(id)).length;
        score += 0.8 * n;
        reasons.push({ label: 'Performer match', weight: 0.8 * n });
      }
      if (query.studioIds?.length) {
        score += 0.6;
        reasons.push({ label: 'Studio match', weight: 0.6 });
      }
      if (query.tagIds?.length) {
        const hits = query.tagIds.filter((t) => v.tags.includes(t));
        if (!hits.length && !query.visual) continue;
        const w = hits.length / query.tagIds.length;
        score += 1.1 * w;
        if (hits.length) reasons.push({ label: `Tags: ${hits.map((t) => this.catalog.tagById.get(t)?.label).join(', ')}`, weight: 1.1 * w });
      }
      if (query.visual) {
        const sim = maskedSimilarity(v.embedding, query.visual.vector, query.visual.mask);
        score += 1.4 * sim;
        reasons.push({ label: `Looks like “${query.visual.label}”`, weight: 1.4 * sim });
      }
      if (query.seriesId) score += 1 - (v.episode ?? 0) / 100;

      const boost = filterBoost(v, f);
      if (boost) {
        score += boost;
        reasons.push({ label: 'Filter weights', weight: boost });
      }
      score += 0.15 * popularity(v);
      cands.push({ video: v, score, reasons });
    }

    this.sortCandidates(cands, query.seriesId ? 'series' : query.sort ?? 'relevance');
    return this.page(cands, page, started, textEntities);
  }

  private sortCandidates(cands: Candidate[], sort: SearchQuery['sort'] | 'series') {
    switch (sort) {
      case 'series':
        cands.sort((a, b) => (a.video.episode ?? 0) - (b.video.episode ?? 0));
        break;
      case 'popular':
        cands.sort((a, b) => b.video.views - a.video.views);
        break;
      case 'newest':
        cands.sort((a, b) => b.video.releaseDate.localeCompare(a.video.releaseDate));
        break;
      case 'rating':
        cands.sort((a, b) => b.video.rating - a.video.rating);
        break;
      default:
        cands.sort((a, b) => b.score - a.score);
    }
  }

  private keywordScore(v: VideoSummary, tokens: string[]): { score: number; matched: number; reasons: Reason[] } {
    const title = tokenize(v.title);
    const performers = v.performerIds.map((id) => this.catalog.performerById.get(id)).filter(Boolean);
    const studio = this.catalog.studioById.get(v.studioId);
    const studioTokens = studio ? tokenize(studio.name) : [];
    const series = v.seriesId ? this.catalog.seriesById.get(v.seriesId) : undefined;
    const seriesTokens = series ? tokenize(series.title) : [];
    const tagTokens = v.tags.flatMap((t) => {
      const tag = this.catalog.tagById.get(t);
      return tag ? [...tokenize(tag.label), ...tag.synonyms.flatMap(tokenize), t] : [t];
    });
    let score = 0;
    let matched = 0;
    const reasons: Reason[] = [];
    for (const tok of tokens) {
      let best = 0;
      let label = '';
      for (const p of performers) {
        const names = [...tokenize(p!.name), ...p!.aliases.flatMap(tokenize)];
        if (names.some((n) => n === tok || fuzzyEq(n, tok))) {
          best = Math.max(best, 1.2);
          label = p!.name;
        }
      }
      if (best < 1 && studioTokens.some((s) => s === tok || fuzzyEq(s, tok))) {
        best = 0.9;
        label = studio!.name;
      }
      if (best < 0.9 && seriesTokens.includes(tok)) {
        best = 0.9;
        label = series!.title;
      }
      if (best < 0.8 && tagTokens.some((t) => t === tok || fuzzyEq(t, tok))) {
        best = 0.8;
        label = 'tag';
      }
      if (best < 1) {
        if (title.includes(tok)) best = Math.max(best, 1);
        else if (tok.length >= 3 && title.some((w) => w.startsWith(tok))) best = Math.max(best, 0.6);
        else if (title.some((w) => fuzzyEq(w, tok))) best = Math.max(best, 0.5);
        if (best >= 0.5 && !label) label = 'title';
      }
      if (best > 0) {
        matched++;
        score += best;
        reasons.push({ label: label === 'title' ? `Title has “${tok}”` : label === 'tag' ? `Tagged “${tok}”` : `Matches ${label}`, weight: best });
      }
    }
    return { score, matched, reasons };
  }

  private matchEntities(tokens: string[]) {
    const text = normalizeText(tokens.join(' '));
    const hit = (name: string) => {
      const nt = tokenize(name);
      return nt.some((n) => tokens.some((t) => t === n || (t.length >= 3 && n.startsWith(t)) || fuzzyEq(t, n))) || normalizeText(name).includes(text);
    };
    return {
      performers: this.catalog.performers.filter((p) => hit(p.name) || p.aliases.some(hit)).slice(0, 12),
      studios: this.catalog.studios.filter((s) => hit(s.name)).slice(0, 8),
      tags: this.catalog.tags.filter((t) => hit(t.label) || t.synonyms.some((s) => normalizeText(s) === text)).slice(0, 12),
    };
  }

  async getVideo(id: string): Promise<VideoDetail> {
    await this.simulate('getVideo');
    const base = this.catalog.videoById.get(id);
    if (!base) throw new DataError(`Video ${id} not found`, false);
    const v = this.withOverride(base);
    const broken = this.catalog.broken.has(id);
    const embedFails = broken || hashString(`embed:${id}`) % 100 < this.config.embedFailPct;
    const playback: PlaybackOption[] = [
      { kind: 'embed', url: `mock-embed://${id}${embedFails ? '?fail=1' : ''}` },
      { kind: 'source', url: `mock-source://${id}${broken ? '?fail=1' : ''}`, mime: 'application/x-procedural' },
      { kind: 'original', url: v.originalUrl },
    ];
    const series = v.seriesId ? this.catalog.seriesById.get(v.seriesId) : undefined;
    return {
      ...v,
      description: describe(v, this.catalog),
      performers: v.performerIds.map((pid) => this.catalog.performerById.get(pid)!).filter(Boolean),
      studio: this.catalog.studioById.get(v.studioId)!,
      series,
      playback,
    };
  }

  async getVideos(ids: string[]): Promise<VideoSummary[]> {
    await this.simulate('getVideos');
    return ids.map((id) => this.catalog.videoById.get(id)).filter((v): v is VideoSummary => !!v).map((v) => this.withOverride(v));
  }

  async getSimilar(seed: SimilarSeed, page?: PageRequest): Promise<SearchResults> {
    const started = performance.now();
    await this.simulate('getSimilar');
    const cands: Candidate[] = [];
    if (seed.kind === 'tags') {
      const want = new Set(seed.tagIds);
      const wantW = [...want].reduce((s, t) => s + (this.idf.get(t) ?? 1), 0);
      for (const v of this.catalog.videos) {
        let inter = 0;
        let union = wantW;
        for (const t of v.tags) {
          const w = this.idf.get(t) ?? 1;
          if (want.has(t)) inter += w;
          else union += w * 0.35;
        }
        if (inter === 0) continue;
        const score = inter / union;
        cands.push({ video: v, score, reasons: [{ label: 'Tag overlap', weight: score }] });
      }
    } else {
      let vector: number[];
      let selfId: string | undefined;
      if (seed.kind === 'video') {
        const v = this.catalog.videoById.get(seed.id);
        if (!v) throw new DataError(`Video ${seed.id} not found`, false);
        vector = v.embedding;
        selfId = v.id;
      } else {
        vector = seed.vector;
      }
      const mask = seed.kind === 'embedding' ? seed.mask : undefined;
      for (const v of this.catalog.videos) {
        if (v.id === selfId) continue;
        const sim = mask ? maskedSimilarity(v.embedding, vector, mask) : (facetSimilarity(v.embedding, vector, seed.facets) + 1) / 2;
        cands.push({ video: v, score: sim, reasons: [{ label: 'Visual similarity', weight: sim }] });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    return this.page(cands, page, started);
  }

  async explore(page?: PageRequest & { sort?: SearchQuery['sort'] }): Promise<SearchResults> {
    const started = performance.now();
    await this.simulate('explore');
    const day = Math.floor(Date.now() / 86400000);
    const cands: Candidate[] = this.catalog.videos.map((v) => {
      const ageDays = (Date.now() - Date.parse(v.releaseDate)) / 86400000;
      const fresh = Math.max(0, 1 - ageDays / 1500);
      const jitter = (hashString(`${v.id}:${day}`) % 1000) / 1000;
      const score = 0.55 * popularity(v) + 0.2 * fresh + 0.25 * jitter;
      return { video: v, score, reasons: [{ label: 'Trending mix', weight: score }] };
    });
    this.sortCandidates(cands, page?.sort ?? 'relevance');
    return this.page(cands, page, started);
  }

  async resolveUrl(url: string): Promise<ResolvedLink | null> {
    await this.simulate('resolveUrl');
    const parsed = parseLink(url);
    if (!parsed) return null;
    if (parsed.id) {
      const direct = this.catalog.videoById.get(parsed.id);
      if (direct) return { video: this.withOverride(direct), matchedBy: parsed.matchedBy };
    }
    // Unknown link: map it deterministically onto a stand-in so the flow can be exercised offline.
    const videos = this.catalog.videos;
    const v = videos[hashString(parsed.id ?? parsed.url) % videos.length];
    this.linkOverrides.set(v.id, parsed.url);
    return { video: this.withOverride(v), matchedBy: parsed.matchedBy, standIn: true };
  }
}
