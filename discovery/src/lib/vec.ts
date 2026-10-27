/** Vector maths for embeddings. Plain arrays; dims are small (32). */
import { FACET_DIM, FACETS, type Facet, type FacetWeights, type Vec } from '../data/types';

export function zeros(n: number): Vec {
  return new Array(n).fill(0);
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec): Vec {
  const n = norm(a);
  return n === 0 ? a.slice() : a.map((x) => x / n);
}

export function add(a: Vec, b: Vec, scale = 1): Vec {
  return a.map((x, i) => x + (b[i] ?? 0) * scale);
}

export function scale(a: Vec, k: number): Vec {
  return a.map((x) => x * k);
}

export function cosine(a: Vec, b: Vec): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function mean(vectors: Vec[]): Vec {
  if (!vectors.length) return [];
  const out = zeros(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
  return out.map((x) => x / vectors.length);
}

export function facetSlice(v: Vec, facet: Facet): Vec {
  const i = FACETS.indexOf(facet);
  return v.slice(i * FACET_DIM, (i + 1) * FACET_DIM);
}

/**
 * Facet-weighted similarity in [-1, 1]. Each facet is compared by cosine and
 * the results are averaged by weight. No weights means all facets equally.
 */
export function facetSimilarity(a: Vec, b: Vec, weights?: FacetWeights): number {
  let total = 0;
  let wsum = 0;
  for (const f of FACETS) {
    const w = weights ? weights[f] ?? 0 : 1;
    if (w <= 0) continue;
    total += w * cosine(facetSlice(a, f), facetSlice(b, f));
    wsum += w;
  }
  return wsum === 0 ? 0 : total / wsum;
}

/**
 * Similarity to a partial target: only dims where mask > 0 count, compared by
 * mean squared distance and mapped to (0, 1]. Used for NL visual intents
 * ("warm lighting", "close-up") that pin a few semantic dims.
 */
export function maskedSimilarity(v: Vec, target: Vec, mask: Vec): number {
  let d = 0;
  let wsum = 0;
  for (let i = 0; i < mask.length; i++) {
    const w = mask[i];
    if (w <= 0) continue;
    const diff = (v[i] ?? 0) - (target[i] ?? 0);
    d += w * diff * diff;
    wsum += w;
  }
  if (wsum === 0) return 0;
  return 1 / (1 + 2.5 * (d / wsum));
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
