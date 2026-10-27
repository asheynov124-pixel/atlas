import { useCallback, useEffect, useState } from 'react';
import { cachedDetail, cachedSummary, ensureSummaries, loadDetail } from '../../data/api';
import type { VideoDetail, VideoSummary } from '../../data/types';
import { useStore, activeData } from '../../state/store';
import { isImportId } from '../../import/model';

/** Summary (sync, from caches) + detail (async, with retry). Imports re-render on every edit. */
export function useVideoDetail(id: string | undefined) {
  const content = useStore((s) => (id ? (isImportId(id) ? activeData(s).imports.items[id] : s.content[id]) : undefined));
  const [summary, setSummary] = useState<VideoSummary | undefined>(() => (id ? cachedOrContent(id, content) : undefined));
  const [detail, setDetail] = useState<VideoDetail | null>(() => (id ? cachedDetail(id) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const s = cachedOrContent(id, content);
    setSummary(s);
    if (!s) {
      ensureSummaries([id])
        .then(() => alive && setSummary(cachedSummary(id)))
        .catch(() => undefined);
    }
    const hit = cachedDetail(id);
    if (hit) {
      setDetail(hit);
      setError(null);
      return;
    }
    setDetail(null);
    setError(null);
    loadDetail(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setSummary(d);
      })
      .catch((e: Error) => alive && setError(e.message || 'Could not load this clip'));
    return () => {
      alive = false;
    };
  }, [id, attempt, content]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { summary, detail, error, retry };
}

function cachedOrContent(id: string, content: unknown): VideoSummary | undefined {
  if (isImportId(id)) return cachedSummary(id);
  return (content as VideoSummary | undefined) ?? cachedSummary(id);
}
