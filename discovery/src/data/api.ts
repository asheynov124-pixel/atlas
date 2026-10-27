/**
 * The app talks to exactly one DataSource at a time. Swap it here when a live
 * source exists; nothing else needs to change.
 *
 * Also owns the client-side summary/detail caches. Ranking needs summaries
 * (tags, embeddings) synchronously, so every response is remembered.
 */
import { DataError, type DataSource, type SearchResults, type VideoDetail, type VideoSummary } from './types';
import { MockDataSource } from './mock/mockSource';
import { WithImports } from '../import/localSource';
import { importDetail, importSummary, isImportId } from '../import/model';
import { importById } from '../import/registry';

export const mockSource = new MockDataSource();

/** The source the app talks to: the catalogue source with the user's imports layered over it. */
let active: DataSource = new WithImports(mockSource);

export function dataSource(): DataSource {
  return active;
}

export function setDataSource(ds: DataSource) {
  active = new WithImports(ds);
  summaries.clear();
  details.clear();
  settled.clear();
}

const summaries = new Map<string, VideoSummary>();
const details = new Map<string, Promise<VideoDetail>>();
const settled = new Map<string, VideoDetail>();

export function remember(videos: VideoSummary[]) {
  for (const v of videos) if (!isImportId(v.id)) summaries.set(v.id, v);
}

export function rememberResults(r: SearchResults): SearchResults {
  remember(r.items.map((i) => i.video));
  return r;
}

/** Imports are always read live from their batch, so an edited title shows everywhere at once. */
export function cachedSummary(id: string): VideoSummary | undefined {
  if (isImportId(id)) {
    const item = importById(id);
    return item ? importSummary(item) : undefined;
  }
  return summaries.get(id) ?? settled.get(id);
}

export function cachedDetail(id: string): VideoDetail | undefined {
  if (isImportId(id)) {
    const item = importById(id);
    return item ? importDetail(item) : undefined;
  }
  return settled.get(id);
}

/** Deduplicated detail fetch. Failed fetches are evicted so Retry actually retries. */
export function loadDetail(id: string): Promise<VideoDetail> {
  if (isImportId(id)) {
    const item = importById(id);
    return item ? Promise.resolve(importDetail(item)) : Promise.reject(new DataError('That import was deleted', false));
  }
  const hit = details.get(id);
  if (hit) return hit;
  const p = active.getVideo(id).then(
    (d) => {
      settled.set(id, d);
      summaries.set(id, d);
      return d;
    },
    (err) => {
      details.delete(id);
      throw err;
    },
  );
  details.set(id, p);
  return p;
}

/** Ensure summaries exist for ids (e.g. a persisted queue after reload). */
export async function ensureSummaries(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !isImportId(id) && !summaries.has(id));
  if (!missing.length) return;
  remember(await active.getVideos(missing));
}
