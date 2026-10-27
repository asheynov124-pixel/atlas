/** k-means (k-means++ init, cosine distance) over embeddings. Deterministic given a seed. */
import type { Vec } from '../data/types';
import { cosine, normalize } from '../lib/vec';
import { mulberry32 } from '../lib/prng';

export interface Cluster {
  centroid: Vec;
  /** Indices into the input array. */
  members: number[];
  /** Mean cosine of members to centroid; higher = tighter. */
  cohesion: number;
}

export function suggestK(n: number): number {
  if (n < 6) return 1;
  return Math.max(2, Math.min(5, Math.round(Math.sqrt(n / 3))));
}

export function kmeans(vectors: Vec[], k = suggestK(vectors.length), weights?: number[], seed = 7, iterations = 25): Cluster[] {
  const n = vectors.length;
  if (!n) return [];
  k = Math.max(1, Math.min(k, n));
  const pts = vectors.map(normalize);
  const w = weights ?? new Array(n).fill(1);
  const rng = mulberry32(seed);

  // k-means++ seeding.
  const centroids: Vec[] = [pts[Math.floor(rng() * n)].slice()];
  while (centroids.length < k) {
    const d = pts.map((p) => Math.min(...centroids.map((c) => 1 - cosine(p, c))) ** 2);
    const total = d.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let r = rng() * total;
    let idx = 0;
    for (; idx < n - 1; idx++) {
      r -= d[idx];
      if (r <= 0) break;
    }
    centroids.push(pts[idx].slice());
  }

  let assign = new Array(n).fill(0);
  for (let it = 0; it < iterations; it++) {
    const next = pts.map((p) => {
      let best = 0;
      let bestSim = -Infinity;
      centroids.forEach((c, ci) => {
        const s = cosine(p, c);
        if (s > bestSim) {
          bestSim = s;
          best = ci;
        }
      });
      return best;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    centroids.forEach((_, ci) => {
      const sum = new Array(pts[0].length).fill(0);
      let mass = 0;
      pts.forEach((p, i) => {
        if (assign[i] !== ci) return;
        for (let d = 0; d < sum.length; d++) sum[d] += p[d] * w[i];
        mass += w[i];
      });
      if (mass > 0) centroids[ci] = normalize(sum.map((x) => x / mass));
    });
    if (!changed && it > 0) break;
  }

  return centroids
    .map((centroid, ci) => {
      const members = assign.map((a, i) => (a === ci ? i : -1)).filter((i) => i >= 0);
      const cohesion = members.length ? members.reduce((s, i) => s + cosine(pts[i], centroid), 0) / members.length : 0;
      return { centroid, members, cohesion };
    })
    .filter((c) => c.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length);
}
