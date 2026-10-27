/**
 * The app talks to exactly one DataSource at a time. Swap it here when a live
 * source exists; nothing else needs to change.
 *
 * Also owns the client-side summary/detail caches. Ranking needs summaries
 * (tags, embeddings) synchronously, so every response is remembered.
 */
import type { DataSource, SearchResults, VideoDetail, VideoSummary } from './types';
import { MockDataSource } from './mock/mockSource';

export const mockSource = new MockDataSource();

let active: DataSource = mockSource;

export function dataSource(): DataSource {
  return active;
}

export function setDataSource(ds: DataSource) {
  active = ds;
  summaries.clear();
  details.clear();
}

const summaries = new Map<string, VideoSummary>();
const details = new Map<string, Promise<VideoDetail>>();
const settled = new Map<string, VideoDetail>();

export function remember(videos: VideoSummary[]) {
  for (const v of videos) summaries.set(v.id, v);
}

export function rememberResults(r: SearchResults): SearchResults {
  remember(r.items.map((i) => i.video));
  return r;
}

export function cachedSummary(id: string): VideoSummary | undefined {
  return summaries.get(id) ?? settled.get(id);
}

export function cachedDetail(id: string): VideoDetail | undefined {
  return settled.get(id);
}

/** Deduplicated detail fetch. Failed fetches are evicted so Retry actually retries. */
export function loadDetail(id: string): Promise<VideoDetail> {
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
  const missing = ids.filter((id) => !summaries.has(id));
  if (!missing.length) return;
  remember(await active.getVideos(missing));
}
