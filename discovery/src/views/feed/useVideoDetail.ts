import { useCallback, useEffect, useState } from 'react';
import { cachedDetail, cachedSummary, ensureSummaries, loadDetail } from '../../data/api';
import type { VideoDetail, VideoSummary } from '../../data/types';
import { useStore } from '../../state/store';

/** Summary (sync, from caches) + detail (async, with retry). */
export function useVideoDetail(id: string | undefined) {
  const content = useStore((s) => (id ? s.content[id] : undefined));
  const [summary, setSummary] = useState<VideoSummary | undefined>(() => (id ? content ?? cachedSummary(id) : undefined));
  const [detail, setDetail] = useState<VideoDetail | null>(() => (id ? cachedDetail(id) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const s = content ?? cachedSummary(id);
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
