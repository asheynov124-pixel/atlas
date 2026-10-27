/** Procedural thumbnails (generated off the main burst via a small queue) and grid tiles. */
import { useEffect, useRef, useState } from 'react';
import type { VideoSummary } from '../data/types';
import { thumbnailURL } from '../player/renderer';
import { performerLookup } from '../state/taxonomy';
import { useStore } from '../state/store';
import { formatDuration, formatCount } from '../lib/format';

type Job = { v: VideoSummary; w: number; done: (url: string) => void };
const queue: Job[] = [];
let scheduled = false;
const ready = new Map<string, string>();

function pump() {
  scheduled = false;
  const start = performance.now();
  while (queue.length && performance.now() - start < 8) {
    const job = queue.shift()!;
    const key = `${job.v.id}:${job.w}`;
    const url = ready.get(key) ?? thumbnailURL(job.v, job.v.performerIds.map(performerLookup), job.w);
    ready.set(key, url);
    job.done(url);
  }
  if (queue.length) schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

export function useThumb(v: VideoSummary | undefined, width = 180): string | null {
  const key = v ? `${v.id}:${width}` : '';
  const [url, setUrl] = useState<string | null>(() => (key ? ready.get(key) ?? null : null));
  useEffect(() => {
    if (!v) return;
    const hit = ready.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    queue.push({ v, w: width, done: (u) => alive && setUrl(u) });
    schedule();
    return () => {
      alive = false;
    };
  }, [key, v, width]);
  return url;
}

export function Thumb({ video, width = 180, className = '' }: { video: VideoSummary; width?: number; className?: string }) {
  const url = useThumb(video, width);
  const discreet = useStore((s) => s.settings.discreet);
  return (
    <div className={`thumb ${discreet ? 'thumb--discreet' : ''} ${className}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <div className="skeleton thumb__ph" />}
    </div>
  );
}

export function VideoTile({
  video,
  onOpen,
  onLongPress,
  badge,
  meta,
}: {
  video: VideoSummary;
  onOpen: () => void;
  onLongPress?: () => void;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  const performers = video.performerIds.map((id) => performerLookup(id)?.name).filter(Boolean);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      className="tile"
      onClick={() => {
        if (!fired.current) onOpen();
        fired.current = false;
      }}
      onPointerDown={() => {
        if (!onLongPress) return;
        fired.current = false;
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, 500);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => {
        if (onLongPress) {
          e.preventDefault();
          onLongPress();
        }
      }}
    >
      <div className="tile__media">
        <Thumb video={video} className="tile__thumb" />
        <span className="tile__dur">{formatDuration(video.duration)}</span>
        {video.quality === '4K' && <span className="tile__q">4K</span>}
        {badge && <span className="tile__badge">{badge}</span>}
      </div>
      <span className="tile__title">{video.title}</span>
      <span className="tile__meta">{meta ?? `${performers.slice(0, 2).join(', ')} · ${formatCount(video.views)} views`}</span>
    </button>
  );
}
