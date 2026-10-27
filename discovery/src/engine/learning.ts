/**
 * Taste model = a pure fold over the profile's signal log (+ manual overrides).
 *
 * Because the model is recomputed from signals, every user control is exact:
 * deleting a signal, resetting, or pausing learning has no hidden residue.
 */
import type { VideoSummary, Vec } from '../data/types';
import { clamp, zeros } from '../lib/vec';
import { EMBEDDING_DIM } from '../data/types';
import type { Overrides, Signal, SignalKind } from './types';

export const SIGNAL_VALUE: Record<SignalKind, number> = {
  like: 1,
  dislike: -1,
  save: 1.4,
  capture: 0.9,
  more: 0.9,
  less: -0.9,
  watch: 0.35,
  rewatch: 0.5,
  skip: -0.3,
};

/** Days until a signal counts half. */
export const HALF_LIFE_DAYS = 45;
const WEIGHT_LIMIT = 3;

/** Generic tags carry less information; learn them slower. */
const DAMPENED = new Set(['solo', 'couple', 'threesome', 'group', 'hd', '4k', 'vertical', 'professional', 'amateur']);

export interface EmbeddingEntry {
  videoId: string;
  weight: number;
  at: number;
}

export interface TasteModel {
  tagW: Record<string, number>;
  performerW: Record<string, number>;
  studioW: Record<string, number>;
  /** Learned values before overrides, for "reset to learned" in the editor. */
  learned: { tagW: Record<string, number>; performerW: Record<string, number>; studioW: Record<string, number> };
  likeCentroid: Vec | null;
  likeMass: number;
  dislikeCentroid: Vec | null;
  dislikeMass: number;
  /** Positively-weighted videos: the embedding store used for clustering and "For You". */
  positives: EmbeddingEntry[];
  /** Explicit dislikes (excluded from most feeds). */
  disliked: Set<string>;
  counts: Record<SignalKind, number> & { total: number; positive: number };
}

export function emptyOverrides(): Overrides {
  return { tags: {}, performers: {}, studios: {} };
}

export function decay(at: number, now: number): number {
  const days = Math.max(0, (now - at) / 86400000);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * Implicit signal from a finished view. Explicit judgements on the same view
 * take precedence: we don't also log a "skip" for a clip you just disliked.
 */
export function implicitSignal(
  watchedSec: number,
  clipSec: number,
  loops: number,
  hadExplicit: boolean,
): { kind: SignalKind; value: number; fraction: number } | null {
  const fraction = clipSec > 0 ? Math.min(1, watchedSec / clipSec) : 0;
  if (loops >= 1) return { kind: 'rewatch', value: SIGNAL_VALUE.rewatch * Math.min(3, loops), fraction };
  if (hadExplicit) return null;
  if (fraction >= 0.8) return { kind: 'watch', value: SIGNAL_VALUE.watch, fraction };
  if (watchedSec < 2 && fraction < 0.15) return { kind: 'skip', value: SIGNAL_VALUE.skip, fraction };
  if (fraction < 0.35) return { kind: 'skip', value: SIGNAL_VALUE.skip * 0.5, fraction };
  return null;
}

export type SummaryLookup = (id: string) => VideoSummary | undefined;

export function foldSignals(signals: Signal[], lookup: SummaryLookup, overrides: Overrides = emptyOverrides(), now = Date.now()): TasteModel {
  const tagW: Record<string, number> = {};
  const performerW: Record<string, number> = {};
  const studioW: Record<string, number> = {};
  const likeSum = zeros(EMBEDDING_DIM);
  const dislikeSum = zeros(EMBEDDING_DIM);
  let likeMass = 0;
  let dislikeMass = 0;
  const positives = new Map<string, EmbeddingEntry>();
  const disliked = new Set<string>();
  const counts = { like: 0, dislike: 0, save: 0, capture: 0, more: 0, less: 0, watch: 0, rewatch: 0, skip: 0, total: 0, positive: 0 };

  for (const s of signals) {
    counts[s.kind]++;
    counts.total++;
    if (s.kind === 'dislike') disliked.add(s.videoId);
    if (s.kind === 'like') disliked.delete(s.videoId);
    const v = lookup(s.videoId);
    if (!v) continue;
    const w = s.value * decay(s.at, now);
    if (w > 0) counts.positive++;

    const tagLr = 0.35 / Math.sqrt(Math.max(1, v.tags.length));
    for (const t of v.tags) {
      const lr = DAMPENED.has(t) ? tagLr * 0.4 : tagLr;
      tagW[t] = clamp((tagW[t] ?? 0) + lr * w, -WEIGHT_LIMIT, WEIGHT_LIMIT);
    }
    v.performerIds.forEach((pid, i) => {
      const lr = i === 0 ? 0.55 : 0.3;
      performerW[pid] = clamp((performerW[pid] ?? 0) + lr * w, -WEIGHT_LIMIT, WEIGHT_LIMIT);
    });
    studioW[v.studioId] = clamp((studioW[v.studioId] ?? 0) + 0.25 * w, -WEIGHT_LIMIT, WEIGHT_LIMIT);

    if (w > 0) {
      for (let i = 0; i < EMBEDDING_DIM; i++) likeSum[i] += v.embedding[i] * w;
      likeMass += w;
      if (w >= 0.3) {
        const prev = positives.get(v.id);
        positives.set(v.id, { videoId: v.id, weight: (prev?.weight ?? 0) + w, at: Math.max(prev?.at ?? 0, s.at) });
      }
    } else if (w < 0) {
      for (let i = 0; i < EMBEDDING_DIM; i++) dislikeSum[i] += v.embedding[i] * -w;
      dislikeMass += -w;
      const prev = positives.get(v.id);
      if (prev) {
        prev.weight += w;
        if (prev.weight < 0.3) positives.delete(v.id);
      }
    }
  }

  const learned = { tagW: { ...tagW }, performerW: { ...performerW }, studioW: { ...studioW } };
  Object.assign(tagW, overrides.tags);
  Object.assign(performerW, overrides.performers);
  Object.assign(studioW, overrides.studios);

  return {
    tagW,
    performerW,
    studioW,
    learned,
    likeCentroid: likeMass > 0 ? likeSum.map((x) => x / likeMass) : null,
    likeMass,
    dislikeCentroid: dislikeMass > 0 ? dislikeSum.map((x) => x / dislikeMass) : null,
    dislikeMass,
    positives: [...positives.values()].sort((a, b) => b.at - a.at).slice(0, 400),
    disliked,
    counts,
  };
}

/** Top-N weighted entries, for insight screens and query suggestions. */
export function topWeights(w: Record<string, number>, n = 8, sign: 1 | -1 = 1): [string, number][] {
  return Object.entries(w)
    .filter(([, x]) => x * sign > 0.05)
    .sort((a, b) => (b[1] - a[1]) * sign)
    .slice(0, n);
}
