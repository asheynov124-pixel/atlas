/**
 * Imported items as native clips.
 *
 * The batch record is the source of truth. Everything the rest of the app
 * reads — VideoSummary, VideoDetail, embeddings — is derived from it here,
 * deterministically, so an edit to a title or tag shows up everywhere at once.
 *
 * Imported media is never run through a face or body model. Its embedding is
 * built from the words, tags, site, and page it came from, so items from one
 * gallery sit together and "related" means "same set", not "same person".
 */
import { EMBEDDING_DIM, FACET_DIM, FACETS, type Quality, type Studio, type Tag, type VideoDetail, type VideoSummary, type Vec, type PlaybackOption } from '../data/types';
import { TAG_BY_ID } from '../data/mock/taxonomy';
import { hashString, mulberry32 } from '../lib/prng';
import { normalize } from '../lib/vec';
import { normalizeText } from '../lib/text';
import type { Candidate, ImportBatch, ImportItem } from './types';
import { filenameOf, hostOf, mightBeImage } from './urls';
import { safetyText } from './extract';
import { checkQuery } from '../data/safety';

/** The import safety gate over everything an item carries: title, tags, notes, and its URLs. */
export function itemIsSafe(item: Pick<ImportItem, 'url' | 'title' | 'tags' | 'originalUrl' | 'notes'> & { thumbnailUrl?: string }): boolean {
  return checkQuery(safetyText(item)).ok;
}

export const IMPORT_PREFIX = 'imp-';
export const SITE_PREFIX = 'site:';

export const isImportId = (id: string | undefined): id is string => !!id && id.startsWith(IMPORT_PREFIX);
export const siteStudioId = (host: string) => `${SITE_PREFIX}${host}`;
export const isSiteStudio = (id: string) => id.startsWith(SITE_PREFIX);

/** Stable id from the normalised URL, so the same link imported twice is the same clip. */
export function importId(url: string): string {
  return `${IMPORT_PREFIX}${hashString(url).toString(36)}${hashString(`${url}#2`).toString(36).slice(0, 4)}`;
}

/** Seconds of dwell that count as "watched through" for a still image. */
export const STILL_DWELL_SEC = 6;
/** Assumed preview length for imported video until the element reports a real one. */
export const VIDEO_CLIP_SEC = 15;

function hashVec(seed: string, dims: number, scale = 1): number[] {
  const rng = mulberry32(hashString(seed));
  return Array.from({ length: dims }, () => (rng() * 2 - 1) * scale);
}

/** Synthetic, explainable embedding: page/gallery and site for "look", tags for pose and composition. */
export function importEmbedding(item: Pick<ImportItem, 'url' | 'host' | 'groupKey' | 'tagIds'>): Vec {
  const out = new Array<number>(EMBEDDING_DIM).fill(0);
  const group = hashVec(`g:${item.groupKey}`, EMBEDDING_DIM, 0.6);
  const site = hashVec(`h:${item.host}`, EMBEDDING_DIM, 0.35);
  const own = hashVec(`u:${item.url}`, EMBEDDING_DIM, 0.22);
  for (let i = 0; i < EMBEDDING_DIM; i++) out[i] = group[i] + site[i] + own[i];
  const pose = FACETS.indexOf('pose') * FACET_DIM;
  const comp = FACETS.indexOf('composition') * FACET_DIM;
  for (const t of item.tagIds) {
    const def = TAG_BY_ID[t];
    if (!def) continue;
    for (const [d, v] of def.pose ?? []) out[pose + d] += v * 0.8;
    for (const [d, v] of def.comp ?? []) out[comp + d] += v * 0.8;
  }
  return normalize(out);
}

function qualityOf(item: Pick<ImportItem, 'width' | 'height'>): Quality {
  const long = Math.max(item.width ?? 0, item.height ?? 0);
  if (long >= 3000) return '4K';
  if (long >= 900) return 'HD';
  return long ? 'SD' : 'HD';
}

const summaries = new WeakMap<ImportItem, VideoSummary>();

export function importSummary(item: ImportItem): VideoSummary {
  const hit = summaries.get(item);
  if (hit) return hit;
  const thumb = item.thumbnailUrl ?? (item.mediaType === 'image' ? item.url : undefined);
  const v: VideoSummary = {
    id: item.id,
    title: item.title,
    performerIds: [],
    studioId: siteStudioId(item.host),
    tags: item.tagIds,
    duration: 0,
    clipDuration: item.mediaType === 'video' ? VIDEO_CLIP_SEC : STILL_DWELL_SEC,
    quality: qualityOf(item),
    style: 'amateur',
    orientation: item.width && item.height && item.width > item.height ? 'horizontal' : 'vertical',
    releaseDate: new Date(item.addedAt).toISOString().slice(0, 10),
    views: 0,
    rating: 0,
    thumbnail: thumb ? { kind: 'url', url: thumb } : { kind: 'procedural', seed: hashString(item.url) },
    embedding: importEmbedding(item),
    originalUrl: item.originalUrl,
    source: 'import',
    mediaType: item.mediaType,
    batchId: item.batchId,
    userTags: item.tags,
    thumbnailUrl: thumb,
  };
  summaries.set(item, v);
  return v;
}

export function siteStudio(host: string): Studio {
  return { id: siteStudioId(host), name: host, style: 'amateur', videoCount: 0 };
}

export function importPlayback(item: ImportItem): PlaybackOption[] {
  const original: PlaybackOption = { kind: 'original', url: item.originalUrl };
  if (item.mediaType === 'image') return [{ kind: 'image', url: item.url }, original];
  if (item.mediaType === 'video') return [{ kind: 'source', url: item.url }, original];
  // An extension-less link that isn't obviously a page may well be a picture: show it
  // as one, and fall back to the open-original card only if it really fails to load.
  if (mightBeImage(item.url)) return [{ kind: 'image', url: item.url }, original];
  return [original];
}

const details = new WeakMap<ImportItem, VideoDetail>();

export function importDetail(item: ImportItem): VideoDetail {
  const hit = details.get(item);
  if (hit) return hit;
  const s = importSummary(item);
  const kind = item.mediaType === 'image' ? 'Image' : item.mediaType === 'video' ? 'Video' : 'Page';
  const d: VideoDetail = {
    ...s,
    description: item.notes || `${kind} imported from ${item.host}.`,
    performers: [],
    studio: siteStudio(item.host),
    playback: importPlayback(item),
  };
  details.set(item, d);
  return d;
}

// ---------------------------------------------------------------------------
// Tags & suggestions

/** Map free-text tags onto taxonomy tag ids (label, id, synonym, simple plural). */
export function matchTagIds(tags: string[], taxonomy: Tag[]): string[] {
  const index = new Map<string, string>();
  for (const t of taxonomy) {
    index.set(normalizeText(t.label), t.id);
    index.set(normalizeText(t.id.replace(/-/g, ' ')), t.id);
    for (const s of t.synonyms) index.set(normalizeText(s), t.id);
  }
  const out = new Set<string>();
  for (const raw of tags) {
    const n = normalizeText(raw.replace(/^#/, '').replace(/[-_]/g, ' '));
    const id = index.get(n) ?? (n.endsWith('s') ? index.get(n.slice(0, -1)) : undefined) ?? (n.endsWith('es') ? index.get(n.slice(0, -2)) : undefined);
    if (id) out.add(id);
  }
  return [...out];
}

export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const s = t.replace(/^#/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

export function parseTagInput(s: string): string[] {
  return cleanTags(s.split(/[,#\n]/));
}

const BORING = new Set([
  'www', 'com', 'net', 'org', 'io', 'co', 'uk', 'de', 'cdn', 'img', 'imgs', 'image', 'images', 'photo', 'photos', 'pic', 'pics', 'picture', 'pictures',
  'media', 'content', 'contents', 'gallery', 'galleries', 'album', 'albums', 'upload', 'uploads', 'wp', 'wp-content', 'files', 'file', 'static',
  'assets', 'asset', 'public', 'thumb', 'thumbs', 'thumbnail', 'thumbnails', 'large', 'medium', 'small', 'full', 'original', 'originals', 'orig',
  'resized', 'preview', 'previews', 'video', 'videos', 'post', 'posts', 'page', 'pages', 'index', 'html', 'php', 'view', 'watch', 'embed', 'set',
  'sets', 'item', 'items', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', 'the', 'and', 'with', 'for', 'from', 'new', 'img', 'dsc',
  'dscn', 'dcim', 'screenshot', 'copy', 'final', 'edit', 'edited', 'scaled', 'default', 'en', 'us', 'blog', 'news', 'tag', 'tags', 'category',
  'categories', 'p', 's', 'm', 'l', 'xl', 'hd', 'id', 'user', 'users', 'profile', 'storage', 'data', 'api', 'v1', 'v2', 'i', 'a', 'b',
]);

/** Core brand of a host: "cdn.photos.example.co.uk" → "example". */
export function siteName(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 1) return host;
  const sld = parts.length >= 3 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
  return sld;
}

/**
 * Tag ideas from where things came from: the site's name and the words that
 * recur in path segments and file names across the batch.
 */
export function suggestImportTags(cands: Pick<Candidate, 'url' | 'originalUrl'>[], existing: string[] = [], max = 8): string[] {
  const have = new Set(existing.map((t) => t.toLowerCase()));
  const counts = new Map<string, number>();
  const hosts = new Map<string, number>();
  for (const c of cands) {
    const host = hostOf(c.originalUrl || c.url);
    if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
    const words = new Set<string>();
    for (const u of new Set([c.url, c.originalUrl])) {
      try {
        const path = decodeURIComponent(new URL(u).pathname).toLowerCase();
        const segs = path.split('/').filter(Boolean);
        const file = filenameOf(u).toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '');
        for (const seg of [...segs.slice(0, -1), file]) {
          for (const w of seg.split(/[^a-z]+/)) if (w.length >= 3 && w.length <= 18 && !BORING.has(w)) words.add(w);
        }
      } catch {
        /* ignore */
      }
    }
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const n = Math.max(1, cands.length);
  const min = n >= 4 ? Math.max(2, Math.ceil(n * 0.2)) : 1;
  const words = [...counts]
    .filter(([w, c]) => c >= min && !have.has(w))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w]) => w);
  const sites = [...hosts].sort((a, b) => b[1] - a[1]).map(([h]) => siteName(h)).filter((s) => s.length >= 3 && !have.has(s.toLowerCase()) && !BORING.has(s));
  return [...new Set([...sites.slice(0, 2), ...words])].slice(0, max);
}

/** The host most items came from, if one clearly dominates. */
export function primaryHost(cands: Pick<Candidate, 'url' | 'originalUrl'>[]): string | undefined {
  const counts = new Map<string, number>();
  for (const c of cands) {
    const h = hostOf(c.originalUrl || c.url);
    if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] / Math.max(1, cands.length) >= 0.6 ? top[0] : undefined;
}

export function defaultBatchName(cands: Pick<Candidate, 'url' | 'originalUrl'>[], now = Date.now()): string {
  return primaryHost(cands) ?? `Import ${new Date(now).toISOString().slice(0, 10)}`;
}

/** Build the committed item for a reviewed candidate. */
export function itemFromCandidate(
  c: Candidate,
  batch: Pick<ImportBatch, 'id' | 'tags'>,
  opts: { title?: string; extraTags?: string[]; taxonomy?: Tag[]; now?: number } = {},
): ImportItem {
  const tags = cleanTags([...batch.tags, ...c.tags, ...(opts.extraTags ?? [])]);
  const host = hostOf(c.originalUrl || c.url) || hostOf(c.url) || 'import';
  return {
    id: importId(c.key),
    batchId: batch.id,
    url: c.url,
    mediaType: c.mediaType,
    title: (opts.title ?? c.title).trim() || host,
    tags,
    tagIds: opts.taxonomy ? matchTagIds(tags, opts.taxonomy) : [],
    originalUrl: c.originalUrl || c.url,
    thumbnailUrl: c.thumbnailUrl,
    width: c.width,
    height: c.height,
    host,
    groupKey: c.groupId ? `${c.originalUrl}#${c.groupId}` : c.originalUrl !== c.url ? c.originalUrl : batch.id,
    notes: c.notes ?? '',
    addedAt: opts.now ?? Date.now(),
  };
}
