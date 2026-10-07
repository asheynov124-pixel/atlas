/**
 * OWNER: ui-panels.
 * Hypernet — the citizens' social feed. Panel 'news': trending hashtags (tap to filter), Latest / Top sort, posts
 * with gradient emoji avatars, handles, relative game dates, highlighted #tags and @mentions, likes (tap the heart)
 * and a "see where" fly-to when a post is tied to a tile. Opening the feed clears ui.unreadNews.
 * Overlay 'chirps': while playing, a fresh post occasionally floats in above the dock for a few seconds (honours
 * settings.chirps "Hypernet popups"; never while a tool, panel, inspector or photo mode is up). Tap → the feed.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../../core/events';
import { settings } from '../../core/settings';
import type { NewsItem } from '../../core/types';
import { EmptyState, Icon, Segmented } from '../core';
import { openPanel, uiSound } from '../core/env';
import { fmtCompact } from '../core/format';
import { ui } from '../store';
import { Avatar, flyToTile, relShort } from './common';

const liked = new Set<number>();
const memo = { sort: 'latest' as 'latest' | 'top', tag: null as string | null };

function RichText({ text }: { text: string }) {
  const parts = text.split(/([#@][\p{L}\p{N}_]+)/u);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('#') ? <span key={i} class="up-tag">{p}</span> : p.startsWith('@') ? <span key={i} class="up-mention">{p}</span> : p))}
    </>
  );
}

function trending(news: NewsItem[]): [string, number][] {
  const m = new Map<string, number>();
  for (const n of news.slice(0, 80)) for (const t of n.text.match(/#[\p{L}\p{N}_]+/gu) ?? []) m.set(t, (m.get(t) ?? 0) + 1 + (n.likes ?? 0) / 500);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function Post({ n }: { n: NewsItem }) {
  const [, bump] = useState(0);
  const [pop, setPop] = useState(false);
  const isLiked = liked.has(n.id);
  const likes = (n.likes ?? 0) + (isLiked ? 1 : 0);
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (isLiked) liked.delete(n.id);
    else {
      liked.add(n.id);
      setPop(true);
      setTimeout(() => setPop(false), 450);
    }
    uiSound('tap');
    bump((x) => x + 1);
  };
  const where = n.tile !== undefined && n.tile >= 0;
  return (
    <article class={'up-post' + (where ? ' has-tile' : '')}>
      <Avatar emoji={n.icon} seed={n.handle || n.author} size={42} />
      <div class="up-post-body">
        <div class="up-post-head">
          <b class="ellipsis">{n.author}</b>
          <span class="dim ellipsis up-post-handle">{n.handle.startsWith('@') ? n.handle : '@' + n.handle}</span>
          <span class="dim up-post-time">· {relShort(n.day)}</span>
        </div>
        <p class="up-post-text">
          <RichText text={n.text} />
        </p>
        <div class="up-post-actions">
          <button type="button" class={'up-like' + (isLiked ? ' is-liked' : '') + (pop ? ' is-pop' : '')} aria-pressed={isLiked} aria-label={isLiked ? 'Unlike' : 'Like'} onClick={toggle}>
            <Icon name="heart" size={16} />
            <span class="num">{likes > 0 ? fmtCompact(likes) : ''}</span>
          </button>
          {where && (
            <button type="button" class="up-post-where" onClick={() => flyToTile(n.tile, { select: true })}>
              <Icon name="locate" size={15} /> See where
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function NewsPanel() {
  const news = ui.news.value;
  const [sort, setSort] = useState(memo.sort);
  const [tag, setTag] = useState<string | null>(memo.tag);
  useEffect(() => {
    ui.unreadNews.value = 0;
  }, [news.length]);
  const tags = trending(news);
  let list = tag ? news.filter((n) => n.text.includes(tag)) : news;
  if (sort === 'top') list = [...list].sort((a, b) => (b.likes ?? 0) + (liked.has(b.id) ? 1 : 0) - ((a.likes ?? 0) + (liked.has(a.id) ? 1 : 0)));
  const pickTag = (t: string | null) => {
    memo.tag = t;
    setTag(t);
  };
  return (
    <div class="up-root up-news">
      <div class="up-news-live">
        <span class="up-live-dot" aria-hidden="true" />
        <span class="up-live-label">Live</span>
        <span class="dim ellipsis">
          from {ui.cityName.value || 'your city'} · {news.length} post{news.length === 1 ? '' : 's'}
        </span>
      </div>
      {tags.length > 0 && (
        <div class="up-trending scroll-x">
          <span class="up-trending-label">
            <Icon name="trendUp" size={14} /> Trending
          </span>
          {tags.map(([t]) => (
            <button key={t} type="button" class={'up-trend' + (tag === t ? ' is-active' : '')} onClick={() => (uiSound('tap'), pickTag(tag === t ? null : t))}>
              {t}
            </button>
          ))}
        </div>
      )}
      <Segmented
        block
        size="sm"
        sound="tap"
        value={sort}
        onChange={(v) => {
          memo.sort = v;
          setSort(v);
        }}
        options={[
          { value: 'latest', label: 'Latest' },
          { value: 'top', label: 'Most liked' },
        ]}
        ariaLabel="Sort posts"
      />
      {list.length === 0 ? (
        <EmptyState icon="chat" title={tag ? `Nobody is talking about ${tag} anymore` : 'The Hypernet is quiet'} body={tag ? 'Trends are fickle.' : 'Citizens post about their lives as the city grows. Build something and they will have opinions.'} />
      ) : (
        <div class="up-feed">
          {list.slice(0, 80).map((n) => (
            <Post key={n.id} n={n} />
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── chirp popups

const CHIRP_MS = 6500;
const CHIRP_GAP_MS = 20000;

function chirpBlocked(): boolean {
  return (
    !settings.value.chirps ||
    ui.screen.value !== 'game' ||
    ui.view.value !== 'planet' ||
    !!ui.panel.value ||
    ui.photo.value ||
    ui.chromeHidden.value ||
    !!ui.tool.value ||
    !!ui.selection.value ||
    !!ui.category.value ||
    !!ui.lens.value
  );
}

export function Chirps() {
  const [item, setItem] = useState<NewsItem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    let out: ReturnType<typeof setTimeout> | undefined;
    const off = bus.on('news', (n) => {
      const now = performance.now();
      if (chirpBlocked() || now - last.current < CHIRP_GAP_MS || n.text.length > 220) return;
      last.current = now;
      clearTimeout(hide);
      clearTimeout(out);
      setLeaving(false);
      setItem(n);
      hide = setTimeout(() => {
        setLeaving(true);
        out = setTimeout(() => setItem(null), 320);
      }, CHIRP_MS);
    });
    return () => {
      off();
      clearTimeout(hide);
      clearTimeout(out);
    };
  }, []);
  if (!item || chirpBlocked()) return null;
  return (
    <div class={'up-chirp pe' + (leaving ? ' is-leaving' : '')}>
      <button
        type="button"
        class="up-chirp-main"
        onClick={() => {
          setItem(null);
          openPanel('news');
        }}
        aria-label={`Hypernet post by ${item.author}. Open the feed`}
      >
        <Avatar emoji={item.icon} seed={item.handle || item.author} size={34} />
        <span class="up-chirp-text">
          <span class="up-chirp-head">
            <b class="ellipsis">{item.author}</b>
            <span class="dim ellipsis">{item.handle.startsWith('@') ? item.handle : '@' + item.handle}</span>
          </span>
          <span class="up-chirp-body">
            <RichText text={item.text} />
          </span>
        </span>
      </button>
      <button type="button" class="up-chirp-close" aria-label="Dismiss" onClick={() => setItem(null)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
