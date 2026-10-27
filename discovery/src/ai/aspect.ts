/**
 * Aspect Capture interpretation: a drawn region + optional words → a focused
 * visual intent. The region tells us *which part* of the frame (via the
 * renderer's hit test → facet weights); the words tell us *what about it*.
 */
import type { FacetWeights, Taxonomy, VideoSummary, Vec } from '../data/types';
import { FACETS } from '../data/types';
import { interpretQuery, visualTarget } from './interpret';

export interface AspectInput {
  video: VideoSummary;
  /** Facet weights from the renderer hit test of the drawn region (sum ≈ 1). Empty = no drawing. */
  hit: FacetWeights;
  /** Where the region sits, for the reasoning trace. */
  regionLabel?: string;
  text: string;
  quickFacet?: keyof FacetWeights;
}

export interface AspectIntent {
  label: string;
  facets: FacetWeights;
  vector: Vec;
  tagIds: string[];
  excludeTagIds: string[];
  steps: string[];
  confidence: number;
}

const FACET_NOUN: Record<keyof FacetWeights, string> = {
  face: 'Faces',
  body: 'Bodies',
  pose: 'Poses',
  composition: 'Scenes',
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function interpretAspect(input: AspectInput, tx: Taxonomy): AspectIntent {
  const steps: string[] = [];
  const weights: Record<keyof FacetWeights, number> = { face: 0, body: 0, pose: 0, composition: 0 };
  const hitTotal = FACETS.reduce((s, f) => s + (input.hit[f] ?? 0), 0);
  if (hitTotal > 0) {
    for (const f of FACETS) weights[f] += (input.hit[f] ?? 0) / hitTotal;
    const top = FACETS.slice().sort((a, b) => weights[b] - weights[a])[0];
    steps.push(`You marked ${input.regionLabel ?? 'part of the frame'} → mostly ${top} (${pct(weights[top])})`);
  }
  if (input.quickFacet) {
    weights[input.quickFacet] += 1;
    steps.push(`Quick pick: this ${input.quickFacet}`);
  }

  const interp = input.text.trim() ? interpretQuery(input.text, tx) : null;
  if (interp) {
    const named = Object.entries(interp.facets).filter(([, v]) => (v ?? 0) > 0);
    for (const [f, v] of named) weights[f as keyof FacetWeights] += 0.8 * (v ?? 1);
    const bits: string[] = [];
    if (named.length) bits.push(`focus on ${named.map(([f]) => f).join(' + ')}`);
    if (interp.tagIds.length) bits.push(`tags ${interp.tagIds.map((t) => tx.tags.find((x) => x.id === t)?.label ?? t).join(', ')}`);
    if (interp.visualWords.length) {
      bits.push(`look: ${interp.visualWords.join(', ')}`);
      weights.composition += 0.5;
    }
    if (interp.excludeTagIds.length) bits.push(`avoiding ${interp.excludeTagIds.join(', ')}`);
    if (bits.length) steps.push(`“${input.text.trim()}” → ${bits.join('; ')}`);
    else steps.push(`“${input.text.trim()}” → kept as a soft keyword`);
  }

  let total = FACETS.reduce((s, f) => s + weights[f], 0);
  if (total === 0) {
    // Nothing drawn or said: treat as "more of this whole look".
    for (const f of FACETS) weights[f] = 0.25;
    total = 1;
    steps.push('No region or words — using the whole frame');
  }
  const facets: FacetWeights = {};
  for (const f of FACETS) if (weights[f] > 0.02) facets[f] = Math.round((weights[f] / total) * 100) / 100;

  // Start from the clip's own embedding; nudge composition dims towards any visual words.
  const vector = input.video.embedding.slice();
  const target = interp ? visualTarget(interp, tx) : undefined;
  if (target) {
    for (let i = 0; i < vector.length; i++) if (target.mask[i] > 0) vector[i] = 0.5 * vector[i] + 0.5 * target.vector[i];
  }

  const ranked = (Object.entries(facets) as [keyof FacetWeights, number][]).sort((a, b) => b[1] - a[1]);
  const lead = ranked[0]?.[0] ?? 'composition';
  const extra = interp?.visualWords.length ? ` · ${interp.visualWords.join(', ')}` : interp?.tagIds.length ? ` · ${interp.tagIds.map((t) => tx.tags.find((x) => x.id === t)?.label ?? t).join(', ')}` : '';
  const label = `${FACET_NOUN[lead]} like this${extra}`;
  steps.push(`Searching by ${ranked.map(([f, w]) => `${f} ${pct(w)}`).join(' · ')}`);

  return {
    label,
    facets,
    vector,
    tagIds: interp?.tagIds ?? [],
    excludeTagIds: interp?.excludeTagIds ?? [],
    steps,
    confidence: Math.min(1, 0.5 + (hitTotal > 0 ? 0.3 : 0) + (interp ? 0.2 * interp.confidence : 0)),
  };
}
