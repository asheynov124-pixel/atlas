/**
 * Ranking: source relevance × taste profile × filters, with a diversity pass.
 * Every score keeps its reasons so the UI can answer "why am I seeing this?".
 */
import type { Filters, Reason, ScoredVideo, VideoSummary } from '../data/types';
import { facetSimilarity } from '../lib/vec';
import { filterBoost, matchesFilters, type PerformerLookup } from './filters';
import type { TasteModel } from './learning';
import type { Blocks } from './types';

export function emptyBlocks(): Blocks {
  return { videos: [], performers: [], studios: [], tags: [] };
}

export function isBlocked(v: VideoSummary, b: Blocks): boolean {
  return (
    b.videos.includes(v.id) ||
    v.performerIds.some((p) => b.performers.includes(p)) ||
    b.studios.includes(v.studioId) ||
    v.tags.some((t) => b.tags.includes(t))
  );
}

export interface Names {
  tag: (id: string) => string;
  performer: (id: string) => string;
  studio: (id: string) => string;
}

export function profileScore(v: VideoSummary, m: TasteModel, names?: Names): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let score = 0;

  const norm = 1 / Math.sqrt(Math.max(1, v.tags.length));
  let bestTag: [string, number] | null = null;
  for (const t of v.tags) {
    const w = (m.tagW[t] ?? 0) * norm * 0.9;
    score += w;
    if (!bestTag || Math.abs(w) > Math.abs(bestTag[1])) bestTag = [t, w];
  }
  if (bestTag && Math.abs(bestTag[1]) > 0.05) {
    const label = names?.tag(bestTag[0]) ?? bestTag[0];
    reasons.push({ label: bestTag[1] > 0 ? `You like ${label}` : `You tend to skip ${label}`, weight: bestTag[1] });
  }

  let perf = 0;
  let perfId = '';
  for (const pid of v.performerIds) {
    const w = m.performerW[pid] ?? 0;
    if (Math.abs(w) > Math.abs(perf)) {
      perf = w;
      perfId = pid;
    }
  }
  if (perf) {
    score += perf * 0.7;
    const name = names?.performer(perfId) ?? perfId;
    reasons.push({ label: perf > 0 ? `${name} is a favourite` : `Less of ${name}`, weight: perf * 0.7 });
  }

  const sw = m.studioW[v.studioId] ?? 0;
  if (sw) {
    score += sw * 0.35;
    reasons.push({ label: sw > 0 ? `From ${names?.studio(v.studioId) ?? 'a studio'} you like` : `Studio you skip`, weight: sw * 0.35 });
  }

  if (m.likeCentroid) {
    const sim = facetSimilarity(v.embedding, m.likeCentroid);
    const conf = Math.min(1, m.likeMass / 4);
    const w = 1.1 * sim * conf;
    score += w;
    if (sim > 0.35) reasons.push({ label: `Looks like clips you liked (${Math.round(sim * 100)}%)`, weight: w });
  }
  if (m.dislikeCentroid) {
    const sim = facetSimilarity(v.embedding, m.dislikeCentroid);
    const conf = Math.min(1, m.dislikeMass / 4);
    const w = -0.9 * Math.max(0, sim) * conf;
    score += w;
    if (sim > 0.5) reasons.push({ label: `Resembles clips you passed on`, weight: w });
  }
  return { score, reasons };
}

export interface RankOptions {
  model: TasteModel;
  filters: Filters;
  blocks: Blocks;
  performer: PerformerLookup;
  names?: Names;
  /** Weight of source/path relevance vs. taste. */
  pathWeight: number;
  profileWeight: number;
  /** Ids already queued on this path — never repeated. */
  exclude: Set<string>;
  /** Recently seen elsewhere — mild penalty. */
  recent?: Set<string>;
  /** Exclude explicitly disliked videos. */
  dropDisliked?: boolean;
  /** Invert taste similarity (for Contrast paths). */
  contrast?: boolean;
  /** Extra relevance supplied by the path generator. */
  extra?: (v: VideoSummary) => { score: number; reasons: Reason[] };
  /** Randomness, 0..1. Usually filters.exploration. */
  exploration?: number;
  /** Keep source order (series, collections). */
  preserveOrder?: boolean;
  rng?: () => number;
}

export interface Ranked {
  video: VideoSummary;
  score: number;
  reasons: Reason[];
}

export function rank(cands: ScoredVideo[], o: RankOptions): Ranked[] {
  const rng = o.rng ?? Math.random;
  const scores = cands.map((c) => c.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = hi - lo || 1;
  const out: Ranked[] = [];
  const seen = new Set<string>();

  for (const c of cands) {
    const v = c.video;
    if (seen.has(v.id) || o.exclude.has(v.id)) continue;
    seen.add(v.id);
    if (isBlocked(v, o.blocks)) continue;
    if (o.dropDisliked && o.model.disliked.has(v.id)) continue;
    if (!matchesFilters(v, o.filters, o.performer)) continue;

    const rel = (c.score - lo) / span;
    const reasons: Reason[] = [];
    let score = o.pathWeight * rel;
    if (c.reasons[0] && o.pathWeight > 0) reasons.push({ label: c.reasons[0].label, weight: o.pathWeight * rel });

    const prof = profileScore(v, o.model, o.names);
    const explore = o.exploration ?? 0.25;
    if (o.contrast) {
      // Contrast: reward distance from your taste, but never what you've rejected.
      const sim = o.model.likeCentroid ? facetSimilarity(v.embedding, o.model.likeCentroid) : 0;
      score += o.profileWeight * (1 - sim);
      reasons.push({ label: 'Outside your usual taste', weight: o.profileWeight * (1 - sim) });
      const negatives = prof.reasons.filter((r) => r.weight < 0);
      for (const r of negatives) score += r.weight;
    } else {
      score += o.profileWeight * (1 - explore * 0.5) * prof.score;
      reasons.push(...prof.reasons.map((r) => ({ ...r, weight: r.weight * o.profileWeight })));
    }

    const boost = filterBoost(v, o.filters);
    if (boost) {
      score += boost;
      reasons.push({ label: 'Boosted by your filter weights', weight: boost });
    }
    if (o.extra) {
      const e = o.extra(v);
      score += e.score;
      reasons.push(...e.reasons);
    }
    if (o.recent?.has(v.id)) {
      score -= 0.45;
      reasons.push({ label: 'Seen recently', weight: -0.45 });
    }
    score += (rng() - 0.5) * explore * 0.8;
    out.push({ video: v, score, reasons: reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)) });
  }

  if (o.preserveOrder) return out;
  out.sort((a, b) => b.score - a.score);
  return diversify(out, 0.75);
}

/**
 * Maximal-marginal-relevance reorder: avoid runs of near-identical clips.
 * λ=1 is pure score order.
 */
export function diversify(items: Ranked[], lambda: number, window = 3): Ranked[] {
  if (items.length < 3) return items;
  const pool = items.slice();
  const out: Ranked[] = [];
  const hi = pool[0].score;
  const lo = pool[pool.length - 1].score;
  const span = hi - lo || 1;
  while (pool.length) {
    let best = 0;
    let bestVal = -Infinity;
    const recent = out.slice(-window);
    const lookahead = Math.min(pool.length, 12);
    for (let i = 0; i < lookahead; i++) {
      const rel = (pool[i].score - lo) / span;
      let maxSim = 0;
      for (const r of recent) {
        const s = facetSimilarity(pool[i].video.embedding, r.video.embedding);
        if (s > maxSim) maxSim = s;
      }
      const val = lambda * rel - (1 - lambda) * maxSim;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    out.push(pool.splice(best, 1)[0]);
  }
  return out;
}

/** Top reasons for display, formatted. */
export function explain(reasons: Reason[], n = 4): Reason[] {
  const seen = new Set<string>();
  return reasons
    .filter((r) => Math.abs(r.weight) > 0.04 && !seen.has(r.label) && seen.add(r.label))
    .slice(0, n);
}
