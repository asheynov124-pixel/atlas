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
  const remote = v?.thumbnail.kind === 'url' ? v.thumbnail.url : null;
  // Imports never get a procedural stand-in: it would invent a picture that isn't theirs.
  const procedural = !!v && !remote && v.source !== 'import';
  const key = procedural ? `${v!.id}:${width}` : '';
  const [url, setUrl] = useState<string | null>(() => (key ? ready.get(key) ?? null : null));
  useEffect(() => {
    if (!v || !procedural) return;
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
  }, [key, v, width, procedural]);
  return remote ?? url;
}

const TYPE_ICON = { image: '▧', video: '▶', page: '↗' } as const;

/** Stand-in for a remote thumbnail that isn't loaded (data saver, broken link, or none). */
export function RemotePlaceholder({ video, note }: { video: Pick<VideoSummary, 'mediaType' | 'originalUrl' | 'id'>; note?: string }) {
  let host = '';
  try {
    host = new URL(video.originalUrl).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  const hue = [...video.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div className="thumb__remote" style={{ background: `linear-gradient(160deg, hsl(${hue} 45% 22%), hsl(${(hue + 60) % 360} 50% 12%))` }}>
      <span className="thumb__remote-icon" aria-hidden="true">
        {TYPE_ICON[video.mediaType ?? 'page']}
      </span>
      <span className="thumb__remote-host">{host}</span>
      {note && <span className="thumb__remote-note">{note}</span>}
    </div>
  );
}

export function Thumb({ video, width = 180, className = '' }: { video: VideoSummary; width?: number; className?: string }) {
  const url = useThumb(video, width);
  const discreet = useStore((s) => s.settings.discreet);
  const dataSaver = useStore((s) => s.settings.dataSaver);
  const [broken, setBroken] = useState<string | null>(null);
  const remote = video.thumbnail.kind === 'url';
  let body: React.ReactNode;
  if (video.source === 'import' && !remote) body = <RemotePlaceholder video={video} />; // no picture known: never fake one
  else if (remote && video.source === 'import' && dataSaver) body = <RemotePlaceholder video={video} note="Data saver" />;
  else if (remote && (!url || broken === url)) body = <RemotePlaceholder video={video} />;
  else if (url) {
    body = remote ? (
      <img src={url} alt="" draggable={false} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(url)} />
    ) : (
      <img src={url} alt="" draggable={false} />
    );
  } else if (video.source === 'import') body = <RemotePlaceholder video={video} />;
  else body = <div className="skeleton thumb__ph" />;
  return <div className={`thumb ${discreet ? 'thumb--discreet' : ''} ${className}`}>{body}</div>;
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
        {video.source === 'import' ? (
          <span className="tile__dur">{video.mediaType === 'image' ? 'Image' : video.mediaType === 'video' ? 'Video' : 'Page'}</span>
        ) : (
          <span className="tile__dur">{formatDuration(video.duration)}</span>
        )}
        {video.quality === '4K' && <span className="tile__q">4K</span>}
        {badge && <span className="tile__badge">{badge}</span>}
      </div>
      <span className="tile__title">{video.title}</span>
      <span className="tile__meta">
        {meta ?? (video.source === 'import' ? `Imported · ${video.studioId.replace(/^site:/, '')}` : `${performers.slice(0, 2).join(', ')} · ${formatCount(video.views)} views`)}
      </span>
    </button>
  );
}
