/**
 * Proactive AI suggestions: path ideas from liked-content clusters, board
 * ideas from saved-content clusters, and search ideas from the taste model.
 */
import { FACETS, type FacetWeights, type Taxonomy, type VideoSummary, type Vec } from '../data/types';
import { cosine, facetSlice, mean } from '../lib/vec';
import { hashString } from '../lib/prng';
import { COMP } from '../data/mock/taxonomy';
import { kmeans, suggestK } from './cluster';
import { topWeights, type TasteModel } from '../engine/learning';
import type { Board, Path, PathSeed, SaveRecord } from '../engine/types';

/** Tags too generic to name a cluster after. */
const GENERIC = new Set(['solo', 'couple', 'hd', '4k', 'vertical', 'professional', 'amateur']);

export interface ClusterInfo {
  label: string;
  tagIds: string[];
  performerId?: string;
  facets: FacetWeights;
  centroid: Vec;
  memberIds: string[];
  descriptor: string;
}

function compDescriptor(centroid: Vec): string {
  const comp = facetSlice(centroid, 'composition');
  // The centroid is normalised across 32 dims; rescale so thresholds stay meaningful.
  const k = 1 / (Math.sqrt(comp.reduce((s, x) => s + x * x, 0)) || 1);
  const c = comp.map((x) => x * k);
  const words: string[] = [];
  if (c[COMP.sat] < -0.55) words.push('Monochrome');
  else if (c[COMP.sat] > 0.5) words.push('Vivid');
  if (c[COMP.warmth] > 0.45) words.push('Warm');
  else if (c[COMP.cool] > 0.45) words.push('Cool-toned');
  if (c[COMP.bright] < -0.4) words.push('Low-light');
  else if (c[COMP.bright] > 0.45) words.push('Bright');
  if (c[COMP.grain] > 0.45) words.push('Grainy');
  if (c[COMP.close] > 0.45) words.push('Close');
  return words.slice(0, 2).join(', ');
}

export function describeCluster(members: VideoSummary[], centroid: Vec, tx: Taxonomy): ClusterInfo {
  const n = members.length;
  const freq = new Map<string, number>();
  const perf = new Map<string, number>();
  for (const v of members) {
    for (const t of v.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
    for (const p of v.performerIds) perf.set(p, (perf.get(p) ?? 0) + 1);
  }
  const tagIds = [...freq]
    .filter(([t, c]) => !GENERIC.has(t) && c / n >= 0.45)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  const topPerf = [...perf].sort((a, b) => b[1] - a[1])[0];
  const performerId = topPerf && topPerf[1] / n >= 0.5 && n >= 2 ? topPerf[0] : undefined;

  // Which facet holds the cluster together best?
  const facets: FacetWeights = {};
  let bestFacet: (typeof FACETS)[number] = 'composition';
  let bestCoh = -Infinity;
  for (const f of FACETS) {
    const c = facetSlice(centroid, f);
    const coh = members.reduce((s, v) => s + cosine(facetSlice(v.embedding, f), c), 0) / Math.max(1, n);
    facets[f] = Math.max(0.1, coh);
    if (coh > bestCoh) {
      bestCoh = coh;
      bestFacet = f;
    }
  }
  const tagLabel = (id: string) => tx.tags.find((t) => t.id === id)?.label ?? id;
  const perfName = performerId ? tx.performers.find((p) => p.id === performerId)?.name : undefined;
  const descriptor = compDescriptor(centroid);
  const tagPart = tagIds.slice(0, 2).map(tagLabel).join(' + ').toLowerCase();
  let label: string;
  if (perfName && tagPart) label = `${perfName}: ${tagPart}`;
  else if (perfName) label = `More ${perfName}${descriptor ? ` · ${descriptor.toLowerCase()}` : ''}`;
  else if (descriptor && tagPart) label = `${descriptor} ${tagPart}`;
  else if (tagPart) label = `Your ${tagPart} mix`;
  else label = `${bestFacet === 'face' ? 'Familiar faces' : bestFacet === 'body' ? 'Your type' : bestFacet === 'pose' ? 'That energy' : 'That look'}`;
  return { label: label.charAt(0).toUpperCase() + label.slice(1), tagIds, performerId, facets, centroid, memberIds: members.map((v) => v.id), descriptor };
}

export interface PathSuggestion {
  id: string;
  label: string;
  reason: string;
  seed: PathSeed;
  memberIds: string[];
}

export const MIN_SIGNALS_FOR_SUGGESTIONS = 6;

export function suggestPaths(model: TasteModel, lookup: (id: string) => VideoSummary | undefined, paths: Path[], tx: Taxonomy): PathSuggestion[] {
  const pos = model.positives.map((p) => ({ p, v: lookup(p.videoId) })).filter((x): x is { p: (typeof model.positives)[number]; v: VideoSummary } => !!x.v);
  if (pos.length < MIN_SIGNALS_FOR_SUGGESTIONS) return [];
  const clusters = kmeans(pos.map((x) => x.v.embedding), suggestK(pos.length), pos.map((x) => x.p.weight));
  const existing = paths.filter((p) => p.seed.kind === 'cluster').map((p) => (p.seed as Extract<PathSeed, { kind: 'cluster' }>).vector);
  const out: PathSuggestion[] = [];
  for (const c of clusters) {
    if (c.members.length < 3) continue;
    if (existing.some((v) => cosine(v, c.centroid) > 0.92)) continue;
    const members = c.members.map((i) => pos[i].v);
    const info = describeCluster(members, c.centroid, tx);
    const id = `ps-${hashString(members.map((m) => m.id).sort().slice(0, 6).join('|')).toString(36)}`;
    out.push({
      id,
      label: info.label,
      reason: `Based on ${members.length} clips you liked or replayed`,
      seed: { kind: 'cluster', vector: mean(members.map((m) => m.embedding)), facets: info.facets, tagIds: info.tagIds, label: info.label },
      memberIds: info.memberIds,
    });
  }
  return out;
}

export interface BoardSuggestion {
  id: string;
  name: string;
  emoji: string;
  videoIds: string[];
  reason: string;
}

const EMOJI_BY_TAG: Record<string, string> = {
  neon: '🌃', beach: '🏖️', pool: '💧', shower: '🚿', sauna: '♨️', outdoor: '🌿', hotel: '🛎️', bedroom: '🛏️', vintage: '📼',
  'black-and-white': '🎞️', romantic: '🌹', playful: '🎈', intense: '🔥', sensual: '🕯️', dreamy: '☁️', funny: '😂', dance: '💃',
  massage: '💆', cosplay: '🎭', roleplay: '🎬', kissing: '💋', 'slow-motion': '🐌', 'close-up': '🔍', cinematic: '🎥',
};

export function suggestBoards(saves: SaveRecord[], boards: Board[], lookup: (id: string) => VideoSummary | undefined, tx: Taxonomy, dismissed: string[]): BoardSuggestion[] {
  const vids = saves.map((s) => lookup(s.videoId)).filter((v): v is VideoSummary => !!v);
  if (vids.length < 4) return [];
  const clusters = kmeans(vids.map((v) => v.embedding), Math.min(4, suggestK(vids.length) + 1));
  const out: BoardSuggestion[] = [];
  for (const c of clusters) {
    if (c.members.length < 3) continue;
    const members = c.members.map((i) => vids[i]);
    const ids = members.map((m) => m.id);
    // Skip if an existing board already holds most of these.
    if (boards.some((b) => ids.filter((id) => b.videoIds.includes(id)).length >= Math.ceil(ids.length * 0.6))) continue;
    const info = describeCluster(members, c.centroid, tx);
    const id = `bs-${hashString(ids.slice().sort().join('|')).toString(36)}`;
    if (dismissed.includes(id)) continue;
    out.push({
      id,
      name: info.label,
      emoji: EMOJI_BY_TAG[info.tagIds.find((t) => EMOJI_BY_TAG[t]) ?? ''] ?? '✨',
      videoIds: ids,
      reason: `${ids.length} saves share ${info.performerId ? 'a performer and ' : ''}${info.tagIds.length ? 'tags and ' : ''}a visual style`,
    });
  }
  return out;
}

export const STARTERS = [
  'warm romantic close-ups',
  'neon dance under 10 min',
  'playful outdoor natural light',
  'cinematic slow motion 4K',
  'vintage grainy black and white',
  'massage, no handheld',
];

export function suggestQueries(model: TasteModel | null, tx: Taxonomy, n = 6): string[] {
  if (!model || model.counts.positive < 3) return STARTERS.slice(0, n);
  const out: string[] = [];
  const tagLabel = (id: string) => tx.tags.find((t) => t.id === id)?.label.toLowerCase() ?? id;
  const tags = topWeights(model.tagW, 6).map(([t]) => t).filter((t) => !GENERIC.has(t));
  const perfs = topWeights(model.performerW, 3).map(([p]) => tx.performers.find((x) => x.id === p)?.name).filter(Boolean) as string[];
  const studios = topWeights(model.studioW, 2).map(([s]) => tx.studios.find((x) => x.id === s)?.name).filter(Boolean) as string[];
  const desc = model.likeCentroid ? compDescriptor(model.likeCentroid).toLowerCase().split(', ')[0] : '';
  if (perfs[0] && tags[0]) out.push(`${perfs[0]} ${tagLabel(tags[0])}`);
  if (desc && tags[1]) out.push(`${desc} ${tagLabel(tags[1])}`);
  if (tags[0] && tags[2]) out.push(`${tagLabel(tags[0])} ${tagLabel(tags[2])} 4K`);
  if (perfs[1]) out.push(`looks like ${perfs[1]}`);
  if (studios[0]) out.push(`new from ${studios[0]}`);
  if (tags[1]) out.push(`${tagLabel(tags[1])} under 10 min`);
  const neg = topWeights(model.tagW, 1, -1)[0];
  if (neg && tags[0]) out.push(`${tagLabel(tags[0])}, no ${tagLabel(neg[0])}`);
  for (const s of STARTERS) if (out.length < n) out.push(s);
  return [...new Set(out)].slice(0, n);
}
